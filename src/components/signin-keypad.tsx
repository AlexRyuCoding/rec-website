// src/components/signin-keypad.tsx
"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck } from "lucide-react";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import {
  applyPhoneKey,
  createPinReducer,
  formatPhone,
  initialCreatePin,
  isPhoneComplete,
  PadKey,
  PIN_LENGTH,
  signInPinReducer,
} from "@/lib/kiosk-entry";
import { kioskTapGuard, SCREEN_CHANGE_GUARD_MS } from "@/lib/tap-guard";
import ConfirmationModal from "./confirmation-modal";
import DigitSlots from "./kiosk/digit-slots";
import NumberPad from "./kiosk/number-pad";
import TapButton from "./kiosk/tap-button";
import { goToStaffLogin } from "@/lib/staff-login-redirect";

// The patient check-in kiosk. Written for people who are not comfortable
// with screens, so three rules shape every screen:
//
// 1. One question at a time, in plain words, with a heading that says
//    what to do right now.
// 2. Nothing changes without the patient seeing why. Typing the fourth
//    PIN digit does not swap the screen for a spinner — the boxes fill,
//    the pad dims and the line under them says "Checking…". A wrong PIN
//    leaves them on the same pad with the reason in a box above it.
// 3. No dead ends. Every screen has an obvious way forward and a way
//    back, and a mistake never needs the front desk unless the front desk
//    really is the answer.
//
// What the pad does to the typed value lives in src/lib/kiosk-entry.ts
// (pure, tested). It is applied through reducers, so presses are never
// lost or reordered no matter how fast they arrive.

type Screen =
  | "signin"
  | "contact"
  | "select_name"
  | "create_pin"
  | "pin_saved"
  | "message";

interface NameOption {
  patient_id: string;
  first_name: string;
  last_initial: string;
}

interface PatientInfo {
  id: string;
  first_name: string;
  last_name: string;
  pb_client_id: string | null;
}

interface AppointmentInfo {
  time: string | null;
  date: string | null;
  practitioner: string | null;
}

interface Notice {
  tone: "error" | "info";
  text: string;
}

// A stop on the way that needs reading: who we couldn't find, and so on.
interface Message {
  title: string;
  body: string;
  // Offer "Try again" back to the contact step (as well as going home).
  canRetryContact: boolean;
}

// An abandoned session must not leave a patient's name on screen for the
// next person: after IDLE_RESET_MS without a touch the kiosk returns to
// the PIN pad. Slow readers get a visible countdown first rather than
// having the screen vanish under them.
const IDLE_RESET_MS = 60_000;
const IDLE_WARN_MS = 40_000;
// The "your PIN is saved" screen moves on by itself after this long, so a
// patient who stops reading there is still taken to the check-in step.
const PIN_SAVED_AUTO_MS = 7_000;
// Practice Better can be slow; the appointment is a nicety on the
// confirmation screen and must not hold the patient at "Checking…".
const APPOINTMENT_TIMEOUT_MS = 8_000;

const FRONT_DESK = "ask the front desk for help";

const phoneReducer = (value: string, key: PadKey | { type: "reset" }) =>
  key.type === "reset" ? "" : applyPhoneKey(value, key);

const primaryButton =
  "flex items-center justify-center gap-2 rounded-full bg-brand-primary px-8 py-[min(1.7dvh,16px)] text-[clamp(1.1rem,2.9dvh,1.5rem)] font-medium text-white data-[pressed=true]:bg-brand-secondary";
const secondaryButton =
  "flex items-center justify-center gap-2 rounded-full border-2 border-cream/50 px-6 py-[min(1.7dvh,16px)] text-[clamp(1.1rem,2.9dvh,1.5rem)] text-cream data-[pressed=true]:bg-cream/15";
// Screens without the number pad: one centred column.
const columnClass =
  "flex w-full max-w-[520px] flex-col items-center gap-[min(2dvh,18px)]";
const headingClass =
  "text-center font-serif text-[clamp(1.7rem,4.6dvh,2.75rem)] leading-tight";
const leadClass =
  "text-center text-[clamp(1rem,2.5dvh,1.35rem)] leading-snug text-cream/80";

export default function SignInKeypad() {
  const [screen, setScreen] = useState<Screen>("signin");

  // Sign in
  const [pin, dispatchPin] = useReducer(signInPinReducer, "");
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // New patient: find the record
  const [contactMode, setContactMode] = useState<"phone" | "email">("phone");
  const [phone, dispatchPhone] = useReducer(phoneReducer, "");
  const [email, setEmail] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [nameOptions, setNameOptions] = useState<NameOption[]>([]);

  // New patient: create the PIN
  const [create, dispatchCreate] = useReducer(
    createPinReducer,
    initialCreatePin
  );
  const [saving, setSaving] = useState(false);
  const [createNotice, setCreateNotice] = useState("");
  const [savedPin, setSavedPin] = useState("");

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [appointment, setAppointment] = useState<AppointmentInfo | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number | null>(null);

  // Every reset starts a new "flow". A reply from the server that belongs
  // to an earlier flow (the patient went back, or the kiosk timed out and
  // someone else is now using it) is dropped instead of being applied to
  // whoever is at the screen now.
  const flowRef = useRef(0);

  const resetAll = useCallback(() => {
    flowRef.current += 1;
    setScreen("signin");
    dispatchPin({ type: "reset" });
    setChecking(false);
    setNotice(null);
    setContactMode("phone");
    dispatchPhone({ type: "reset" });
    setEmail("");
    setLookingUp(false);
    setNameOptions([]);
    dispatchCreate({ type: "restart" });
    setSaving(false);
    setCreateNotice("");
    setSavedPin("");
    setPatient(null);
    setAppointment(null);
    setMessage(null);
    setIsModalOpen(false);
    setIdleSecondsLeft(null);
  }, []);

  // Whenever what is on screen changes, presses are ignored for a moment
  // so the second half of a double tap cannot answer the new screen (see
  // tap-guard.ts). A layout effect, so the guard is up before the browser
  // can deliver another event to the freshly rendered buttons.
  useLayoutEffect(() => {
    kioskTapGuard.block(SCREEN_CHANGE_GUARD_MS);
  }, [screen, contactMode, isModalOpen]);

  // Kiosk session expired mid-day — staff need to unlock again.
  const redirectToLogin = () => {
    goToStaffLogin();
  };

  const loadAppointment = async (
    pbClientId: string | null
  ): Promise<AppointmentInfo | null> => {
    if (!pbClientId) return null;
    try {
      const res = await fetchWithTimeout(
        `/api/appointments/today?pb_client_id=${encodeURIComponent(pbClientId)}`,
        {},
        APPOINTMENT_TIMEOUT_MS
      );
      const data = await res.json();
      return data.appointment ?? null;
    } catch {
      return null;
    }
  };

  // --- Sign in -----------------------------------------------------------

  const submitPin = async (entered: string) => {
    const flow = flowRef.current;
    setChecking(true);
    setNotice(null);
    const fail = (text: string) => {
      if (flow !== flowRef.current) return;
      dispatchPin({ type: "reset" });
      setChecking(false);
      setNotice({ tone: "error", text });
    };
    try {
      const res = await fetch("/api/patients/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: entered }),
      });
      if (res.status === 401) return redirectToLogin();
      const data = await res.json().catch(() => ({}));
      if (flow !== flowRef.current) return;
      if (!res.ok) {
        fail(
          res.status === 429
            ? `Too many tries. Please ${FRONT_DESK}.`
            : res.status === 404
              ? `We don't recognize that PIN. Please try again, or ${FRONT_DESK}.`
              : `Something went wrong. Please try again, or ${FRONT_DESK}.`
        );
        return;
      }
      setPatient(data);
      const appt = await loadAppointment(data.pb_client_id);
      if (flow !== flowRef.current) return;
      setAppointment(appt);
      // `checking` stays on: the pad stays dimmed behind the confirmation.
      setIsModalOpen(true);
    } catch {
      fail(`Something went wrong. Please try again, or ${FRONT_DESK}.`);
    }
  };

  // The fourth digit starts the check by itself — no "Enter" to find.
  // The reducer locks the value at four digits, so what is checked is
  // exactly what the boxes show.
  useEffect(() => {
    if (screen !== "signin" || checking || pin.length !== PIN_LENGTH) return;
    void submitPin(pin);
    // submitPin only uses refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, screen, checking]);

  const onSignInKey = (key: PadKey) => {
    if (checking) return;
    if (notice) setNotice(null);
    dispatchPin(key);
  };

  // --- New patient: find the record --------------------------------------

  const contactReady =
    contactMode === "phone"
      ? isPhoneComplete(phone)
      : /^\S+@\S+\.\S+$/.test(email.trim());

  const submitContact = async () => {
    if (!contactReady || lookingUp) return;
    const flow = flowRef.current;
    setLookingUp(true);
    const stop = (next: Message) => {
      if (flow !== flowRef.current) return;
      setLookingUp(false);
      setMessage(next);
      setScreen("message");
    };
    const generic: Message = {
      title: "Something went wrong",
      body: `Please try again, or ${FRONT_DESK}.`,
      canRetryContact: true,
    };
    try {
      const res = await fetch("/api/patients/setup-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact: contactMode === "phone" ? phone : email.trim(),
        }),
      });
      if (res.status === 401) return redirectToLogin();
      const data = await res.json().catch(() => ({}));
      if (flow !== flowRef.current) return;
      if (!res.ok) return stop(generic);

      if (data.status === "not_found") {
        return stop({
          title: "We couldn't find you",
          body:
            contactMode === "phone"
              ? `We don't have that phone number on file. Check the number, try your email, or ${FRONT_DESK}.`
              : `We don't have that email on file. Check the spelling, try your phone number, or ${FRONT_DESK}.`,
          canRetryContact: true,
        });
      }
      if (data.status === "has_pin") {
        return stop({
          title: "You already have a PIN",
          body: `Go back and sign in with your PIN. If you forgot it, ${FRONT_DESK}.`,
          canRetryContact: false,
        });
      }
      setLookingUp(false);
      if (data.status === "select") {
        setNameOptions(data.options ?? []);
        setScreen("select_name");
        return;
      }
      startCreatePin({
        id: data.patient_id,
        first_name: data.first_name,
        last_name: "",
        pb_client_id: null,
      });
    } catch {
      stop(generic);
    }
  };

  const onPhoneKey = (key: PadKey) => {
    if (lookingUp) return;
    dispatchPhone(key);
  };

  // --- New patient: create the PIN ---------------------------------------

  const startCreatePin = (who: PatientInfo) => {
    setPatient(who);
    dispatchCreate({ type: "restart" });
    setCreateNotice("");
    setScreen("create_pin");
  };

  const savePin = async (chosen: string) => {
    if (!patient) return;
    const flow = flowRef.current;
    setSaving(true);
    try {
      const res = await fetch("/api/patients/setup-pin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patient.id, pin: chosen }),
      });
      if (res.status === 401) return redirectToLogin();
      const data = await res.json().catch(() => ({}));
      if (flow !== flowRef.current) return;
      if (res.status === 409) {
        // PINs are unique. Start the choice again, on the same screen.
        dispatchCreate({ type: "restart" });
        setCreateNotice(
          "Someone else already uses that PIN. Please choose 4 different numbers."
        );
        setSaving(false);
        return;
      }
      if (!res.ok) throw new Error("save failed");
      const saved: PatientInfo = data;
      setPatient(saved);
      setSavedPin(chosen);
      setSaving(false);
      setScreen("pin_saved");
      // Fetched while the patient reads the "saved" screen.
      const appt = await loadAppointment(saved.pb_client_id);
      if (flow !== flowRef.current) return;
      setAppointment(appt);
    } catch {
      if (flow !== flowRef.current) return;
      setSaving(false);
      setMessage({
        title: "We couldn't save your PIN",
        body: `Please ${FRONT_DESK}.`,
        canRetryContact: false,
      });
      setScreen("message");
    }
  };

  // The second entry matching the first saves the PIN by itself.
  useEffect(() => {
    if (screen !== "create_pin" || saving || create.matchedPin === null) return;
    void savePin(create.matchedPin);
    // savePin reads the current patient; it cannot change while saving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [create.matchedPin, screen, saving]);

  const onCreateKey = (key: PadKey) => {
    if (saving) return;
    if (createNotice) setCreateNotice("");
    dispatchCreate(key);
  };

  const continueToCheckIn = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  // "Your PIN is saved" moves on by itself.
  useEffect(() => {
    if (screen !== "pin_saved" || isModalOpen) return;
    const t = setTimeout(continueToCheckIn, PIN_SAVED_AUTO_MS);
    return () => clearTimeout(t);
  }, [screen, isModalOpen, continueToCheckIn]);

  // --- Check-in (from the confirmation) ----------------------------------

  const handleConfirmCheckin = async (): Promise<
    "ok" | "duplicate" | "error"
  > => {
    if (!patient) return "error";
    try {
      const res = await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patient.id }),
      });
      if (!res.ok) return "error";
      const data = await res.json();
      return data.duplicate ? "duplicate" : "ok";
    } catch {
      return "error";
    }
  };

  const handleModalDeny = () => {
    resetAll();
    setNotice({
      tone: "info",
      text: `No problem. Please type your PIN again, or ${FRONT_DESK}.`,
    });
  };

  // --- Physical keyboard / numpad ----------------------------------------
  // One listener for the life of the kiosk; it reads the current pad
  // handler from a ref, so it never acts on a stale screen. Held keys
  // (auto-repeat) are ignored — one press, one digit.

  const padHandlerRef = useRef<((key: PadKey) => void) | null>(null);
  const enterHandlerRef = useRef<(() => void) | null>(null);
  padHandlerRef.current = isModalOpen
    ? null
    : screen === "signin"
      ? onSignInKey
      : screen === "create_pin"
        ? onCreateKey
        : screen === "contact" && contactMode === "phone"
          ? onPhoneKey
          : null;
  enterHandlerRef.current =
    !isModalOpen && screen === "contact" ? () => void submitContact() : null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "Enter" && enterHandlerRef.current) {
        e.preventDefault();
        enterHandlerRef.current();
        return;
      }
      const handler = padHandlerRef.current;
      if (!handler) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handler({ type: "digit", digit: e.key });
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        handler({ type: "backspace" });
      } else if (e.key === "Escape") {
        handler({ type: "clear" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // --- Idle reset ---------------------------------------------------------

  // Something on screen worth protecting / worth warning about.
  const hasSession =
    screen !== "signin" || pin.length > 0 || isModalOpen || checking;
  const waitingOnServer = checking || lookingUp || saving;
  const idleStateRef = useRef({ hasSession, waitingOnServer, notice });
  idleStateRef.current = { hasSession, waitingOnServer, notice };

  useEffect(() => {
    let lastActivity = Date.now();
    const bump = () => {
      lastActivity = Date.now();
      setIdleSecondsLeft(null);
    };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, bump));
    const interval = setInterval(() => {
      const state = idleStateRef.current;
      // Waiting on the server is not the patient being idle.
      if (state.waitingOnServer) {
        lastActivity = Date.now();
        return;
      }
      const idle = Date.now() - lastActivity;
      if (!state.hasSession) {
        // Nothing but perhaps a notice on the PIN pad: clear it quietly.
        if (state.notice && idle >= IDLE_RESET_MS) {
          lastActivity = Date.now();
          resetAll();
        }
        return;
      }
      if (idle >= IDLE_RESET_MS) {
        lastActivity = Date.now();
        resetAll();
      } else if (idle >= IDLE_WARN_MS) {
        setIdleSecondsLeft(Math.ceil((IDLE_RESET_MS - idle) / 1000));
      }
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(interval);
    };
  }, [resetAll]);

  // --- Pieces -------------------------------------------------------------

  const stepLine = (step: 1 | 2 | 3) => (
    <div
      className="flex w-full flex-col items-center gap-1.5"
      aria-label={`Step ${step} of 3`}
    >
      <p className="text-[clamp(0.85rem,2dvh,1.05rem)] font-semibold uppercase tracking-[0.2em] text-gold">
        Step {step} of 3
      </p>
      <div className="flex w-40 gap-1.5" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-1.5 flex-1 rounded-full ${
              n <= step ? "bg-gold" : "bg-cream/20"
            }`}
          />
        ))}
      </div>
    </div>
  );

  const noticeBox = (n: Notice) => (
    <p
      role="alert"
      className={`flex w-full items-start gap-2.5 rounded-xl border-2 px-4 py-2.5 text-left text-[clamp(0.95rem,2.3dvh,1.2rem)] leading-snug ${
        n.tone === "error"
          ? "border-error bg-error/15 text-cream"
          : "border-gold bg-gold/10 text-cream"
      }`}
    >
      <CircleAlert
        aria-hidden="true"
        className={`mt-0.5 size-[1.3em] shrink-0 ${
          n.tone === "error" ? "text-error" : "text-gold"
        }`}
      />
      <span>{n.text}</span>
    </p>
  );

  // Go back / Continue / switch between phone and email — shared by the
  // phone and email versions of the first step.
  const contactActions = (
    <div className="flex w-full flex-col items-center gap-[min(1.4dvh,12px)]">
      <div className="flex w-full gap-3">
        <TapButton
          onTap={resetAll}
          disabled={lookingUp}
          className={`${secondaryButton} flex-1`}
        >
          <ArrowLeft aria-hidden="true" className="size-[1.1em]" />
          Go back
        </TapButton>
        <TapButton
          onTap={() => void submitContact()}
          disabled={!contactReady || lookingUp}
          className={`${primaryButton} flex-[1.4]`}
        >
          {lookingUp ? "Looking…" : "Continue"}
          {!lookingUp && (
            <ArrowRight aria-hidden="true" className="size-[1.1em]" />
          )}
        </TapButton>
      </div>
      <TapButton
        onTap={() => setContactMode((m) => (m === "phone" ? "email" : "phone"))}
        disabled={lookingUp}
        className="rounded-full px-4 py-2 text-[clamp(0.95rem,2.3dvh,1.2rem)] text-cream/80 underline underline-offset-4 data-[pressed=true]:bg-cream/15"
      >
        {contactMode === "phone"
          ? "Use my email instead"
          : "Use my phone number instead"}
      </TapButton>
    </div>
  );

  const remaining = PIN_LENGTH - pin.length;

  const createError =
    createNotice ||
    (create.mismatch
      ? "Those two didn't match. Let's start again — choose 4 numbers."
      : "");

  return (
    <div
      className="flex w-full select-none flex-col items-center"
      style={{ touchAction: "manipulation" }}
    >
      {/* Sign in — returning patient */}
      {screen === "signin" && (
        <PadScreen
          notice={notice && noticeBox(notice)}
          info={
            <>
              <h1 className={headingClass}>Sign in</h1>
              <p className={leadClass}>Tap your 4-digit PIN.</p>
              <DigitSlots
                value={pin}
                reveal="last"
                active={!checking}
                label="Your PIN"
              />
              <p
                aria-live="polite"
                className="h-[1.5em] text-center text-[clamp(0.95rem,2.3dvh,1.2rem)] text-cream/70"
              >
                {checking
                  ? "Checking… one moment."
                  : remaining === PIN_LENGTH
                    ? "Use the number buttons."
                    : `${remaining} more ${
                        remaining === 1 ? "number" : "numbers"
                      }.`}
              </p>
            </>
          }
          pad={<NumberPad onKey={onSignInKey} disabled={checking} />}
          actions={
            <TapButton
              onTap={() => {
                flowRef.current += 1;
                dispatchPin({ type: "reset" });
                setNotice(null);
                setScreen("contact");
              }}
              disabled={checking}
              className={`${secondaryButton} w-full`}
            >
              First time here? Create your PIN
              <ArrowRight aria-hidden="true" className="size-[1.1em]" />
            </TapButton>
          }
        />
      )}

      {/* New patient 1/3 — phone number */}
      {screen === "contact" && contactMode === "phone" && (
        <PadScreen
          notice={null}
          info={
            <>
              {stepLine(1)}
              <h1 className={headingClass}>What is your phone number?</h1>
              <p className={leadClass}>
                Type the number you gave us, area code first.
              </p>
              <p
                role="status"
                aria-label={`Phone number: ${phone.length} numbers entered`}
                className={`flex h-[clamp(52px,8dvh,72px)] w-full items-center justify-center rounded-xl border-2 text-[clamp(1.5rem,4.2dvh,2.4rem)] font-semibold tabular-nums ${
                  phone
                    ? "border-cream bg-cream/10 text-cream"
                    : "border-gold bg-gold/10 text-cream/35"
                }`}
              >
                {phone ? formatPhone(phone) : "(555) 123-4567"}
              </p>
            </>
          }
          pad={<NumberPad onKey={onPhoneKey} disabled={lookingUp} />}
          actions={contactActions}
        />
      )}

      {/* New patient 1/3 — email instead (uses the tablet's keyboard) */}
      {screen === "contact" && contactMode === "email" && (
        <div className={columnClass}>
          {stepLine(1)}
          <h1 className={headingClass}>What is your email?</h1>
          <p className={leadClass}>Type the email address you gave us.</p>
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitContact();
            }}
            placeholder="name@example.com"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            disabled={lookingUp}
            className="w-full select-text rounded-xl border-2 border-gold bg-gold/10 px-4 py-4 text-center text-[clamp(1.2rem,3dvh,1.6rem)] text-cream placeholder:text-cream/35 focus:outline-none focus:ring-4 focus:ring-gold/40"
          />
          {contactActions}
        </div>
      )}

      {/* New patient 1/3 — shared phone or email: which one is you? */}
      {screen === "select_name" && (
        <div className={columnClass}>
          {stepLine(1)}
          <h1 className={headingClass}>Which one is you?</h1>
          <p className={leadClass}>Tap your name.</p>
          <div className="flex w-full flex-col gap-3">
            {nameOptions.map((option) => (
              <TapButton
                key={option.patient_id}
                onTap={() =>
                  startCreatePin({
                    id: option.patient_id,
                    first_name: option.first_name,
                    last_name: option.last_initial,
                    pb_client_id: null,
                  })
                }
                className="w-full rounded-2xl bg-cream px-6 py-[min(2.4dvh,22px)] text-[clamp(1.4rem,3.8dvh,2.1rem)] font-medium text-ink data-[pressed=true]:bg-gold"
              >
                {option.first_name}
                {option.last_initial ? ` ${option.last_initial}.` : ""}
              </TapButton>
            ))}
          </div>
          <TapButton
            onTap={() => {
              setNameOptions([]);
              setScreen("contact");
            }}
            className={`${secondaryButton} w-full`}
          >
            <ArrowLeft aria-hidden="true" className="size-[1.1em]" />
            My name isn&apos;t here — go back
          </TapButton>
        </div>
      )}

      {/* New patient 2/3 — choose a PIN, then type it again */}
      {screen === "create_pin" && (
        <PadScreen
          notice={
            saving
              ? noticeBox({
                  tone: "info",
                  text: "Saving your PIN… one moment.",
                })
              : createError && noticeBox({ tone: "error", text: createError })
          }
          info={
            <>
              {stepLine(2)}
              <h1 className={headingClass}>
                {patient?.first_name
                  ? `Hi ${patient.first_name}! Create your PIN`
                  : "Create your PIN"}
              </h1>
              <p className={leadClass}>
                A PIN is 4 numbers you choose. You will use it to sign in at
                every visit.
              </p>
              <div className="flex w-full flex-col gap-[min(1.2dvh,10px)]">
                {(
                  [
                    ["first", "Choose 4 numbers", create.first],
                    ["second", "Type the same 4 numbers again", create.second],
                  ] as const
                ).map(([stage, label, value], i) => {
                  const isActive =
                    create.stage === stage && create.matchedPin === null;
                  const isDone =
                    stage === "first"
                      ? create.stage === "second"
                      : create.matchedPin !== null;
                  return (
                    <div
                      key={stage}
                      data-entry={stage}
                      data-active={isActive}
                      className={`flex items-center justify-between gap-3 rounded-2xl border-2 px-3 py-[min(1dvh,8px)] transition-colors duration-200 ${
                        isActive
                          ? "border-gold bg-gold/10"
                          : "border-transparent opacity-60"
                      }`}
                    >
                      <p className="flex items-center gap-2 text-left text-[clamp(0.9rem,2.2dvh,1.15rem)] leading-tight">
                        <span
                          className={`flex size-[1.7em] shrink-0 items-center justify-center rounded-full font-semibold ${
                            isDone
                              ? "bg-brand-primary text-white"
                              : isActive
                                ? "bg-gold text-ink"
                                : "bg-cream/20 text-cream"
                          }`}
                        >
                          {isDone ? (
                            <CircleCheck
                              aria-hidden="true"
                              className="size-[1em]"
                            />
                          ) : (
                            i + 1
                          )}
                        </span>
                        {label}
                      </p>
                      <DigitSlots
                        value={value}
                        reveal="all"
                        active={isActive}
                        tone={isDone ? "done" : "normal"}
                        size="md"
                        label={label}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          }
          pad={<NumberPad onKey={onCreateKey} disabled={saving} />}
          actions={
            <div className="flex w-full gap-3">
              <TapButton
                onTap={resetAll}
                disabled={saving}
                className={`${secondaryButton} flex-1`}
              >
                Cancel
              </TapButton>
              <TapButton
                onTap={() => {
                  dispatchCreate({ type: "restart" });
                  setCreateNotice("");
                }}
                disabled={saving || (create.first === "" && !create.mismatch)}
                className={`${secondaryButton} flex-1`}
              >
                Start over
              </TapButton>
            </div>
          }
        />
      )}

      {/* New patient 2/3 — saved: show the PIN once more */}
      {screen === "pin_saved" && (
        <div className={columnClass}>
          {stepLine(2)}
          <CircleCheck
            aria-hidden="true"
            className="size-[clamp(48px,9dvh,84px)] text-brand-primary"
          />
          <h1 className={headingClass}>Your PIN is saved</h1>
          <DigitSlots
            value={savedPin}
            reveal="all"
            active={false}
            tone="done"
            label="Your new PIN"
          />
          <p className={leadClass}>
            Remember these 4 numbers.
            <br />
            You will use them to sign in next time.
          </p>
          <TapButton
            onTap={continueToCheckIn}
            className={`${primaryButton} w-full`}
          >
            Continue to check in
            <ArrowRight aria-hidden="true" className="size-[1.1em]" />
          </TapButton>
        </div>
      )}

      {/* A stop that needs reading */}
      {screen === "message" && message && (
        <div className={columnClass}>
          <CircleAlert
            aria-hidden="true"
            className="size-[clamp(44px,8dvh,72px)] text-gold"
          />
          <h1 className={headingClass}>{message.title}</h1>
          <p className={leadClass} role="alert">
            {message.body}
          </p>
          <div className="flex w-full flex-col gap-3">
            {message.canRetryContact && (
              <TapButton
                onTap={() => {
                  setMessage(null);
                  setScreen("contact");
                }}
                className={`${primaryButton} w-full`}
              >
                Try again
              </TapButton>
            )}
            <TapButton
              onTap={resetAll}
              className={`${
                message.canRetryContact ? secondaryButton : primaryButton
              } w-full`}
            >
              <ArrowLeft aria-hidden="true" className="size-[1.1em]" />
              Back to sign in
            </TapButton>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={resetAll}
        onConfirm={handleConfirmCheckin}
        onDeny={handleModalDeny}
        firstName={patient?.first_name ?? ""}
        lastName={patient?.last_name ?? ""}
        appointmentTime={appointment?.time ?? null}
        appointmentDate={appointment?.date ?? null}
        practitioner={appointment?.practitioner ?? null}
        step={savedPin ? 3 : null}
      />

      {/* Idle warning: covers everything, and the tap that dismisses it
          lands on this layer, not on whatever is underneath. */}
      {idleSecondsLeft !== null && (
        <div
          role="alertdialog"
          aria-label="Are you still there?"
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-canvas/95 px-6 text-center"
        >
          <p className="font-serif text-[clamp(2rem,6dvh,3.5rem)] leading-tight">
            Are you still there?
          </p>
          <p className="text-[clamp(1.2rem,3.2dvh,1.8rem)] text-cream/80">
            Tap anywhere to keep going.
          </p>
          <p className="text-[clamp(1rem,2.6dvh,1.4rem)] text-cream/60">
            Starting over in {idleSecondsLeft}{" "}
            {idleSecondsLeft === 1 ? "second" : "seconds"}.
          </p>
        </div>
      )}
    </div>
  );
}

// Layout for the screens that use the number pad.
//
// Upright tablet: one column — words, pad, then the buttons.
// Tablet on its side: two columns — words and buttons on the left, the pad
// large on the right — so everything fits the shorter screen without
// shrinking the keys.
//
// The notice sits in a slot whose height is reserved whether or not there
// is a notice. That is deliberate: a message appearing or disappearing
// must never move the number pad while someone is in the middle of
// typing, or their next press lands on the wrong key.
function PadScreen({
  notice,
  info,
  pad,
  actions,
}: {
  notice: React.ReactNode;
  info: React.ReactNode;
  pad: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="grid w-full max-w-[560px] grid-cols-1 gap-y-[min(1.8dvh,16px)] landscape:max-w-[940px] landscape:grid-cols-2 landscape:items-center landscape:gap-x-12">
      <div className="flex flex-col items-center gap-[min(1.5dvh,14px)] landscape:col-start-1 landscape:row-start-1">
        <div className="flex min-h-[clamp(56px,7.6dvh,84px)] w-full items-end">
          {notice}
        </div>
        {info}
      </div>
      <div className="landscape:col-start-2 landscape:row-span-2 landscape:row-start-1">
        {pad}
      </div>
      <div className="landscape:col-start-1 landscape:row-start-2">
        {actions}
      </div>
    </div>
  );
}
