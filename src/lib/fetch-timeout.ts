// fetch() that gives up. A request that never settles (flaky Wi-Fi, a
// device waking from sleep, a stalled upstream) otherwise blocks whatever
// awaits it forever — the waiting-room TV's poll loop, or a kiosk
// check-in waiting on a best-effort broadcast.
//
// AbortController + setTimeout rather than AbortSignal.timeout(): the TV
// may be running an older smart-TV browser that lacks the latter.
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
