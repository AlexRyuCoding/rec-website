"use client";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import SignInKeypad from "@/components/signin-keypad";

export default function Page() {
  return (
    // Kiosk: exactly one viewport tall, never scrolls. pt-28 clears the
    // fixed header (py-4 + 80px logo ≈ 112px).
    <div className="h-dvh overflow-hidden flex flex-col items-center justify-center px-4 pb-4 pt-28">
      <main className="flex flex-col items-center">
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
