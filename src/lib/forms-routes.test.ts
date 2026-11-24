import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The two public forms, end to end except for Google and the database.
const sent = vi.hoisted(() => ({
  mails: [] as Record<string, unknown>[],
  fail: null as Error | null,
  exhausted: false,
}));

vi.mock("./forms-mail", async (original) => {
  const real = await original<typeof import("./forms-mail")>();
  return {
    ...real,
    sendFormMail: async (mail: Record<string, unknown>) => {
      if (sent.fail) throw sent.fail;
      sent.mails.push(mail);
    },
  };
});
vi.mock("./form-rate-limit", () => ({
  formSubmissionsExhausted: async () => sent.exhausted,
  recordFormSubmission: async () => {},
}));

import { POST as requestForm } from "@/app/api/request-form/route";
import { POST as grievanceForm } from "@/app/api/grievance-form/route";
import { FormsMailError } from "./forms-mail";
import { FORMS_INBOX } from "./site";

const post = (body: unknown) =>
  new Request("https://example.test/api/form", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const request = {
  name: "Ann Licater",
  email: "ann@example.com",
  phone: "(555) 010-0100",
  message: "Could I come in on Friday?",
};
const grievance = { subject: "Parking", message: "The lot was full." };

let logged: unknown[][];
beforeEach(() => {
  sent.mails = [];
  sent.fail = null;
  sent.exhausted = false;
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args) => {
    logged.push(args);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("the appointment-request form", () => {
  it("sends one message to the forms inbox, answerable to the visitor", async () => {
    const res = await requestForm(post(request));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(sent.mails).toHaveLength(1);
    expect(sent.mails[0]).toMatchObject({
      fromName: "Appointment Request",
      to: FORMS_INBOX,
      replyTo: "ann@example.com",
    });
    expect(String(sent.mails[0].subject)).toContain("Ann Licater");
    expect(String(sent.mails[0].text)).toContain("Could I come in on Friday?");
    expect(String(sent.mails[0].text)).toContain("(555) 010-0100");
  });

  it("sends nothing for a filled-in trap field, and says nothing of it", async () => {
    const res = await requestForm(post({ ...request, company: "Acme" }));
    expect(res.status).toBe(200);
    expect(sent.mails).toHaveLength(0);
  });

  it("sends nothing for a form that is not filled in properly", async () => {
    const res = await requestForm(
      post({ ...request, email: "not an address" })
    );
    expect(res.status).toBe(400);
    expect(sent.mails).toHaveLength(0);
  });

  it("sends nothing once the address has sent too many", async () => {
    sent.exhausted = true;
    const res = await requestForm(post(request));
    expect(res.status).toBe(429);
    expect(sent.mails).toHaveLength(0);
  });

  it("tells the visitor when it could not be sent, and logs only what kind of failure", async () => {
    sent.fail = new FormsMailError("token", 401);
    const res = await requestForm(post(request));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to send email" });
    expect(logged).toEqual([
      ["Email sending failed:", "FormsMailError code=token status=401"],
    ]);
    expect(JSON.stringify(logged)).not.toMatch(/Ann|ann@example|Friday|555/);
  });
});

describe("the grievance form", () => {
  it("sends without a name or an address when none is given", async () => {
    const res = await grievanceForm(post(grievance));
    expect(res.status).toBe(200);
    expect(sent.mails).toHaveLength(1);
    expect(sent.mails[0]).toMatchObject({
      fromName: "Grievance Form",
      to: FORMS_INBOX,
    });
    expect(sent.mails[0].replyTo).toBeUndefined();
    expect(String(sent.mails[0].subject)).toContain("Parking");
    expect(String(sent.mails[0].text)).toContain("The lot was full.");
    expect(String(sent.mails[0].text)).toContain("Name: Not provided");
  });

  it("is answerable when the visitor left an address", async () => {
    await grievanceForm(post({ ...grievance, email: "ann@example.com" }));
    expect(sent.mails[0].replyTo).toBe("ann@example.com");
  });

  it("tells the visitor when it could not be sent, and logs only what kind of failure", async () => {
    sent.fail = new FormsMailError("send", 403);
    const res = await grievanceForm(post(grievance));
    expect(res.status).toBe(500);
    expect(logged).toEqual([
      ["Error processing grievance:", "FormsMailError code=send status=403"],
    ]);
    expect(JSON.stringify(logged)).not.toMatch(/Parking|lot was full/);
  });
});

// ---- nothing else carries a form out of the building ----------------------

describe("how the forms leave", () => {
  it("no mail-sending company's library is installed", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };
    const names = Object.keys(pkg.dependencies ?? {});
    expect(
      names.filter((n) =>
        /^(resend|nodemailer|@sendgrid\/|mailgun|postmark|@mailchimp\/|@aws-sdk\/client-ses)/.test(
          n
        )
      )
    ).toEqual([]);
  });
});
