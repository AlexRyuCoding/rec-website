import { NextResponse } from "next/server";
import { Resend } from "resend";

// Sender must be on a Resend-verified domain in production.
// onboarding@resend.dev only delivers to the Resend account owner's inbox.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
const TO_EMAIL = "ryuacupuncture@yahoo.com";

export async function POST(req: Request) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { name, email, phone, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const { error } = await resend.emails.send({
      from: `Appointment Request <${FROM_EMAIL}>`,
      to: TO_EMAIL,
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
      console.error("Email sending failed:", error);
      return NextResponse.json(
        { error: "Failed to send email" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email sending failed:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
