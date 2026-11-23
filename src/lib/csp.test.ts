import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function csp(): Promise<string> {
  const config = (await import("../../next.config.js")).default;
  const all = await config.headers!();
  return all[0].headers.find(
    (h: { key: string }) => h.key === "Content-Security-Policy"
  )!.value;
}

it("allows the Realtime host, and not the database's old host, once Realtime has its own", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://old.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "https://new.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_REALTIME_ANON_KEY", "new-anon");
  const value = await csp();
  expect(value).toContain("https://new.supabase.co wss://new.supabase.co");
  expect(value).not.toContain("old.supabase.co");
});

// The browser then still connects to the old host (realtime-config.ts):
// a policy naming only the new one would block the board's websocket,
// which crashes the page on an iPad.
it("allows the host the browser really uses when the new settings are half set", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://old.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "https://new.supabase.co");
  const value = await csp();
  expect(value).toContain("https://old.supabase.co wss://old.supabase.co");
  expect(value).not.toContain("new.supabase.co");
});

it("still allows Supabase's host when Realtime has no address of its own", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://old.supabase.co");
  expect(await csp()).toContain(
    "https://old.supabase.co wss://old.supabase.co"
  );
});
