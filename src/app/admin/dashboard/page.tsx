"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSession, signOut } from "next-auth/react";
import { KeyRound, LogOut, Timer } from "lucide-react";
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
//
// The first two are what the front desk uses all day, so they stay
// loaded: switching tabs must not lose a half-typed search. Setup loads
// the first time it is opened.
type Tab = "checkins" | "patients" | "setup";
const TABS: [Tab, string][] = [
  ["checkins", "Check-ins"],
  ["patients", "Patients"],
  ["setup", "Setup"],
];

// The tab the address asks for: ?tab=patients (the rooms board's "Check
// in a patient"), ?tab=setup, or the way back from connecting Spotify
// (?spotify=…#music), which belongs to Setup.
function tabFromAddress(): Tab {
  const params = new URLSearchParams(window.location.search);
  const asked = params.get("tab");
  if (asked === "patients" || asked === "setup") return asked;
  return params.has("spotify") ? "setup" : "checkins";
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("checkins");
  const [setupOpened, setSetupOpened] = useState(false);
  // Came in asking for the patient search: put the cursor in it.
  const [focusSearch, setFocusSearch] = useState(false);

  useEffect(() => {
    const asked = tabFromAddress();
    setTab(asked);
    if (asked === "patients") setFocusSearch(true);
    if (asked === "setup") setSetupOpened(true);
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
    setTab(next);
    if (next === "setup") setSetupOpened(true);
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

  const pill =
    "flex items-center gap-2 px-4 py-2 rounded-full border border-brand-foreground hover:bg-brand-muted transition-colors";

  return (
    <div className="min-h-screen p-6 sm:p-10 mt-12 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold">Office Dashboard</h1>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {staffEmail && (
            <span className="text-sm text-cream/50">{staffEmail}</span>
          )}
          <Link href="/admin/rooms" className={pill}>
            <Timer className="size-4" />
            Rooms
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className={pill}
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </div>

      <div role="tablist" aria-label="Dashboard" className="flex gap-2">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => open(id)}
            className={`px-6 py-3 text-lg rounded-t-lg border border-b-0 border-brand-foreground transition-colors ${
              tab === id
                ? "bg-brand-primary text-white"
                : "bg-transparent hover:bg-brand-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="panel-checkins"
        aria-labelledby="tab-checkins"
        hidden={tab !== "checkins"}
        className="border border-brand-foreground rounded-b-lg rounded-tr-lg p-6"
      >
        <CheckinsPanel active={tab === "checkins"} />
      </div>
      <div
        role="tabpanel"
        id="panel-patients"
        aria-labelledby="tab-patients"
        hidden={tab !== "patients"}
        className="border border-brand-foreground rounded-b-lg rounded-tr-lg p-6"
      >
        <PatientsPanel autoFocus={focusSearch} />
      </div>
      <div
        role="tabpanel"
        id="panel-setup"
        aria-labelledby="tab-setup"
        hidden={tab !== "setup"}
        // The set-up panels are cards of their own; this only closes the
        // tab strip's line above them.
        className="border-t border-brand-foreground"
      >
        {setupOpened && (
          <>
            <ScreensPanel />
            <MusicPanel />
            <SyncPanel />
          </>
        )}
      </div>

      <Link
        href="/admin/patient-signin"
        aria-label="Patient sign-in kiosk"
        className="fixed bottom-4 right-4 text-cream/20 transition-colors duration-300 hover:text-cream/60"
      >
        <KeyRound className="size-5" />
      </Link>
    </div>
  );
}
