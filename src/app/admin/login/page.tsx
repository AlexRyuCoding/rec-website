"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/kiosk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/admin/patient-signin");
      } else {
        setError("Incorrect password.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-brand-background">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 w-full max-w-sm p-8 border border-brand-foreground rounded-xl shadow-md bg-brand-background"
      >
        <h1 className="text-2xl font-semibold text-center">Staff Login</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter kiosk password"
          className="px-4 py-3 border border-brand-foreground rounded-lg text-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-[#2A9E8F]"
          autoFocus
        />
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="py-3 rounded-lg bg-[#2A9E8F] text-white text-lg font-medium hover:bg-[#238B7E] disabled:opacity-50 transition-colors"
        >
          {loading ? "Verifying..." : "Unlock Kiosk"}
        </button>
      </form>
    </div>
  );
}
