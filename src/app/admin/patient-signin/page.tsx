"use client";
import SignInKeypad from "@/components/signin-keypad";

export default function Page() {
  return (
    // Kiosk: exactly one viewport tall, never scrolls. pt-28 clears the
    // fixed header (py-4 + 80px logo ≈ 112px).
    <div className="h-dvh overflow-hidden flex flex-col items-center justify-center px-4 pb-4 pt-28">
      <main className="flex flex-col items-center">
        <SignInKeypad />
      </main>
    </div>
  );
}
