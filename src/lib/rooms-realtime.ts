// Cross-device sync for the room timer board. After any rooms mutation the
// server posts to Supabase Realtime's REST broadcast endpoint (no websocket
// needed server-side); subscribed browsers refetch on the message.
// Best-effort by design: if a broadcast is lost, the clients' 60 s poll
// catches them up, and countdown accuracy never depends on it.

export const ROOMS_CHANNEL = "room-timers";
export const ROOMS_EVENT = "rooms-updated";

export async function broadcastRoomsUpdated(): Promise<void> {
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`,
      {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ topic: ROOMS_CHANNEL, event: ROOMS_EVENT, payload: {} }],
        }),
      }
    );
  } catch {
    // Swallow: polling is the fallback transport.
  }
}
