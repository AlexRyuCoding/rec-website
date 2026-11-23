"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import {
  customRange,
  DateRange,
  defaultCustomDates,
  presetRange,
  rangeIncludesNow,
  RangePreset,
} from "@/lib/checkin-range";
import { FLOW_EVENT, ROOMS_CHANNEL, ROOMS_EVENT } from "@/lib/rooms-realtime";
import { leaveDashboard } from "@/lib/staff-login-redirect";
import { createBrowserClient } from "@/lib/supabase-browser";
import Banner from "../ui/Banner";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import Segmented from "../ui/Segmented";
import StatusPill from "../ui/StatusPill";
import {
  fieldClass,
  tableClass,
  tdClass,
  thClass,
  trClass,
} from "../ui/styles";
import {
  CheckinRecord,
  checkinsCsv,
  checkinStatus,
  isInRoomStatus,
  Measure,
  nextStatusChangeMs,
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

// The summary's numbers are raised tiles in two groups: how today stands
// (counts) and how long things took (times). No heading over a group —
// the page behind them is a photograph, and nothing is read off that.

// One time of the summary: the typical (median) time, how many visits it
// is based on and the longest.
function MeasureTile({ label, measure }: { label: string; measure: Measure }) {
  return (
    <Panel className="px-3.5 pb-3 pt-2.5">
      <p className="text-[13px] text-ui-text-2">{label}</p>
      <p className="text-[28px] font-semibold leading-tight tracking-tight tabular-nums">
        {measure.median === null ? (
          "—"
        ) : (
          <>
            {measure.median}{" "}
            <span className="text-[15px] font-medium tracking-normal text-ui-text-2">
              min
            </span>
          </>
        )}
      </p>
      <p className="text-xs text-ui-text-3">
        {measure.count === 0
          ? "no visits yet"
          : `typical of ${measure.count} · longest ${minutes(measure.longest)}`}
      </p>
    </Panel>
  );
}

// `dot`: the colour of the status the count is about, as on the pills in
// the list below.
function CountTile({
  label,
  value,
  dot,
}: {
  label: string;
  value: number;
  dot?: "waiting" | "doctor";
}) {
  return (
    <Panel className="px-3.5 pb-3 pt-2.5">
      <p className="flex items-center gap-1.5 text-[13px] text-ui-text-2">
        {dot && (
          <span
            aria-hidden
            className={`size-2 shrink-0 rounded-full ${
              dot === "waiting" ? "bg-ui-st-waiting" : "bg-ui-st-doctor"
            }`}
          />
        )}
        {label}
      </p>
      <p className="text-[28px] font-semibold leading-tight tracking-tight tabular-nums">
        {value}
      </p>
    </Panel>
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
  const [byPractitionerOpen, setByPractitionerOpen] = useState(false);
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
    if (res.status === 401 || res.status === 423) {
      leaveDashboard(res.status);
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
    const hint = () => {
      clearTimeout(hintTimer);
      hintTimer = setTimeout(refresh, HINT_DEBOUNCE_MS);
    };
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(ROOMS_CHANNEL)
        .on("broadcast", { event: FLOW_EVENT }, hint)
        // A timer paused, changed or cleared ("needles out") moves no
        // patient, so it sends no flow hint — but it changes what a
        // patient in that room is shown as. Used as a hint only: what
        // the message carries is not read.
        .on("broadcast", { event: ROOMS_EVENT }, hint)
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

  // A room's timer does not end on the minute: read the clock again at
  // the moment the next one runs out (or goes into overtime), so the
  // pill turns when the board's tile does.
  useEffect(() => {
    const at = nextStatusChangeMs(rows, nowMs);
    if (at === null) return;
    const t = setTimeout(
      () => setNowMs(Date.now()),
      Math.max(0, at - Date.now()) + 50
    );
    return () => clearTimeout(t);
  }, [rows, nowMs]);

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
  const statuses = rows.map((r) => checkinStatus(r, nowMs, r.room_timer));
  const count = (test: (s: (typeof statuses)[number]) => boolean) =>
    statuses.filter(test).length;

  const today = preset === "today";
  const timeTiles = stats && (
    <>
      <MeasureTile label="Wait for a room" measure={stats.all.waitForRoom} />
      <MeasureTile
        label="Wait for the doctor, in the room"
        measure={stats.all.waitForDoctor}
      />
      <MeasureTile label="Whole visit" measure={stats.all.visit} />
    </>
  );
  const maxDate = defaultCustomDates(new Date()).to;

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-wrap items-center justify-between gap-2.5 px-2.5 pb-[9px] pt-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Segmented
            label="Dates"
            value={preset}
            options={PRESETS.map(([value, label]) => ({ value, label }))}
            onChange={(p) => {
              // Custom starts prefilled — the last 30 days — so the range
              // loads without both fields typed in.
              if (p === "custom" && (!customFrom || !customTo)) {
                const dates = defaultCustomDates(new Date());
                setCustomFrom(dates.from);
                setCustomTo(dates.to);
              }
              setPreset(p);
            }}
          />
          {/* Always in the page, so they can slide open and shut; while
              shut they cannot be seen, clicked or tabbed to (.ui-reveal-x). */}
          <span
            className="ui-reveal-x"
            data-open={preset === "custom" ? "" : undefined}
          >
            <input
              type="date"
              aria-label="From"
              value={customFrom}
              max={maxDate}
              onChange={(e) => setCustomFrom(e.target.value)}
              className={fieldClass}
            />
            <span className="text-ui-text-2">to</span>
            <input
              type="date"
              aria-label="To"
              value={customTo}
              max={maxDate}
              onChange={(e) => setCustomTo(e.target.value)}
              className={fieldClass}
            />
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="quiet"
            onClick={() => load("refresh")}
            disabled={loading || refreshing}
            aria-label="Refresh check-ins"
          >
            <RefreshCw
              aria-hidden
              className={`size-4 ${loading || refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button onClick={exportCsv} disabled={rows.length === 0 || exporting}>
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </Panel>

      {error && (
        <Banner tone="error" role="alert">
          {error}
        </Banner>
      )}

      {/* Mounted afresh when a new range has loaded, which is what makes
          the numbers fade up (.ui-settle) — and only then: a refresh of
          the same range keeps them mounted, and nothing moves. */}
      {!loading && (rows.length > 0 || stats) && (
        <div className="ui-settle flex flex-col gap-4">
          {today ? (
            <div className="grid gap-x-6 gap-y-3 lg:grid-cols-[4fr_5fr]">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CountTile label="Checked in" value={total} />
                <CountTile
                  label="Waiting"
                  dot="waiting"
                  value={count((s) => s === "waiting" || s === "next_up")}
                />
                <CountTile
                  label="In a room"
                  dot="doctor"
                  value={count(isInRoomStatus)}
                />
                <CountTile
                  label="Finished"
                  value={count((s) => s === "finished")}
                />
              </div>
              {timeTiles && (
                <div className="grid gap-3 sm:grid-cols-3">{timeTiles}</div>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.35fr_1.35fr_1.35fr]">
              <CountTile label="Checked in" value={total} />
              {timeTiles}
            </div>
          )}
          {stats && !stats.complete && (
            <Banner tone="caution">
              This range is very large: the times above cover its most recent
              20,000 check-ins.
            </Banner>
          )}
          {stats && stats.byPractitioner.length > 1 && (
            <Panel className="overflow-hidden">
              <button
                type="button"
                aria-expanded={byPractitionerOpen}
                aria-controls="checkins-by-practitioner"
                onClick={() => setByPractitionerOpen((open) => !open)}
                className="flex w-full items-center gap-2 px-[18px] py-2.5 text-left text-sm text-ui-text-2 hover:text-ui-text focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-accent-text"
              >
                <ChevronDown
                  aria-hidden
                  className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${
                    byPractitionerOpen ? "rotate-180" : ""
                  }`}
                />
                By practitioner
              </button>
              {/* Opens with a glide: a grid row that goes from no height
                  to its content's height. The table stays in the page
                  while shut (it holds nothing that can be focused). */}
              <div
                id="checkins-by-practitioner"
                className={`grid transition-[grid-template-rows] duration-300 ease-out-quint motion-reduce:transition-none ${
                  byPractitionerOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div
                  className={`min-h-0 overflow-hidden ${
                    byPractitionerOpen ? "" : "invisible"
                  }`}
                >
                  <div className="overflow-x-auto border-t border-ui-line">
                    <table className={`${tableClass} text-sm`}>
                      <thead>
                        <tr>
                          <th className={thClass}>Practitioner</th>
                          <th className={thClass}>Check-ins</th>
                          <th className={thClass}>Wait for a room</th>
                          <th className={thClass}>Wait for the doctor</th>
                          <th className={thClass}>Whole visit</th>
                        </tr>
                      </thead>
                      <tbody className="tabular-nums">
                        {stats.byPractitioner.map((p) => (
                          <tr
                            key={p.practitioner ?? "none"}
                            className={trClass}
                          >
                            <td className={tdClass}>
                              {p.practitioner ?? "No appointment that day"}
                            </td>
                            <td className={tdClass}>{p.checkins}</td>
                            <td className={tdClass}>
                              {minutes(p.waitForRoom.median)}
                            </td>
                            <td className={tdClass}>
                              {minutes(p.waitForDoctor.median)}
                            </td>
                            <td className={tdClass}>
                              {minutes(p.visit.median)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* The list's panel stays while a new range loads, so the page does
          not lose and regain a block; with nothing to say (a failed load,
          which has its own message above) it is left out. */}
      {(loading || rows.length > 0 || !error) && (
        <Panel className="overflow-hidden">
          {loading ? (
            <p className="py-10 text-center text-ui-text-3">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-ui-text-3">
              No check-ins in this range.
            </p>
          ) : (
            <div className="ui-settle">
              <div className="overflow-x-auto">
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th className={thClass}>Checked in</th>
                      <th className={thClass}>Patient</th>
                      <th className={thClass}>Appointment</th>
                      <th className={thClass}>Service</th>
                      <th className={thClass}>Practitioner</th>
                      <th className={thClass}>Status</th>
                      <th className={`${thClass} text-right`}>
                        Waited for a room
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const status = statuses[i];
                      const times = visitTimes(r);
                      return (
                        <tr key={r.id} className={trClass}>
                          <td
                            className={`${tdClass} whitespace-nowrap tabular-nums text-ui-text-2`}
                          >
                            {when(r.checked_in_at)}
                          </td>
                          <td className={`${tdClass} font-semibold`}>
                            {r.first_name} {r.last_name}
                          </td>
                          <td
                            className={`${tdClass} whitespace-nowrap tabular-nums text-ui-text-2`}
                          >
                            {r.appointment_at ? when(r.appointment_at) : "—"}
                          </td>
                          <td className={`${tdClass} text-ui-text-2`}>
                            {r.service_name ?? "—"}
                          </td>
                          <td className={`${tdClass} text-ui-text-2`}>
                            {r.practitioner_name ?? "—"}
                          </td>
                          <td className={tdClass}>
                            <StatusPill status={status}>
                              {/* The spaces are for whoever copies the
                                  cell, searches the page or has it read
                                  out: the gap on screen is the pill's own. */}
                              {statusLabel(status, r.room_name)}
                              {status === "waiting" && " "}
                              {status === "waiting" && (
                                <span className="font-medium tabular-nums">
                                  ·{" "}
                                  {Math.max(
                                    0,
                                    Math.round(
                                      (nowMs - Date.parse(r.checked_in_at)) /
                                        60_000
                                    )
                                  )}{" "}
                                  min
                                </span>
                              )}
                              {status === "finished" && r.done_at && " "}
                              {status === "finished" && r.done_at && (
                                <span className="font-medium tabular-nums">
                                  {timeOnly(r.done_at)}
                                </span>
                              )}
                            </StatusPill>
                          </td>
                          <td
                            className={`${tdClass} whitespace-nowrap text-right tabular-nums`}
                          >
                            {minutes(times.waitForRoomMin)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-ui-line px-[18px] py-2.5 text-[13px] text-ui-text-3">
                {truncated ? (
                  <>
                    <span>
                      Showing the most recent {rows.length} of {total}{" "}
                      check-ins. Export CSV includes all of them.
                    </span>
                    <Button size="sm" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? "Loading…" : "Load more"}
                    </Button>
                  </>
                ) : (
                  <span>
                    {total} check-in{total === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
