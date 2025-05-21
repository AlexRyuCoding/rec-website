"use client";
import SignInKeypad from "@/components/signin-keypad";

export default function Page() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 pb-10 sm:p-10">
      <main className="flex flex-col gap-[24px] row-start-2 items-center sm:items-start">
        <SignInKeypad />
      </main>
    </div>
  );
}
