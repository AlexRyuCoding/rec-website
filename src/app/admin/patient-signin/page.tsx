"use client";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import SignInKeypad from "@/components/signin-keypad";

export default function Page() {
  return (
    // Kiosk: exactly one viewport tall, never scrolls or zooms. (Admin
    // pages have no site header, so no top offset is needed — the space
    // goes to bigger keys instead.) The sizes inside scale with the
    // viewport height (dvh), so the whole flow fits an iPad in either
    // orientation.
    <div
      className="h-dvh overflow-hidden overscroll-none flex flex-col items-center justify-center px-4 py-3"
      style={{ touchAction: "manipulation" }}
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
