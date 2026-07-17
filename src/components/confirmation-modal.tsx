// src/components/confirmation-modal.tsx
"use client";

import { useEffect, useState } from "react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Performs the check-in. "duplicate" = already checked in recently.
  onConfirm: () => Promise<"ok" | "duplicate" | "error">;
  onDeny: () => void;
  firstName: string;
  lastName: string;
  appointmentTime: string | null;
  practitioner: string | null;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  onDeny,
  firstName,
  lastName,
  appointmentTime,
  practitioner,
}: ConfirmationModalProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [wasDuplicate, setWasDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setShowSuccess(false);
      setWasDuplicate(false);
      setSaving(false);
      setFailed(false);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess, onClose]);

  const handleConfirm = async () => {
    setSaving(true);
    const result = await onConfirm();
    setSaving(false);
    if (result === "error") {
      setFailed(true);
    } else {
      setWasDuplicate(result === "duplicate");
      setShowSuccess(true);
    }
  };

  // Numpad-only check-in: Enter confirms, Escape declines. Re-subscribes
  // every render so the handler sees current state.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (saving || showSuccess) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (failed) onClose();
        else handleConfirm();
      } else if (e.key === "Escape") {
        if (failed) onClose();
        else onDeny();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!isVisible && !isOpen) return null;

  const displayName = lastName
    ? `${firstName} ${lastName.charAt(0)}.`
    : firstName;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`fixed inset-0 bg-canvas/60 backdrop-blur-md transition-all duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 backdrop-blur-none"
        }`}
        onClick={saving ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Check-in confirmation"
        className={`relative bg-island text-ink border border-ink/10 p-6 mx-4 sm:mx-auto rounded-card max-w-md w-full z-10 transition-all duration-300 ${
          isOpen ? "translate-y-0 opacity-100" : "translate-y-24 opacity-0"
        }`}
      >
        {/* aria-live announces the thank-you / error text when it appears */}
        <div className="text-center mb-10" aria-live="polite">
          {failed ? (
            <p className="text-2xl text-error">
              We couldn&apos;t record your check-in. Please see the front desk.
            </p>
          ) : showSuccess ? (
            <p className="font-serif text-4xl text-ink">
              {wasDuplicate ? (
                <>
                  You&apos;re already checked in, <strong>{firstName}</strong>!
                  <br />
                  <br />
                  Please have a seat.
                </>
              ) : (
                <>
                  Thank you, <strong>{firstName}</strong>!
                  <br />
                  <br />
                  You&apos;re checked in.
                </>
              )}
            </p>
          ) : firstName ? (
            <>
              <h2 className="font-serif text-4xl text-ink mb-6">
                {appointmentTime ? "Is this your appointment?" : "Is this you?"}
              </h2>
              <p className="text-3xl mb-3">{displayName}</p>
              {appointmentTime ? (
                <p className="text-2xl">
                  Today at <strong>{appointmentTime}</strong>
                  {practitioner ? ` with ${practitioner}` : ""}
                </p>
              ) : (
                <p className="text-lg text-ink/60">
                  We couldn&apos;t find a booked appointment for today — you can
                  still sign in.
                </p>
              )}
            </>
          ) : null}
        </div>

        {!showSuccess && !failed && firstName && (
          <div className="flex items-center justify-center gap-4 text-2xl">
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="px-6 py-2 bg-surface text-cream active:scale-95 rounded-full disabled:opacity-50 transition"
            >
              {saving ? "Signing in..." : "Yes, Sign In"}
            </button>
            <button
              onClick={onDeny}
              disabled={saving}
              className="px-6 py-2 border border-ink/20 text-ink active:scale-95 rounded-full disabled:opacity-50 transition"
            >
              No
            </button>
          </div>
        )}
        {failed && (
          <div className="flex justify-center">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-ink/20 text-ink active:scale-95 rounded-full transition"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
