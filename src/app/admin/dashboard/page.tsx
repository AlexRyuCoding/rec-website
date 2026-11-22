"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSession, signOut } from "next-auth/react";
import {
  ClipboardList,
  KeyRound,
  LogOut,
  ScrollText,
  SlidersHorizontal,
  Timer,
  Users,
} from "lucide-react";
import Backdrop from "../ui/Backdrop";
import Button from "../ui/Button";
import { buttonClass } from "../ui/styles";
import ThemeSwitch from "../ui/ThemeSwitch";
import { useStaffTheme } from "../ui/use-staff-theme";
import { useThumb } from "../ui/use-thumb";
import AuditPanel, { LogPatient } from "./AuditPanel";
import CheckinsPanel from "./CheckinsPanel";
import MusicPanel from "./MusicPanel";
import PatientsPanel from "./PatientsPanel";
import ScreensPanel from "./ScreensPanel";
import SyncPanel from "./SyncPanel";

// The staff dashboard. Three tabs:
// - Check-ins: today (or any range) — who is here, where each visit
//   stands, how long patients waited (CheckinsPanel)
// - Patients: find a patient, check them in, reset a PIN (PatientsPanel)
// - Setup: things done once or rarely — paired screens and kiosks, the
//   waiting-room music, the Practice Better sync
// - Log: what staff did with patient information (AuditPanel)
//
// The first two are what the front desk uses all day, so they stay
// loaded: switching tabs must not lose a half-typed search. Setup and Log
// load the first time they are opened.
type Tab = "checkins" | "patients" | "setup" | "log";
const TABS: [Tab, string, typeof Users][] = [
  ["checkins", "Check-ins", ClipboardList],
  ["patients", "Patients", Users],
  ["setup", "Setup", SlidersHorizontal],
  ["log", "Log", ScrollText],
];

// How the page looks — colours, the theme switch, the photo behind it,
// what is raised and what is flat — is the "staff look": CLAUDE.md, and
// src/app/admin/staff-theme.css with the pieces in src/app/admin/ui/.

// The tab the address asks for: ?tab=patients (the rooms board's "Check
// in a patient"), ?tab=setup, or the way back from connecting Spotify
// (?spotify=…#music), which belongs to Setup.
function tabFromAddress(): Tab {
  const params = new URLSearchParams(window.location.search);
  const asked = params.get("tab");
  if (asked === "patients" || asked === "setup" || asked === "log") {
    return asked;
  }
  return params.has("spotify") ? "setup" : "checkins";
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("checkins");
  const [setupOpened, setSetupOpened] = useState(false);
  const [logOpened, setLogOpened] = useState(false);
  // The patient the Log tab is narrowed to ("Log" on a search result).
  const [logPatient, setLogPatient] = useState<LogPatient | null>(null);
  // Came in asking for the patient search: put the cursor in it.
  const [focusSearch, setFocusSearch] = useState(false);
  // A tab's content rises into place when the tab is opened — but not on
  // the page's first paint, so this is false until a tab has been pressed.
  // (A panel that goes from hidden to shown restarts the animation by
  // itself; nothing has to be replayed by hand.)
  const [entered, setEntered] = useState(false);

  const { choice: themeChoice, setChoice: setThemeChoice } = useStaffTheme();
  // The raised tile that slides to the open tab.
  const {
    containerRef: tabsRef,
    thumbRef: tabThumbRef,
    arm: armTabThumb,
  } = useThumb(tab);

  useEffect(() => {
    const asked = tabFromAddress();
    setTab(asked);
    if (asked === "patients") setFocusSearch(true);
    if (asked === "setup") setSetupOpened(true);
    if (asked === "log") setLogOpened(true);
  }, []);

  // A link to a place inside Setup (…#music): go there once it exists.
  useEffect(() => {
    if (!setupOpened || !window.location.hash) return;
    const id = window.location.hash.slice(1);
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ block: "start" })
    );
  }, [setupOpened]);

  const open = (next: Tab) => {
    setEntered(true);
    setTab(next);
    if (next === "setup") setSetupOpened(true);
    if (next === "log") setLogOpened(true);
    // Keep the tab in the address, so a reload comes back to it.
    const params = new URLSearchParams(window.location.search);
    if (next === "checkins") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`
    );
  };

  // Who is signed in on this device, next to the way out.
  const [staffEmail, setStaffEmail] = useState("");
  useEffect(() => {
    getSession()
      .then((session) => setStaffEmail(session?.user?.email ?? ""))
      .catch(() => {});
  }, []);

  // The four panels stay in the page, hidden or shown; each brings its own
  // surfaces (the page behind them is a photograph). No display class
  // here (flex, grid…): it would override the `hidden` attribute and show
  // every tab at once.
  const panel = entered ? "ui-enter" : undefined;

  return (
    <div className="min-h-screen text-[15px] leading-normal text-ui-text">
      <Backdrop />

      <header className="relative z-10 border-b border-ui-line bg-ui-panel shadow-lift-2">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 pb-1.5 pt-3.5">
            <h1 className="text-xl font-semibold tracking-tight">
              Office Dashboard
            </h1>
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              {staffEmail && (
                <span className="text-[13px] text-ui-text-3">{staffEmail}</span>
              )}
              <ThemeSwitch choice={themeChoice} onChange={setThemeChoice} />
              <Link href="/admin/rooms" className={buttonClass()}>
                <Timer aria-hidden className="size-4" />
                Rooms board
              </Link>
              <Button
                variant="quiet"
                onClick={() => signOut({ callbackUrl: "/admin/login" })}
              >
                <LogOut aria-hidden className="size-4" />
                Sign out
              </Button>
            </div>
          </div>

          <div
            ref={tabsRef}
            role="tablist"
            aria-label="Dashboard"
            className="relative flex gap-1.5 overflow-x-auto px-0.5 pb-3.5 pt-1.5"
          >
            <span
              ref={tabThumbRef}
              aria-hidden="true"
              className="ui-thumb ui-thumb-still ui-tab-thumb rounded-[9px] border border-ui-line-strong bg-ui-btn"
            />
            {TABS.map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                id={`tab-${id}`}
                data-thumb-item={id}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                onPointerDown={armTabThumb}
                onKeyDown={armTabThumb}
                onClick={() => open(id)}
                className={`relative flex items-center gap-2 whitespace-nowrap rounded-[9px] border border-transparent px-4 pb-[11px] pt-[9px] font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ui-accent-text ${
                  tab === id
                    ? "text-ui-text"
                    : "text-ui-text-2 hover:text-ui-text"
                }`}
              >
                <Icon
                  aria-hidden
                  className={`size-4 transition-colors duration-150 ${
                    tab === id ? "text-ui-tab-accent" : ""
                  }`}
                />
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1280px] px-4 pb-12 pt-5 sm:px-6">
        <div
          role="tabpanel"
          id="panel-checkins"
          aria-labelledby="tab-checkins"
          hidden={tab !== "checkins"}
          className={panel}
        >
          <CheckinsPanel active={tab === "checkins"} />
        </div>
        <div
          role="tabpanel"
          id="panel-patients"
          aria-labelledby="tab-patients"
          hidden={tab !== "patients"}
          className={panel}
        >
          <PatientsPanel
            autoFocus={focusSearch}
            onShowLog={(patient) => {
              setLogPatient(patient);
              open("log");
            }}
          />
        </div>
        <div
          role="tabpanel"
          id="panel-setup"
          aria-labelledby="tab-setup"
          hidden={tab !== "setup"}
          className={panel}
        >
          {setupOpened && (
            // Wide: Screens above Sync on the left, Music (the tall
            // one) down the right. Narrow: one column — Screens, Music,
            // Sync. The second row takes the spare height, so Sync sits
            // right under Screens however tall Music is.
            <div className="grid items-start gap-4 min-[1100px]:grid-cols-2 min-[1100px]:grid-rows-[auto_1fr]">
              <div className="min-w-0">
                <ScreensPanel />
              </div>
              <div className="min-w-0 min-[1100px]:col-start-2 min-[1100px]:row-span-2 min-[1100px]:row-start-1">
                <MusicPanel />
              </div>
              <div className="min-w-0">
                <SyncPanel />
              </div>
            </div>
          )}
        </div>
        <div
          role="tabpanel"
          id="panel-log"
          aria-labelledby="tab-log"
          hidden={tab !== "log"}
          className={panel}
        >
          {logOpened && (
            <AuditPanel
              patient={logPatient}
              onClearPatient={() => setLogPatient(null)}
            />
          )}
        </div>
      </main>

      {/* Small and quiet on purpose; on a surface of its own because the
          page behind it is a photograph. Tucked into the very corner:
          on a window no wider than the page's column it sits over the
          panels' edge and padding, never over what is written in them. */}
      <Link
        href="/admin/patient-signin"
        aria-label="Patient sign-in kiosk"
        className="fixed bottom-1.5 right-1.5 z-10 flex size-6 items-center justify-center rounded-full border border-ui-line bg-ui-panel text-ui-text-3 transition-colors duration-300 hover:text-ui-text"
      >
        <KeyRound aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}
