"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, X } from "lucide-react";
import { deriveRoomState, GRID_COLS } from "@/lib/room-status";
import { useRooms } from "./useRooms";
import RoomTile from "./RoomTile";

export default function RoomsPage() {
  const {
    rooms,
    serverNowMs,
    loading,
    connectionError,
    busyRoomIds,
    actionError,
    timerAction,
  } = useRooms();
  const [editMode, setEditMode] = useState(false);

  return (
    <main className="min-h-screen bg-neutral-950 p-4 text-white sm:p-6">
      <header className="mx-auto mb-6 flex max-w-5xl items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/dashboard"
            className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-semibold">Rooms</h1>
        </div>
        <div className="flex items-center gap-2">
          {connectionError && (
            <span className="text-xs text-amber-400">Reconnecting…</span>
          )}
          <button
            onClick={() => setEditMode((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
          >
            {editMode ? (
              <>
                <X className="h-4 w-4" /> Done
              </>
            ) : (
              <>
                <Pencil className="h-4 w-4" /> Edit layout
              </>
            )}
          </button>
        </div>
      </header>

      {actionError && (
        <p className="mx-auto mb-4 max-w-5xl rounded-lg bg-rose-900/60 px-4 py-2 text-sm">
          {actionError}
        </p>
      )}

      {loading ? (
        <p className="mx-auto max-w-5xl text-white/60">Loading…</p>
      ) : rooms.length === 0 && !editMode ? (
        <p className="mx-auto max-w-5xl text-white/60">
          No rooms yet — tap &quot;Edit layout&quot; to add your first room.
        </p>
      ) : (
        <div className="mx-auto max-w-5xl overflow-x-auto pb-2">
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${GRID_COLS}, minmax(150px, 1fr))`,
            }}
          >
            {rooms.map((room) => (
              <div
                key={room.id}
                style={{
                  gridRowStart: room.grid_row + 1,
                  gridColumnStart: room.grid_col + 1,
                }}
              >
                <RoomTile
                  room={room}
                  state={deriveRoomState(room, serverNowMs)}
                  busy={busyRoomIds.has(room.id)}
                  onAction={(action, deltaSeconds) =>
                    timerAction(room.id, action, deltaSeconds)
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
