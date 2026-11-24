import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FormsMailError,
  buildFormMessage,
  encodeHeaderText,
  resetFormsMailForTests,
  sendFormMail,
} from "./forms-mail";
import { errorLabel } from "./error-label";

const MAILBOX = "desk@clinic.example";
const STAMP = {
  at: new Date("2026-11-24T18:03:07Z"),
  id: "3f2b8c1e-0000-4000-8000-aabbccddeeff",
};

const mail = {
  fromName: "Appointment Request",
  to: "forms@clinic.example",
  replyTo: "ann@example.com",
  subject: "New Appointment Request from Ann",
  text: "Name: Ann\nPhone: 555 0100\n",
};

/** The headers and the decoded body of a built message. */
function parse(message: string) {
  const [head, body] = message.split("\r\n\r\n");
  const headers = new Map<string, string>();
  for (const line of head.replace(/\r\n[ \t]/g, " ").split("\r\n")) {
    const at = line.indexOf(":");
    headers.set(line.slice(0, at).toLowerCase(), line.slice(at + 1).trim());
  }
  return {
    headers,
    head,
    text: Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8"),
  };
}

/** What a mail program shows for a header written as RFC 2047 words. */
function decodeWords(value: string) {
  return value
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b64: string) =>
      Buffer.from(b64, "base64").toString("utf8")
    );
}

describe("buildFormMessage", () => {
  it("writes who it is from, to, the subject and the text", () => {
    const m = parse(buildFormMessage(mail, STAMP));
    // Sender and recipient are both the clinic's forms address — never
    // the mailbox's own sign-in address, which Gmail would file as Sent.
    expect(m.headers.get("from")).toBe(
      "Appointment Request <forms@clinic.example>"
    );
    expect(m.headers.get("to")).toBe("forms@clinic.example");
    expect(m.head).not.toContain(MAILBOX);
    expect(m.headers.get("date")).toBe("Tue, 24 Nov 2026 18:03:07 +0000");
    expect(m.headers.get("message-id")).toBe(
      "<3f2b8c1e-0000-4000-8000-aabbccddeeff@clinic.example>"
    );
    expect(m.headers.get("reply-to")).toBe("ann@example.com");
    expect(m.headers.get("subject")).toBe("New Appointment Request from Ann");
    expect(m.headers.get("mime-version")).toBe("1.0");
    expect(m.headers.get("content-type")).toBe('text/plain; charset="UTF-8"');
    expect(m.text).toBe("Name: Ann\nPhone: 555 0100\n");
  });

  it("leaves Reply-To out when there is nobody to answer", () => {
    const m = parse(buildFormMessage({ ...mail, replyTo: undefined }, STAMP));
    expect(m.headers.has("reply-to")).toBe(false);
  });

  it("keeps accents and emoji in the subject readable", () => {
    const subject = "☎️📞New Appointment Request from Zoë Müller-Çelik⚠️";
    const m = parse(buildFormMessage({ ...mail, subject }, STAMP));
    expect(m.headers.get("subject")).toMatch(/^=\?UTF-8\?B\?/);
    expect(decodeWords(m.headers.get("subject")!)).toBe(subject);
  });

  it("keeps accents and emoji in the text", () => {
    const text = "Señora Núñez — 你好 🙂\nsecond line";
    const m = parse(buildFormMessage({ ...mail, text }, STAMP));
    expect(m.text).toBe(text);
  });

  it("no line of the message is longer than mail allows", () => {
    const m = buildFormMessage(
      {
        ...mail,
        subject: "⚠️".repeat(60) + "x".repeat(300),
        text: "long ".repeat(2000),
      },
      STAMP
    );
    for (const line of m.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(78);
    }
  });

  // What a visitor types must never become a header of its own: a second
  // recipient, a different sender.
  it.each([
    ["a line break", "Ann\r\nBcc: thief@example.com"],
    ["a bare line feed", "Ann\nBcc: thief@example.com"],
    ["a bare carriage return", "Ann\rBcc: thief@example.com"],
    ["a line break with accents", "Zoë\r\nBcc: thief@example.com"],
  ])("a subject holding %s stays one subject", (_what, name) => {
    const built = buildFormMessage(
      {
        ...mail,
        subject: `New Appointment Request from ${name}`,
      },
      STAMP
    );
    const m = parse(built);
    expect(m.headers.has("bcc")).toBe(false);
    expect([...m.headers.keys()].sort()).toEqual(
      [
        "content-transfer-encoding",
        "content-type",
        "date",
        "from",
        "message-id",
        "mime-version",
        "reply-to",
        "subject",
        "to",
      ].sort()
    );
    expect(decodeWords(m.headers.get("subject")!)).toContain("Bcc: thief");
  });

  it.each([
    "ann@example.com\r\nBcc: thief@example.com",
    "ann@example.com, thief@example.com",
    "Ann <ann@example.com>",
    "not an address",
    "",
  ])("a Reply-To that is not one plain address is left out: %j", (replyTo) => {
    const m = parse(buildFormMessage({ ...mail, replyTo }, STAMP));
    expect(m.headers.has("reply-to")).toBe(false);
    expect(m.headers.has("bcc")).toBe(false);
  });

  it("refuses a forms address that is not one plain address", () => {
    expect(() =>
      buildFormMessage(
        { ...mail, to: "a@b.example\r\nBcc: x@y.example" },
        STAMP
      )
    ).toThrow(FormsMailError);
    expect(() =>
      buildFormMessage({ ...mail, to: "a@b.example, x@y.example" }, STAMP)
    ).toThrow(FormsMailError);
  });

  it("refuses a message name that could break out of its header", () => {
    expect(() =>
      buildFormMessage(mail, { ...STAMP, id: "x>\r\nBcc: x@y.example" })
    ).toThrow(FormsMailError);
  });
});

describe("encodeHeaderText", () => {
  it("leaves plain text as it is", () => {
    expect(encodeHeaderText("Grievance Form")).toBe("Grievance Form");
  });

  it("never cuts a character in half", () => {
    const text = "é".repeat(200) + "📞".repeat(50);
    const words = encodeHeaderText(text).split(/\r\n /);
    expect(words.length).toBeGreaterThan(1);
    for (const word of words) {
      const b64 = /^=\?UTF-8\?B\?(.*)\?=$/.exec(word)![1];
      const back = Buffer.from(b64, "base64");
      // A cut character would not survive a round trip.
      expect(Buffer.from(back.toString("utf8"), "utf8").equals(back)).toBe(
        true
      );
    }
    expect(decodeWords(words.join(" "))).toBe(text);
  });
});

// ---- sending --------------------------------------------------------------

type Call = { url: string; init: RequestInit };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A stand-in for Google: answers each address the sender talks to. */
function google(
  overrides: Record<string, () => Response | Promise<Response>> = {}
) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      for (const [part, answer] of Object.entries(overrides)) {
        if (url.includes(part)) return answer();
      }
      if (url.endsWith("/service-accounts/default/email")) {
        return new Response("site@project.example");
      }
      if (url.endsWith("/service-accounts/default/token")) {
        return json({ access_token: "site-token", expires_in: 3600 });
      }
      if (url.includes(":signJwt"))
        return json({ signedJwt: "signed.jwt.here" });
      if (url === "https://oauth2.googleapis.com/token") {
        return json({ access_token: "mailbox-token", expires_in: 3600 });
      }
      if (url.includes("gmail.googleapis.com")) return json({ id: "m1" });
      throw new Error(`unexpected request to ${url}`);
    }
  );
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const env = { FORMS_MAILBOX: MAILBOX };
const urls = (calls: Call[]) =>
  calls.map((c) => c.url.replace(/^https?:\/\//, ""));

beforeEach(() => resetFormsMailForTests());

describe("sendFormMail", () => {
  it("signs in as the site, asks to act for the mailbox, then adds the message to its Inbox", async () => {
    const g = google();
    await sendFormMail(mail, {
      fetchImpl: g.fetchImpl,
      env,
      nowMs: () => 1_700_000_000_000,
      newId: () => "11111111-2222-4333-8444-555555555555",
    });

    expect(urls(g.calls)).toEqual([
      "metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email",
      "metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      "iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/site%40project.example:signJwt",
      "oauth2.googleapis.com/token",
      "gmail.googleapis.com/gmail/v1/users/me/messages?internalDateSource=receivedTime",
    ]);

    // The metadata server answers only requests that carry this header.
    expect(new Headers(g.calls[0].init.headers).get("metadata-flavor")).toBe(
      "Google"
    );

    // What the site asks to be signed: itself, for this one mailbox, to
    // ADD messages only — not to read, not to send — for no longer than
    // an hour.
    const sign = g.calls[2];
    expect(new Headers(sign.init.headers).get("authorization")).toBe(
      "Bearer site-token"
    );
    const claims = JSON.parse(JSON.parse(String(sign.init.body)).payload);
    expect(claims).toEqual({
      iss: "site@project.example",
      sub: MAILBOX,
      scope: "https://www.googleapis.com/auth/gmail.insert",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });

    const exchange = new URLSearchParams(String(g.calls[3].init.body));
    expect(exchange.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer"
    );
    expect(exchange.get("assertion")).toBe("signed.jwt.here");

    const send = g.calls[4];
    expect(send.init.method).toBe("POST");
    expect(new Headers(send.init.headers).get("authorization")).toBe(
      "Bearer mailbox-token"
    );
    const handed = JSON.parse(String(send.init.body)) as {
      raw: string;
      labelIds: string[];
    };
    // Into the Inbox, as new mail, in the main tab.
    expect(handed.labelIds).toEqual(["INBOX", "UNREAD", "CATEGORY_PERSONAL"]);
    expect(handed.raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const added = parse(Buffer.from(handed.raw, "base64url").toString("utf8"));
    expect(added.headers.get("from")).toBe(
      "Appointment Request <forms@clinic.example>"
    );
    expect(added.headers.get("to")).toBe("forms@clinic.example");
    expect(added.headers.get("date")).toBe("Tue, 14 Nov 2023 22:13:20 +0000");
    expect(added.headers.get("message-id")).toBe(
      "<11111111-2222-4333-8444-555555555555@clinic.example>"
    );
    expect(added.text).toBe(mail.text);
  });

  it("signs in once for several messages", async () => {
    const g = google();
    const deps = {
      fetchImpl: g.fetchImpl,
      env,
      nowMs: () => 1_700_000_000_000,
    };
    await sendFormMail(mail, deps);
    await sendFormMail(mail, deps);
    expect(urls(g.calls).filter((u) => u.includes("signJwt"))).toHaveLength(1);
    expect(
      urls(g.calls).filter((u) => u.includes("gmail.googleapis.com"))
    ).toHaveLength(2);
  });

  it("signs in again once the hour is nearly over", async () => {
    const g = google();
    let now = 1_700_000_000_000;
    const deps = { fetchImpl: g.fetchImpl, env, nowMs: () => now };
    await sendFormMail(mail, deps);
    now += 59 * 60_000 + 30_000;
    await sendFormMail(mail, deps);
    expect(urls(g.calls).filter((u) => u.includes("signJwt"))).toHaveLength(2);
  });

  it("says so, and asks Google nothing, when no mailbox is set", async () => {
    const g = google();
    const failure = await sendFormMail(mail, {
      fetchImpl: g.fetchImpl,
      env: {},
    }).catch((e) => e);
    expect(failure).toBeInstanceOf(FormsMailError);
    expect(errorLabel(failure)).toBe("FormsMailError code=config");
    expect(g.calls).toHaveLength(0);
  });

  it.each([
    ["service-accounts/default/email", "metadata", 500],
    ["service-accounts/default/token", "metadata", 503],
    [":signJwt", "sign", 403],
    ["oauth2.googleapis.com/token", "token", 401],
    ["gmail.googleapis.com", "deliver", 400],
  ])("a refusal at %s is a failure named %s", async (part, step, status) => {
    const g = google({
      [part]: () =>
        json({ error: { message: `about ${mail.replyTo}` } }, status),
    });
    const failure = await sendFormMail(mail, {
      fetchImpl: g.fetchImpl,
      env,
    }).catch((e) => e);
    expect(failure).toBeInstanceOf(FormsMailError);
    // The label for the log: the step and the status, never Google's words.
    expect(errorLabel(failure)).toBe(
      `FormsMailError code=${step} status=${status}`
    );
    expect(String(failure.message)).not.toContain("ann@example.com");
  });

  it("a refused message is not remembered as a sign-in: the next one starts over", async () => {
    let refuse = true;
    const g = google({
      "gmail.googleapis.com": () =>
        refuse ? json({}, 401) : json({ id: "m2" }),
    });
    const deps = { fetchImpl: g.fetchImpl, env };
    await expect(sendFormMail(mail, deps)).rejects.toBeInstanceOf(
      FormsMailError
    );
    refuse = false;
    await sendFormMail(mail, deps);
    expect(urls(g.calls).filter((u) => u.includes("signJwt"))).toHaveLength(2);
  });

  it("gives up on a request that never answers", async () => {
    const never = () => new Promise<Response>(() => {});
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
        );
        void never;
      })) as typeof fetch;
    const failure = await sendFormMail(mail, {
      fetchImpl,
      env,
      timeoutMs: 20,
    }).catch((e) => e);
    expect(failure).toBeInstanceOf(FormsMailError);
    expect(errorLabel(failure)).toBe("FormsMailError code=metadata");
  });

  it("an answer without what was asked for is a failure, and nothing is added", async () => {
    const g = google({ ":signJwt": () => json({}) });
    const failure = await sendFormMail(mail, {
      fetchImpl: g.fetchImpl,
      env,
    }).catch((e) => e);
    expect(errorLabel(failure)).toBe("FormsMailError code=sign");
    expect(urls(g.calls).some((u) => u.includes("gmail.googleapis.com"))).toBe(
      false
    );
  });
});
