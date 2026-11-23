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
import Banner from "../ui/Banner";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import {
  selectClass,
  tableClass,
  tdClass,
  thClass,
  trClass,
} from "../ui/styles";
import Tag from "../ui/Tag";

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

// Dashboard → Log: who signed in, and what staff did with patient
// information — who, when, what, and which patients. Read-only: nothing
// here can be changed, and nothing in the app deletes a row.
//
// The question it exists for is "who looked at this patient?": the
// Patients tab links here with the log narrowed to one patient.
//
// A "Sign-in refused" row has, under Who, the address of a Google account
// that is not staff. That text was chosen by a stranger: it is shown as
// text like everything else here, and a very long one wraps inside its
// column instead of pushing the table off the page. Strangers are never
// in the "Staff member" list — that is the staff list itself (the route).

// An address longer than any staff member's is allowed to break anywhere.
// Ordinary ones keep their column exactly as it was.
const LONG_ADDRESS = 40;
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

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-wrap items-center gap-2 px-2.5 pb-[9px] pt-2">
        <select
          aria-label="Kind of activity"
          value={action}
          onChange={(e) => setAction(e.target.value as StaffAction | "")}
          className={selectClass}
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
          className={selectClass}
        >
          <option value="">All staff</option>
          {staff.map((email) => (
            <option key={email} value={email}>
              {email}
            </option>
          ))}
        </select>
        {/* A rectangle, not a pill: it can be pressed away. */}
        {patient && (
          <span className="flex items-center gap-1 rounded-md border border-ui-accent-text bg-ui-panel py-1 pl-3 pr-1 text-sm font-medium text-ui-accent-text">
            Only {patient.name}
            <button
              aria-label={`Show all patients again`}
              onClick={onClearPatient}
              className="rounded p-1 hover:bg-ui-panel-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ui-accent-text"
            >
              <X aria-hidden className="size-4" />
            </button>
          </span>
        )}
        <Button
          variant="quiet"
          onClick={load}
          disabled={loading}
          aria-label="Refresh the log"
          className="ml-auto"
        >
          <RefreshCw
            aria-hidden
            className={`size-4 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </Panel>

      {error && (
        <Banner tone="error" role="alert">
          {error}
        </Banner>
      )}

      <Panel className="overflow-hidden">
        <p className="border-b border-ui-line px-[18px] py-3 text-sm text-ui-text-2">
          Who signed in or out, which accounts were refused, and what staff did
          with patient information: searches, PIN resets, check-ins, history
          views and exports, removals from the rooms board, and device pairing.
          It cannot be edited.
        </p>
        {loading && entries.length === 0 ? (
          <p className="py-10 text-center text-ui-text-3">Loading...</p>
        ) : entries.length === 0 ? (
          !error && (
            <p className="py-10 text-center text-ui-text-3">
              {patient || action || staffEmail
                ? "Nothing recorded that matches."
                : "Nothing recorded yet."}
            </p>
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>When</th>
                    <th className={thClass}>Who</th>
                    <th className={thClass}>What</th>
                    <th className={thClass}>Patients</th>
                    <th className={thClass}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className={`${trClass} align-top`}>
                      <td
                        className={`${tdClass} whitespace-nowrap tabular-nums text-ui-text-2`}
                      >
                        {when(entry.at)}
                      </td>
                      <td
                        className={`${tdClass} text-ui-text-2 ${
                          entry.staffEmail.length > LONG_ADDRESS
                            ? "min-w-[12rem] max-w-[22rem] break-all"
                            : ""
                        }`}
                      >
                        {entry.staffEmail}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        <Tag>{ACTION_LABELS[entry.action]}</Tag>
                      </td>
                      <td className={tdClass}>
                        {patientsSummary(
                          entry.patientNames,
                          entry.patientCount
                        ) || "—"}
                      </td>
                      <td className={`${tdClass} text-ui-text-2`}>
                        {entry.action === "patient_search" && entry.detail
                          ? `“${entry.detail}”`
                          : (entry.detail ?? "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3 border-t border-ui-line px-[18px] py-2.5 text-[13px] text-ui-text-3">
              {more ? (
                <Button size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Show older entries"}
                </Button>
              ) : (
                <span>That is everything recorded.</span>
              )}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
