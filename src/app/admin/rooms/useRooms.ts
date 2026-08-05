"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RoomRow, TimerAction } from "@/lib/room-status";
import { createBrowserClient } from "@/lib/supabase-browser";
import { ROOMS_CHANNEL, ROOMS_EVENT } from "@/lib/rooms-realtime";

const POLL_MS = 60_000;

// Data layer for the room timer board. Server rows + a skew-corrected
// 1 s clock; realtime broadcast triggers refetch, with polling and
// focus/online refetch as fallback. Display math stays in room-status.ts.
export function useRooms() {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busyRoomIds, setBusyRoomIds] = useState<Set<string>>(new Set());
  const [tickMs, setTickMs] = useState(() => Date.now());
  const offsetRef = useRef(0);

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
        serverTime: string;
      };
      offsetRef.current = Date.parse(data.serverTime) - Date.now();
      setRooms(data.rooms);
      setConnectionError(false);
    } catch {
      setConnectionError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(ROOMS_CHANNEL)
      .on("broadcast", { event: ROOMS_EVENT }, () => {
        refresh();
      })
      .subscribe();
    const poll = setInterval(refresh, POLL_MS);
    const onWake = () => refresh();
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => setTickMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const mutate = useCallback(
    async (roomId: string | null, path: string, init: RequestInit) => {
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
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setActionError(data.error ?? "Something went wrong");
          setTimeout(() => setActionError(""), 4000);
        }
      } catch {
        setActionError("Connection problem");
        setTimeout(() => setActionError(""), 4000);
      } finally {
        if (roomId) {
          setBusyRoomIds((prev) => {
            const next = new Set(prev);
            next.delete(roomId);
            return next;
          });
        }
        await refresh();
      }
    },
    [refresh]
  );

  const timerAction = useCallback(
    (roomId: string, action: TimerAction, valueSeconds?: number) =>
      mutate(roomId, `/api/admin/rooms/${roomId}/timer`, {
        method: "POST",
        body: JSON.stringify(
          action === "set"
            ? { action, setSeconds: valueSeconds }
            : { action, deltaSeconds: valueSeconds }
        ),
      }),
    [mutate]
  );

  const createRoom = useCallback(
    (input: {
      name: string;
      gridRow: number;
      gridCol: number;
      practitionerName?: string;
    }) =>
      mutate(null, "/api/admin/rooms", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    [mutate]
  );

  const updateRoom = useCallback(
    (
      roomId: string,
      input: {
        name?: string;
        gridRow?: number;
        gridCol?: number;
        practitionerName?: string | null;
        defaultDurationSeconds?: number;
      }
    ) =>
      mutate(roomId, `/api/admin/rooms/${roomId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    [mutate]
  );

  const deleteRoom = useCallback(
    (roomId: string) =>
      mutate(roomId, `/api/admin/rooms/${roomId}`, { method: "DELETE" }),
    [mutate]
  );

  return {
    rooms,
    serverNowMs: tickMs + offsetRef.current,
    loading,
    connectionError,
    busyRoomIds,
    actionError,
    timerAction,
    createRoom,
    updateRoom,
    deleteRoom,
  };
}
