import { fetchWithTimeout } from "./fetch-timeout";
import { realtimeServerConfig } from "./realtime-config";
import type { RoomRow } from "@/lib/room-status";

// Cross-device sync for the room timer board. After any rooms mutation the
// server posts to Supabase Realtime's REST broadcast endpoint (no websocket
// needed server-side). The message carries the changed row (or deleted id)
// so subscribed browsers apply it directly without a refetch round trip.
// Best-effort by design: broadcast payloads are unauthenticated hints, so
// the clients' 60 s poll of the API remains the authority — a lost or
// forged message is corrected on the next poll, and countdown accuracy
// never depends on the channel at all.

export const ROOMS_CHANNEL = "room-timers";
export const ROOMS_EVENT = "rooms-updated";
// "Something about the patient flow changed — refetch." Sent after a
// check-in and after any visit change. The payload is ALWAYS empty: this
// channel is readable with the public anon key, so nothing identifying a
// patient may ever be put on it. Clients respond by calling the
// staff-authenticated API.
export const FLOW_EVENT = "flow-updated";

export interface RoomsBroadcastPayload {
  room?: RoomRow;
  deletedId?: string;
}

const BROADCAST_TIMEOUT_MS = 2000;

async function postBroadcast(event: string, payload: object): Promise<void> {
  try {
    // Realtime's own address and key — not the database's.
    const { url, serviceKey } = realtimeServerConfig();
    // Routes await this (including the kiosk check-in), so it is capped:
    // a stalled Realtime endpoint costs at most BROADCAST_TIMEOUT_MS.
    await fetchWithTimeout(
      `${url}/realtime/v1/api/broadcast`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ topic: ROOMS_CHANNEL, event, payload }],
        }),
      },
      BROADCAST_TIMEOUT_MS
    );
  } catch {
    // Swallow: polling is the fallback transport.
  }
}

export async function broadcastRoomsUpdated(
  payload: RoomsBroadcastPayload = {}
): Promise<void> {
  await postBroadcast(ROOMS_EVENT, payload);
}

export async function broadcastFlowUpdated(): Promise<void> {
  await postBroadcast(FLOW_EVENT, {});
}
