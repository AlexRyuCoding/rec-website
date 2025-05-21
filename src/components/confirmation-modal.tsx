"use client";

import { useEffect, useState } from "react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onDeny: () => void;
  name: string;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  onDeny,
  name,
}: ConfirmationModalProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 300); // Match the CSS transition duration
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
    setTimeout(() => {
      onConfirm();
    }, 3000);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm transition-all duration-300 ${
          isOpen
            ? "opacity-100 backdrop-blur-sm"
            : "opacity-0 backdrop-blur-none"
        }`}
        onClick={onClose}
      />
      {/* Modal */}
      <div
        className={`relative bg-[var(--background)] dark:bg-gray-800 border border-gray-200 dark:border-gray-400 p-6 rounded-lg max-w-md w-full z-10 transition-all duration-300 ${
          isOpen ? "translate-y-0 opacity-100" : "translate-y-24 opacity-0"
        }`}
      >
        <div className="text-center m-6">
          {showSuccess ? (
            <p className="text-4xl gap-8">
              Welcome,
              <br />
              <br />
              <strong>{name}</strong>
              <br />
              <br />
              You&apos;ve successfully signed in!
            </p>
          ) : (
            <>
              <h2 className="text-4xl font-semibold mb-4">Is this you?</h2>
              <p className="text-4xl">{name}</p>
            </>
          )}
        </div>

        {/* Buttons */}
        {!showSuccess && (
          <div className="flex flex-col justify-center gap-4">
            <button
              onClick={handleConfirm}
              className="w-fit mx-auto px-6 py-2 bg-[#2A9E8F] hover:bg-[#238B7E] text-white rounded-full transition-colors text-center"
            >
              Yes, Sign In
            </button>
            <button
              onClick={onDeny}
              className="w-fit mx-auto px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-400 dark:hover:bg-gray-600 rounded-full transition-colors text-center"
            >
              No
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
