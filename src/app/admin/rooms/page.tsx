"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { ArrowLeft, Bell, Pencil, X } from "lucide-react";
import { deriveRoomState } from "@/lib/room-status";
import {
  assignOutcome,
  roomNextUp,
  roomOccupants,
  roomWaitingForDoctor,
  visitState,
} from "@/lib/patient-flow";
import { gridStyle } from "./grid";
import { useRooms } from "./useRooms";
import { useAlarm } from "./useAlarm";
import RoomTile from "./RoomTile";
import LayoutEditor from "./LayoutEditor";
import WaitingList, { WaitingChipGhost } from "./WaitingList";
import SoundsPanel from "./SoundsPanel";
import WaitingBanner, { WaitingAlert } from "./WaitingBanner";

// Dragging a chip is a mouse gesture; staying silent keeps dnd-kit's
// default "Picked up draggable item <id>" out of screen readers. Keyboard
// and touch use tap-then-tap, which is announced by the buttons.
const SILENT_DRAG_ANNOUNCEMENTS = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

export default function RoomsPage() {
  const {
    rooms,
    doctors,
    visits,
    serverNowMs,
    loading,
    connectionError,
    busyRoomIds,
    pendingAdjustRoomIds,
    actionError,
    timerAction,
    visitAction,
    doctorIn,
    createRoom,
    updateRoom,
    deleteRoom,
    addDoctor,
    deleteDoctor,
  } = useRooms();
  const [editMode, setEditMode] = useState(false);
  const { soundEnabled, enableSound, testSound } = useAlarm(
    rooms,
    serverNowMs,
    visits,
    !loading
  );
  // The waiting patient staff are about to place. While set, every room
  // tile turns into a "Send here" / "Next up here" target.
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  // Desktop shortcut for the same thing: drag a waiting chip onto a room.
  // The MOUSE sensor on purpose — on the iPads a finger on the list must
  // keep scrolling and tapping exactly as before. A few pixels of travel
  // tell a drag from a click.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } })
  );
  const [draggingVisitId, setDraggingVisitId] = useState<string | null>(null);
  // The room the dragged chip is over right now.
  const [dragOverRoomId, setDragOverRoomId] = useState<string | null>(null);

  const waiting = visits.filter((v) => visitState(v) === "waiting");
  const selectedVisit = waiting.find((v) => v.id === selectedVisitId) ?? null;
  const draggingVisit = waiting.find((v) => v.id === draggingVisitId) ?? null;
  // Everyone except the selected patient — what each room looks like
  // before they are added to it.
  const otherVisits = selectedVisit
    ? visits.filter((v) => v.id !== selectedVisit.id)
    : visits;

  // One alert per room where a patient is waiting and no doctor has come
  // yet, longest wait first. Shown on every board: a board has no idea
  // which doctor is looking at it, so each alert names its doctor.
  const waitingAlerts: WaitingAlert[] = rooms
    .map((room) => {
      const unseen = roomWaitingForDoctor(visits, room.id);
      if (unseen.length === 0) return null;
      return {
        roomId: room.id,
        roomName: room.name,
        doctorName: room.doctor_name,
        doctorColor:
          doctors.find((d) => d.name === room.doctor_name)?.color ?? null,
        patientNames: unseen.map((v) => v.display_name),
        sinceMs: Math.min(...unseen.map((v) => Date.parse(v.called_at!))),
      };
    })
    .filter((a): a is WaitingAlert => a !== null)
    .sort((a, b) => a.sinceMs - b.sinceMs);

  // A tap anywhere that is not a waiting chip or a room target cancels
  // the selection, so the board never stays stuck in assign mode.
  useEffect(() => {
    if (!selectedVisitId) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest?.("[data-assign-keep]")) setSelectedVisitId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selectedVisitId]);

  // Picking a chip up selects it, so the tiles show the very same "Send
  // here" / "Next up here" / "Full" answers a tap would.
  const onDragStart = ({ active }: DragStartEvent) => {
    setSelectedVisitId(String(active.id));
    setDraggingVisitId(String(active.id));
  };

  const onDragOver = ({ over }: DragOverEvent) => {
    setDragOverRoomId(over ? String(over.id) : null);
  };

  const endDrag = () => {
    setDraggingVisitId(null);
    setDragOverRoomId(null);
    setSelectedVisitId(null);
  };

  // What letting go right now would do — the dragged chip says it, since
  // it covers the label of the tile underneath. A room mid-request takes
  // no drop, so it gets no promise either.
  const dragOverRoom =
    selectedVisit && draggingVisit
      ? rooms.find((r) => r.id === dragOverRoomId && !busyRoomIds.has(r.id))
      : undefined;
  const dragTarget = dragOverRoom
    ? {
        roomName: dragOverRoom.name,
        outcome: assignOutcome(dragOverRoom, otherVisits),
      }
    : null;

  // Letting go over a room is the tap on that room. Anywhere else — or on
  // a room that is full or mid-request — nothing happens and the chip is
  // simply back in the list.
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    endDrag();
    const visit = waiting.find((v) => v.id === active.id);
    const room = over ? rooms.find((r) => r.id === over.id) : undefined;
    if (!visit || !room || busyRoomIds.has(room.id)) return;
    const others = visits.filter((v) => v.id !== visit.id);
    if (assignOutcome(room, others) === "full") return;
    visitAction(visit.id, "assign", room.id);
  };

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
          <SoundsPanel onPlay={testSound} />
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
          <Bell className="h-4 w-4" /> Tap to turn on alert sounds on this
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
      ) : (
        <DndContext
          id="rooms-assign"
          sensors={sensors}
          collisionDetection={pointerWithin}
          accessibility={{ announcements: SILENT_DRAG_ANNOUNCEMENTS }}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={endDrag}
        >
          <WaitingBanner
            alerts={waitingAlerts}
            nowMs={serverNowMs}
            busyRoomIds={busyRoomIds}
            onDoctorIn={doctorIn}
          />
          <WaitingList
            visits={waiting}
            doctors={doctors}
            nowMs={serverNowMs}
            selectedId={selectedVisit?.id ?? null}
            dragging={draggingVisit !== null}
            onSelect={setSelectedVisitId}
            onRemove={(visitId) => visitAction(visitId, "remove")}
          />
          {rooms.length === 0 ? (
            <p className="mx-auto max-w-5xl text-white/60">
              No rooms yet — tap &quot;Edit layout&quot;, then &quot;Create
              room&quot;.
            </p>
          ) : (
            <div className="mx-auto max-w-5xl overflow-x-auto pb-2">
              <div className="grid gap-3" style={gridStyle}>
                {rooms.map((room) => {
                  const occupants = roomOccupants(visits, room.id);
                  return (
                    <div
                      key={room.id}
                      style={{
                        gridRowStart: room.grid_row + 1,
                        gridColumnStart: room.grid_col + 1,
                      }}
                    >
                      <RoomTile
                        room={room}
                        state={deriveRoomState(
                          room,
                          serverNowMs,
                          occupants.length,
                          roomWaitingForDoctor(visits, room.id).length
                        )}
                        busy={busyRoomIds.has(room.id)}
                        adjustPending={pendingAdjustRoomIds.has(room.id)}
                        nowMs={serverNowMs}
                        doctors={doctors}
                        occupants={occupants}
                        nextUp={roomNextUp(visits, room.id)}
                        assignMode={
                          selectedVisit
                            ? assignOutcome(room, otherVisits)
                            : null
                        }
                        onAction={(action, deltaSeconds) =>
                          timerAction(room.id, action, deltaSeconds)
                        }
                        onAssignDoctor={(doctorName) =>
                          updateRoom(room.id, { doctorName })
                        }
                        onAssignHere={() => {
                          if (!selectedVisit) return;
                          setSelectedVisitId(null);
                          visitAction(selectedVisit.id, "assign", room.id);
                        }}
                        onVisitAction={(visitId, action) =>
                          visitAction(visitId, action)
                        }
                        onDoctorIn={() => doctorIn(room.id)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {/* No "fly back" animation: after a drop the chip is already in
              its room, and a ghost sailing home would read as a refusal. */}
          <DragOverlay dropAnimation={null}>
            {draggingVisit && (
              <WaitingChipGhost
                visit={draggingVisit}
                doctors={doctors}
                nowMs={serverNowMs}
                target={dragTarget}
              />
            )}
          </DragOverlay>
        </DndContext>
      )}
    </main>
  );
}
