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
      className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm transition-all duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 backdrop-blur-none"
        }`}
        onClick={saving ? undefined : onClose}
      />
      <div
        className={`relative bg-[var(--background)] dark:bg-gray-800 border border-gray-200 dark:border-gray-400 p-6 mx-4 sm:mx-auto rounded-lg max-w-md w-full z-10 transition-all duration-300 ${
          isOpen ? "translate-y-0 opacity-100" : "translate-y-24 opacity-0"
        }`}
      >
        <div className="text-center mb-10">
          {failed ? (
            <p className="text-2xl text-red-600 dark:text-red-400">
              We couldn&apos;t record your check-in. Please see the front desk.
            </p>
          ) : showSuccess ? (
            <p className="text-4xl">
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
              <h2 className="text-4xl font-semibold mb-6">
                {appointmentTime ? "Is this your appointment?" : "Is this you?"}
              </h2>
              <p className="text-3xl mb-3">{displayName}</p>
              {appointmentTime ? (
                <p className="text-2xl">
                  Today at <strong>{appointmentTime}</strong>
                  {practitioner ? ` with ${practitioner}` : ""}
                </p>
              ) : (
                <p className="text-lg text-gray-600 dark:text-gray-300">
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
              className="px-6 py-2 bg-[#2A9E8F] hover:bg-[#238B7E] text-white rounded-full disabled:opacity-50 transition-colors"
            >
              {saving ? "Signing in..." : "Yes, Sign In"}
            </button>
            <button
              onClick={onDeny}
              disabled={saving}
              className="px-6 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-400 dark:hover:bg-gray-600 rounded-full disabled:opacity-50 transition-colors"
            >
              No
            </button>
          </div>
        )}
        {failed && (
          <div className="flex justify-center">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-400 dark:hover:bg-gray-600 rounded-full transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
