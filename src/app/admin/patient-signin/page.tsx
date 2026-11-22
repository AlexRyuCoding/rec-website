"use client";
import KioskGate from "@/components/kiosk/kiosk-gate";
import { useScrollLock } from "@/components/kiosk/use-scroll-lock";

export default function Page() {
  // The page is pinned: no scroll, bounce, pan or zoom in any direction.
  useScrollLock();
  // No link to the staff pages here, on purpose: this tablet is left with
  // patients. Paired as a kiosk (see kiosk-gate.tsx) it cannot open them
  // at all; staff use the dashboard on their own device.
  return (
    // Kiosk: exactly one viewport tall. (Admin pages have no site header,
    // so no top offset is needed — the space goes to bigger keys instead.)
    // The sizes inside scale with the viewport height (dvh), so the whole
    // flow fits an iPad in either orientation. touch-action: none means a
    // touch here is never the start of a scroll or a pinch — only a press.
    <div
      className="h-dvh overflow-hidden overscroll-none flex flex-col items-center justify-center px-4 py-3"
      style={{ touchAction: "none" }}
    >
      <main className="flex w-full flex-col items-center">
        <KioskGate />
      </main>
    </div>
  );
}
