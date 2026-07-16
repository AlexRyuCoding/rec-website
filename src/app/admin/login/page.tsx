"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

export default function AdminLoginPage() {
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

  const handleSignIn = () => {
    setLoading(true);
    signIn("google", { callbackUrl: "/admin/patient-signin" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-card bg-island p-10 text-ink">
        <h1 className="text-center font-serif text-3xl">
          Staff <i>login</i>
        </h1>
        <p className="text-center text-sm text-ink/60">
          Sign in with your staff Google account to unlock the kiosk.
        </p>
        {error && (
          <p role="alert" className="text-center text-sm text-error">
            {error}
          </p>
        )}
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="flex items-center justify-center gap-3 rounded-full bg-surface py-4 text-sm font-bold text-cream transition-opacity disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M21.35 11.1H12v2.9h5.35c-.5 2.35-2.45 3.7-5.35 3.7a5.7 5.7 0 1 1 0-11.4c1.45 0 2.75.5 3.8 1.5l2.15-2.15A8.55 8.55 0 0 0 12 3.15a8.85 8.85 0 1 0 0 17.7c5.1 0 8.5-3.6 8.5-8.65 0-.35-.05-.75-.15-1.1Z"
            />
          </svg>
          {loading ? "Redirecting…" : "Sign in with Google"}
        </button>
      </div>
    </div>
  );
}
