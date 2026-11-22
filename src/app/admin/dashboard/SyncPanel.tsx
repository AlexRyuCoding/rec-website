"use client";
import { useState } from "react";
import { RefreshCcw } from "lucide-react";
import { goToStaffLogin } from "@/lib/staff-login-redirect";

// Dashboard → Setup: pull patient records from Practice Better by hand.
// Normally nobody needs to — new and changed patients arrive through the
// webhook — which is why this lives with the set-up panels and not next
// to the patient search.
export default function SyncPanel() {
  // --- Bulk sync from Practice Better ---
  // The API syncs ~500 records per call and returns a cursor; this loop
  // keeps calling until done so each serverless request stays fast.
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const syncPatients = async (quick = false) => {
    setSyncing(true);
    setSyncMsg(quick ? "Checking the newest records…" : "Starting sync…");
    let beforeId: string | null = null;
    let fetched = 0;
    let upserted = 0;
    let errors = 0;
    let total: number | null = null;
    try {
      for (;;) {
        const res = await fetch("/api/admin/sync-patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            quick ? { quick: true } : beforeId ? { before_id: beforeId } : {}
          ),
        });
        if (res.status === 401) {
          goToStaffLogin();
          return;
        }
        const data: {
          done: boolean;
          before_id: string | null;
          fetched: number;
          upserted: number;
          errors: number;
          total: number | null;
          created: number | null;
          error?: string;
        } = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSyncMsg(data.error ?? "Sync failed — try again.");
          return;
        }
        fetched += data.fetched;
        upserted += data.upserted;
        errors += data.errors;
        if (data.total) total = data.total;
        if (data.done || !data.before_id) {
          setSyncMsg(
            quick
              ? `Quick sync complete — checked the newest ${fetched} records` +
                  (data.created !== null
                    ? `: ${data.created} new patient${data.created === 1 ? "" : "s"} added`
                    : "") +
                  (errors ? `, ${errors} errors` : "") +
                  "."
              : `Sync complete — ${upserted.toLocaleString()} patients updated` +
                  (errors ? `, ${errors} errors` : "") +
                  "."
          );
          return;
        }
        beforeId = data.before_id;
        setSyncMsg(
          `Syncing… ${fetched.toLocaleString()}${
            total ? ` of ${total.toLocaleString()}` : ""
          } records`
        );
      }
    } catch {
      setSyncMsg("Sync failed — check your connection and try again.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="mt-10 border border-brand-foreground rounded-lg p-6">
      <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold">
        <RefreshCcw className="size-5" />
        Practice Better sync
      </h2>
      <p className="mb-5 text-sm opacity-70">
        Patients are copied from Practice Better automatically. Use this if a
        patient added there cannot be found here.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => syncPatients(true)}
          disabled={syncing}
          className="px-4 py-2 rounded-full border border-brand-foreground hover:bg-brand-muted disabled:opacity-50 transition-colors"
        >
          Quick sync (newest 100)
        </button>
        <button
          onClick={() => syncPatients()}
          disabled={syncing}
          className="px-4 py-2 rounded-full border border-brand-foreground hover:bg-brand-muted disabled:opacity-50 transition-colors"
        >
          {syncing ? "Syncing…" : "Full sync from Practice Better"}
        </button>
        <span className="text-sm text-cream/50">
          {syncMsg ||
            "New and updated patients normally arrive automatically. Quick sync catches recently added patients; full sync re-pulls every record."}
        </span>
      </div>
    </section>
  );
}
