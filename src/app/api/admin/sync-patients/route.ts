import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import {
  PB_BASE,
  getPbToken,
  type PbClientRecord,
} from "@/lib/practice-better";

export const maxDuration = 60;

// Chunked bulk sync from Practice Better, driven by the dashboard: each
// call fetches up to PAGES_PER_CALL pages (newest-first, before_id cursor
// — after_id walks the wrong way and re-fetches page 1 forever) and
// upserts them, then returns the cursor so the client requests the next
// chunk. Keeps each serverless invocation far from the timeout; a full
// sync is a browser-driven loop of these.
const PAGE_LIMIT = 100;
const PAGES_PER_CALL = 5;

interface PbRecordsPage {
  items?: PbClientRecord[];
  count?: number;
  hasMore?: boolean;
}

export async function POST(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  // Quick mode: one newest-first page only — catches recently CREATED
  // patients (e.g. a missed webhook). PB orders by record id, so edits to
  // old records don't surface here; those need the webhook or a full sync.
  const quick = body.quick === true;
  let cursor: string | null =
    typeof body.before_id === "string" && body.before_id
      ? body.before_id
      : null;

  const token = await getPbToken();

  const clients: PbClientRecord[] = [];
  // count shrinks with the cursor window; only the first page of the
  // whole sync (no cursor) reports the true total
  let total: number | null = null;
  let hasMore = true;

  const pagesThisCall = quick ? 1 : PAGES_PER_CALL;
  for (let page = 0; page < pagesThisCall && hasMore; page++) {
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (cursor) params.set("before_id", cursor);

    const res = await fetch(`${PB_BASE}/consultant/records?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.error("PB records fetch failed:", res.status);
      return NextResponse.json(
        { error: `Practice Better fetch failed (${res.status})` },
        { status: 502 }
      );
    }
    const data: PbRecordsPage = await res.json();

    if (total === null && !body.before_id && typeof data.count === "number") {
      total = data.count;
    }

    const items = data.items ?? [];
    clients.push(...items);
    hasMore = Boolean(data.hasMore) && items.length > 0;
    if (items.length > 0) cursor = items[items.length - 1].id;
  }

  // Dedupe by PB record id — a batch upsert fails outright if the same
  // key appears twice ("cannot affect row a second time")
  const unique = [...new Map(clients.map((c) => [c.id, c])).values()];
  const rows = unique.map((c) => ({
    pb_client_id: c.id,
    first_name: c.profile?.firstName ?? "",
    last_name: c.profile?.lastName ?? "",
    email: c.profile?.emailAddress?.toLowerCase() ?? null,
    phone: c.profile?.mobilePhone ?? c.profile?.homePhone ?? null,
  }));

  const supabase = createServiceClient();

  // Quick mode reports how many of the fetched records are genuinely new
  // (not yet in Supabase) — the interesting number for a spot check.
  let created: number | null = null;
  if (quick && rows.length > 0) {
    const { data: existing, error: existingError } = await supabase
      .from("patients")
      .select("pb_client_id")
      .in(
        "pb_client_id",
        rows.map((r) => r.pb_client_id)
      );
    if (!existingError && existing) {
      created = rows.length - existing.length;
    }
  }

  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase
      .from("patients")
      .upsert(batch, { onConflict: "pb_client_id" });
    if (!error) {
      upserted += batch.length;
      continue;
    }
    // Batch failed — retry rows one at a time to isolate the bad ones
    for (const row of batch) {
      const { error: rowError } = await supabase
        .from("patients")
        .upsert(row, { onConflict: "pb_client_id" });
      if (rowError) errors++;
      else upserted++;
    }
  }

  return NextResponse.json({
    // quick mode is always a single call — never hand back a cursor
    done: quick || !hasMore,
    before_id: !quick && hasMore ? cursor : null,
    fetched: clients.length,
    upserted,
    errors,
    total,
    created,
  });
}
