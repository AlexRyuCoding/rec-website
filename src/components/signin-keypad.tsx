// src/components/signin-keypad.tsx
"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import ConfirmationModal from "./confirmation-modal";

type Screen =
  | "pin_entry"
  | "verifying"
  | "confirmed"
  | "error"
  | "new_contact"
  | "new_contact_lookup"
  | "new_select_name"
  | "new_pin_create"
  | "new_pin_confirm"
  | "new_pin_saving";

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
  practitioner: string | null;
}

export default function SignInKeypad() {
  const [screen, setScreen] = useState<Screen>("pin_entry");
  const [pin, setPin] = useState("");
  const [contact, setContact] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [nameOptions, setNameOptions] = useState<NameOption[]>([]);
  const [appointment, setAppointment] = useState<AppointmentInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // --- Returning patient: PIN entry ---

  const handlePinDigit = (digit: string) => {
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) submitPin(next);
  };

  const handlePinBackspace = () => setPin((p) => p.slice(0, -1));
  const handlePinClear = () => setPin("");

  // Kiosk session expired mid-day — staff need to unlock again
  const redirectToLogin = () => {
    window.location.href = "/admin/login";
  };

  const submitPin = async (entered: string) => {
    setScreen("verifying");
    try {
      const res = await fetch("/api/patients/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: entered }),
      });
      if (res.status === 401) return redirectToLogin();
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(
          data.error ?? "PIN not recognized, please see the front desk"
        );
        setPin("");
        setScreen("error");
        return;
      }
      setPatient(data);
      await fetchAppointment(data.pb_client_id);
      setIsModalOpen(true);
      setScreen("confirmed");
    } catch {
      setErrorMessage("Something went wrong. Please see the front desk.");
      setPin("");
      setScreen("error");
    }
  };

  const fetchAppointment = async (pb_client_id: string | null) => {
    if (!pb_client_id) return;
    try {
      const res = await fetch(
        `/api/appointments/today?pb_client_id=${encodeURIComponent(pb_client_id)}`
      );
      const data = await res.json();
      setAppointment(data.appointment ?? null);
    } catch {
      setAppointment(null);
    }
  };

  // --- Check-in (called from modal confirm) ---

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

  const handleModalClose = () => {
    setIsModalOpen(false);
    setPin("");
    setPatient(null);
    setAppointment(null);
    setErrorMessage("");
    setScreen("pin_entry");
  };

  const handleModalDeny = () => {
    setIsModalOpen(false);
    setPin("");
    setPatient(null);
    setAppointment(null);
    setScreen("pin_entry");
  };

  // --- New patient: contact lookup ---

  const handleContactSubmit = async () => {
    if (!contact.trim()) return;
    setScreen("new_contact_lookup");
    try {
      const res = await fetch("/api/patients/setup-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: contact.trim() }),
      });
      if (res.status === 401) return redirectToLogin();
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error ?? "Something went wrong.");
        setScreen("error");
        return;
      }
      if (data.status === "not_found") {
        setErrorMessage(
          "We couldn't find your record. Please see the front desk to get started."
        );
        setScreen("error");
      } else if (data.status === "has_pin") {
        setErrorMessage(
          "You already have a PIN. Please use it, or see the front desk."
        );
        setScreen("error");
      } else if (data.status === "select") {
        setNameOptions(data.options ?? []);
        setErrorMessage("");
        setScreen("new_select_name");
      } else {
        setPatient({
          id: data.patient_id,
          first_name: data.first_name,
          last_name: "",
          pb_client_id: null,
        });
        setErrorMessage("");
        setScreen("new_pin_create");
      }
    } catch {
      setErrorMessage("Something went wrong. Please see the front desk.");
      setScreen("error");
    }
  };

  // --- New patient: pick your name (shared family contact) ---

  const handleNameSelect = (option: NameOption) => {
    setPatient({
      id: option.patient_id,
      first_name: option.first_name,
      last_name: option.last_initial,
      pb_client_id: null,
    });
    setNameOptions([]);
    setErrorMessage("");
    setScreen("new_pin_create");
  };

  // --- New patient: PIN creation ---

  const handleNewPinDigit = (digit: string) => {
    if (screen === "new_pin_create" && newPin.length < 4) {
      if (newPin.length === 0) setErrorMessage("");
      const next = newPin + digit;
      setNewPin(next);
      if (next.length === 4) setScreen("new_pin_confirm");
    } else if (screen === "new_pin_confirm" && confirmPin.length < 4) {
      const next = confirmPin + digit;
      setConfirmPin(next);
      if (next.length === 4) submitNewPin(next);
    }
  };

  const handleNewPinBackspace = () => {
    if (screen === "new_pin_create") setNewPin((p) => p.slice(0, -1));
    else if (screen === "new_pin_confirm") setConfirmPin((p) => p.slice(0, -1));
  };

  const handleNewPinClear = () => {
    if (screen === "new_pin_create") setNewPin("");
    else if (screen === "new_pin_confirm") setConfirmPin("");
  };

  const submitNewPin = async (entered: string) => {
    if (entered !== newPin) {
      setErrorMessage("PINs don't match. Let's try again.");
      setNewPin("");
      setConfirmPin("");
      setScreen("new_pin_create");
      return;
    }
    setScreen("new_pin_saving");
    try {
      const res = await fetch("/api/patients/setup-pin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patient!.id, pin: entered }),
      });
      if (res.status === 401) return redirectToLogin();
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setErrorMessage(
            data.error ??
              "That PIN is already taken — please choose a different one."
          );
          setNewPin("");
          setConfirmPin("");
          setScreen("new_pin_create");
          return;
        }
        setErrorMessage(
          data.error ?? "Failed to save PIN. Please see the front desk."
        );
        setScreen("error");
        return;
      }
      const fullPatient: PatientInfo = data;
      setPatient(fullPatient);
      await fetchAppointment(fullPatient.pb_client_id);
      setIsModalOpen(true);
      setScreen("confirmed");
    } catch {
      setErrorMessage("Something went wrong. Please see the front desk.");
      setScreen("error");
    }
  };

  // --- Reset ---

  const reset = () => {
    setScreen("pin_entry");
    setPin("");
    setContact("");
    setNewPin("");
    setConfirmPin("");
    setPatient(null);
    setNameOptions([]);
    setAppointment(null);
    setErrorMessage("");
    setIsModalOpen(false);
  };

  // Idle reset: an abandoned mid-flow session leaves patient info on
  // screen for the next person, so return to the PIN pad after 60s of no
  // interaction. reset() only calls stable setState functions, so
  // mounting this once is safe.
  useEffect(() => {
    const IDLE_MS = 60_000;
    let lastActivity = Date.now();
    const bump = () => {
      lastActivity = Date.now();
    };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, bump));
    const interval = setInterval(() => {
      if (Date.now() - lastActivity >= IDLE_MS) {
        lastActivity = Date.now();
        reset();
      }
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Physical keyboard / numpad support on the PIN screens. The contact
  // screen types into a real input, so keystrokes focused there are left
  // alone. Re-subscribes every render so the handlers see current state.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const isPinEntry = screen === "pin_entry";
      const isNewPin =
        screen === "new_pin_create" || screen === "new_pin_confirm";
      if (!isPinEntry && !isNewPin) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (isPinEntry) handlePinDigit(e.key);
        else handleNewPinDigit(e.key);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        if (isPinEntry) handlePinBackspace();
        else handleNewPinBackspace();
      } else if (e.key === "Escape") {
        if (isPinEntry) handlePinClear();
        else handleNewPinClear();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // --- PIN display helper ---

  // role="status" makes screen readers announce progress as digits go in
  const pinDots = (value: string) => (
    <div
      className="flex justify-center gap-4 mb-6 py-4"
      role="status"
      aria-label={`${value.length} of 4 digits entered`}
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className={`w-6 h-6 rounded-full border-2 border-brand-foreground transition-colors ${
            i < value.length ? "bg-brand-primary" : "bg-transparent"
          }`}
        />
      ))}
    </div>
  );

  // --- Keypad ---

  const currentPinValue =
    screen === "new_pin_confirm"
      ? confirmPin
      : screen === "new_pin_create"
        ? newPin
        : pin;

  const keypadDisabled = ![
    "pin_entry",
    "new_pin_create",
    "new_pin_confirm",
  ].includes(screen);

  const Keypad = () => (
    <motion.div layout className="grid grid-cols-3 gap-4 mb-4">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((num) => (
        <button
          key={num}
          onClick={() =>
            screen === "pin_entry"
              ? handlePinDigit(num)
              : handleNewPinDigit(num)
          }
          disabled={keypadDisabled || currentPinValue.length >= 4}
          className="py-3 text-5xl bg-brand-background hover:bg-brand-muted active:bg-brand-muted active:scale-95 border border-cream/15 text-cream rounded-full disabled:opacity-50 transition"
        >
          {num}
        </button>
      ))}
      <button
        onClick={
          screen === "pin_entry" ? handlePinBackspace : handleNewPinBackspace
        }
        disabled={keypadDisabled}
        aria-label="Delete last digit"
        className="col-span-1 text-5xl bg-brand-accent-light hover:bg-brand-accent active:scale-95 border rounded-xl disabled:opacity-50 transition"
      >
        <span aria-hidden="true">⌫</span>
      </button>
      <button
        onClick={screen === "pin_entry" ? handlePinClear : handleNewPinClear}
        disabled={keypadDisabled}
        aria-label="Clear all digits"
        className="col-span-1 py-3 text-2xl bg-error hover:bg-error active:scale-95 border rounded-xl disabled:opacity-50 transition"
      >
        CLEAR
      </button>
    </motion.div>
  );

  return (
    <div className="flex flex-col items-center justify-center gap-8">
      <AnimatePresence mode="wait">
        {/* PIN entry — returning patient */}
        {screen === "pin_entry" && (
          <motion.div
            key="pin_entry"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-8 w-full"
          >
            <p className="text-2xl text-center">
              Enter your 4-digit PIN to sign in.
            </p>
            <motion.div
              layout
              className="w-full max-w-[380px] sm:max-w-[480px] p-4 rounded-lg bg-brand-background border border-brand-foreground"
            >
              {pinDots(pin)}
              <Keypad />
            </motion.div>
            <button
              onClick={() => setScreen("new_contact")}
              className="text-lg text-brand-primary underline underline-offset-2 hover:text-brand-secondary transition-colors"
            >
              First visit? Set up your PIN
            </button>
          </motion.div>
        )}

        {/* Verifying / loading */}
        {(screen === "verifying" ||
          screen === "new_contact_lookup" ||
          screen === "new_pin_saving") && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4"
          >
            <motion.div
              className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
            <p className="text-2xl">
              {screen === "verifying"
                ? "Verifying PIN..."
                : screen === "new_pin_saving"
                  ? "Setting up your PIN..."
                  : "Looking you up..."}
            </p>
          </motion.div>
        )}

        {/* Error */}
        {screen === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6 max-w-sm text-center"
          >
            <p className="text-2xl text-error">{errorMessage}</p>
            <button
              onClick={reset}
              className="px-8 py-3 rounded-full bg-brand-primary text-white text-xl hover:bg-brand-secondary active:scale-95 transition"
            >
              Try Again
            </button>
          </motion.div>
        )}

        {/* New patient: contact entry */}
        {screen === "new_contact" && (
          <motion.div
            key="new_contact"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6 w-full max-w-sm"
          >
            <p className="text-2xl text-center">
              Enter your phone number or email.
            </p>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleContactSubmit()}
              placeholder="555-123-4567 or email"
              className="w-full px-4 py-3 border border-brand-foreground rounded-lg text-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-brand-primary"
              autoFocus
            />
            <div className="flex gap-4 w-full">
              <button
                onClick={reset}
                className="flex-1 py-3 rounded-full border border-brand-foreground text-xl hover:bg-brand-muted active:scale-95 transition"
              >
                Back
              </button>
              <button
                onClick={handleContactSubmit}
                disabled={!contact.trim()}
                className="flex-1 py-3 rounded-full bg-brand-primary text-white text-xl hover:bg-brand-secondary active:scale-95 disabled:opacity-50 transition"
              >
                Continue
              </button>
            </div>
          </motion.div>
        )}

        {/* New patient: shared contact — pick your name */}
        {screen === "new_select_name" && (
          <motion.div
            key="new_select_name"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6 w-full max-w-sm"
          >
            <p className="text-2xl text-center">
              Select your name to set up your PIN.
            </p>
            <div className="flex flex-col gap-4 w-full">
              {nameOptions.map((option) => (
                <button
                  key={option.patient_id}
                  onClick={() => handleNameSelect(option)}
                  className="py-4 px-6 rounded-xl border border-brand-foreground text-2xl bg-brand-background hover:bg-brand-muted active:scale-95 transition"
                >
                  {option.first_name}
                  {option.last_initial ? ` ${option.last_initial}.` : ""}
                </button>
              ))}
            </div>
            <button
              onClick={reset}
              className="text-lg text-cream/50 underline underline-offset-2 hover:text-cream/50 transition-colors"
            >
              Cancel
            </button>
          </motion.div>
        )}

        {/* New patient: PIN creation */}
        {(screen === "new_pin_create" || screen === "new_pin_confirm") && (
          <motion.div
            key="new_pin"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6 w-full"
          >
            <p className="text-2xl text-center">
              {screen === "new_pin_create"
                ? `Hi ${patient?.first_name}! Choose a 4-digit PIN.`
                : "Re-enter your PIN to confirm."}
            </p>
            {errorMessage && screen === "new_pin_create" && (
              <p className="text-lg text-error text-center max-w-sm">
                {errorMessage}
              </p>
            )}
            <motion.div
              layout
              className="w-full max-w-[380px] sm:max-w-[480px] p-4 rounded-lg bg-brand-background border border-brand-foreground"
            >
              {pinDots(currentPinValue)}
              <Keypad />
            </motion.div>
            <button
              onClick={() => {
                if (screen === "new_pin_confirm") {
                  setNewPin("");
                  setConfirmPin("");
                  setScreen("new_pin_create");
                } else {
                  reset();
                }
              }}
              className="text-lg text-cream/50 underline underline-offset-2 hover:text-cream/50 transition-colors"
            >
              {screen === "new_pin_confirm" ? "Back" : "Cancel"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleConfirmCheckin}
        onDeny={handleModalDeny}
        firstName={patient?.first_name ?? ""}
        lastName={patient?.last_name ?? ""}
        appointmentTime={appointment?.time ?? null}
        practitioner={appointment?.practitioner ?? null}
      />
    </div>
  );
}
