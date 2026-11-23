import { beforeAll, describe, expect, it, vi } from "vitest";
import bcryptjs from "bcryptjs";
import {
  comparePin,
  compareWidth,
  hashPin,
  loadPinEngine,
  pinEngineIsNative,
} from "./pin-hash";

// Every PIN stored so far was hashed by bcryptjs 3 at cost 8. These are
// made the same way, here, so the test proves what production needs:
// whatever compares PINs now still reads those hashes.
let stored: string;
beforeAll(() => {
  stored = bcryptjs.hashSync("4821", 8);
});

describe("comparePin", () => {
  it("runs on the native library on this computer", () => {
    // If this fails the prebuilt binary did not load here; the app would
    // still work (on bcryptjs), but nothing below would be testing the
    // code production runs.
    expect(pinEngineIsNative()).toBe(true);
  });

  it("verifies a hash made by bcryptjs at cost 8", async () => {
    expect(stored.startsWith("$2b$08$")).toBe(true);
    expect(await comparePin("4821", stored)).toBe(true);
    expect(await comparePin("4822", stored)).toBe(false);
    expect(await comparePin("0000", stored)).toBe(false);
  });

  it("verifies the same hash under the older $2a$ prefix", async () => {
    const older = "$2a$" + stored.slice(4);
    expect(await comparePin("4821", older)).toBe(true);
    expect(await comparePin("0000", older)).toBe(false);
  });

  it("answers false, without throwing, for something that is not a hash", async () => {
    for (const odd of ["", "not-a-hash", "x".repeat(60), stored.slice(0, 40)]) {
      expect(await comparePin("4821", odd)).toBe(false);
    }
  });
});

describe("hashPin", () => {
  it("makes a hash that it verifies itself — and that bcryptjs verifies too", async () => {
    const made = await hashPin("3333", 8);
    expect(made.startsWith("$2b$08$")).toBe(true);
    expect(made).not.toContain("3333");
    expect(await comparePin("3333", made)).toBe(true);
    expect(await comparePin("3334", made)).toBe(false);
    // The way back: if this change is ever reverted, PINs made meanwhile
    // must still sign their patients in.
    expect(bcryptjs.compareSync("3333", made)).toBe(true);
    expect(bcryptjs.compareSync("3334", made)).toBe(false);
  });

  it("salts: the same PIN twice gives two hashes", async () => {
    expect(await hashPin("3333", 4)).not.toBe(await hashPin("3333", 4));
  });
});

describe("loadPinEngine", () => {
  it("falls back to bcryptjs when the native library cannot be loaded, and says so", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    const loaded = loadPinEngine(() => {
      throw new Error("No native build was found for platform=…");
    });
    expect(loaded.native).toBe(false);
    expect(await loaded.engine.compare("4821", stored)).toBe(true);
    expect(await loaded.engine.compare("0000", stored)).toBe(false);
    const made = await loaded.engine.hash("3333", 4);
    expect(await comparePin("3333", made)).toBe(true);
    expect(said).toHaveBeenCalledTimes(1);
    // the message names the problem, never a PIN or a hash
    expect(String(said.mock.calls[0][0])).toMatch(/bcrypt/);
    said.mockRestore();
  });

  it("falls back when the library loads but does not work", () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      compareSync: () => false,
      compare: async () => false,
      hash: async () => "",
    };
    expect(loadPinEngine(() => broken).native).toBe(false);
    said.mockRestore();
  });
});

describe("compareWidth", () => {
  it("is the number of CPUs the server may use", () => {
    expect(compareWidth(1, undefined)).toBe(1);
    expect(compareWidth(2, undefined)).toBe(2);
    expect(compareWidth(4, undefined)).toBe(4);
  });

  it("is never more than Node's helper threads (4 unless UV_THREADPOOL_SIZE says otherwise)", () => {
    expect(compareWidth(12, undefined)).toBe(4);
    expect(compareWidth(12, "8")).toBe(8);
    expect(compareWidth(8, "16")).toBe(8);
    expect(compareWidth(8, "2")).toBe(2);
  });

  it("is at least 1, whatever it is told", () => {
    expect(compareWidth(0, undefined)).toBe(1);
    expect(compareWidth(Number.NaN, "nonsense")).toBe(1);
    expect(compareWidth(4, "0")).toBe(4);
    expect(compareWidth(4, "-2")).toBe(4);
  });
});
