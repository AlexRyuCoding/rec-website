"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DoctorRow,
  RoomRow,
  TimerAction,
  timerActionUpdate,
} from "@/lib/room-status";
import { createBrowserClient } from "@/lib/supabase-browser";
import {
  ROOMS_CHANNEL,
  ROOMS_EVENT,
  RoomsBroadcastPayload,
} from "@/lib/rooms-realtime";

const POLL_MS = 60_000;
// Rapid +/- taps update the display instantly and accumulate; the summed
// delta is POSTed once this long after the last tap.
const ADJUST_FLUSH_MS = 800;

// Data layer for the room timer board. Server rows + a skew-corrected 1 s
// clock. Sync is layered for speed with a safety net underneath:
// - the acting device applies timer actions optimistically (instant),
//   then replaces them with the row the API returns (authoritative)
// - other devices apply the row carried in the realtime broadcast
//   (no refetch round trip)
// - a 60 s poll plus focus/online refetch reconciles anything missed or
//   forged (broadcast payloads are unauthenticated hints, never authority)
// Display math stays in room-status.ts.
export function useRooms() {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busyRoomIds, setBusyRoomIds] = useState<Set<string>>(new Set());
  const [tickMs, setTickMs] = useState(() => Date.now());
  const offsetRef = useRef(0);
  const roomsRef = useRef<RoomRow[]>([]);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  // Insert or replace a row, unless the local copy is already newer
  // (an optimistic patch keeps the old updated_at, so authoritative rows
  // always win over it).
  const upsertRoom = useCallback((incoming: RoomRow) => {
    setRooms((prev) => {
      const existing = prev.find((r) => r.id === incoming.id);
      if (!existing) return [...prev, incoming];
      if (Date.parse(existing.updated_at) > Date.parse(incoming.updated_at)) {
        return prev;
      }
      return prev.map((r) => (r.id === incoming.id ? incoming : r));
    });
  }, []);

  const removeRoom = useCallback((roomId: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/rooms");
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        rooms: RoomRow[];
        doctors?: DoctorRow[];
        serverTime: string;
      };
      offsetRef.current = Date.parse(data.serverTime) - Date.now();
      setRooms(data.rooms);
      setDoctors(data.doctors ?? []);
      setConnectionError(false);
    } catch {
      setConnectionError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Realtime is an accelerator, never a dependency: if the websocket
    // cannot be opened (CSP, old browser, network appliance), the board
    // must still work on the poll. WebKit throws synchronously from a
    // blocked WebSocket constructor, so the subscribe is guarded.
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(ROOMS_CHANNEL)
        .on("broadcast", { event: ROOMS_EVENT }, (message) => {
          const payload = message.payload as RoomsBroadcastPayload | undefined;
          if (payload?.room) {
            upsertRoom(payload.room);
          } else if (payload?.deletedId) {
            removeRoom(payload.deletedId);
          } else {
            refresh();
          }
        })
        .subscribe();
    } catch {
      channel = null;
    }
    const poll = setInterval(refresh, POLL_MS);
    const onWake = () => refresh();
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // Channel teardown must never crash unmount either.
        }
      }
      clearInterval(poll);
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [refresh, upsertRoom, removeRoom]);

  useEffect(() => {
    const t = setInterval(() => setTickMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Returns the parsed response body on success, null on failure.
  // Success paths apply the returned row locally instead of refetching;
  // failures refetch to roll back any optimistic state.
  const mutate = useCallback(
    async (
      roomId: string | null,
      path: string,
      init: RequestInit
    ): Promise<{ room?: RoomRow; success?: boolean } | null> => {
      if (roomId) {
        setBusyRoomIds((prev) => new Set(prev).add(roomId));
      }
      try {
        const res = await fetch(path, {
          headers: { "Content-Type": "application/json" },
          ...init,
        });
        if (res.status === 401) {
          window.location.href = "/admin/login";
          return null;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setActionError(data.error ?? "Something went wrong");
          setTimeout(() => setActionError(""), 4000);
          await refresh();
          return null;
        }
        return (await res.json()) as { room?: RoomRow; success?: boolean };
      } catch {
        setActionError("Connection problem");
        setTimeout(() => setActionError(""), 4000);
        await refresh();
        return null;
      } finally {
        if (roomId) {
          setBusyRoomIds((prev) => {
            const next = new Set(prev);
            next.delete(roomId);
            return next;
          });
        }
      }
    },
    [refresh]
  );

  // Deltas from rapid +/- taps, per room, awaiting their single POST.
  // The flush passes roomId null to mutate so busy is never set — the
  // buttons must not lock up between taps.
  const pendingAdjustRef = useRef(
    new Map<string, { delta: number; timer: ReturnType<typeof setTimeout> }>()
  );

  const flushAdjust = useCallback(
    async (roomId: string) => {
      const pending = pendingAdjustRef.current.get(roomId);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingAdjustRef.current.delete(roomId);
      if (pending.delta === 0) return;
      const body = await mutate(null, `/api/admin/rooms/${roomId}/timer`, {
        method: "POST",
        body: JSON.stringify({ action: "adjust", deltaSeconds: pending.delta }),
      });
      if (body?.room) upsertRoom(body.room);
    },
    [mutate, upsertRoom]
  );

  const timerAction = useCallback(
    async (roomId: string, action: TimerAction, valueSeconds?: number) => {
      // Optimistic: apply the same pure logic the server runs, so the
      // acting device updates instantly. The old updated_at is kept, so
      // the authoritative row (response or broadcast) replaces it.
      const room = roomsRef.current.find((r) => r.id === roomId);
      let optimisticOk = false;
      if (room) {
        const result = timerActionUpdate(
          room,
          action,
          Date.now() + offsetRef.current,
          valueSeconds
        );
        if (result.ok) {
          optimisticOk = true;
          setRooms((prev) =>
            prev.map((r) => (r.id === roomId ? { ...r, ...result.fields } : r))
          );
        }
      }
      if (action === "adjust") {
        // A tap the local math rejects (e.g. below elapsed time) is
        // dropped, mirroring what the server would say.
        if (!optimisticOk || valueSeconds === undefined) return;
        const pending = pendingAdjustRef.current.get(roomId);
        if (pending) clearTimeout(pending.timer);
        pendingAdjustRef.current.set(roomId, {
          delta: (pending?.delta ?? 0) + valueSeconds,
          timer: setTimeout(() => void flushAdjust(roomId), ADJUST_FLUSH_MS),
        });
        return;
      }
      // Any other action first lands the pending delta so the server
      // applies changes in the order the user made them.
      await flushAdjust(roomId);
      const body = await mutate(roomId, `/api/admin/rooms/${roomId}/timer`, {
        method: "POST",
        body: JSON.stringify(
          action === "set"
            ? { action, setSeconds: valueSeconds }
            : { action, deltaSeconds: valueSeconds }
        ),
      });
      if (body?.room) upsertRoom(body.room);
    },
    [mutate, upsertRoom, flushAdjust]
  );

  const createRoom = useCallback(
    async (input: { name: string; gridRow: number; gridCol: number }) => {
      const body = await mutate(null, "/api/admin/rooms", {
        method: "POST",
        body: JSON.stringify(input),
      });
      if (body?.room) upsertRoom(body.room);
    },
    [mutate, upsertRoom]
  );

  const updateRoom = useCallback(
    async (
      roomId: string,
      input: {
        name?: string;
        gridRow?: number;
        gridCol?: number;
        doctorName?: string | null;
        defaultDurationSeconds?: number;
      }
    ) => {
      const body = await mutate(roomId, `/api/admin/rooms/${roomId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      if (body?.room) upsertRoom(body.room);
    },
    [mutate, upsertRoom]
  );

  const deleteRoom = useCallback(
    async (roomId: string) => {
      const body = await mutate(roomId, `/api/admin/rooms/${roomId}`, {
        method: "DELETE",
      });
      if (body?.success) removeRoom(roomId);
    },
    [mutate, removeRoom]
  );

  // Roster mutations refetch on success: adding needs the new row's id, and
  // deleting may have un-assigned rooms server-side.
  const addDoctor = useCallback(
    async (name: string) => {
      const body = await mutate(null, "/api/admin/doctors", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      if (body) await refresh();
    },
    [mutate, refresh]
  );

  const deleteDoctor = useCallback(
    async (doctorId: string) => {
      const body = await mutate(null, `/api/admin/doctors/${doctorId}`, {
        method: "DELETE",
      });
      if (body?.success) await refresh();
    },
    [mutate, refresh]
  );

  return {
    rooms,
    doctors,
    serverNowMs: tickMs + offsetRef.current,
    loading,
    connectionError,
    busyRoomIds,
    actionError,
    timerAction,
    createRoom,
    updateRoom,
    deleteRoom,
    addDoctor,
    deleteDoctor,
  };
}
