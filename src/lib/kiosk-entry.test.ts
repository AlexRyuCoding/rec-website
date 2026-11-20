import { describe, expect, it } from "vitest";
import {
  applyKey,
  applyPhoneKey,
  createPinReducer,
  CreatePinState,
  formatPhone,
  initialCreatePin,
  isPhoneComplete,
  PadKey,
  phoneCandidates,
  signInPinReducer,
} from "./kiosk-entry";

const digit = (d: string): PadKey => ({ type: "digit", digit: d });
const BACK: PadKey = { type: "backspace" };
const CLEAR: PadKey = { type: "clear" };

// Feed a whole sequence of key presses through the reducer, the way a
// burst of taps arrives: each one applied to the result of the last.
const type = (keys: string, from: CreatePinState = initialCreatePin) =>
  [...keys].reduce(
    (state, ch) =>
      createPinReducer(
        state,
        ch === "<" ? BACK : ch === "x" ? CLEAR : digit(ch)
      ),
    from
  );

describe("applyKey (one entry field)", () => {
  it("appends digits up to the limit and ignores the rest", () => {
    let v = "";
    for (const d of "481599") v = applyKey(v, digit(d), 4);
    expect(v).toBe("4815");
  });
  it("never loses a digit in a burst of presses", () => {
    // Every press is applied to the previous result, so four presses
    // always make four digits however fast they come.
    expect([..."2200"].reduce((v, d) => applyKey(v, digit(d), 4), "")).toBe(
      "2200"
    );
  });
  it("ignores anything that is not a single digit", () => {
    expect(applyKey("12", digit("a"), 4)).toBe("12");
    expect(applyKey("12", digit("34"), 4)).toBe("12");
    expect(applyKey("12", digit(""), 4)).toBe("12");
  });
  it("backspace removes one digit and is harmless when empty", () => {
    expect(applyKey("123", BACK, 4)).toBe("12");
    expect(applyKey("", BACK, 4)).toBe("");
  });
  it("clear empties the field", () => {
    expect(applyKey("123", CLEAR, 4)).toBe("");
  });
});

describe("createPinReducer (choose a PIN, then type it again)", () => {
  it("moves to the second entry after four digits", () => {
    expect(type("4815")).toMatchObject({
      first: "4815",
      second: "",
      stage: "second",
      matchedPin: null,
    });
  });
  it("accepts a matching second entry", () => {
    expect(type("48154815")).toMatchObject({
      stage: "second",
      matchedPin: "4815",
      mismatch: false,
    });
  });
  it("eight fast presses in a row give the same result as slow ones", () => {
    expect(type("48154815").matchedPin).toBe("4815");
  });
  it("starts over, saying so, when the second entry differs", () => {
    expect(type("48154816")).toEqual({
      first: "",
      second: "",
      stage: "first",
      mismatch: true,
      matchedPin: null,
    });
  });
  it("drops the 'did not match' note as soon as they start again", () => {
    expect(type("481548164").mismatch).toBe(false);
  });
  it("ignores every key once the PIN is matched", () => {
    const done = type("48154815");
    expect(type("9<x", done)).toEqual(done);
  });
  it("backspace in the second entry removes its last digit", () => {
    expect(type("481548<")).toMatchObject({
      first: "4815",
      second: "4",
      stage: "second",
    });
  });
  it("backspace on an empty second entry goes back to fix the first", () => {
    expect(type("4815<")).toMatchObject({
      first: "481",
      second: "",
      stage: "first",
    });
  });
  it("clear only empties the entry being typed", () => {
    expect(type("481548x")).toMatchObject({
      first: "4815",
      second: "",
      stage: "second",
    });
    expect(type("48x")).toMatchObject({ first: "", stage: "first" });
  });
  it("restart wipes everything", () => {
    expect(createPinReducer(type("481548"), { type: "restart" })).toEqual(
      initialCreatePin
    );
  });
});

describe("formatPhone", () => {
  it("formats as the digits arrive", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("9")).toBe("(9");
    expect(formatPhone("925")).toBe("(925");
    expect(formatPhone("9255")).toBe("(925) 5");
    expect(formatPhone("925555")).toBe("(925) 555");
    expect(formatPhone("9255550")).toBe("(925) 555-0");
    expect(formatPhone("9255550101")).toBe("(925) 555-0101");
  });
  it("shows a leading 1 as the country code", () => {
    expect(formatPhone("19255550101")).toBe("1 (925) 555-0101");
    expect(formatPhone("1925")).toBe("1 (925");
  });
});

describe("isPhoneComplete", () => {
  it("needs ten digits, or eleven starting with 1", () => {
    expect(isPhoneComplete("925555010")).toBe(false);
    expect(isPhoneComplete("9255550101")).toBe(true);
    expect(isPhoneComplete("19255550101")).toBe(true);
    expect(isPhoneComplete("29255550101")).toBe(false);
    // Ten digits starting with 1 is an unfinished 1-xxx number.
    expect(isPhoneComplete("1925555010")).toBe(false);
  });
});

describe("signInPinReducer", () => {
  const press = (keys: string, from = "") =>
    [...keys].reduce(
      (v, ch) => signInPinReducer(v, ch === "<" ? BACK : digit(ch)),
      from
    );
  it("collects four digits", () => {
    expect(press("4815")).toBe("4815");
  });
  it("locks once four digits are in, so the PIN being checked can't change", () => {
    // The 4th digit starts the lookup. A stray tap landing before the
    // screen reacts must not alter what is being checked.
    expect(press("4815<")).toBe("4815");
    expect(press("48159")).toBe("4815");
    expect(signInPinReducer("4815", CLEAR)).toBe("4815");
  });
  it("is emptied by reset, ready for the next try", () => {
    expect(signInPinReducer("4815", { type: "reset" })).toBe("");
  });
  it("still allows correcting before the fourth digit", () => {
    expect(press("48<1")).toBe("41");
  });
});

describe("applyPhoneKey", () => {
  const press = (keys: string) =>
    [...keys].reduce((v, d) => applyPhoneKey(v, digit(d)), "");
  it("stops at ten digits", () => {
    expect(press("92555501019")).toBe("9255550101");
  });
  it("allows eleven when the number starts with 1", () => {
    expect(press("192555501019")).toBe("19255550101");
  });
});

describe("phoneCandidates", () => {
  it("looks a ten-digit number up with and without the leading 1", () => {
    expect(phoneCandidates("9255550101")).toEqual([
      "9255550101",
      "19255550101",
    ]);
  });
  it("looks an eleven-digit 1-number up with and without the 1", () => {
    expect(phoneCandidates("19255550101")).toEqual([
      "19255550101",
      "9255550101",
    ]);
  });
  it("leaves any other length alone", () => {
    expect(phoneCandidates("5550101")).toEqual(["5550101"]);
    expect(phoneCandidates("442071234567")).toEqual(["442071234567"]);
  });
});
