import { beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { pinFingerprint } from "./pin-lookup";
import { findPatientByPin, pinUsedByAnother, saveNewPin } from "./pin-server";
import { fakeSupabase } from "./testing/fake-supabase";

const SECRET = "test-secret";
const opts = { secret: SECRET, hashRounds: 4 };

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  pb_client_id: string | null;
  pin: string | null;
  pin_lookup?: string | null;
}

const hashes: Record<string, string> = {};
beforeAll(async () => {
  for (const pin of ["1111", "2222", "3333"]) {
    hashes[pin] = await bcrypt.hash(pin, 4);
  }
});

const patient = (
  id: string,
  pin: string | null,
  lookup: "stamped" | "old-key" | "none" = "none"
): Patient => ({
  id,
  first_name: id.toUpperCase(),
  last_name: "Test",
  pb_client_id: `pb-${id}`,
  pin: pin ? hashes[pin] : null,
  pin_lookup:
    pin && lookup === "stamped"
      ? pinFingerprint(pin, SECRET)
      : pin && lookup === "old-key"
        ? pinFingerprint(pin, "the-secret-before-rotation")
        : null,
});

const row = (db: ReturnType<typeof fakeSupabase>, id: string) =>
  (db.tables.patients as Patient[]).find((p) => p.id === id)!;

describe("findPatientByPin", () => {
  it("finds a fingerprinted patient with one query, without reading everyone", async () => {
    const db = fakeSupabase({
      patients: [
        patient("a", "1111", "stamped"),
        patient("b", "2222", "stamped"),
      ],
    });
    const found = await findPatientByPin(db.client, "2222", opts);
    expect(found).toMatchObject({
      id: "b",
      first_name: "B",
      pb_client_id: "pb-b",
    });
    expect(db.queries).toHaveLength(1);
  });

  it("finds a patient not fingerprinted yet the slow way, and stamps them", async () => {
    const db = fakeSupabase({
      patients: [patient("a", "1111", "stamped"), patient("b", "2222")],
    });
    expect(await findPatientByPin(db.client, "2222", opts)).toMatchObject({
      id: "b",
    });
    expect(row(db, "b").pin_lookup).toBe(pinFingerprint("2222", SECRET));
    // the second time it is the one query
    const before = db.queries.length;
    await findPatientByPin(db.client, "2222", opts);
    expect(db.queries.length - before).toBe(1);
  });

  it("still finds everyone after the server secret was rotated, and re-stamps", async () => {
    const db = fakeSupabase({ patients: [patient("a", "1111", "old-key")] });
    expect(await findPatientByPin(db.client, "1111", opts)).toMatchObject({
      id: "a",
    });
    expect(row(db, "a").pin_lookup).toBe(pinFingerprint("1111", SECRET));
  });

  it("returns null for a PIN nobody has", async () => {
    const db = fakeSupabase({
      patients: [patient("a", "1111", "stamped"), patient("b", "2222")],
    });
    expect(await findPatientByPin(db.client, "3333", opts)).toBeNull();
    expect(row(db, "b").pin_lookup).toBeNull();
  });

  it("never matches a patient whose PIN was reset", async () => {
    const reset = patient("a", null);
    // a fingerprint left behind (the database trigger normally clears it)
    reset.pin_lookup = pinFingerprint("1111", SECRET);
    const db = fakeSupabase({ patients: [reset] });
    expect(await findPatientByPin(db.client, "1111", opts)).toBeNull();
  });

  it("does not trust a fingerprint that does not fit the stored hash", async () => {
    const wrong = patient("a", "1111");
    wrong.pin_lookup = pinFingerprint("2222", SECRET);
    const db = fakeSupabase({ patients: [wrong] });
    expect(await findPatientByPin(db.client, "2222", opts)).toBeNull();
  });

  it("a database error is an error — not a slow search on a guess", async () => {
    // the fingerprint query fails
    const db = fakeSupabase(
      { patients: [patient("a", "1111")] },
      { onQuery: (_query, index) => (index === 0 ? "XX000" : undefined) }
    );
    await expect(findPatientByPin(db.client, "1111", opts)).rejects.toThrow();
    expect(db.queries).toHaveLength(1);
  });

  it("works the old way when the server has no secret", async () => {
    const db = fakeSupabase({ patients: [patient("a", "1111")] });
    expect(
      await findPatientByPin(db.client, "1111", { secret: undefined })
    ).toMatchObject({ id: "a" });
    expect(row(db, "a").pin_lookup).toBeNull();
  });

  it("throws when the patients cannot be read at all", async () => {
    const db = fakeSupabase({ patients: [] }, { onQuery: () => "XX000" });
    await expect(findPatientByPin(db.client, "1111", opts)).rejects.toThrow();
  });
});

describe("pinUsedByAnother", () => {
  it("is true when another patient has the PIN, fingerprinted or not", async () => {
    const db = fakeSupabase({
      patients: [
        patient("a", "1111", "stamped"),
        patient("b", "2222"),
        patient("c", null),
      ],
    });
    expect(await pinUsedByAnother(db.client, "1111", "c", opts)).toBe(true);
    expect(await pinUsedByAnother(db.client, "2222", "c", opts)).toBe(true);
  });

  it("is false for a free PIN", async () => {
    const db = fakeSupabase({
      patients: [patient("a", "1111", "stamped"), patient("c", null)],
    });
    expect(await pinUsedByAnother(db.client, "3333", "c", opts)).toBe(false);
  });

  it("does not count the patient themselves", async () => {
    const db = fakeSupabase({ patients: [patient("a", "1111", "stamped")] });
    expect(await pinUsedByAnother(db.client, "1111", "a", opts)).toBe(false);
  });
});

describe("saveNewPin", () => {
  it("saves the hash and the fingerprint, never the PIN itself", async () => {
    const db = fakeSupabase({ patients: [patient("c", null)] });
    const saved = await saveNewPin(db.client, "c", "3333", opts);
    expect(saved).toEqual({
      id: "c",
      first_name: "C",
      last_name: "Test",
      pb_client_id: "pb-c",
    });
    const stored = row(db, "c");
    expect(await bcrypt.compare("3333", stored.pin!)).toBe(true);
    expect(stored.pin_lookup).toBe(pinFingerprint("3333", SECRET));
    expect(JSON.stringify(stored)).not.toContain("3333");
    // and the kiosk finds them with it straight away
    expect(await findPatientByPin(db.client, "3333", opts)).toMatchObject({
      id: "c",
    });
  });

  it("never overwrites a PIN that is already set", async () => {
    const db = fakeSupabase({ patients: [patient("a", "1111", "stamped")] });
    expect(await saveNewPin(db.client, "a", "3333", opts)).toBe("error");
    expect(await bcrypt.compare("1111", row(db, "a").pin!)).toBe(true);
  });

  it("reports 'taken' when another patient saved the same PIN a moment before", async () => {
    const db = fakeSupabase(
      { patients: [patient("a", "1111", "stamped"), patient("c", null)] },
      { unique: { patients: ["pin_lookup"] } }
    );
    expect(await saveNewPin(db.client, "c", "1111", opts)).toBe("taken");
    expect(row(db, "c").pin).toBeNull();
  });

  it("a write the database refuses is an error — no PIN is saved without its fingerprint", async () => {
    const db = fakeSupabase(
      { patients: [patient("c", null)] },
      { onQuery: (query) => (query.kind === "update" ? "XX000" : undefined) }
    );
    expect(await saveNewPin(db.client, "c", "3333", opts)).toBe("error");
    expect(row(db, "c").pin).toBeNull();
    expect(db.queries.filter((q) => q.kind === "update")).toHaveLength(1);
  });

  it("with no server secret the PIN is saved without a fingerprint", async () => {
    const db = fakeSupabase({ patients: [patient("c", null)] });
    expect(
      await saveNewPin(db.client, "c", "3333", {
        secret: undefined,
        hashRounds: 4,
      })
    ).toMatchObject({ id: "c" });
    expect(await bcrypt.compare("3333", row(db, "c").pin!)).toBe(true);
    expect(row(db, "c").pin_lookup).toBeNull();
  });
});

// The slow way: patients with no current fingerprint, compared several at
// a time (pin-match.ts). The answers must be what one-at-a-time gave.
describe("the slow way, among many patients", () => {
  // Each patient gets a hash of their own (their own salt), as in the
  // real table, so a compare can be traced to its row. p000 … p039; all
  // have the PIN "1111" unless `pins` says otherwise.
  const many = (count: number, pins: Record<number, string> = {}): Patient[] =>
    Array.from({ length: count }, (_, i) => {
      const id = `p${String(i).padStart(3, "0")}`;
      return {
        id,
        first_name: id.toUpperCase(),
        last_name: "Test",
        pb_client_id: `pb-${id}`,
        pin: bcrypt.hashSync(pins[i] ?? "1111", 4),
        pin_lookup: null,
      };
    });

  // The real compare, counting which stored hashes it was asked about.
  const counting = () => {
    const asked: string[] = [];
    const compare = async (pin: string, hash: string) => {
      asked.push(hash);
      return bcrypt.compare(pin, hash);
    };
    return { asked, compare };
  };

  const updates = (db: ReturnType<typeof fakeSupabase>) =>
    db.queries.filter((q) => q.kind === "update");
  const stamped = (db: ReturnType<typeof fakeSupabase>) =>
    (db.tables.patients as Patient[])
      .filter((p) => p.pin_lookup)
      .map((p) => p.id);

  it("finds the one patient among many, and stamps that patient only, once", async () => {
    for (const width of [1, 4, 7]) {
      const db = fakeSupabase({ patients: many(40, { 29: "2222" }) });
      const found = await findPatientByPin(db.client, "2222", {
        ...opts,
        width,
      });
      expect(found).toEqual({
        id: "p029",
        pin: row(db, "p029").pin,
        first_name: "P029",
        last_name: "Test",
        pb_client_id: "pb-p029",
      });
      expect(stamped(db)).toEqual(["p029"]);
      expect(row(db, "p029").pin_lookup).toBe(pinFingerprint("2222", SECRET));
      expect(updates(db)).toHaveLength(1);
    }
  });

  it("returns null for a PIN nobody has: every patient compared once, nobody stamped", async () => {
    const db = fakeSupabase({ patients: many(40) });
    const { asked, compare } = counting();
    expect(
      await findPatientByPin(db.client, "3333", { ...opts, width: 4, compare })
    ).toBeNull();
    expect(asked).toHaveLength(40);
    expect(new Set(asked).size).toBe(40);
    expect(stamped(db)).toEqual([]);
    expect(updates(db)).toHaveLength(0);
  });

  it("stops comparing after the group that holds the match", async () => {
    const db = fakeSupabase({ patients: many(40, { 5: "2222" }) });
    const { asked, compare } = counting();
    await findPatientByPin(db.client, "2222", { ...opts, width: 4, compare });
    // p000–p007: two groups of four
    expect(asked).toHaveLength(8);
  });

  it("never compares a patient whose current fingerprint already says 'another PIN'", async () => {
    const patients = many(12, { 7: "2222" });
    for (const i of [0, 1, 2, 3, 4]) {
      patients[i].pin_lookup = pinFingerprint("1111", SECRET);
    }
    const db = fakeSupabase({ patients });
    const { asked, compare } = counting();
    expect(
      await findPatientByPin(db.client, "3333", { ...opts, width: 4, compare })
    ).toBeNull();
    expect(asked).toHaveLength(7);
    for (const i of [0, 1, 2, 3, 4]) {
      expect(asked).not.toContain(patients[i].pin);
    }
  });

  it("leaves the skipped patient out altogether — not compared, not stamped", async () => {
    const db = fakeSupabase({ patients: many(20, { 13: "2222" }) });
    const { asked, compare } = counting();
    const options = { ...opts, width: 4, compare };
    expect(await pinUsedByAnother(db.client, "2222", "p013", options)).toBe(
      false
    );
    expect(asked).toHaveLength(19);
    expect(asked).not.toContain(row(db, "p013").pin);
    expect(stamped(db)).toEqual([]);
    // …and someone else asking about the same PIN is told it is taken
    expect(await pinUsedByAnother(db.client, "2222", "p002", options)).toBe(
      true
    );
  });

  it("with the same PIN on two patients, always answers with the first by id — at any width", async () => {
    // The database forbids it for fingerprinted PINs; among old ones the
    // answer must still not depend on which compare finishes first.
    for (const width of [1, 2, 3, 4, 8, 50]) {
      // rows handed over out of order: the database sorts them by id
      const patients = many(30, { 11: "2222", 12: "2222", 27: "2222" });
      const db = fakeSupabase({ patients: [...patients].reverse() });
      // the earlier row's compare is the slow one
      const compare = async (pin: string, hash: string) => {
        if (hash === patients[11].pin) {
          await new Promise((done) => setTimeout(done, 15));
        }
        return bcrypt.compare(pin, hash);
      };
      const found = await findPatientByPin(db.client, "2222", {
        ...opts,
        width,
        compare,
      });
      expect(found?.id).toBe("p011");
      expect(stamped(db)).toEqual(["p011"]);
      expect(updates(db)).toHaveLength(1);
    }
  });

  it("reads every page of patients (the database hands out 1,000 at a time)", async () => {
    const patients: Patient[] = Array.from({ length: 1003 }, (_, i) => ({
      id: `q${String(i).padStart(5, "0")}`,
      first_name: "Q",
      last_name: "Test",
      pb_client_id: null,
      pin: `hash-${i}`,
      pin_lookup: null,
    }));
    const db = fakeSupabase({ patients });
    const asked: string[] = [];
    const compare = async (_pin: string, hash: string) => {
      asked.push(hash);
      return hash === "hash-1002";
    };
    const found = await findPatientByPin(db.client, "2222", {
      ...opts,
      width: 4,
      compare,
    });
    expect(found?.id).toBe("q01002");
    expect(asked).toHaveLength(1003);
  });

  it("a database error while reading the patients still throws", async () => {
    // query 0 is the fingerprint lookup; query 1 reads the patients
    const db = fakeSupabase(
      { patients: many(8, { 3: "2222" }) },
      { onQuery: (_query, index) => (index === 1 ? "XX000" : undefined) }
    );
    await expect(
      findPatientByPin(db.client, "2222", { ...opts, width: 4 })
    ).rejects.toThrow();
    expect(stamped(db)).toEqual([]);
  });

  it("a compare that fails is an error — never 'PIN not recognized'", async () => {
    const db = fakeSupabase({ patients: many(8, { 6: "2222" }) });
    const compare = async (pin: string, hash: string) => {
      if (hash === row(db, "p002").pin) throw new Error("compare failed");
      return bcrypt.compare(pin, hash);
    };
    await expect(
      findPatientByPin(db.client, "2222", { ...opts, width: 4, compare })
    ).rejects.toThrow();
    expect(stamped(db)).toEqual([]);
  });

  it("a stamp the database refuses does not stop the sign-in", async () => {
    const db = fakeSupabase(
      { patients: many(8, { 6: "2222" }) },
      { onQuery: (query) => (query.kind === "update" ? "XX000" : undefined) }
    );
    expect(
      await findPatientByPin(db.client, "2222", { ...opts, width: 4 })
    ).toMatchObject({ id: "p006" });
    expect(stamped(db)).toEqual([]);
  });

  it("without a server secret: found among many, nobody stamped", async () => {
    const db = fakeSupabase({ patients: many(20, { 17: "2222" }) });
    expect(
      await findPatientByPin(db.client, "2222", { secret: undefined, width: 4 })
    ).toMatchObject({ id: "p017" });
    expect(stamped(db)).toEqual([]);
    expect(updates(db)).toHaveLength(0);
  });
});
