"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, UserCheck } from "lucide-react";
import { CLINIC_TZ } from "@/lib/clinic-time";
import {
  arrivalLabel,
  arrivalStatus,
  ArrivalStatus,
  ExpectedRow,
} from "@/lib/expected";
import { matchRosterDoctor, VisitView } from "@/lib/patient-flow";
import { doctorColorClasses, DoctorRow } from "@/lib/room-status";
import { goToStaffLogin } from "@/lib/staff-login-redirect";

interface Reply {
  expected: ExpectedRow[];
  unmatched: number;
  fetchedAt: string;
  stale: boolean;
  complete: boolean;
  error?: string;
}

// The list is read again this often while it is open (who has checked
// in is always fresh; the schedule itself is a shared copy the server
// renews every five minutes).
const RELOAD_MS = 60_000;

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: CLINIC_TZ,
  });

const STATUS_STYLE: Record<ArrivalStatus, string> = {
  upcoming: "text-white/60",
  due: "text-white",
  late: "font-semibold text-amber-300",
  very_late: "font-bold text-rose-300",
};

// Who is still expected today: Practice Better's appointments for the
// day whose patients have not checked in, earliest first, each with a
// "Check in" for staff — the patient who walked past the kiosk, or
// cannot manage it. Late arrivals turn amber, then red.
//
// Names are "First L." like everything on this board.
export default function ExpectedPanel({
  visits,
  doctors,
  nowMs,
}: {
  // Everyone on the board: a change here (someone checked in) means the
  // list below has changed too.
  visits: VisitView[];
  doctors: DoctorRow[];
  nowMs: number;
}) {
  const [list, setList] = useState<Reply | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Per patient: a check-in on its way, or one that failed.
  const [checking, setChecking] = useState<Record<string, "busy" | "error">>(
    {}
  );
  const requestRef = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/expected${refresh ? "?refresh=1" : ""}`,
        { cache: "no-store" }
      );
      if (res.status === 401) {
        goToStaffLogin();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as Partial<Reply>;
      if (request !== requestRef.current) return;
      if (!res.ok || !data.expected) {
        // Keep showing the list we have; say that it could not be renewed.
        setError(data.error ?? "Today's appointments could not be loaded.");
        return;
      }
      setList(data as Reply);
      setError("");
    } catch {
      if (request === requestRef.current) {
        setError("Today's appointments could not be loaded.");
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  const boardKey = visits.map((v) => v.id).join("|");
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), RELOAD_MS);
    return () => clearInterval(t);
  }, [load, boardKey]);

  const checkIn = async (patientId: string) => {
    setChecking((all) => ({ ...all, [patientId]: "busy" }));
    try {
      const res = await fetch("/api/admin/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patientId }),
      });
      if (res.status === 401) {
        goToStaffLogin();
        return;
      }
      if (!res.ok) throw new Error();
      // Gone from the list at once; the board's own update follows.
      setList((have) =>
        have
          ? {
              ...have,
              expected: have.expected.filter((r) => r.patientId !== patientId),
            }
          : have
      );
      setChecking((all) => {
        const rest = { ...all };
        delete rest[patientId];
        return rest;
      });
      void load();
    } catch {
      setChecking((all) => ({ ...all, [patientId]: "error" }));
    }
  };

  return (
    <div className="mt-2.5 border-t border-white/10 pt-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50">
        <span>
          {list
            ? `Appointments from Practice Better, as of ${formatTime(list.fetchedAt)}.`
            : "Today's appointments from Practice Better."}
        </span>
        {list?.stale && (
          <span className="text-amber-300">
            Practice Better can&apos;t be reached — this list may be out of
            date.
          </span>
        )}
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="ml-auto flex min-h-8 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-white/80 hover:bg-white/20 disabled:opacity-40"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="py-1 text-sm text-amber-300">
          {error}
        </p>
      )}

      {list === null ? (
        !error && <p className="py-2 text-sm text-white/50">Loading…</p>
      ) : list.expected.length === 0 ? (
        <p className="py-2 text-sm text-white/50">
          Everyone with an appointment today has checked in.
        </p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {list.expected.map((row) => {
            const status = arrivalStatus(row.at, nowMs);
            const rosterName = matchRosterDoctor(row.practitioner, doctors);
            const rosterColor = doctors.find(
              (d) => d.name === rosterName
            )?.color;
            const state = checking[row.patientId];
            return (
              <li
                key={row.patientId}
                data-expected={row.patientId}
                data-arrival={status}
                className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-1.5"
              >
                <span className="w-[4.5rem] shrink-0 text-sm font-semibold tabular-nums">
                  {formatTime(row.at)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {row.displayName}
                    <span className={`ml-2 text-xs ${STATUS_STYLE[status]}`}>
                      {arrivalLabel(row.at, nowMs)}
                    </span>
                  </p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-white/50">
                    {row.practitioner && (
                      <span className="flex items-center gap-1">
                        {rosterName && (
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${doctorColorClasses(
                              rosterColor
                            )}`}
                          />
                        )}
                        {rosterName ?? row.practitioner}
                      </span>
                    )}
                    {row.practitioner && row.service && (
                      <span aria-hidden>·</span>
                    )}
                    {row.service && (
                      <span className="truncate">{row.service}</span>
                    )}
                  </p>
                </div>
                {state === "error" && (
                  <span role="alert" className="text-xs text-rose-300">
                    Not checked in — try again
                  </span>
                )}
                <button
                  disabled={state === "busy"}
                  onClick={() => checkIn(row.patientId)}
                  aria-label={`Check in ${row.displayName}`}
                  className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-white/90 px-3 text-sm font-semibold text-neutral-900 hover:bg-white disabled:opacity-40"
                >
                  <UserCheck className="h-4 w-4" />
                  {state === "busy" ? "Checking in…" : "Check in"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {list && list.unmatched > 0 && (
        <p className="pt-2 text-xs text-white/50">
          {list.unmatched} more appointment{list.unmatched === 1 ? "" : "s"}{" "}
          today {list.unmatched === 1 ? "is" : "are"} for a patient not in the
          patient list yet. Dashboard → Setup → Quick sync brings them in.
        </p>
      )}
      {list && !list.complete && (
        <p className="pt-1 text-xs text-amber-300">
          Today has more appointments than could be read; this list may be
          missing some.
        </p>
      )}
    </div>
  );
}
