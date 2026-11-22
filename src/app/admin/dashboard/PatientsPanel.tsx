"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSearchRunner, type SearchRunner } from "@/lib/latest-search";
import { goToStaffLogin } from "@/lib/staff-login-redirect";

interface PatientRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  has_pin: boolean;
}

// Where a staff check-in from the search results stands, per patient.
type CheckinStatus = "busy" | "created" | "duplicate" | "error";

interface SearchReply {
  status: number;
  ok: boolean;
  data: { patients?: PatientRow[]; more?: boolean; error?: string };
}

// How long typing has to pause before the search goes out.
const SEARCH_DELAY_MS = 250;
const SEARCH_MIN_LENGTH = 2;

// Dashboard → Patients: find a patient (by name, email or phone), check
// them in, or reset their PIN. Rules for the search itself are in
// CLAUDE.md under "Patient search".
export default function PatientsPanel({
  autoFocus,
  onShowLog,
}: {
  autoFocus: boolean;
  // Open the Log tab narrowed to this patient: who searched for them,
  // reset their PIN, saw them in the check-in history.
  onShowLog: (patient: { id: string; name: string }) => void;
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Opened from the rooms board's "Check in a patient": ready to type.
  useEffect(() => {
    if (autoFocus) searchInputRef.current?.focus();
  }, [autoFocus]);

  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  // the search matched more patients than the list shows
  const [moreMatches, setMoreMatches] = useState(false);
  // id of the patient whose Reset button is in confirm state
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [resetDoneId, setResetDoneId] = useState<string | null>(null);
  const [resetFailedId, setResetFailedId] = useState<string | null>(null);
  const [checkins, setCheckins] = useState<Record<string, CheckinStatus>>({});

  // Searches as the staff member types (and at once on Enter / Search).
  // The runner sends one request after typing pauses and only ever hands
  // back the reply to the latest text — see src/lib/latest-search.ts.
  const searchRunner = useRef<SearchRunner | null>(null);
  useEffect(() => {
    const showNothing = (message: string) => {
      setPatients([]);
      setMoreMatches(false);
      setSearchError(message);
      setConfirmingId(null);
      setResetDoneId(null);
      setResetFailedId(null);
      setCheckins({});
    };
    const runner = createSearchRunner<SearchReply>({
      delayMs: SEARCH_DELAY_MS,
      minLength: SEARCH_MIN_LENGTH,
      // POST, text in the body: a patient's name must not be in the address.
      run: async (text, signal) => {
        const res = await fetch("/api/admin/patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: text }),
          signal,
        });
        const data = await res.json().catch(() => ({}));
        return { status: res.status, ok: res.ok, data };
      },
      onStart: () => setSearching(true),
      onResult: (reply) => {
        setSearching(false);
        if (reply.status === 401) {
          goToStaffLogin();
          return;
        }
        if (!reply.ok) {
          showNothing(reply.data.error ?? "Search failed");
          return;
        }
        const found = reply.data.patients ?? [];
        showNothing(found.length === 0 ? "No patients found." : "");
        setPatients(found);
        setMoreMatches(reply.data.more === true);
      },
      onError: () => {
        setSearching(false);
        showNothing("Search failed");
      },
      onClear: () => {
        setSearching(false);
        showNothing("");
      },
    });
    searchRunner.current = runner;
    return () => runner.cancel();
  }, []);

  // A reset that did not happen must say so: staff are about to tell the
  // patient "your PIN is cleared, make a new one at the kiosk".
  const resetPin = async (id: string) => {
    setResetFailedId(null);
    try {
      const res = await fetch("/api/admin/reset-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: id }),
      });
      if (res.status === 401) {
        goToStaffLogin();
        return;
      }
      if (res.ok) {
        setPatients((ps) =>
          ps.map((p) => (p.id === id ? { ...p, has_pin: false } : p))
        );
        setResetDoneId(id);
      } else {
        setResetFailedId(id);
      }
    } catch {
      setResetFailedId(id);
    } finally {
      setConfirmingId(null);
    }
  };

  // Staff check a patient in themselves: a walk-in, a forgotten PIN, the
  // kiosk being down, or someone taken off the rooms board by mistake.
  // The patient lands in the board's waiting list like any check-in.
  const checkIn = async (id: string) => {
    const mark = (status: CheckinStatus) =>
      setCheckins((all) => ({ ...all, [id]: status }));
    mark("busy");
    try {
      const res = await fetch("/api/admin/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: id }),
      });
      if (res.status === 401) {
        goToStaffLogin();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        mark("error");
        return;
      }
      mark(data.duplicate ? "duplicate" : "created");
    } catch {
      mark("error");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              searchRunner.current?.type(e.target.value);
            }}
            onKeyDown={(e) =>
              e.key === "Enter" && searchRunner.current?.submit(query)
            }
            placeholder="Search by name, email, or phone"
            autoComplete="off"
            className="w-full pl-4 pr-28 py-2 border border-brand-foreground rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          {/* Inside the box, so it never moves anything; shown only
              when a search takes longer than a moment. */}
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-cream/50 transition-opacity duration-200 ${
              searching ? "opacity-100 delay-300" : "opacity-0"
            }`}
          >
            Searching…
          </span>
        </div>
        <button
          onClick={() => searchRunner.current?.submit(query)}
          disabled={query.trim().length < SEARCH_MIN_LENGTH}
          className="px-6 py-2 rounded-lg bg-brand-primary text-white hover:bg-brand-secondary disabled:opacity-50 transition-colors"
        >
          Search
        </button>
      </div>

      {/* Below everything else, in the place of the results: the
          list changes with every letter typed, and nothing sits
          under it to be pushed around. */}
      <p aria-live="polite" className="text-cream/50 empty:hidden">
        {searchError}
      </p>
      {patients.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-brand-foreground">
                <th className="py-2 pr-4">Patient</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Phone</th>
                <th className="py-2 pr-4">PIN</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} className="border-b border-brand-muted">
                  <td className="py-2 pr-4">
                    {p.first_name} {p.last_name}
                  </td>
                  <td className="py-2 pr-4">{p.email ?? "—"}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {p.phone ?? "—"}
                  </td>
                  <td className="py-2 pr-4">{p.has_pin ? "Set" : "None"}</td>
                  <td className="py-2 text-right">
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      {confirmingId !== p.id && (
                        <button
                          onClick={() =>
                            onShowLog({
                              id: p.id,
                              name: `${p.first_name} ${p.last_name}`.trim(),
                            })
                          }
                          aria-label={`Log for ${p.first_name} ${p.last_name}`}
                          className="px-2 py-1 text-sm text-cream/60 underline hover:text-cream"
                        >
                          Log
                        </button>
                      )}
                      {/* Hidden while the reset question is open:
                          that row holds one decision at a time. */}
                      {confirmingId !== p.id &&
                        (checkins[p.id] === "created" ? (
                          <span className="text-brand-primary">
                            Checked in ·{" "}
                            <Link href="/admin/rooms" className="underline">
                              Rooms board
                            </Link>
                          </span>
                        ) : checkins[p.id] === "duplicate" ? (
                          <span className="text-cream/60">
                            Already on the{" "}
                            <Link href="/admin/rooms" className="underline">
                              rooms board
                            </Link>
                          </span>
                        ) : (
                          <>
                            {checkins[p.id] === "error" && (
                              <span role="alert" className="text-error">
                                Couldn&apos;t check in — try again
                              </span>
                            )}
                            <button
                              onClick={() => checkIn(p.id)}
                              disabled={checkins[p.id] === "busy"}
                              aria-label={`Check in ${p.first_name} ${p.last_name}`}
                              className="px-3 py-1 rounded-full bg-brand-primary text-white hover:bg-brand-secondary disabled:opacity-50 transition-colors"
                            >
                              {checkins[p.id] === "busy"
                                ? "Checking in…"
                                : "Check in"}
                            </button>
                          </>
                        ))}
                      {resetDoneId === p.id ? (
                        <span className="text-brand-primary">
                          Cleared — patient can set a new PIN at the kiosk
                        </span>
                      ) : p.has_pin ? (
                        confirmingId === p.id ? (
                          <span className="flex gap-2 justify-end">
                            <button
                              onClick={() => resetPin(p.id)}
                              className="px-3 py-1 rounded-full bg-error text-white hover:bg-error/80 transition-colors"
                            >
                              Reset PIN for {p.first_name} {p.last_name}
                            </button>
                            <button
                              onClick={() => setConfirmingId(null)}
                              className="px-3 py-1 rounded-full border border-brand-foreground hover:bg-brand-muted transition-colors"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <>
                            {resetFailedId === p.id && (
                              <span role="alert" className="text-error">
                                PIN not reset — try again
                              </span>
                            )}
                            <button
                              onClick={() => setConfirmingId(p.id)}
                              className="px-3 py-1 rounded-full border border-brand-foreground hover:bg-brand-muted transition-colors"
                            >
                              Reset PIN
                            </button>
                          </>
                        )
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {moreMatches && (
            <p className="pt-3 text-sm text-cream/50">
              Showing the {patients.length} closest matches. Type more of the
              name to narrow the list.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
