import { NextResponse } from "next/server";
import { getClientIp, grievanceFormSchema } from "@/lib/validation";
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

    const parsed = grievanceFormSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please check the form fields and try again." },
        { status: 400 }
      );
    }
    const { name, email, phone, subject, message, company } = parsed.data;

    if (company) {
      return NextResponse.json({ success: true });
    }

    const ip = getClientIp(req);
    if (await formSubmissionsExhausted(ip)) {
      return NextResponse.json({ error: RATE_LIMIT_MSG }, { status: 429 });
    }
    await recordFormSubmission(ip);

    const timestamp = new Date().toLocaleString();
    const emailContent = `
New Grievance Submission
Time: ${timestamp}

Subject: ${subject}

Message:
${message}

Contact Information:
${name ? `Name: ${name}` : "Name: Not provided"}
${email ? `Email: ${email}` : "Email: Not provided"}
${phone ? `Phone: ${phone}` : "Phone: Not provided"}
    `.trim();

    // Through the clinic's own mailbox (src/lib/forms-mail.ts); it throws
    // if the message could not be handed over.
    await sendFormMail({
      fromName: "Grievance Form",
      to: FORMS_INBOX,
      replyTo: email,
      subject: `‼️⚠️New Grievance: ${subject}`,
      text: emailContent,
    });

    return NextResponse.json({
      success: true,
      message: "Grievance submitted successfully",
    });
  } catch (error) {
    console.error("Error processing grievance:", errorLabel(error));
    return NextResponse.json(
      { error: "Failed to process grievance" },
      { status: 500 }
    );
  }
}
