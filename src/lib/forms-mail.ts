// The website's forms (appointment request, grievance) are delivered by
// the clinic's own Google Workspace mailbox, through the Gmail API. A
// form carries a patient's name, contact details and words, so it travels
// only through services the clinic's HIPAA agreement covers — it used to
// pass through a mail-sending company that the agreement does not.
//
// How the site may send as the mailbox, with nothing to steal:
//  - There is no password, no key file and no stored token. The site runs
//    as a Google Cloud service account; Google signs, on its behalf and
//    for one hour, a statement "I am the site, acting for this mailbox,
//    to SEND mail only" (IAM Credentials signJwt), and trades it for a
//    Gmail token (domain-wide delegation, authorised once by the
//    Workspace administrator for the gmail.send scope alone).
//  - So the most this code — or anyone who broke into the site — can do
//    with the mailbox is send from it. It cannot read a single message.
//
// What the visitor typed never becomes a header of its own (a second
// recipient, another sender): header text is flattened to one line and
// written as RFC 2047 words, and an address is used only if it is one
// plain address. forms-mail.test.ts holds each of these.
import { fetchWithTimeout } from "./fetch-timeout";

export const FORMS_MAIL_TIMEOUT_MS = 8_000;

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const METADATA =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default";
// How long before its end a sign-in is no longer used.
const TOKEN_MARGIN_MS = 60_000;

type Step = "config" | "message" | "metadata" | "sign" | "token" | "send";

/**
 * Why a form could not be sent. It carries the step and Google's status
 * and nothing else: Google's own words can quote the message, and
 * errorLabel() prints `code` and `status` to the log.
 */
export class FormsMailError extends Error {
  readonly code: Step;
  readonly status?: number;
  constructor(step: Step, status?: number) {
    super(`forms mail failed at: ${step}`);
    this.name = "FormsMailError";
    this.code = step;
    if (status !== undefined) this.status = status;
  }
}

// ------------------------------------------------------------- the message

export type FormMail = {
  /** Shown as the sender's name, e.g. "Appointment Request". */
  fromName: string;
  to: string;
  /** The visitor's address, if they gave one: "Reply" then answers them. */
  replyTo?: string;
  subject: string;
  text: string;
};

// One plain address: no display name, no list, no line break.
const ADDRESS =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const isAddress = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 254 && ADDRESS.test(value);

// At most this many bytes of text in one RFC 2047 word: with its wrapping
// and the longest header name in front, the line stays under 78.
const WORD_BYTES = 39;

/**
 * Text for a header, on one logical line. Control characters — a line
 * break above all — become spaces; anything that is not short plain
 * ASCII is written as RFC 2047 words, cut only between characters.
 */
export function encodeHeaderText(text: string): string {
  const flat = Array.from(text, (character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f ? " " : character;
  })
    .join("")
    .replace(/ {2,}/g, " ")
    .trim();
  if (/^[\x20-\x7E]*$/.test(flat) && flat.length <= 60) return flat;

  const words: string[] = [];
  let chunk: Buffer[] = [];
  let size = 0;
  const flush = () => {
    if (size === 0) return;
    words.push(`=?UTF-8?B?${Buffer.concat(chunk).toString("base64")}?=`);
    chunk = [];
    size = 0;
  };
  for (const character of flat) {
    const bytes = Buffer.from(character, "utf8");
    if (size + bytes.length > WORD_BYTES) flush();
    chunk.push(bytes);
    size += bytes.length;
  }
  flush();
  return words.join("\r\n ");
}

/** The message as mail programs exchange it (RFC 5322), ready to send. */
export function buildFormMessage(mail: FormMail & { mailbox: string }): string {
  if (!isAddress(mail.mailbox) || !isAddress(mail.to)) {
    throw new FormsMailError("message");
  }
  const fromName = mail.fromName.replace(/[^A-Za-z0-9 ._-]+/g, " ").trim();
  const headers = [
    `From: ${fromName} <${mail.mailbox}>`,
    `To: ${mail.to}`,
    ...(isAddress(mail.replyTo) ? [`Reply-To: ${mail.replyTo}`] : []),
    `Subject: ${encodeHeaderText(mail.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const body =
    Buffer.from(mail.text, "utf8")
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? "";
  return `${headers.join("\r\n")}\r\n\r\n${body}\r\n`;
}

// ----------------------------------------------------------------- sending

export type FormsMailDeps = {
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  nowMs?: () => number;
  timeoutMs?: number;
};

type Ready = Required<Omit<FormsMailDeps, "env">> & {
  env: Record<string, string | undefined>;
};

// The site's own account never changes while it runs; a Gmail sign-in
// lasts an hour and is reused until shortly before it ends.
let siteAccount: string | null = null;
let signIn: { mailbox: string; token: string; untilMs: number } | null = null;

export function resetFormsMailForTests() {
  siteAccount = null;
  signIn = null;
}

/** One request to Google; anything but a 2xx is a failure of `step`. */
async function ask(
  step: Step,
  url: string,
  init: RequestInit,
  deps: Ready
): Promise<Response> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, init, deps.timeoutMs, deps.fetchImpl);
  } catch {
    // Timed out or unreachable. What was thrown is not kept: it can
    // quote the request.
    throw new FormsMailError(step);
  }
  if (!res.ok) throw new FormsMailError(step, res.status);
  return res;
}

async function field(step: Step, res: Response, name: string): Promise<string> {
  let value: unknown;
  try {
    value = ((await res.json()) as Record<string, unknown>)[name];
  } catch {
    throw new FormsMailError(step);
  }
  if (typeof value !== "string" || value === "") throw new FormsMailError(step);
  return value;
}

async function gmailToken(mailbox: string, deps: Ready): Promise<string> {
  const now = deps.nowMs();
  if (signIn && signIn.mailbox === mailbox && now < signIn.untilMs) {
    return signIn.token;
  }

  const metadata = { headers: { "Metadata-Flavor": "Google" } };
  if (!siteAccount) {
    const res = await ask("metadata", `${METADATA}/email`, metadata, deps);
    const email = (await res.text()).trim();
    if (!isAddress(email)) throw new FormsMailError("metadata");
    siteAccount = email;
  }
  const siteToken = await field(
    "metadata",
    await ask("metadata", `${METADATA}/token`, metadata, deps),
    "access_token"
  );

  // "I am the site, acting for this mailbox, to send mail, for an hour" —
  // signed by Google with the site account's own key, which never leaves
  // Google.
  const issued = Math.floor(now / 1000);
  const signed = await field(
    "sign",
    await ask(
      "sign",
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(siteAccount)}:signJwt`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${siteToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payload: JSON.stringify({
            iss: siteAccount,
            sub: mailbox,
            scope: GMAIL_SEND_SCOPE,
            aud: TOKEN_URL,
            iat: issued,
            exp: issued + 3600,
          }),
        }),
      },
      deps
    ),
    "signedJwt"
  );

  const exchange = await ask(
    "token",
    TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signed,
      }).toString(),
    },
    deps
  );
  let answer: Record<string, unknown>;
  try {
    answer = (await exchange.json()) as Record<string, unknown>;
  } catch {
    throw new FormsMailError("token");
  }
  const token = answer.access_token;
  if (typeof token !== "string" || token === "")
    throw new FormsMailError("token");
  const lifetime =
    typeof answer.expires_in === "number" && answer.expires_in > 0
      ? answer.expires_in
      : 3600;
  signIn = {
    mailbox,
    token,
    untilMs: now + lifetime * 1000 - TOKEN_MARGIN_MS,
  };
  return token;
}

/**
 * Sends one form to the clinic. Throws FormsMailError; the caller logs
 * errorLabel(error) and tells the visitor to call instead.
 */
export async function sendFormMail(
  mail: FormMail,
  deps: FormsMailDeps = {}
): Promise<void> {
  const ready: Ready = {
    fetchImpl: deps.fetchImpl ?? fetch,
    env: deps.env ?? process.env,
    nowMs: deps.nowMs ?? Date.now,
    timeoutMs: deps.timeoutMs ?? FORMS_MAIL_TIMEOUT_MS,
  };
  // The mailbox the forms are sent from (and land in): the Workspace
  // user that owns the forms address. Set per deployment, not here.
  const mailbox = (ready.env.FORMS_MAILBOX ?? "").trim();
  if (!isAddress(mailbox)) throw new FormsMailError("config");

  const message = buildFormMessage({ ...mail, mailbox });
  const token = await gmailToken(mailbox, ready);
  try {
    await ask(
      "send",
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: Buffer.from(message, "utf8").toString("base64url"),
        }),
      },
      ready
    );
  } catch (error) {
    // Whatever went wrong, do not trust this sign-in for the next form.
    signIn = null;
    throw error;
  }
}
