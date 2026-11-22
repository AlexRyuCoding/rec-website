"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import SignInKeypad from "@/components/signin-keypad";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { kioskTapGuard, SCREEN_CHANGE_GUARD_MS } from "@/lib/tap-guard";
import TapButton from "./tap-button";
import {
  columnClass,
  headingClass,
  leadClass,
  primaryButton,
  secondaryButton,
} from "./styles";

// What stands in front of the check-in flow: is this browser allowed to
// be the kiosk? (/api/kiosk/status — a paired kiosk, or a signed-in staff
// member.) If it is, the patient sees the PIN pad and nothing of this.
// If not, this is where a tablet gets paired:
//
//   set-up screen → "Show pairing code" → the code → staff type it in
//   Dashboard → Screens → the PIN pad appears by itself.
//
// The code is only asked for when someone taps the button, never by the
// page on its own: asking marks the browser as a kiosk, and a kiosk is
// never staff. A staff member who merely opened this page on their own
// computer must not find themselves locked out of the dashboard.
type Gate =
  | { kind: "checking" }
  | { kind: "ready" }
  | { kind: "pending"; code: string }
  | { kind: "setup"; problem: string }
  // The server could not be asked. Shown only when there is no working
  // kiosk on screen; a kiosk that is up stays up through a blip.
  | { kind: "offline" };

const STATUS_TIMEOUT_MS = 8_000;
// How often the page asks again, by what it is showing.
const RECHECK_MS: Partial<Record<Gate["kind"], number>> = {
  // Notices a pairing removed in the dashboard, keeps the cookie fresh
  // and tells the dashboard the kiosk is alive.
  ready: 60_000,
  // Waiting for staff to type the code.
  pending: 3_000,
  offline: 5_000,
};

export default function KioskGate() {
  const [gate, setGate] = useState<Gate>({ kind: "checking" });
  const gateRef = useRef(gate);
  const [working, setWorking] = useState(false);

  const show = useCallback((next: Gate) => {
    gateRef.current = next;
    setGate(next);
  }, []);

  const check = useCallback(async () => {
    let status: string | undefined;
    let code = "";
    try {
      const res = await fetchWithTimeout(
        "/api/kiosk/status",
        { cache: "no-store" },
        STATUS_TIMEOUT_MS
      );
      const data = (await res.json()) as { status?: string; code?: string };
      status = data.status;
      code = data.code ?? "";
    } catch {
      status = "error";
    }
    const now = gateRef.current;
    if (status === "paired" || status === "staff") {
      if (now.kind !== "ready") show({ kind: "ready" });
    } else if (status === "pending" && code) {
      if (now.kind !== "pending" || now.code !== code) {
        show({ kind: "pending", code });
      }
    } else if (status === "none") {
      if (now.kind !== "setup") show({ kind: "setup", problem: "" });
    } else if (now.kind !== "ready") {
      // Could not be checked. A working kiosk keeps working.
      if (now.kind !== "offline") show({ kind: "offline" });
    }
  }, [show]);

  // Ask once on load, then again at the pace of what is showing, and
  // whenever the tablet wakes up.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const loop = async () => {
      await check();
      if (stopped) return;
      const delay = RECHECK_MS[gateRef.current.kind];
      if (delay) timer = setTimeout(loop, delay);
    };
    void loop();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      void loop();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // gate.kind: a new screen restarts the loop at that screen's pace.
  }, [check, gate.kind]);

  // A double tap must not answer the next screen ("Show pairing code" and
  // "Cancel" sit in the same place) — the kiosk's own rule.
  useLayoutEffect(() => {
    kioskTapGuard.block(SCREEN_CHANGE_GUARD_MS);
  }, [gate.kind]);

  const askForCode = async () => {
    if (working || kioskTapGuard.blocked()) return;
    setWorking(true);
    try {
      const res = await fetchWithTimeout(
        "/api/kiosk/pair",
        { method: "POST" },
        STATUS_TIMEOUT_MS
      );
      const data = (await res.json().catch(() => ({}))) as {
        code?: string;
        paired?: boolean;
      };
      if (res.ok && data.paired) show({ kind: "ready" });
      else if (res.ok && data.code) show({ kind: "pending", code: data.code });
      else {
        show({
          kind: "setup",
          problem:
            "A pairing code is not available right now. Please try again in a minute.",
        });
      }
    } catch {
      show({
        kind: "setup",
        problem: "No connection. Please check the Wi-Fi and try again.",
      });
    } finally {
      setWorking(false);
    }
  };

  const cancelCode = async () => {
    if (working || kioskTapGuard.blocked()) return;
    setWorking(true);
    try {
      await fetchWithTimeout(
        "/api/kiosk/pair",
        { method: "DELETE" },
        STATUS_TIMEOUT_MS
      );
    } catch {
      // The check below shows whatever is true now.
    }
    await check();
    setWorking(false);
  };

  if (gate.kind === "ready") return <SignInKeypad onUnauthorized={check} />;

  // Nothing to read for the moment it takes to ask.
  if (gate.kind === "checking") return <div aria-busy="true" />;

  return (
    <div className={columnClass} style={{ touchAction: "manipulation" }}>
      {gate.kind === "offline" && (
        <>
          <h1 className={headingClass}>One moment, please</h1>
          <p className={leadClass}>
            The check-in screen is reconnecting. If it does not come back,
            please see the front desk.
          </p>
        </>
      )}

      {gate.kind === "setup" && (
        <>
          <h1 className={headingClass}>Please see the front desk</h1>
          <p className={leadClass}>
            This tablet is not set up for check-in yet.
          </p>
          <div className="mt-[min(3dvh,28px)] flex w-full flex-col items-center gap-[min(1.6dvh,14px)] border-t border-cream/15 pt-[min(3dvh,28px)]">
            <p className="text-center text-[clamp(0.9rem,2.1dvh,1.1rem)] uppercase tracking-widest text-cream/50">
              Staff
            </p>
            <TapButton
              onTap={askForCode}
              disabled={working}
              className={`${primaryButton} w-full disabled:opacity-50`}
            >
              Show pairing code
            </TapButton>
            <p
              role="status"
              className="min-h-[2.6em] text-center text-[clamp(0.95rem,2.2dvh,1.15rem)] text-gold"
            >
              {gate.problem}
            </p>
            <TapButton
              onTap={() => {
                if (kioskTapGuard.blocked()) return;
                window.location.href = "/admin/login";
              }}
              className="rounded-full px-4 py-2 text-[clamp(0.95rem,2.2dvh,1.15rem)] text-cream/60 underline data-[pressed=true]:text-cream"
            >
              Sign in as staff instead
            </TapButton>
          </div>
        </>
      )}

      {gate.kind === "pending" && (
        <>
          <h1 className={headingClass}>Pair this tablet</h1>
          <p
            aria-label={`Pairing code ${gate.code.split("").join(" ")}`}
            className="font-mono text-[clamp(3rem,11dvh,6rem)] font-semibold leading-none tracking-[0.18em] text-cream"
          >
            {gate.code}
          </p>
          <p className={leadClass}>
            On a staff computer, open the dashboard, go to{" "}
            <strong className="text-cream">Screens</strong>, choose{" "}
            <strong className="text-cream">Check-in kiosk</strong> and type this
            code.
          </p>
          <p className="text-center text-[clamp(0.9rem,2.1dvh,1.1rem)] text-cream/50">
            This screen changes by itself once the code is entered.
          </p>
          <TapButton
            onTap={cancelCode}
            disabled={working}
            className={`${secondaryButton} mt-[min(1.5dvh,14px)] disabled:opacity-50`}
          >
            Cancel
          </TapButton>
        </>
      )}
    </div>
  );
}
