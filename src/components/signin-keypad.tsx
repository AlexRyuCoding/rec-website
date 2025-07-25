"use client";
import { useState } from "react";
import ConfirmationModal from "./confirmation-modal";
import { motion, AnimatePresence } from "motion/react";

export default function SignInKeypad() {
  const [patientName, setPatientName] = useState("");
  const [value, setValue] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleClick = (num: string) => {
    if (value.length < 4) {
      const newValue = value + num;
      setValue(newValue);

      // Show modal when exactly 4 digits are entered
      if (newValue.length === 4) {
        handlePinSubmit(newValue);
      }
    }
  };

  const handleBackspace = () => {
    setValue((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setValue("");
    setErrorMessage("");
  };

  const handleModalClose = () => {
    setPatientName("");
    setCurrentPin("");
    setErrorMessage("");
    setIsModalOpen(false);
  };

  const handlePinSubmit = async (pin: string) => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const res = await fetch("/api/pin-signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, confirmed: false }),
      });

      const data = await res.json();

      if (res.ok) {
        setPatientName(data.name);
        setCurrentPin(pin);
        setIsModalOpen(true);
      } else {
        setErrorMessage(data.error || "PIN not found.");
        setIsModalOpen(true);
      }
    } catch (err) {
      console.error("Submission failed:", err);
      setErrorMessage("Something went wrong.");
      setIsModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    try {
      // Send confirmation to API
      await fetch("/api/pin-signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: currentPin, confirmed: true }),
      });

      setIsModalOpen(false);
      setValue("");
      setPatientName("");
      setCurrentPin("");
    } catch (err) {
      console.error("Confirmation failed:", err);
      alert("Something went wrong during confirmation.");
    }
  };

  const handleDeny = () => {
    setValue("");
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col items-center justify-center gap-8">
      <div className="text-2xl">
        Enter your 4-digit PIN here to sign in for your appointment.
      </div>
      <motion.div
        layout
        className="w-full max-w-[380px] sm:max-w-[480px] p-4 rounded-lg shadow-lg bg-brand-background dark:bg-[var(--background)] border border-brand-foreground dark:border-white self-center"
      >
        {/* Display */}
        <motion.div
          layout
          className="mb-4 p-3 text-xl sm:text-4xl text-right border border-brand-foreground dark:border-white rounded-lg bg-brand-background dark:bg-[var(--background)]"
        >
          {value || "ENTER YOUR PIN"}
        </motion.div>

        {/* Loading Animation */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center justify-center gap-3 mb-4 text-2xl overflow-hidden"
            >
              <motion.div
                className="w-8 h-8 border-4 border-[#2A9E8F] border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              <span className="text-2xl">Verifying PIN...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Keypad Grid */}
        <motion.div layout className="grid grid-cols-3 gap-4 mb-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((num) => (
            <button
              key={num}
              onClick={() => handleClick(num)}
              className="py-3 text-5xl sm:text-5xl bg-brand-background dark:bg-[var(--background)] hover:bg-brand-muted dark:hover:bg-gray-600 border border-brand-foreground dark:border-brand-background rounded-xl disabled:opacity-50"
              disabled={value.length >= 4 || isLoading}
            >
              {num}
            </button>
          ))}

          <button
            onClick={handleBackspace}
            className="col-span-1 text-5xl bg-[#fcdf97] dark:bg-[#E9C46A] hover:bg-[#E9C46A] dark:hover:bg-[#e8b63c] border border dark:border-white rounded-xl"
            disabled={isLoading}
          >
            ⌫
          </button>
          <button
            onClick={handleClear}
            className="col-span-1 py-3 text-2xl bg-red-300 dark:bg-red-400 hover:bg-red-400 dark:hover:bg-red-600 border border dark:border-white rounded-xl"
            disabled={isLoading}
          >
            CLEAR
          </button>
        </motion.div>
      </motion.div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleConfirm}
        onDeny={handleDeny}
        name={patientName}
        errorMessage={errorMessage}
      />
    </div>
  );
}
