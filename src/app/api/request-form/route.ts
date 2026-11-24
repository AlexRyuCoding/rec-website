import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getClientIp, requestFormSchema } from "@/lib/validation";
import {
  formSubmissionsExhausted,
  recordFormSubmission,
} from "@/lib/form-rate-limit";
import { errorLabel } from "@/lib/error-label";
import { FORMS_INBOX } from "@/lib/site";

// Sender must be on a Resend-verified domain in production.
// onboarding@resend.dev only delivers to the Resend account owner's inbox.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
const RATE_LIMIT_MSG =
  "Too many requests. Please call us at (818) 841-9790 instead.";

export async function POST(req: Request) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const parsed = requestFormSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please check the form fields and try again." },
        { status: 400 }
      );
    }
    const { name, email, phone, message, company } = parsed.data;

    // Honeypot tripped: report success, send nothing.
    if (company) {
      return NextResponse.json({ success: true });
    }

    const ip = getClientIp(req);
    if (await formSubmissionsExhausted(ip)) {
      return NextResponse.json({ error: RATE_LIMIT_MSG }, { status: 429 });
    }
    await recordFormSubmission(ip);

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: `Appointment Request <${FROM_EMAIL}>`,
      to: FORMS_INBOX,
      replyTo: email,
      subject: `☎️📞New Appointment Request from ${name}⚠️`,
      text: `
You received a new appointment request:

Name: ${name}
Email: ${email}
Phone: ${phone}
Message:
${message}
      `,
    });

    if (error) {
      console.error("Email sending failed:", errorLabel(error));
      return NextResponse.json(
        { error: "Failed to send email" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email sending failed:", errorLabel(error));
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
