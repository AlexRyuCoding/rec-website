import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "./fetch-timeout";

// A request that never answers on its own, but honours cancellation —
// what a hung connection on a TV stick looks like.
const hangingFetch = ((_input: unknown, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  })) as typeof fetch;

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchWithTimeout", () => {
  it("gives up on a request that never answers", async () => {
    vi.useFakeTimers();
    const pending = fetchWithTimeout("/x", {}, 8000, hangingFetch);
    const outcome = pending.then(
      () => "resolved",
      () => "rejected"
    );
    await vi.advanceTimersByTimeAsync(7999);
    expect(
      await Promise.race([outcome, Promise.resolve("still waiting")])
    ).toBe("still waiting");
    await vi.advanceTimersByTimeAsync(2);
    expect(await outcome).toBe("rejected");
  });

  it("returns the response of a request that answers in time", async () => {
    vi.useFakeTimers();
    const quick = (async () => new Response("ok")) as typeof fetch;
    const res = await fetchWithTimeout("/x", { method: "POST" }, 8000, quick);
    expect(await res.text()).toBe("ok");
    // No timer left behind to fire on a finished request.
    expect(vi.getTimerCount()).toBe(0);
  });
});
