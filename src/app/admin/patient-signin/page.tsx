"use client";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import SignInKeypad from "@/components/signin-keypad";
import { useScrollLock } from "@/components/kiosk/use-scroll-lock";

export default function Page() {
  // The page is pinned: no scroll, bounce, pan or zoom in any direction.
  useScrollLock();
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
        <SignInKeypad />
      </main>
      <Link
        href="/admin/dashboard"
        aria-label="Staff dashboard"
        className="fixed bottom-4 right-4 text-cream/20 transition-colors duration-300 hover:text-cream/60"
      >
        <LayoutDashboard className="size-5" />
      </Link>
    </div>
  );
}
