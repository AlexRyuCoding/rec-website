// A small in-memory stand-in for the Supabase client, for tests of the
// server-side code that reads, decides and writes (flow-server.ts,
// pin-server.ts). It runs the handful of query shapes this app uses
// against plain arrays, so a test can set up rows, run the real code and
// look at the rows afterwards — including what happens when another
// request changes them halfway through.
//
// Not a PostgREST emulator: select() does not project columns or embed
// related tables (rows come back whole), and only the filters below exist.

import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

// Numbers compare as numbers (ids), everything else as text (ISO
// timestamps sort correctly that way).
const below = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number"
    ? a < b
    : String(a) < String(b);
type Filter = (row: Row) => boolean;
interface Reply {
  data: unknown;
  error: { code: string } | null;
  // Only for select(…, { count: "exact", head: true }).
  count?: number | null;
}

export interface FakeQuery {
  table: string;
  kind: "select" | "insert" | "update" | "delete" | "upsert" | "rpc";
  columns: string[];
}

export interface FakeDbOptions {
  // Columns the "database" does not have yet (a migration not applied):
  // any query naming one is refused with Postgres's 42703.
  missingColumns?: Record<string, string[]>;
  // Unique columns: a write that would repeat a non-null value is refused
  // with 23505.
  unique?: Record<string, string[]>;
  // What the database would fill in on a new row (an id, a timestamp):
  // called with each row about to be inserted, to complete it in place.
  onInsert?: (table: string, row: Record<string, unknown>) => void;
  // Runs before each query is answered; return an error code to make that
  // query fail. Also the place to change rows "from another request".
  onQuery?: (query: FakeQuery, index: number) => string | void;
}

export function fakeSupabase(
  tables: Record<string, object[]>,
  options: FakeDbOptions = {}
) {
  const queries: FakeQuery[] = [];

  const from = (table: string) => {
    const rows = (tables[table] ??= []) as Row[];
    let kind: FakeQuery["kind"] = "select";
    let payload: Row | Row[] | null = null;
    let returning = false;
    let countOnly = false;
    let conflictKey = "id";
    let withCount = false;
    let one: "single" | "maybeSingle" | null = null;
    let limit: number | null = null;
    let range: [number, number] | null = null;
    let orderBy: string | null = null;
    let descending = false;
    const filters: Filter[] = [];
    const columns = new Set<string>();

    const named = (list: string) =>
      list
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c && c !== "*" && !c.includes("("))
        .forEach((c) => columns.add(c));

    let queueCount = 0;
    const run = (): Reply => {
      const query: FakeQuery = { table, kind, columns: [...columns] };
      const index = queries.push(query) - 1;
      const forced = options.onQuery?.(query, index);
      if (forced) return { data: null, error: { code: forced } };
      const missing = options.missingColumns?.[table] ?? [];
      if (query.columns.some((c) => missing.includes(c))) {
        return { data: null, error: { code: "42703" } };
      }
      const matches = () => rows.filter((r) => filters.every((f) => f(r)));
      const clash = (candidate: Row, self?: Row) =>
        (options.unique?.[table] ?? []).some(
          (col) =>
            candidate[col] != null &&
            rows.some((r) => r !== self && r[col] === candidate[col])
        );

      let result: Row[];
      if (kind === "insert") {
        const added = (Array.isArray(payload) ? payload : [payload!]).map(
          (r) => ({ ...r })
        );
        added.forEach((r) => options.onInsert?.(table, r));
        if (added.some((r) => clash(r))) {
          return { data: null, error: { code: "23505" } };
        }
        rows.push(...added);
        result = added;
      } else if (kind === "update") {
        const hit = matches();
        if (hit.some((r) => clash({ ...r, ...(payload as Row) }, r))) {
          return { data: null, error: { code: "23505" } };
        }
        hit.forEach((r) => Object.assign(r, payload as Row));
        result = hit;
      } else if (kind === "upsert") {
        const row = payload as Row;
        const existing = rows.find((r) => r[conflictKey] === row[conflictKey]);
        if (existing) Object.assign(existing, row);
        else rows.push({ ...row });
        result = [existing ?? row];
      } else if (kind === "delete") {
        result = matches();
        result.forEach((r) => rows.splice(rows.indexOf(r), 1));
      } else {
        result = matches();
        if (countOnly) return { data: null, error: null, count: result.length };
        const matched = result.length;
        if (withCount) {
          // the count is of everything that matched, not of the page
          queueCount = matched;
        }
        if (orderBy) {
          const key = orderBy;
          result = [...result].sort((a, b) => (below(a[key], b[key]) ? -1 : 1));
          if (descending) result.reverse();
        }
        if (range) result = result.slice(range[0], range[1] + 1);
        if (limit !== null) result = result.slice(0, limit);
      }

      const copies = result.map((r) => ({ ...r }));
      if (kind !== "select" && !returning) return { data: null, error: null };
      if (kind === "select" && withCount && !one) {
        return { data: copies, error: null, count: queueCount };
      }
      if (one) {
        if (copies.length > 1 || (one === "single" && copies.length === 0)) {
          return { data: null, error: { code: "PGRST116" } };
        }
        return { data: copies[0] ?? null, error: null };
      }
      return { data: copies, error: null };
    };

    const where = (column: string, test: (value: unknown) => boolean) => {
      columns.add(column);
      filters.push((r) => test(r[column]));
      return builder;
    };

    const builder = {
      select(list = "*", options?: { count?: string; head?: boolean }) {
        named(list);
        if (kind !== "select") returning = true;
        if (options?.head) countOnly = true;
        else if (options?.count) withCount = true;
        return builder;
      },
      insert(value: Row | Row[]) {
        kind = "insert";
        payload = value;
        (Array.isArray(value) ? value : [value]).forEach((r) =>
          Object.keys(r).forEach((c) => columns.add(c))
        );
        return builder;
      },
      update(value: Row) {
        kind = "update";
        payload = value;
        Object.keys(value).forEach((c) => columns.add(c));
        return builder;
      },
      delete() {
        kind = "delete";
        return builder;
      },
      // insert, or replace the row with the same key
      upsert(value: Row, options?: { onConflict?: string }) {
        kind = "upsert";
        payload = value;
        conflictKey = options?.onConflict ?? "id";
        Object.keys(value).forEach((c) => columns.add(c));
        return builder;
      },
      eq: (c: string, v: unknown) => where(c, (x) => x === v),
      neq: (c: string, v: unknown) => where(c, (x) => x !== v),
      gte: (c: string, v: string | number) =>
        where(c, (x) => x != null && !below(x, v)),
      lt: (c: string, v: string | number) =>
        where(c, (x) => x != null && below(x, v)),
      in: (c: string, v: unknown[]) => where(c, (x) => v.includes(x)),
      // array column holds every one of these
      contains: (c: string, v: unknown[]) =>
        where(c, (x) => Array.isArray(x) && v.every((i) => x.includes(i))),
      is: (c: string, v: null) => where(c, (x) => (x ?? null) === v),
      not(c: string, operator: string, v: unknown) {
        if (operator !== "is") throw new Error(`fake: not.${operator}`);
        return where(c, (x) => (x ?? null) !== v);
      },
      order(c: string, options?: { ascending?: boolean }) {
        orderBy = c;
        descending = options?.ascending === false;
        return builder;
      },
      limit(n: number) {
        limit = n;
        return builder;
      },
      range(a: number, b: number) {
        range = [a, b];
        return builder;
      },
      single() {
        one = "single";
        return builder;
      },
      maybeSingle() {
        one = "maybeSingle";
        return builder;
      },
      then(
        resolve: (reply: Reply) => unknown,
        reject?: (reason: unknown) => unknown
      ) {
        return new Promise<Reply>((done) => done(run())).then(resolve, reject);
      },
    };
    return builder;
  };

  // Database functions. Only apply_flow_change exists here, behaving as
  // the real one does (migration 0021): every row changes, or none.
  const rpc = (name: string, args: Record<string, unknown>) => ({
    then(
      resolve: (reply: Reply) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      const run = (): Reply => {
        const query: FakeQuery = { table: name, kind: "rpc", columns: [] };
        const index = queries.push(query) - 1;
        const forced = options.onQuery?.(query, index);
        if (forced) return { data: null, error: { code: forced } };
        if (name !== "apply_flow_change") {
          return { data: null, error: { code: "PGRST202" } };
        }
        const updates = (args.visit_updates ?? []) as {
          id: string;
          fields: Row;
        }[];
        const visits = (tables.checkins ??= []) as Row[];
        const rooms = (tables.rooms ??= []) as Row[];
        const room = args.target_room
          ? rooms.find((r) => r.id === args.target_room)
          : null;
        // nothing is written unless everything can be
        if (
          (args.target_room && !room) ||
          updates.some((u) => !visits.some((v) => v.id === u.id))
        ) {
          return { data: null, error: { code: "P0002" } };
        }
        if (room && args.room_fields) {
          Object.assign(room, args.room_fields, { updated_at: "updated" });
        }
        for (const u of updates) {
          Object.assign(visits.find((v) => v.id === u.id)!, u.fields);
        }
        return { data: room ? { ...room } : null, error: null };
      };
      return new Promise<Reply>((done) => done(run())).then(resolve, reject);
    },
  });

  return {
    client: { from, rpc } as unknown as SupabaseClient,
    tables,
    queries,
  };
}
