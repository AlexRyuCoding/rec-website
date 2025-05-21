"use client";
import { useState } from "react";
import ConfirmationModal from "./confirmation-modal";
import useSound from "use-sound";
import { motion, AnimatePresence } from "motion/react";

export default function SignInKeypad() {
  const [patientName, setPatientName] = useState("");
  const [value, setValue] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
  };

  const handlePinSubmit = async (pin: string) => {
    setIsLoading(true);
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
        alert(data.error || "PIN not found.");
      }
    } catch (err) {
      console.error("Submission failed:", err);
      alert("Something went wrong.");
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
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col items-center justify-center gap-8">
      <div className="text-2xl">
        Enter your 4-digit PIN here to sign in for your appointment.
      </div>
      <div className="w-full max-w-[280px] sm:max-w-[380px] p-4 rounded-lg shadow-lg dark:bg-[var(--background)] border border dark:border-white self-center">
        {/* Display */}
        <div className="mb-4 p-3 text-xl sm:text-4xl text-right border rounded-lg bg-gray-100 dark:bg-[var(--background)]">
          {value || "ENTER YOUR PIN"}
        </div>

        {/* Loading Animation */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center gap-3 mb-4"
            >
              <motion.div
                className="w-8 h-8 border-4 border-[#2A9E8F] border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              <span>Finding your info...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Keypad Grid */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((num) => (
            <button
              key={num}
              onClick={() => handleClick(num)}
              className="py-3 text-xl sm:text-4xl bg-gray-100 dark:bg-[var(--background)] hover:bg-gray-200 dark:hover:bg-gray-600 border border dark:border-white rounded-full disabled:opacity-50"
              disabled={value.length >= 4 || isLoading}
            >
              {num}
            </button>
          ))}

          <button
            onClick={handleBackspace}
            className="col-span-1 py-3 text-xl bg-[#fcdf97] dark:bg-[#E9C46A] hover:bg-[#E9C46A] dark:hover:bg-[#e8b63c] border border dark:border-white rounded"
            disabled={isLoading}
          >
            ⌫
          </button>
          <button
            onClick={handleClear}
            className="col-span-1 py-3 text-xl bg-red-200 dark:bg-red-400 hover:bg-red-300 dark:hover:bg-red-500 border border dark:border-white rounded"
            disabled={isLoading}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleConfirm}
        onDeny={handleDeny}
        name={patientName}
      />
    </div>
  );
}
