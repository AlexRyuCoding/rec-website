import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { broadcastFlowUpdated, FLOW_EVENT } from "./rooms-realtime";

// The Realtime project's settings are required (realtime-config.ts).
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "https://rt.supabase.co");
  vi.stubEnv("REALTIME_SERVICE_KEY", "svc");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("broadcastFlowUpdated", () => {
  it("sends an empty payload — never patient data", async () => {
    const calls: { body: string }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      calls.push({ body: String(init.body) });
      return new Response("{}");
    });
    await broadcastFlowUpdated();
    expect(calls).toHaveLength(1);
    const message = JSON.parse(calls[0].body).messages[0];
    expect(message.event).toBe(FLOW_EVENT);
    expect(message.payload).toEqual({});
  });

  it("returns within two seconds even if Realtime never answers", async () => {
    // The kiosk check-in awaits this; a stalled endpoint must not hold a
    // patient at the kiosk.
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new Error("aborted"))
          );
        })
    );
    let done = false;
    const pending = broadcastFlowUpdated().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(2001);
    await pending;
    expect(done).toBe(true);
  });
});
