"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { safeNextPath } from "@/lib/staff-session";
import type { ThemeChoice } from "@/lib/staff-theme";
import Backdrop from "../ui/Backdrop";
import Banner from "../ui/Banner";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { useStaffTheme } from "../ui/use-staff-theme";

export default function LoginCard({
  themeFallback,
}: {
  themeFallback: ThemeChoice;
}) {
  useStaffTheme(themeFallback);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // NextAuth reports failures via ?error=... on redirect back here
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err === "AccessDenied") {
      setError("That Google account isn't authorized for the kiosk.");
    } else if (err) {
      setError("Sign-in failed. Please try again.");
    }
  }, []);

  // Back to the page staff were on (?next=, set by the middleware and by
  // pages whose session ran out); the kiosk when nothing was asked for.
  const handleSignIn = () => {
    setLoading(true);
    const next = new URLSearchParams(window.location.search).get("next");
    signIn("google", { callbackUrl: safeNextPath(next) });
  };

  return (
    // The photo goes under the content (`isolate` + `under`), as on the
    // rooms board: nothing here needs lifting over it.
    <main className="relative isolate flex min-h-dvh items-center justify-center px-4 py-8 text-ui-text">
      <Backdrop under />
      <Panel className="flex w-full max-w-sm flex-col gap-5 px-6 pb-7 pt-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Staff login</h1>
          <p className="text-sm text-ui-text-2">
            Sign in with your staff Google account.
          </p>
        </div>
        {error && (
          <Banner tone="error" role="alert">
            {error}
          </Banner>
        )}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handleSignIn}
          disabled={loading}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="shrink-0"
          >
            <path
              fill="currentColor"
              d="M21.35 11.1H12v2.9h5.35c-.5 2.35-2.45 3.7-5.35 3.7a5.7 5.7 0 1 1 0-11.4c1.45 0 2.75.5 3.8 1.5l2.15-2.15A8.55 8.55 0 0 0 12 3.15a8.85 8.85 0 1 0 0 17.7c5.1 0 8.5-3.6 8.5-8.65 0-.35-.05-.75-.15-1.1Z"
            />
          </svg>
          {loading ? "Redirecting…" : "Sign in with Google"}
        </Button>
      </Panel>
    </main>
  );
}
