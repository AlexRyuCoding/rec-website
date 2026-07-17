import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getClientIp, grievanceFormSchema } from "@/lib/validation";
import {
  formSubmissionsExhausted,
  recordFormSubmission,
} from "@/lib/form-rate-limit";

// Sender must be on a Resend-verified domain in production.
// onboarding@resend.dev only delivers to the Resend account owner's inbox.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
const TO_EMAIL = "ryuacupuncture@yahoo.com";
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

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: `Grievance Form <${FROM_EMAIL}>`,
      to: TO_EMAIL,
      ...(email ? { replyTo: email } : {}),
      subject: `‼️⚠️New Grievance: ${subject}`,
      text: emailContent,
    });

    if (error) {
      console.error("Grievance email failed:", error.message);
      return NextResponse.json(
        { error: "Failed to process grievance" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Grievance submitted successfully",
    });
  } catch (error) {
    console.error("Error processing grievance:", error);
    return NextResponse.json(
      { error: "Failed to process grievance" },
      { status: 500 }
    );
  }
}
