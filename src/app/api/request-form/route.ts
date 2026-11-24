import { NextResponse } from "next/server";
import { getClientIp, requestFormSchema } from "@/lib/validation";
import {
  formSubmissionsExhausted,
  recordFormSubmission,
} from "@/lib/form-rate-limit";
import { errorLabel } from "@/lib/error-label";
import { sendFormMail } from "@/lib/forms-mail";
import { FORMS_INBOX } from "@/lib/site";

const RATE_LIMIT_MSG =
  "Too many requests. Please call us at (818) 841-9790 instead.";

export async function POST(req: Request) {
  try {
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

    // Through the clinic's own mailbox (src/lib/forms-mail.ts); it throws
    // if the message could not be handed over, which the catch below
    // turns into "Failed to send email".
    await sendFormMail({
      fromName: "Appointment Request",
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email sending failed:", errorLabel(error));
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
