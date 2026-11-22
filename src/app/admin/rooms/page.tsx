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
import { ArrowLeft, Bell, BellOff, Pencil, X } from "lucide-react";
import { deriveRoomState, RoomRow } from "@/lib/room-status";
import {
  assignOutcome,
  JoinQuestion,
  joinQuestionFor,
  joinQuestionOpen,
  roomNextUp,
  roomOccupants,
  roomWaitingForDoctor,
  visitState,
  VisitView,
} from "@/lib/patient-flow";
import { isLongWait } from "@/lib/alert-escalation";
import { gridStyle } from "./grid";
import Backdrop from "../ui/Backdrop";
import { buttonClass, buttonSkinClass } from "../ui/styles";
import ThemeSwitch from "../ui/ThemeSwitch";
import { useStaffTheme } from "../ui/use-staff-theme";
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

// How long a tile stays inert after withdrawing its question.
const QUESTION_CHANGED_HOLD_MS = 2500;

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
  // Dark unless a theme has been chosen on this device (see layout.tsx).
  const { choice: themeChoice, setChoice: setThemeChoice } =
    useStaffTheme("dark");
  const [editMode, setEditMode] = useState(false);
  const {
    soundEnabled,
    silentNotice,
    enableSound,
    testSound,
    doorbellDoctors,
    setDoorbellDoctors,
  } = useAlarm(rooms, serverNowMs, visits, !loading, doctors);
  // The waiting patient staff are about to place. While set, every room
  // tile turns into a "Send here" / "Next up here" target.
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  // A room with someone in it never takes a second patient by itself:
  // the tile first asks whether they came together. This is that
  // question — for one patient, one room, and exactly the people it
  // named when it opened.
  const [question, setQuestion] = useState<JoinQuestion | null>(null);
  // Every way of picking, changing or dropping the selection also drops
  // the question: it belongs to the patient who was selected.
  const select = (visitId: string | null) => {
    setSelectedVisitId(visitId);
    setQuestion(null);
  };
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

  // The question stays up only while everything it rests on still holds.
  // If another board changes who is in the room (or its line), it closes
  // rather than quietly showing a different name above the same "Yes".
  const openQuestion =
    question &&
    question.visitId === selectedVisit?.id &&
    joinQuestionOpen(question, rooms, visits)
      ? question
      : null;
  // A question that closes this way does so under a finger that may
  // already be on its way to "Yes". Whatever the tile would show next —
  // another question about other people, "Send here", or the room's own
  // Start / Room ready buttons — must not catch that tap. So the tile
  // says it changed and takes no presses for a moment.
  const [changedRoomId, setChangedRoomId] = useState<string | null>(null);
  useEffect(() => {
    if (question && !openQuestion) {
      setQuestion(null);
      setChangedRoomId(question.roomId);
    }
  }, [question, openQuestion]);
  useEffect(() => {
    if (!changedRoomId) return;
    const t = setTimeout(
      () => setChangedRoomId(null),
      QUESTION_CHANGED_HOLD_MS
    );
    return () => clearTimeout(t);
  }, [changedRoomId]);

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
        long: unseen.some((v) =>
          isLongWait(Date.parse(v.called_at!), serverNowMs)
        ),
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
      if (!target?.closest?.("[data-assign-keep]")) {
        setSelectedVisitId(null);
        setQuestion(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selectedVisitId]);

  // Picking a chip up selects it, so the tiles show the very same "Send
  // here" / "Next up here" / "Full" answers a tap would.
  const onDragStart = ({ active }: DragStartEvent) => {
    select(String(active.id));
    setDraggingVisitId(String(active.id));
  };

  const onDragOver = ({ over }: DragOverEvent) => {
    setDragOverRoomId(over ? String(over.id) : null);
  };

  const endDrag = () => {
    setDraggingVisitId(null);
    setDragOverRoomId(null);
    select(null);
  };

  // Put a waiting patient on a room — the one action behind both the tap
  // on a tile and the drop of a dragged chip. If the room has someone in
  // it (or lined up for it) whom this patient could be together with,
  // nothing is sent yet: the tile asks, and the patient stays selected so
  // it is plain who the question is about.
  const assignTo = (visit: VisitView, room: RoomRow) => {
    const ask = joinQuestionFor(room, visits, visit.id);
    if (ask) {
      setSelectedVisitId(visit.id);
      setQuestion(ask);
      return;
    }
    select(null);
    const others = visits.filter((v) => v.id !== visit.id);
    if (assignOutcome(room, others) === "full") return;
    visitAction(visit.id, "assign", room.id);
  };

  // "Yes" names the people the question showed; the server refuses it if
  // they are no longer the ones there. "No" sends no names: lined up.
  const answerQuestion = (together: boolean) => {
    if (!openQuestion) return;
    select(null);
    visitAction(
      openQuestion.visitId,
      "assign",
      openQuestion.roomId,
      together ? openQuestion.companionIds : undefined
    );
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
    assignTo(visit, room);
  };

  return (
    // The frame — top bar, waiting list, panels — follows the theme and
    // sits on the theme's photo; the room tiles do not (tile/key-styles.ts).
    //
    // `isolate` + a photo that goes UNDER the content: no part of the page
    // is given a z-index for the photo's sake, so the board's own layers
    // (Sounds popover z-40, the sticky doctor alert z-30, the editor's
    // dialog, the silent-sounds bar) stack exactly as they always have.
    <main className="relative isolate min-h-screen pb-4 text-ui-text sm:pb-6">
      <Backdrop under />
      {/* No taller than the header it replaced (that one: 84px with the
          gap under it; this one: 82px): two rows of rooms and a doctor
          alert have to sit as high on a 10-inch tablet as they did. */}
      <header className="mb-4 border-b border-ui-line bg-ui-panel px-4 shadow-lift-2 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/dashboard"
              className={`rounded-lg p-2 ${buttonSkinClass("quiet")}`}
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-semibold">Rooms</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {connectionError && (
              <span className="text-xs text-ui-caution">Reconnecting…</span>
            )}
            <ThemeSwitch
              device="tablet"
              choice={themeChoice}
              onChange={setThemeChoice}
            />
            <SoundsPanel
              onPlay={testSound}
              doctors={doctors}
              doorbellDoctors={doorbellDoctors}
              onDoorbellDoctors={setDoorbellDoctors}
            />
            <button
              onClick={() => setEditMode((v) => !v)}
              className={`${buttonClass()} text-sm`}
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
        </div>
      </header>

      <div className="px-4 sm:px-6">
        {!soundEnabled && (
          <button
            onClick={enableSound}
            className={`mx-auto mb-4 flex w-full max-w-5xl items-center gap-2 rounded-lg px-4 py-2 text-sm ${buttonSkinClass()}`}
          >
            <Bell className="h-4 w-4" /> Tap to turn on alert sounds on this
            device
          </button>
        )}

        {/* Sounds are on for this device but the browser is holding them
          back until the screen is touched (every page load starts that
          way). Fixed to the bottom edge, so the board does not jump under
          the very tap that clears it. */}
        {silentNotice && (
          <button
            onClick={enableSound}
            className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-3 bg-amber-300 px-4 py-3 text-base font-semibold text-amber-950 shadow-[0_-3px_0_rgba(0,0,0,0.5)]"
          >
            <BellOff aria-hidden className="h-6 w-6 shrink-0 animate-pulse" />
            Alert sounds are silent on this screen until it is touched — tap
            anywhere
          </button>
        )}

        {actionError && (
          <p className="mx-auto mb-4 max-w-5xl rounded-lg border border-ui-error bg-ui-panel px-4 py-2 text-sm text-ui-error">
            {actionError}
          </p>
        )}

        {loading ? (
          <p className="mx-auto max-w-5xl rounded-lg border border-ui-line bg-ui-panel px-4 py-2 text-ui-text-2">
            Loading…
          </p>
        ) : editMode ? (
          <>
            {/* The doctor alert cannot be dismissed, and opening the layout
              editor on one tablet must not be a way around that. */}
            <WaitingBanner
              alerts={waitingAlerts}
              nowMs={serverNowMs}
              busyRoomIds={busyRoomIds}
              onDoctorIn={doctorIn}
            />
            <LayoutEditor
              rooms={rooms}
              doctors={doctors}
              onCreate={createRoom}
              onUpdate={updateRoom}
              onDelete={deleteRoom}
              onAddDoctor={addDoctor}
              onDeleteDoctor={deleteDoctor}
            />
          </>
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
              allVisits={visits}
              rooms={rooms}
              doctors={doctors}
              nowMs={serverNowMs}
              selectedId={selectedVisit?.id ?? null}
              dragging={draggingVisit !== null}
              onSelect={select}
              onRemove={(visitId) => visitAction(visitId, "remove")}
              onRestore={(visitId) => visitAction(visitId, "restore")}
            />
            {rooms.length === 0 ? (
              <p className="mx-auto max-w-5xl rounded-lg border border-ui-line bg-ui-panel px-4 py-2 text-ui-text-2">
                No rooms yet — tap &quot;Edit layout&quot;, then &quot;Create
                room&quot;.
              </p>
            ) : (
              <div className="mx-auto max-w-5xl overflow-x-auto pb-2">
                <div className="grid gap-3" style={gridStyle}>
                  {rooms.map((room) => {
                    const occupants = roomOccupants(visits, room.id);
                    const asking =
                      openQuestion?.roomId === room.id && selectedVisit
                        ? {
                            patientName: selectedVisit.display_name,
                            companionNames: openQuestion.companionIds.map(
                              (id) =>
                                visits.find((v) => v.id === id)?.display_name ??
                                ""
                            ),
                            kind: openQuestion.kind,
                          }
                        : null;
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
                          longWait={
                            waitingAlerts.find((a) => a.roomId === room.id)
                              ?.long ?? false
                          }
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
                          question={asking}
                          changed={changedRoomId === room.id}
                          onAssignHere={() => {
                            if (selectedVisit) assignTo(selectedVisit, room);
                          }}
                          onAnswer={answerQuestion}
                          onCancelQuestion={() => select(null)}
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
      </div>
    </main>
  );
}
