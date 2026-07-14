"use client";
import { useCallback, useEffect, useState } from "react";

interface CheckinRow {
  id: string;
  checked_in_at: string;
  appointment_time: string | null;
  practitioner: string | null;
  first_name: string;
  last_name: string;
}

interface PatientRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  has_pin: boolean;
}

type Preset = "today" | "yesterday" | "week" | "month" | "custom";

function presetRange(preset: Preset): { from: Date; to: Date } {
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);
  switch (preset) {
    case "yesterday": {
      const from = new Date(today.getTime() - 86400_000);
      return { from, to: today };
    }
    case "week": {
      const from = new Date(today.getTime() - 6 * 86400_000);
      return { from, to: new Date(today.getTime() + 86400_000) };
    }
    case "month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: new Date(today.getTime() + 86400_000) };
    }
    default:
      return { from: today, to: new Date(today.getTime() + 86400_000) };
  }
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default function AdminDashboard() {
  const [tab, setTab] = useState<"checkins" | "patients">("checkins");

  // --- Check-ins ---
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<CheckinRow[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCheckins = useCallback(async () => {
    let from: Date, to: Date;
    if (preset === "custom") {
      if (!customFrom || !customTo) return;
      from = new Date(customFrom + "T00:00:00");
      to = new Date(new Date(customTo + "T00:00:00").getTime() + 86400_000);
    } else {
      ({ from, to } = presetRange(preset));
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/checkins?from=${from.toISOString()}&to=${to.toISOString()}`
      );
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load check-ins");
        return;
      }
      setRows(data.checkins);
      setTotal(data.total);
      setTruncated(data.truncated);
    } catch {
      setError("Failed to load check-ins");
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    loadCheckins();
  }, [loadCheckins]);

  const exportCsv = () => {
    const header = "Checked in,Patient,Appointment,Practitioner";
    const lines = rows.map((r) =>
      [
        new Date(r.checked_in_at).toLocaleString(),
        `${r.first_name} ${r.last_name}`,
        r.appointment_time ?? "",
        r.practitioner ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header, ...lines].join("\n")], {
      type: "text/csv",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `checkins-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // --- Patients ---
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  // id of the patient whose Reset button is in confirm state
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [resetDoneId, setResetDoneId] = useState<string | null>(null);

  const search = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError("");
    setConfirmingId(null);
    setResetDoneId(null);
    try {
      const res = await fetch(
        `/api/admin/patients?q=${encodeURIComponent(query.trim())}`
      );
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? "Search failed");
        return;
      }
      setPatients(data.patients);
      if (data.patients.length === 0) setSearchError("No patients found.");
    } catch {
      setSearchError("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const resetPin = async (id: string) => {
    try {
      const res = await fetch("/api/admin/reset-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: id }),
      });
      if (res.ok) {
        setPatients((ps) =>
          ps.map((p) => (p.id === id ? { ...p, has_pin: false } : p))
        );
        setResetDoneId(id);
      }
    } finally {
      setConfirmingId(null);
    }
  };

  const tabClass = (active: boolean) =>
    `px-6 py-3 text-lg rounded-t-lg border border-b-0 border-brand-foreground transition-colors ${
      active ? "bg-[#2A9E8F] text-white" : "bg-transparent hover:bg-brand-muted"
    }`;

  return (
    <div className="min-h-screen p-6 sm:p-10 mt-12 max-w-5xl mx-auto">
      <h1 className="text-3xl font-semibold mb-6">Office Dashboard</h1>

      <div className="flex gap-2">
        <button
          className={tabClass(tab === "checkins")}
          onClick={() => setTab("checkins")}
        >
          Check-ins
        </button>
        <button
          className={tabClass(tab === "patients")}
          onClick={() => setTab("patients")}
        >
          Patients
        </button>
      </div>

      <div className="border border-brand-foreground rounded-b-lg rounded-tr-lg p-6">
        {tab === "checkins" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["today", "Today"],
                  ["yesterday", "Yesterday"],
                  ["week", "Past week"],
                  ["month", "This month"],
                  ["custom", "Custom"],
                ] as [Preset, string][]
              ).map(([p, label]) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={`px-4 py-2 rounded-full border transition-colors ${
                    preset === p
                      ? "bg-[#2A9E8F] text-white border-[#2A9E8F]"
                      : "border-brand-foreground hover:bg-brand-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
              {preset === "custom" && (
                <span className="flex items-center gap-2">
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="px-3 py-2 border border-brand-foreground rounded-lg bg-transparent"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="px-3 py-2 border border-brand-foreground rounded-lg bg-transparent"
                  />
                </span>
              )}
              <button
                onClick={exportCsv}
                disabled={rows.length === 0}
                className="ml-auto px-4 py-2 rounded-full border border-brand-foreground hover:bg-brand-muted disabled:opacity-50 transition-colors"
              >
                Export CSV
              </button>
            </div>

            {error && <p className="text-red-500">{error}</p>}
            {truncated && (
              <p className="text-amber-600">
                Showing the most recent 500 of {total} check-ins — narrow the
                range or export in chunks.
              </p>
            )}
            {loading ? (
              <p className="py-8 text-center text-gray-500">Loading...</p>
            ) : rows.length === 0 && !error ? (
              <p className="py-8 text-center text-gray-500">
                No check-ins in this range.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-brand-foreground">
                      <th className="py-2 pr-4">Checked in</th>
                      <th className="py-2 pr-4">Patient</th>
                      <th className="py-2 pr-4">Appointment</th>
                      <th className="py-2">Practitioner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-brand-muted">
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {fmtTime(r.checked_in_at)}
                        </td>
                        <td className="py-2 pr-4">
                          {r.first_name} {r.last_name}
                        </td>
                        <td className="py-2 pr-4">
                          {r.appointment_time ?? "—"}
                        </td>
                        <td className="py-2">{r.practitioner ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-sm text-gray-500">
                  {total} check-in{total === 1 ? "" : "s"}
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "patients" && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="Search by name, email, or phone"
                className="flex-1 px-4 py-2 border border-brand-foreground rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-[#2A9E8F]"
              />
              <button
                onClick={search}
                disabled={searching || query.trim().length < 2}
                className="px-6 py-2 rounded-lg bg-[#2A9E8F] text-white hover:bg-[#238B7E] disabled:opacity-50 transition-colors"
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </div>

            {searchError && <p className="text-gray-500">{searchError}</p>}
            {patients.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-brand-foreground">
                      <th className="py-2 pr-4">Patient</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Phone</th>
                      <th className="py-2 pr-4">PIN</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((p) => (
                      <tr key={p.id} className="border-b border-brand-muted">
                        <td className="py-2 pr-4">
                          {p.first_name} {p.last_name}
                        </td>
                        <td className="py-2 pr-4">{p.email ?? "—"}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {p.phone ?? "—"}
                        </td>
                        <td className="py-2 pr-4">
                          {p.has_pin ? "Set" : "None"}
                        </td>
                        <td className="py-2 text-right">
                          {resetDoneId === p.id ? (
                            <span className="text-[#2A9E8F]">
                              Cleared — patient can set a new PIN at the kiosk
                            </span>
                          ) : p.has_pin ? (
                            confirmingId === p.id ? (
                              <span className="flex gap-2 justify-end">
                                <button
                                  onClick={() => resetPin(p.id)}
                                  className="px-3 py-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                                >
                                  Confirm reset
                                </button>
                                <button
                                  onClick={() => setConfirmingId(null)}
                                  className="px-3 py-1 rounded-full border border-brand-foreground hover:bg-brand-muted transition-colors"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirmingId(p.id)}
                                className="px-3 py-1 rounded-full border border-brand-foreground hover:bg-brand-muted transition-colors"
                              >
                                Reset PIN
                              </button>
                            )
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
