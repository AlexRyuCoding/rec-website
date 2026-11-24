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

// The rooms board connects from the browser to the Realtime project
// (realtime-config.ts). A policy without that host blocks the websocket,
// which crashes the page on an iPad.
it("allows the Realtime host, https and wss", async () => {
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "https://rt.supabase.co");
  const value = await csp();
  expect(value).toContain("https://rt.supabase.co wss://rt.supabase.co");
});

it("names no host of the old database, whatever is left in the environment", async () => {
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "https://rt.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://old.supabase.co");
  expect(await csp()).not.toContain("old.supabase.co");
});
