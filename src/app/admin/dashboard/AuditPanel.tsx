"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import {
  ACTION_LABELS,
  AuditEntryView,
  patientsSummary,
  STAFF_ACTIONS,
  StaffAction,
} from "@/lib/audit-log";
import { goToStaffLogin } from "@/lib/staff-login-redirect";

interface Reply {
  entries: AuditEntryView[];
  more: boolean;
  staff: string[];
  error?: string;
}

// The patient the log is narrowed to. The name is only for the label; the
// request carries the id.
export interface LogPatient {
  id: string;
  name: string;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// Dashboard → Log: what staff did with patient information — who, when,
// what, and which patients. Read-only: nothing here can be changed, and
// nothing in the app deletes a row.
//
// The question it exists for is "who looked at this patient?": the
// Patients tab links here with the log narrowed to one patient.
export default function AuditPanel({
  patient,
  onClearPatient,
}: {
  patient: LogPatient | null;
  onClearPatient: () => void;
}) {
  const [action, setAction] = useState<StaffAction | "">("");
  const [staffEmail, setStaffEmail] = useState("");
  const [entries, setEntries] = useState<AuditEntryView[]>([]);
  const [more, setMore] = useState(false);
  const [staff, setStaff] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const patientId = patient?.id ?? "";

  // Only the reply to the latest filters is shown.
  const requestRef = useRef(0);

  const fetchPage = useCallback(
    async (beforeId?: number): Promise<Reply | null> => {
      const params = new URLSearchParams();
      if (action) params.set("action", action);
      if (staffEmail) params.set("staff", staffEmail);
      if (patientId) params.set("patient", patientId);
      if (beforeId !== undefined) params.set("before", String(beforeId));
      const res = await fetch(`/api/admin/audit?${params}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        goToStaffLogin();
        return null;
      }
      const data = (await res.json().catch(() => ({}))) as Partial<Reply>;
      if (!res.ok || !data.entries) {
        throw new Error(data.error ?? "The log could not be read.");
      }
      return data as Reply;
    },
    [action, staffEmail, patientId]
  );

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const data = await fetchPage();
      if (!data || request !== requestRef.current) return;
      setEntries(data.entries);
      setMore(data.more);
      setStaff(data.staff);
      setError("");
    } catch (e) {
      if (request !== requestRef.current) return;
      setEntries([]);
      setMore(false);
      setError(e instanceof Error ? e.message : "The log could not be read.");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    const last = entries[entries.length - 1];
    if (!last || loadingMore) return;
    const request = requestRef.current;
    setLoadingMore(true);
    try {
      const data = await fetchPage(last.id);
      if (!data || request !== requestRef.current) return;
      setEntries((have) => [...have, ...data.entries]);
      setMore(data.more);
    } catch {
      setError("Couldn't load older entries.");
    } finally {
      setLoadingMore(false);
    }
  };

  const select =
    "px-3 py-2 rounded-lg border border-brand-foreground bg-brand-background";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-cream/60">
        What staff did with patient information: searches, PIN resets,
        check-ins, history views and exports, removals from the rooms board, and
        device pairing. It cannot be edited.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Kind of activity"
          value={action}
          onChange={(e) => setAction(e.target.value as StaffAction | "")}
          className={select}
        >
          <option value="">All activity</option>
          {STAFF_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
        <select
          aria-label="Staff member"
          value={staffEmail}
          onChange={(e) => setStaffEmail(e.target.value)}
          className={select}
        >
          <option value="">All staff</option>
          {staff.map((email) => (
            <option key={email} value={email}>
              {email}
            </option>
          ))}
        </select>
        {patient && (
          <span className="flex items-center gap-1 rounded-full bg-brand-primary py-1 pl-4 pr-1 text-white">
            Only {patient.name}
            <button
              aria-label={`Show all patients again`}
              onClick={onClearPatient}
              className="rounded-full p-1.5 hover:bg-white/20"
            >
              <X className="size-4" />
            </button>
          </span>
        )}
        <button
          onClick={load}
          disabled={loading}
          aria-label="Refresh the log"
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-full border border-brand-foreground hover:bg-brand-muted disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}

      {loading && entries.length === 0 ? (
        <p className="py-8 text-center text-cream/50">Loading...</p>
      ) : entries.length === 0 ? (
        !error && (
          <p className="py-8 text-center text-cream/50">
            {patient || action || staffEmail
              ? "Nothing recorded that matches."
              : "Nothing recorded yet."}
          </p>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-brand-foreground">
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Who</th>
                <th className="py-2 pr-4">What</th>
                <th className="py-2 pr-4">Patients</th>
                <th className="py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-brand-muted align-top"
                >
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {when(entry.at)}
                  </td>
                  <td className="py-2 pr-4">{entry.staffEmail}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {ACTION_LABELS[entry.action]}
                  </td>
                  <td className="py-2 pr-4">
                    {patientsSummary(entry.patientNames, entry.patientCount) ||
                      "—"}
                  </td>
                  <td className="py-2 text-cream/70">
                    {entry.action === "patient_search" && entry.detail
                      ? `“${entry.detail}”`
                      : (entry.detail ?? "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-3 text-sm text-cream/50">
            {more ? (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-4 py-1.5 rounded-full border border-brand-foreground text-cream hover:bg-brand-muted disabled:opacity-50 transition-colors"
              >
                {loadingMore ? "Loading…" : "Show older entries"}
              </button>
            ) : (
              <span>That is everything recorded.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
