import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "s3");
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "https://rt.supabase.co");
  vi.stubEnv("REALTIME_SERVICE_KEY", "svc");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const call = (auth?: string) =>
  GET(
    new Request("https://x.test/api/cron/keepalive", {
      headers: auth ? { authorization: auth } : {},
    })
  );

it("refuses a caller without the cron secret", async () => {
  expect((await call()).status).toBe(401);
});
it("pings the Realtime project's keepalive table and nothing else", async () => {
  const seen: { url: string; auth: string | null }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    seen.push({ url, auth: new Headers(init.headers).get("authorization") });
    return new Response("[]");
  });
  const res = await call("Bearer s3");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(seen).toEqual([
    {
      url: "https://rt.supabase.co/rest/v1/keepalive?select=id&limit=1",
      auth: "Bearer svc",
    },
  ]);
});
it("answers 500 when the ping fails", async () => {
  vi.stubGlobal("fetch", async () => new Response("no", { status: 503 }));
  expect((await call("Bearer s3")).status).toBe(500);
  vi.stubGlobal("fetch", async () => {
    throw new Error("down");
  });
  expect((await call("Bearer s3")).status).toBe(500);
});
