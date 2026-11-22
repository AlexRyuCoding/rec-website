"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import {
  fieldBaseClass,
  linkClass,
  tableClass,
  tdClass,
  thClass,
  trClass,
} from "../ui/styles";
import Tag from "../ui/Tag";
import { createSearchRunner, type SearchRunner } from "@/lib/latest-search";
import { goToStaffLogin } from "@/lib/staff-login-redirect";
import { createTapGuard, SCREEN_CHANGE_GUARD_MS } from "@/lib/tap-guard";

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
  // "Reset PIN" is replaced, where it stood, by the button that does the
  // resetting. For a moment after that swap the new button ignores
  // presses, so the second half of a double-click cannot confirm a
  // question nobody has read (the kiosk's rule, and its timing).
  const confirmGuard = useRef(createTapGuard());

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

  const inlineLink = "underline underline-offset-[3px]";

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex gap-2.5 p-2.5">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-ui-text-3"
          />
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
            className={`${fieldBaseClass} w-full rounded-[10px] py-3 pl-[42px] pr-28 text-[17px]`}
          />
          {/* Inside the box, so it never moves anything; shown only
              when a search takes longer than a moment. */}
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ui-text-3 transition-opacity duration-200 ${
              searching ? "opacity-100 delay-300" : "opacity-0"
            }`}
          >
            Searching…
          </span>
        </div>
        {/* Never changes width: the label is the same in every state. */}
        <Button
          variant="primary"
          size="lg"
          onClick={() => searchRunner.current?.submit(query)}
          disabled={query.trim().length < SEARCH_MIN_LENGTH}
        >
          Search
        </Button>
      </Panel>

      {/* Below everything else, in the place of the results: the
          list changes with every letter typed, and nothing sits
          under it to be pushed around. On a surface of its own — the
          page behind it is a photograph. */}
      <p
        aria-live="polite"
        className="rounded-lg border border-ui-line bg-ui-panel px-3.5 py-2 text-ui-text-2 empty:hidden"
      >
        {searchError}
      </p>
      {patients.length > 0 && (
        <Panel className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Patient</th>
                  <th className={thClass}>Email</th>
                  <th className={thClass}>Phone</th>
                  <th className={thClass}>PIN</th>
                  <th className={thClass}></th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  // Rows fade in and never slide: the list changes under
                  // the staff member's hands. A patient who stays in the
                  // list keeps their row (same key), so it does not blink.
                  <tr key={p.id} className={`${trClass} ui-fade-in`}>
                    <td className={`${tdClass} font-semibold`}>
                      {p.first_name} {p.last_name}
                    </td>
                    <td className={`${tdClass} break-words text-ui-text-2`}>
                      {p.email ?? "—"}
                    </td>
                    <td
                      className={`${tdClass} whitespace-nowrap tabular-nums text-ui-text-2`}
                    >
                      {p.phone ?? "—"}
                    </td>
                    <td className={tdClass}>
                      {p.has_pin ? (
                        <Tag>Set</Tag>
                      ) : (
                        <span className="text-[13px] text-ui-text-3">None</span>
                      )}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      {/* Always in the same order, lightest first: Log,
                          Reset PIN, Check in. */}
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
                            className={linkClass}
                          >
                            Log
                          </button>
                        )}
                        {resetDoneId === p.id ? (
                          <span className="ui-fade-in text-ui-accent-text">
                            Cleared — patient can set a new PIN at the kiosk
                          </span>
                        ) : p.has_pin ? (
                          confirmingId === p.id ? (
                            <span className="ui-fade-in flex flex-wrap justify-end gap-2">
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => {
                                  if (confirmGuard.current.blocked()) return;
                                  resetPin(p.id);
                                }}
                              >
                                Reset PIN for {p.first_name} {p.last_name}
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => setConfirmingId(null)}
                              >
                                Cancel
                              </Button>
                            </span>
                          ) : (
                            <>
                              {resetFailedId === p.id && (
                                <span role="alert" className="text-ui-error">
                                  PIN not reset — try again
                                </span>
                              )}
                              <Button
                                size="sm"
                                onClick={() => {
                                  confirmGuard.current.block(
                                    SCREEN_CHANGE_GUARD_MS
                                  );
                                  setConfirmingId(p.id);
                                }}
                              >
                                Reset PIN
                              </Button>
                            </>
                          )
                        ) : null}
                        {/* Hidden while the reset question is open:
                            that row holds one decision at a time. */}
                        {confirmingId !== p.id &&
                          (checkins[p.id] === "created" ? (
                            <span className="ui-fade-in text-ui-accent-text">
                              Checked in ·{" "}
                              <Link href="/admin/rooms" className={inlineLink}>
                                Rooms board
                              </Link>
                            </span>
                          ) : checkins[p.id] === "duplicate" ? (
                            <span className="ui-fade-in text-ui-text-2">
                              Already on the{" "}
                              <Link href="/admin/rooms" className={inlineLink}>
                                rooms board
                              </Link>
                            </span>
                          ) : (
                            <>
                              {checkins[p.id] === "error" && (
                                <span role="alert" className="text-ui-error">
                                  Couldn&apos;t check in — try again
                                </span>
                              )}
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => checkIn(p.id)}
                                disabled={checkins[p.id] === "busy"}
                                aria-label={`Check in ${p.first_name} ${p.last_name}`}
                              >
                                {checkins[p.id] === "busy"
                                  ? "Checking in…"
                                  : "Check in"}
                              </Button>
                            </>
                          ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {moreMatches && (
            <p className="border-t border-ui-line px-[18px] py-2.5 text-[13px] text-ui-text-3">
              Showing the {patients.length} closest matches. Type more of the
              name to narrow the list.
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}
