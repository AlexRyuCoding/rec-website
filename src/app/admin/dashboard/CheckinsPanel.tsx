"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  customRange,
  DateRange,
  defaultCustomDates,
  presetRange,
  rangeIncludesNow,
  RangePreset,
} from "@/lib/checkin-range";
import { FLOW_EVENT, ROOMS_CHANNEL } from "@/lib/rooms-realtime";
import { goToStaffLogin } from "@/lib/staff-login-redirect";
import { createBrowserClient } from "@/lib/supabase-browser";
import {
  CheckinRecord,
  checkinsCsv,
  checkinStatus,
  isOpenStatus,
  Measure,
  PractitionerSummary,
  statusLabel,
  VisitSummary,
  visitTimes,
} from "@/lib/visit-stats";

interface Stats {
  all: VisitSummary;
  byPractitioner: PractitionerSummary[];
  // false = the range was too large to read in full.
  complete: boolean;
}

interface Reply {
  checkins: CheckinRecord[];
  total: number;
  truncated: boolean;
  stats: Stats | null;
  error?: string;
}

const PRESETS: [RangePreset, string][] = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["week", "Past week"],
  ["month", "This month"],
  ["custom", "Custom"],
];

// While the range reaches today the view keeps itself current: at once
// when the rooms board changes (a check-in, a room given, a visit
// finished), and once a minute regardless.
const REFRESH_MS = 60_000;
// A burst of board changes is one refresh.
const HINT_DEBOUNCE_MS = 600;
// An export of everything stops here rather than running for ever.
const EXPORT_MAX_PAGES = 40;

const timeOnly = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
const dateAndTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const minutes = (n: number | null) => (n === null ? "—" : `${n} min`);

// One number of the summary: the typical (median) time, how many visits
// it is based on and the longest.
function MeasureTile({ label, measure }: { label: string; measure: Measure }) {
  return (
    <div className="min-w-40 flex-1 rounded-lg border border-brand-foreground/40 px-4 py-3">
      <p className="text-sm text-cream/60">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">
        {minutes(measure.median)}
      </p>
      <p className="text-xs text-cream/50">
        {measure.count === 0
          ? "no visits yet"
          : `typical of ${measure.count} · longest ${minutes(measure.longest)}`}
      </p>
    </div>
  );
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-28 flex-1 rounded-lg border border-brand-foreground/40 px-4 py-3">
      <p className="text-sm text-cream/60">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// Dashboard → Check-ins: who checked in, where each visit stands, and how
// long patients waited — for today or any range. `active` is false while
// another tab of the dashboard is showing; the view then stops refreshing.
export default function CheckinsPanel({ active }: { active: boolean }) {
  const [preset, setPreset] = useState<RangePreset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<CheckinRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  // "Loading…" in place of the list: only for a new range. A refresh of
  // the same range keeps the list on screen and just spins the icon, so
  // the table does not blink once a minute.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  // Re-read once a minute so "Waiting · 8 min" keeps counting.
  const [nowMs, setNowMs] = useState(() => Date.now());

  // The range as of this moment ("Today" at 00:05 is the new day).
  const currentRange = useCallback((): DateRange | null => {
    return preset === "custom"
      ? customRange(customFrom, customTo)
      : presetRange(preset, new Date());
  }, [preset, customFrom, customTo]);

  // forExport: the request is for a CSV file — the server writes that to
  // the staff audit log as an export rather than a view.
  const fetchPage = async (
    range: DateRange,
    offset: number,
    forExport = false
  ) => {
    const res = await fetch(
      `/api/admin/checkins?from=${range.from.toISOString()}&to=${range.to.toISOString()}&offset=${offset}${
        forExport ? "&export=1" : ""
      }`,
      { cache: "no-store" }
    );
    if (res.status === 401) {
      goToStaffLogin();
      return null;
    }
    const data = (await res.json().catch(() => ({}))) as Partial<Reply>;
    if (!res.ok || !data.checkins) {
      throw new Error(data.error ?? "Failed to load check-ins");
    }
    return data as Reply;
  };

  // Only the reply to the latest request is shown: a slow answer for the
  // range that was on screen before must not replace the new one.
  const requestRef = useRef(0);
  const pagesLoadedRef = useRef(1);

  const load = useCallback(
    async (how: "replace" | "refresh") => {
      const range = currentRange();
      if (!range) return;
      const request = ++requestRef.current;
      if (how === "replace") setLoading(true);
      else setRefreshing(true);
      try {
        const data = await fetchPage(range, 0);
        if (!data || request !== requestRef.current) return;
        pagesLoadedRef.current = 1;
        setRows(data.checkins);
        setTotal(data.total);
        setTruncated(data.truncated);
        setStats(data.stats);
        setError("");
        setNowMs(Date.now());
      } catch (e) {
        if (request !== requestRef.current) return;
        // A failed refresh leaves the list as it was, with a note.
        setError(e instanceof Error ? e.message : "Failed to load check-ins");
        if (how === "replace") {
          setRows([]);
          setTotal(0);
          setTruncated(false);
          setStats(null);
        }
      } finally {
        if (request === requestRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [currentRange]
  );

  useEffect(() => {
    void load("replace");
  }, [load]);

  const loadMore = async () => {
    const range = currentRange();
    if (!range || loadingMore) return;
    const request = requestRef.current;
    setLoadingMore(true);
    try {
      const data = await fetchPage(range, rows.length);
      if (!data || request !== requestRef.current) return;
      pagesLoadedRef.current += 1;
      setRows((have) => {
        const seen = new Set(have.map((r) => r.id));
        return [...have, ...data.checkins.filter((r) => !seen.has(r.id))];
      });
      setTotal(data.total);
      setTruncated(data.truncated);
    } catch {
      setError("Couldn't load more check-ins");
    } finally {
      setLoadingMore(false);
    }
  };

  // Keep a range that reaches today current — unless older pages have
  // been loaded: a refresh would throw those away under the reader.
  const live =
    active &&
    (() => {
      const range = currentRange();
      return range !== null && rangeIncludesNow(range, new Date());
    })();
  useEffect(() => {
    if (!live) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (pagesLoadedRef.current > 1) return;
      void load("refresh");
    };
    const poll = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);

    // The board's "something changed" hint (empty, no patient data). An
    // extra: if the connection cannot be opened the minute poll remains.
    let hintTimer: ReturnType<typeof setTimeout> | undefined;
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(ROOMS_CHANNEL)
        .on("broadcast", { event: FLOW_EVENT }, () => {
          clearTimeout(hintTimer);
          hintTimer = setTimeout(refresh, HINT_DEBOUNCE_MS);
        })
        .subscribe();
    } catch {
      channel = null;
    }
    return () => {
      clearInterval(poll);
      clearTimeout(hintTimer);
      document.removeEventListener("visibilitychange", refresh);
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // Teardown must never crash the page.
        }
      }
    };
  }, [live, load]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Everything in the range, not only what is on screen.
  const exportCsv = async () => {
    const range = currentRange();
    if (!range || exporting) return;
    setExporting(true);
    try {
      // Always asked of the server afresh, even when the list on screen
      // is complete: the file is what leaves the building, so it is the
      // server that hands it over (and records that it did).
      let all: CheckinRecord[] = [];
      for (let page = 0; page < EXPORT_MAX_PAGES; page++) {
        const data = await fetchPage(range, all.length, true);
        if (!data) return;
        const seen = new Set(all.map((r) => r.id));
        all = [...all, ...data.checkins.filter((r) => !seen.has(r.id))];
        if (!data.truncated || data.checkins.length === 0) break;
      }
      const blob = new Blob(
        [checkinsCsv(all, Date.now(), (iso) => new Date(iso).toLocaleString())],
        { type: "text/csv;charset=utf-8" }
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `checkins-${range.from.toLocaleDateString("en-CA")}-to-${new Date(
        range.to.getTime() - 1
      ).toLocaleDateString("en-CA")}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError("Couldn't export the check-ins");
    } finally {
      setExporting(false);
    }
  };

  const oneDay = preset === "today" || preset === "yesterday";
  const when = oneDay ? timeOnly : dateAndTime;
  const statuses = rows.map((r) => checkinStatus(r, nowMs));
  const count = (test: (s: (typeof statuses)[number]) => boolean) =>
    statuses.filter(test).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(([p, label]) => (
          <button
            key={p}
            aria-pressed={preset === p}
            onClick={() => {
              // Custom starts prefilled — the last 30 days — so the range
              // loads without both fields typed in.
              if (p === "custom" && (!customFrom || !customTo)) {
                const dates = defaultCustomDates(new Date());
                setCustomFrom(dates.from);
                setCustomTo(dates.to);
              }
              setPreset(p);
            }}
            className={`px-4 py-2 rounded-full border transition-colors ${
              preset === p
                ? "bg-brand-primary text-white border-brand-primary"
                : "border-brand-foreground hover:bg-brand-muted"
            }`}
          >
            {label}
          </button>
        ))}
        {preset === "custom" && (
          <span className="flex items-center gap-2">
            <input
              type="date"
              aria-label="From"
              value={customFrom}
              max={defaultCustomDates(new Date()).to}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="px-3 py-2 border border-brand-foreground rounded-lg bg-transparent"
            />
            <span>to</span>
            <input
              type="date"
              aria-label="To"
              value={customTo}
              max={defaultCustomDates(new Date()).to}
              onChange={(e) => setCustomTo(e.target.value)}
              className="px-3 py-2 border border-brand-foreground rounded-lg bg-transparent"
            />
          </span>
        )}
        <button
          onClick={() => load("refresh")}
          disabled={loading || refreshing}
          aria-label="Refresh check-ins"
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-full border border-brand-foreground hover:bg-brand-muted disabled:opacity-50 transition-colors"
        >
          <RefreshCw
            className={`size-4 ${loading || refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
        <button
          onClick={exportCsv}
          disabled={rows.length === 0 || exporting}
          className="px-4 py-2 rounded-full border border-brand-foreground hover:bg-brand-muted disabled:opacity-50 transition-colors"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}

      {!loading && (rows.length > 0 || stats) && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <CountTile label="Checked in" value={total} />
            {preset === "today" && (
              <>
                <CountTile
                  label="Waiting"
                  value={count((s) => s === "waiting" || s === "next_up")}
                />
                <CountTile
                  label="In a room"
                  value={count((s) => s === "called" || s === "with_doctor")}
                />
                <CountTile
                  label="Finished"
                  value={count((s) => s === "finished")}
                />
              </>
            )}
          </div>
          {stats && (
            <div className="flex flex-wrap gap-3">
              <MeasureTile
                label="Wait for a room"
                measure={stats.all.waitForRoom}
              />
              <MeasureTile
                label="Wait for the doctor, in the room"
                measure={stats.all.waitForDoctor}
              />
              <MeasureTile label="Whole visit" measure={stats.all.visit} />
            </div>
          )}
          {stats && !stats.complete && (
            <p className="text-sm text-gold">
              This range is very large: the times above cover its most recent
              20,000 check-ins.
            </p>
          )}
          {stats && stats.byPractitioner.length > 1 && (
            <details className="rounded-lg border border-brand-foreground/40 px-4 py-2">
              <summary className="cursor-pointer py-1 text-sm text-cream/70">
                By practitioner
              </summary>
              <div className="overflow-x-auto">
                <table className="mt-2 w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-brand-foreground/40 text-cream/60">
                      <th className="py-1.5 pr-4 font-normal">Practitioner</th>
                      <th className="py-1.5 pr-4 font-normal">Check-ins</th>
                      <th className="py-1.5 pr-4 font-normal">
                        Wait for a room
                      </th>
                      <th className="py-1.5 pr-4 font-normal">
                        Wait for the doctor
                      </th>
                      <th className="py-1.5 font-normal">Whole visit</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {stats.byPractitioner.map((p) => (
                      <tr
                        key={p.practitioner ?? "none"}
                        className="border-b border-brand-muted last:border-0"
                      >
                        <td className="py-1.5 pr-4">
                          {p.practitioner ?? "No appointment that day"}
                        </td>
                        <td className="py-1.5 pr-4">{p.checkins}</td>
                        <td className="py-1.5 pr-4">
                          {minutes(p.waitForRoom.median)}
                        </td>
                        <td className="py-1.5 pr-4">
                          {minutes(p.waitForDoctor.median)}
                        </td>
                        <td className="py-1.5">{minutes(p.visit.median)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-cream/50">Loading...</p>
      ) : rows.length === 0 ? (
        !error && (
          <p className="py-8 text-center text-cream/50">
            No check-ins in this range.
          </p>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-brand-foreground">
                <th className="py-2 pr-4">Checked in</th>
                <th className="py-2 pr-4">Patient</th>
                <th className="py-2 pr-4">Appointment</th>
                <th className="py-2 pr-4">Service</th>
                <th className="py-2 pr-4">Practitioner</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Waited for a room</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const status = statuses[i];
                const times = visitTimes(r);
                return (
                  <tr key={r.id} className="border-b border-brand-muted">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {when(r.checked_in_at)}
                    </td>
                    <td className="py-2 pr-4">
                      {r.first_name} {r.last_name}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {r.appointment_at ? when(r.appointment_at) : "—"}
                    </td>
                    <td className="py-2 pr-4">{r.service_name ?? "—"}</td>
                    <td className="py-2 pr-4">{r.practitioner_name ?? "—"}</td>
                    <td
                      className={`py-2 pr-4 whitespace-nowrap ${
                        isOpenStatus(status)
                          ? "text-brand-primary"
                          : status === "finished"
                            ? ""
                            : "text-cream/50"
                      }`}
                    >
                      {statusLabel(status, r.room_name)}
                      {status === "waiting" &&
                        ` · ${Math.max(
                          0,
                          Math.round(
                            (nowMs - Date.parse(r.checked_in_at)) / 60_000
                          )
                        )} min`}
                      {status === "finished" && r.done_at && (
                        <span className="text-cream/50">
                          {" "}
                          {timeOnly(r.done_at)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 whitespace-nowrap tabular-nums">
                      {minutes(times.waitForRoomMin)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-cream/50">
            {truncated ? (
              <>
                <span>
                  Showing the most recent {rows.length} of {total} check-ins.
                  Export CSV includes all of them.
                </span>
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-4 py-1.5 rounded-full border border-brand-foreground text-cream hover:bg-brand-muted disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </>
            ) : (
              <span>
                {total} check-in{total === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
