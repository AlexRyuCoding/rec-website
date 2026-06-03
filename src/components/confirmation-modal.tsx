// src/components/confirmation-modal.tsx
"use client";

import { useEffect, useState } from "react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onDeny: () => void;
  firstName: string;
  lastName: string;
  appointmentTime: string | null;
  practitioner: string | null;
  errorMessage?: string;
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
  errorMessage,
}: ConfirmationModalProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
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

  if (!isVisible && !isOpen) return null;

  const handleConfirm = () => {
    setShowSuccess(true);
    setTimeout(onConfirm, 3000);
  };

  const displayName = `${firstName} ${lastName.charAt(0)}.`;

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
        onClick={onClose}
      />
      <div
        className={`relative bg-[var(--background)] dark:bg-gray-800 border border-gray-200 dark:border-gray-400 p-6 mx-4 sm:mx-auto rounded-lg max-w-md w-full z-10 transition-all duration-300 ${
          isOpen ? "translate-y-0 opacity-100" : "translate-y-24 opacity-0"
        }`}
      >
        <div className="text-center mb-10">
          {errorMessage ? (
            <p className="text-2xl text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          ) : showSuccess ? (
            <p className="text-4xl">
              Thank you, <strong>{firstName}</strong>!
              <br />
              <br />
              You&apos;re checked in.
            </p>
          ) : firstName ? (
            <>
              <h2 className="text-4xl font-semibold mb-6">Is this you?</h2>
              <p className="text-3xl mb-3">{displayName}</p>
              {appointmentTime && (
                <p className="text-xl text-gray-600 dark:text-gray-300">
                  Appointment at {appointmentTime}
                  {practitioner ? ` with ${practitioner}` : ""}
                </p>
              )}
            </>
          ) : null}
        </div>

        {!showSuccess && !errorMessage && firstName && (
          <div className="flex items-center justify-center gap-4 text-2xl">
            <button
              onClick={handleConfirm}
              className="px-6 py-2 bg-[#2A9E8F] hover:bg-[#238B7E] text-white rounded-full transition-colors"
            >
              Yes, Sign In
            </button>
            <button
              onClick={onDeny}
              className="px-6 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-400 dark:hover:bg-gray-600 rounded-full transition-colors"
            >
              No
            </button>
          </div>
        )}
        {errorMessage && (
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
