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
    <div className="flex items-center justify-center min-h-screen bg-brand-background">
      <div className="flex flex-col gap-6 w-full max-w-sm p-8 border border-brand-foreground rounded-xl shadow-md bg-brand-background">
        <h1 className="text-2xl font-semibold text-center">Staff Login</h1>
        <p className="text-center text-gray-600 dark:text-gray-300">
          Sign in with your staff Google account to unlock the kiosk.
        </p>
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="flex items-center justify-center gap-3 py-3 rounded-lg bg-brand-primary text-white text-lg font-medium hover:bg-brand-secondary disabled:opacity-50 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M21.35 11.1H12v2.9h5.35c-.5 2.35-2.45 3.7-5.35 3.7a5.7 5.7 0 1 1 0-11.4c1.45 0 2.75.5 3.8 1.5l2.15-2.15A8.55 8.55 0 0 0 12 3.15a8.85 8.85 0 1 0 0 17.7c5.1 0 8.5-3.6 8.5-8.65 0-.35-.05-.75-.15-1.1Z"
            />
          </svg>
          {loading ? "Redirecting..." : "Sign in with Google"}
        </button>
      </div>
    </div>
  );
}
