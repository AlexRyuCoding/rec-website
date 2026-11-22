import { describe, expect, it } from "vitest";
import {
  DeviceKind,
  DEVICES,
  formatDisplayCookie,
  generateSecret,
  hashSecret,
  PAIR_MAX_PER_HOUR,
  parseDisplayCookie,
  PENDING_TTL_MS,
} from "./display-auth";
import { authorizeDisplay } from "./display-server";
import { requestPairing } from "./pairing-server";
import { fakeSupabase } from "./testing/fake-supabase";

const NOW = Date.parse("2026-11-24T18:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const IP = "203.0.113.5";

interface Device {
  id: string;
  code: string;
  secret_hash: string;
  label: string | null;
  created_at: string;
  created_ip: string | null;
  approved_at: string | null;
  revoked_at: string | null;
  last_seen_at: string | null;
}

let nextId = 0;
function device(overrides: Partial<Device> = {}) {
  const secret = generateSecret();
  const id = `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`;
  const row: Device = {
    id,
    code: "K7M4QX",
    secret_hash: hashSecret(secret),
    label: null,
    created_at: iso(NOW - 60_000),
    created_ip: IP,
    approved_at: null,
    revoked_at: null,
    last_seen_at: null,
    ...overrides,
  };
  return { row, cookie: formatDisplayCookie(id, secret) };
}

// The database gives a new row its id and time.
function db(tables: Partial<Record<string, Device[]>> = {}) {
  return fakeSupabase(
    { display_devices: [], kiosk_devices: [], ...tables },
    {
      onInsert: (_table, row) => {
        row.id = `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`;
        row.created_at = iso(NOW);
        row.approved_at = null;
        row.revoked_at = null;
        row.last_seen_at = null;
      },
    }
  );
}

describe.each<DeviceKind>(["tv", "kiosk"])("requestPairing (%s)", (kind) => {
  const table = DEVICES[kind].table;
  const other = DEVICES[kind === "tv" ? "kiosk" : "tv"].table;

  it("gives a new device a code and a cookie, in its own table", async () => {
    const fake = db();
    const reply = await requestPairing(fake.client, kind, undefined, IP, NOW);
    expect(reply.status).toBe("created");
    if (reply.status !== "created") return;
    expect(reply.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(parseDisplayCookie(reply.cookie)).not.toBeNull();
    expect(fake.tables[table]).toHaveLength(1);
    expect(fake.tables[other]).toHaveLength(0);
    // only the hash of the secret is stored
    const stored = fake.tables[table][0] as Device;
    const secret = parseDisplayCookie(reply.cookie)!.secret;
    expect(stored.secret_hash).toBe(hashSecret(secret));
    expect(JSON.stringify(stored)).not.toContain(secret);
  });

  it("a device already waiting keeps its code — reloading mints nothing", async () => {
    const waiting = device();
    const fake = db({ [table]: [waiting.row] });
    expect(
      await requestPairing(fake.client, kind, waiting.cookie, IP, NOW)
    ).toEqual({ status: "pending", code: "K7M4QX" });
    expect(fake.tables[table]).toHaveLength(1);
  });

  it("a paired device is told so", async () => {
    const paired = device({ approved_at: iso(NOW - 3600_000) });
    const fake = db({ [table]: [paired.row] });
    expect(
      await requestPairing(fake.client, kind, paired.cookie, IP, NOW)
    ).toEqual({ status: "paired" });
  });

  it("a revoked device starts over with a new code", async () => {
    const revoked = device({
      approved_at: iso(NOW - 3600_000),
      revoked_at: iso(NOW - 60_000),
      created_at: iso(NOW - 2 * 3600_000),
    });
    const fake = db({ [table]: [revoked.row] });
    const reply = await requestPairing(
      fake.client,
      kind,
      revoked.cookie,
      IP,
      NOW
    );
    expect(reply.status).toBe("created");
  });

  it("refuses an address that has asked too often this hour", async () => {
    const many = Array.from({ length: PAIR_MAX_PER_HOUR }, () => device().row);
    const fake = db({ [table]: many });
    expect(await requestPairing(fake.client, kind, undefined, IP, NOW)).toEqual(
      {
        status: "limited",
      }
    );
    expect(fake.tables[table]).toHaveLength(PAIR_MAX_PER_HOUR);
  });

  it("fails closed when the count cannot be read", async () => {
    const fake = fakeSupabase(
      { [table]: [] },
      { onQuery: (query) => (query.kind === "select" ? "XX000" : undefined) }
    );
    expect(await requestPairing(fake.client, kind, undefined, IP, NOW)).toEqual(
      {
        status: "limited",
      }
    );
  });

  it("does not replace a cookie it could not check", async () => {
    const paired = device({ approved_at: iso(NOW - 3600_000) });
    const fake = fakeSupabase(
      { [table]: [paired.row] },
      { onQuery: () => "XX000" }
    );
    expect(
      await requestPairing(fake.client, kind, paired.cookie, IP, NOW)
    ).toEqual({ status: "error", reason: "unknown" });
  });

  it("clears out codes nobody approved in a day", async () => {
    const stale = device({
      created_at: iso(NOW - 25 * 3600_000),
      created_ip: "x",
    });
    const fake = db({ [table]: [stale.row] });
    await requestPairing(fake.client, kind, undefined, IP, NOW);
    expect(
      (fake.tables[table] as Device[]).some((r) => r.id === stale.row.id)
    ).toBe(false);
  });
});

describe("a pairing belongs to one kind of device", () => {
  it("a paired TV's cookie does not open the kiosk, or the other way round", async () => {
    const tv = device({ approved_at: iso(NOW - 3600_000) });
    const kiosk = device({ approved_at: iso(NOW - 3600_000) });
    const fake = db({ display_devices: [tv.row], kiosk_devices: [kiosk.row] });

    expect(await authorizeDisplay(fake.client, tv.cookie, NOW, "tv")).toEqual({
      status: "ok",
    });
    expect(
      await authorizeDisplay(fake.client, tv.cookie, NOW, "kiosk")
    ).toEqual({
      status: "none",
    });
    expect(
      await authorizeDisplay(fake.client, kiosk.cookie, NOW, "kiosk")
    ).toEqual({
      status: "ok",
    });
    expect(
      await authorizeDisplay(fake.client, kiosk.cookie, NOW, "tv")
    ).toEqual({
      status: "none",
    });
    // and with no kind given it is a TV check, as before
    expect(await authorizeDisplay(fake.client, kiosk.cookie, NOW)).toEqual({
      status: "none",
    });
  });

  it("a kiosk code nobody approved in time stops working", async () => {
    const late = device({ created_at: iso(NOW - PENDING_TTL_MS - 1000) });
    const fake = db({ kiosk_devices: [late.row] });
    expect(
      await authorizeDisplay(fake.client, late.cookie, NOW, "kiosk")
    ).toEqual({
      status: "none",
    });
  });

  it("marks a paired kiosk as seen", async () => {
    const kiosk = device({ approved_at: iso(NOW - 3600_000) });
    const fake = db({ kiosk_devices: [kiosk.row] });
    await authorizeDisplay(fake.client, kiosk.cookie, NOW, "kiosk");
    expect((fake.tables.kiosk_devices[0] as Device).last_seen_at).toBe(
      iso(NOW)
    );
  });
});
