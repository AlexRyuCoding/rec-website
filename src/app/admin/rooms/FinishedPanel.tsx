"use client";
import { useCallback, useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import {
  FinishedVisitView,
  restoreTarget,
  VisitView,
} from "@/lib/patient-flow";
import { RoomRow } from "@/lib/room-status";
import { CLINIC_TZ } from "@/lib/clinic-time";
import { goToStaffLogin } from "@/lib/staff-login-redirect";
import { visitNote } from "./tile/visit-note";
import { buttonSkinClass } from "../ui/styles";

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: CLINIC_TZ,
  });

// Today's finished visits, newest first, each with "Restore". This is the
// way back from the two taps that end a visit with no undo of their own:
// "Room ready" on the wrong tile, and a wrong "Remove".
//
// The button says where the patient will land (the rule is restoreTarget,
// the same one the server applies): back in their room if it still stands
// empty — nobody is called again — otherwise the waiting list.
export default function FinishedPanel({
  rooms,
  visits,
  onRestore,
}: {
  rooms: RoomRow[];
  // Everyone on the board now: decides where a restore would land, and a
  // change here means the list below may have changed too.
  visits: VisitView[];
  // Resolves true once the patient is back on the board.
  onRestore: (visitId: string) => Promise<boolean>;
}) {
  const [finished, setFinished] = useState<FinishedVisitView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/visits/finished", {
        cache: "no-store",
      });
      if (res.status === 401) {
        goToStaffLogin();
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { finished: FinishedVisitView[] };
      setFinished(data.finished);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  // Whenever the board changes, someone may have just been finished (or
  // restored on another tablet).
  const boardKey = visits
    .map((v) => `${v.id}:${v.room_id}:${v.called_at}:${v.seen_at}`)
    .join("|");
  useEffect(() => {
    void load();
  }, [load, boardKey]);

  const restore = async (visitId: string) => {
    setRestoringId(visitId);
    await onRestore(visitId);
    await load();
    setRestoringId(null);
  };

  return (
    <div className="mt-2.5 border-t border-ui-line pt-2.5">
      {finished === null ? (
        <p className="py-2 text-sm text-ui-text-3">
          {failed ? "Couldn't load the finished visits." : "Loading…"}
        </p>
      ) : finished.length === 0 ? (
        <p className="py-2 text-sm text-ui-text-3">
          Nobody has finished yet today.
        </p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto">
          {finished.map((visit) => {
            const room = rooms.find((r) => r.id === visit.room_id);
            const toRoom = restoreTarget(visit, room, visits) === "room";
            const note = visitNote({
              service_name: visit.service_name,
              first_visit: false,
            });
            return (
              <li
                key={visit.id}
                className="flex items-center gap-3 rounded-xl bg-ui-panel-2 px-3 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {visit.display_name}
                    {note && (
                      <span className="ml-2 font-normal text-ui-text-2">
                        {note}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-ui-text-3">
                    {room && visit.called_at ? `${room.name} · ` : ""}
                    finished {formatTime(visit.done_at)}
                  </p>
                </div>
                <button
                  disabled={restoringId !== null}
                  onClick={() => restore(visit.id)}
                  aria-label={`Restore ${visit.display_name} to ${
                    toRoom && room ? room.name : "the waiting list"
                  }`}
                  className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm ${buttonSkinClass("primary")}`}
                >
                  <Undo2 className="h-4 w-4" />
                  {restoringId === visit.id
                    ? "Restoring…"
                    : toRoom && room
                      ? `Back in ${room.name}`
                      : "To waiting list"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {finished !== null && failed && (
        <p className="pt-1 text-xs text-ui-caution">
          Couldn&apos;t refresh this list.
        </p>
      )}
    </div>
  );
}
