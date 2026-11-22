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

// Before migration 0017: the table has no pin_lookup column at all.
const withoutColumn = (patients: Patient[]) =>
  fakeSupabase(
    { patients: patients.map(({ pin_lookup: _gone, ...rest }) => rest) },
    { missingColumns: { patients: ["pin_lookup"] } }
  );

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

  it("works exactly as before when migration 0017 is not applied", async () => {
    const db = withoutColumn([patient("a", "1111"), patient("b", "2222")]);
    expect(await findPatientByPin(db.client, "2222", opts)).toMatchObject({
      id: "b",
    });
    expect(await findPatientByPin(db.client, "3333", opts)).toBeNull();
    expect(row(db, "b")).not.toHaveProperty("pin_lookup");
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

  it("saves the PIN the old way when migration 0017 is not applied", async () => {
    const db = withoutColumn([patient("c", null)]);
    expect(await saveNewPin(db.client, "c", "3333", opts)).toMatchObject({
      id: "c",
    });
    expect(await bcrypt.compare("3333", row(db, "c").pin!)).toBe(true);
    expect(await findPatientByPin(db.client, "3333", opts)).toMatchObject({
      id: "c",
    });
  });
});
