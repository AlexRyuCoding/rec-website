import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

interface GrievanceFormData {
  name?: string;
  email?: string;
  phone?: string;
  subject: string;
  message: string;
}

// Validate required environment variables
const requiredEnvVars = ["EMAIL_USER", "EMAIL_PASS"];

function validateEnvVars() {
  const missing = requiredEnvVars.filter((varName) => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

// Validate input data
function validateInput(data: GrievanceFormData) {
  if (!data.subject?.trim()) {
    throw new Error("Subject is required");
  }
  if (!data.message?.trim()) {
    throw new Error("Message is required");
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw new Error("Invalid email format");
  }
  if (data.phone && !/^\+?[\d\s-()]{10,}$/.test(data.phone)) {
    throw new Error("Invalid phone number format");
  }
}

export async function POST(req: Request) {
  try {
    // Validate environment variables
    validateEnvVars();

    // Parse and validate request data
    const data = await req.json();
    validateInput(data);

    const { name, email, phone, subject, message } = data;

    // Create a transporter using Gmail SMTP
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Prepare email content with better formatting
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

    // Send email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "ryuacupuncture@yahoo.com",
      subject: `‼️⚠️New Grievance: ${subject}`,
      text: emailContent,
    });

    return NextResponse.json({
      success: true,
      message: "Grievance submitted successfully",
    });
  } catch (error) {
    console.error("Error processing grievance:", error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes("Missing required environment variables")) {
        return NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 }
        );
      }
      if (
        error.message.includes("required") ||
        error.message.includes("Invalid")
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json(
      { error: "Failed to process grievance" },
      { status: 500 }
    );
  }
}
