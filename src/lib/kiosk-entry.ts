// What the kiosk's number pad does to what has been typed — pure
// functions, no React. Every key press is applied to the result of the
// previous one (the component runs these through a reducer), so a burst
// of presses can never lose or reorder a digit, however the browser
// schedules its renders. That property is the reason this file exists.

export const PIN_LENGTH = 4;

export type PadKey =
  | { type: "digit"; digit: string }
  | { type: "backspace" }
  | { type: "clear" };

const isSingleDigit = (s: string) => /^[0-9]$/.test(s);

// One entry field: the sign-in PIN, or a phone number.
export function applyKey(
  value: string,
  key: PadKey,
  maxLength: number
): string {
  switch (key.type) {
    case "digit":
      if (!isSingleDigit(key.digit) || value.length >= maxLength) return value;
      return value + key.digit;
    case "backspace":
      return value.slice(0, -1);
    case "clear":
      return "";
  }
}

// Creating a PIN: choose four digits, then type the same four again.
export interface CreatePinState {
  first: string;
  second: string;
  // Which of the two entries the next key goes to.
  stage: "first" | "second";
  // The two entries differed and everything was wiped. Shown as a notice
  // until the patient starts typing again.
  mismatch: boolean;
  // Set once the second entry equals the first: the PIN to save. From
  // then on the pad is inert until "restart".
  matchedPin: string | null;
}

export const initialCreatePin: CreatePinState = {
  first: "",
  second: "",
  stage: "first",
  mismatch: false,
  matchedPin: null,
};

export function createPinReducer(
  state: CreatePinState,
  key: PadKey | { type: "restart" }
): CreatePinState {
  if (key.type === "restart") return initialCreatePin;
  if (state.matchedPin !== null) return state;

  if (state.stage === "first") {
    const first = applyKey(state.first, key, PIN_LENGTH);
    if (first === state.first) return state;
    return {
      ...state,
      first,
      // Any real change means they have moved on from the notice.
      mismatch: false,
      stage: first.length === PIN_LENGTH ? "second" : "first",
    };
  }

  // Second entry. Backspace on an empty second entry steps back into the
  // first one, so "undo" keeps working across the boundary instead of
  // silently doing nothing.
  if (key.type === "backspace" && state.second === "") {
    return { ...state, first: state.first.slice(0, -1), stage: "first" };
  }
  const second = applyKey(state.second, key, PIN_LENGTH);
  if (second === state.second) return state;
  if (second.length < PIN_LENGTH) return { ...state, second };
  if (second === state.first) return { ...state, second, matchedPin: second };
  return { ...initialCreatePin, mismatch: true };
}

// "(925) 555-0101" as it is typed. A leading 1 is shown as the country
// code, since some people start their number with it.
export function formatPhone(digits: string): string {
  const hasCountry = digits.startsWith("1");
  const d = hasCountry ? digits.slice(1) : digits;
  let out = "";
  if (d.length > 0) out = `(${d.slice(0, 3)}`;
  if (d.length > 3) out += `) ${d.slice(3, 6)}`;
  if (d.length > 6) out += `-${d.slice(6, 10)}`;
  if (!hasCountry) return out;
  return out ? `1 ${out}` : "1";
}

export function phoneMaxLength(digits: string): number {
  return digits.startsWith("1") ? 11 : 10;
}

export function isPhoneComplete(digits: string): boolean {
  return digits.length === phoneMaxLength(digits);
}

// The sign-in PIN. The fourth digit starts the lookup automatically, so
// from that moment the value is locked until "reset": a stray extra tap
// (or a late Delete) must not change the PIN while it is being checked.
export function signInPinReducer(
  value: string,
  key: PadKey | { type: "reset" }
): string {
  if (key.type === "reset") return "";
  if (value.length >= PIN_LENGTH) return value;
  return applyKey(value, key, PIN_LENGTH);
}

export function applyPhoneKey(value: string, key: PadKey): string {
  // The limit depends on the first digit, which may be the one arriving.
  const basis = value === "" && key.type === "digit" ? key.digit : value;
  return applyKey(value, key, phoneMaxLength(basis));
}

// The forms a typed phone number may be stored in: Practice Better keeps
// some numbers with the leading 1 and some without, and patients type
// either. Looking up every form means "(925) 555-0101" finds a record
// saved as "+1 925 555 0101" and the other way round.
export function phoneCandidates(digits: string): string[] {
  if (digits.length === 10) return [digits, `1${digits}`];
  if (digits.length === 11 && digits.startsWith("1")) {
    return [digits, digits.slice(1)];
  }
  return [digits];
}

// Which typed digits a PIN entry shows as numbers:
// - "all":  every digit (creating a PIN — the patient must be able to
//           check and remember what they chose)
// - "last": only the digit just pressed; earlier ones become dots
//           (signing in — proof that the press registered and what it
//           was, without leaving the whole PIN on screen)
// - "none": dots only
export type RevealMode = "all" | "last" | "none";

export type SlotContent =
  | { kind: "empty" }
  | { kind: "dot" }
  | { kind: "digit"; digit: string };

export function slotContent(
  value: string,
  index: number,
  reveal: RevealMode
): SlotContent {
  if (index >= value.length) return { kind: "empty" };
  const shown =
    reveal === "all" || (reveal === "last" && index === value.length - 1);
  return shown ? { kind: "digit", digit: value[index] } : { kind: "dot" };
}
