import { NextResponse } from "next/server";

const PB_BASE = "https://api.practicebetter.io/v1";

async function getPbToken(): Promise<string> {
  if (!process.env.PB_CLIENT_ID || !process.env.PB_CLIENT_SECRET) {
    throw new Error("PB credentials not configured");
  }
  const res = await fetch(`${PB_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.PB_CLIENT_ID,
      client_secret: process.env.PB_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error("Failed to get Practice Better token");
  const data = await res.json();
  return data.access_token as string;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pb_client_id = searchParams.get("pb_client_id");

  if (!pb_client_id) {
    return NextResponse.json(
      { error: "pb_client_id required" },
      { status: 400 }
    );
  }

  try {
    const token = await getPbToken();
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const res = await fetch(
      `${PB_BASE}/appointments?client_id=${encodeURIComponent(pb_client_id)}&date=${today}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      console.error("PB appointments fetch failed:", res.status);
      return NextResponse.json({ appointment: null });
    }

    const data = await res.json();
    // Practice Better returns { data: [...] } or { appointments: [...] }
    // Adjust the key below once you verify with a real response.
    const appointments: Array<Record<string, unknown>> = (data.data ??
      data.appointments ??
      []) as Array<Record<string, unknown>>;

    if (appointments.length === 0) {
      return NextResponse.json({ appointment: null });
    }

    const appt = appointments[0];
    // Adjust field names below to match actual PB API response.
    const startRaw = (appt.start_time ??
      appt.start ??
      appt.starts_at ??
      "") as string;
    const practitioner = (appt.staff ?? appt.practitioner) as
      | Record<string, string>
      | undefined;
    const practitionerName = practitioner
      ? `${practitioner.first_name ?? ""} ${practitioner.last_name ?? ""}`.trim()
      : null;

    const appointmentTime = startRaw
      ? new Date(startRaw).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/Los_Angeles",
        })
      : null;

    return NextResponse.json({
      appointment: {
        time: appointmentTime,
        practitioner: practitionerName,
      },
    });
  } catch (err) {
    console.error("Appointments fetch error:", err);
    return NextResponse.json({ appointment: null });
  }
}
