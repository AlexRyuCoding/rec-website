"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, Pencil, X } from "lucide-react";
import { deriveRoomState } from "@/lib/room-status";
import { gridStyle } from "./grid";
import { useRooms } from "./useRooms";
import { useAlarm } from "./useAlarm";
import RoomTile from "./RoomTile";
import LayoutEditor from "./LayoutEditor";

export default function RoomsPage() {
  const {
    rooms,
    doctors,
    serverNowMs,
    loading,
    connectionError,
    busyRoomIds,
    pendingAdjustRoomIds,
    actionError,
    timerAction,
    createRoom,
    updateRoom,
    deleteRoom,
    addDoctor,
    deleteDoctor,
  } = useRooms();
  const [editMode, setEditMode] = useState(false);
  const { soundEnabled, enableSound } = useAlarm(rooms, serverNowMs);

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

      {!soundEnabled && (
        <button
          onClick={enableSound}
          className="mx-auto mb-4 flex w-full max-w-5xl items-center gap-2 rounded-lg bg-sky-900/60 px-4 py-2 text-sm hover:bg-sky-900"
        >
          <Bell className="h-4 w-4" /> Tap to enable the timer chime on this
          device
        </button>
      )}

      {actionError && (
        <p className="mx-auto mb-4 max-w-5xl rounded-lg bg-rose-900/60 px-4 py-2 text-sm">
          {actionError}
        </p>
      )}

      {loading ? (
        <p className="mx-auto max-w-5xl text-white/60">Loading…</p>
      ) : editMode ? (
        <LayoutEditor
          rooms={rooms}
          doctors={doctors}
          onCreate={createRoom}
          onUpdate={updateRoom}
          onDelete={deleteRoom}
          onAddDoctor={addDoctor}
          onDeleteDoctor={deleteDoctor}
        />
      ) : rooms.length === 0 ? (
        <p className="mx-auto max-w-5xl text-white/60">
          No rooms yet — tap &quot;Edit layout&quot;, then &quot;Create
          room&quot;.
        </p>
      ) : (
        <div className="mx-auto max-w-5xl overflow-x-auto pb-2">
          <div className="grid gap-3" style={gridStyle}>
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
                  adjustPending={pendingAdjustRoomIds.has(room.id)}
                  nowMs={serverNowMs}
                  doctors={doctors}
                  onAction={(action, deltaSeconds) =>
                    timerAction(room.id, action, deltaSeconds)
                  }
                  onAssignDoctor={(doctorName) =>
                    updateRoom(room.id, { doctorName })
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
