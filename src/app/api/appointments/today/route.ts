import { NextResponse } from "next/server";
import { PB_BASE, getPbToken } from "@/lib/practice-better";

interface PbSession {
  sessionDate?: string;
  cancelled?: boolean;
  consultant?: {
    profile?: { firstName?: string; lastName?: string };
  };
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
    // Clinic-local date — server may run in UTC
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Los_Angeles",
    });

    const params = new URLSearchParams({
      records: pb_client_id,
      date_eq: today,
    });
    const res = await fetch(`${PB_BASE}/consultant/sessions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error("PB sessions fetch failed:", res.status);
      return NextResponse.json({ appointment: null });
    }

    const data = await res.json();
    const sessions = ((data.items ?? []) as PbSession[])
      .filter((s) => !s.cancelled && s.sessionDate)
      .sort((a, b) => a.sessionDate!.localeCompare(b.sessionDate!));

    if (sessions.length === 0) {
      return NextResponse.json({ appointment: null });
    }

    const appt = sessions[0];
    const profile = appt.consultant?.profile;
    const practitionerName = profile
      ? `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() || null
      : null;

    const appointmentTime = new Date(appt.sessionDate!).toLocaleTimeString(
      "en-US",
      {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Los_Angeles",
      }
    );

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
