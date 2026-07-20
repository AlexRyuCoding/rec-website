import { NextResponse } from "next/server";
import { CLINIC_TZ, fetchTodaySession } from "@/lib/practice-better";
import { isAdminAuthorized } from "@/lib/admin-auth";

export async function GET(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const pb_client_id = searchParams.get("pb_client_id");

  if (!pb_client_id) {
    return NextResponse.json(
      { error: "pb_client_id required" },
      { status: 400 }
    );
  }

  try {
    const session = await fetchTodaySession(pb_client_id);
    if (!session) {
      return NextResponse.json({ appointment: null });
    }

    const start = new Date(session.sessionDate);
    const appointmentTime = start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: CLINIC_TZ,
    });
    const appointmentDate = start.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: CLINIC_TZ,
    });

    return NextResponse.json({
      appointment: {
        time: appointmentTime,
        date: appointmentDate,
        practitioner: session.practitioner,
      },
    });
  } catch (err) {
    console.error("Appointments fetch error:", err);
    return NextResponse.json({ appointment: null });
  }
}
