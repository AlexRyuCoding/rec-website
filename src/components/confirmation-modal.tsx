// src/components/confirmation-modal.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useMotionPrefs } from "./motion/motion-provider";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Performs the check-in. "duplicate" = already checked in recently.
  onConfirm: () => Promise<"ok" | "duplicate" | "error">;
  onDeny: () => void;
  firstName: string;
  lastName: string;
  appointmentTime: string | null;
  appointmentDate: string | null;
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
  appointmentDate,
  practitioner,
}: ConfirmationModalProps) {
  const { reduced } = useMotionPrefs();
  const successRef = useRef<HTMLDivElement>(null);
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
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess, onClose]);

  // Checked-in celebration: draw the circled checkmark, then pop the
  // thank-you text in. Static (pre-drawn) under reduced motion.
  useGSAP(
    () => {
      if (!showSuccess || reduced || !successRef.current) return;
      const circle = successRef.current.querySelector("circle");
      const check = successRef.current.querySelector("path");
      const text = successRef.current.querySelector("[data-success-text]");
      if (!circle || !check || !text) return;
      for (const el of [circle, check]) {
        const len = (el as SVGGeometryElement).getTotalLength();
        gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
      }
      gsap
        .timeline()
        .fromTo(
          successRef.current,
          { autoAlpha: 0, scale: 0.92 },
          { autoAlpha: 1, scale: 1, duration: 0.25, ease: "house" }
        )
        .to(
          circle,
          { strokeDashoffset: 0, duration: 0.5, ease: "power2.inOut" },
          "-=0.05"
        )
        .to(
          check,
          { strokeDashoffset: 0, duration: 0.35, ease: "power2.out" },
          "-=0.2"
        )
        .fromTo(
          text,
          { autoAlpha: 0, y: 16 },
          { autoAlpha: 1, y: 0, duration: 0.4, ease: "house" },
          "-=0.15"
        );
    },
    { dependencies: [showSuccess, reduced], scope: successRef }
  );

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
            <div ref={successRef} className="flex flex-col items-center">
              <svg
                viewBox="0 0 52 52"
                className="mb-6 size-24 text-brand-primary"
                aria-hidden="true"
              >
                <circle
                  cx="26"
                  cy="26"
                  r="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
                <path
                  d="M15 27l8 8 15-16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p data-success-text className="font-serif text-4xl text-ink">
                {wasDuplicate ? (
                  <>
                    You&apos;re already checked in, <strong>{firstName}</strong>
                    !
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
            </div>
          ) : firstName ? (
            <>
              <h2 className="text-lg uppercase tracking-widest text-ink/60 mb-4">
                {appointmentTime ? "Is this your appointment?" : "Is this you?"}
              </h2>
              <p className="font-serif text-5xl sm:text-6xl text-ink mb-6">
                {displayName}
              </p>
              {appointmentTime ? (
                <p className="text-2xl">
                  {appointmentDate ?? "Today"}
                  <br />
                  at <strong>{appointmentTime}</strong>
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
