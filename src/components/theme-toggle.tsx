"use client";

import { useTheme } from "next-themes";
import * as React from "react";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  // Avoid hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true);
    console.log("Initial theme:", theme);
  }, []);

  // Log theme changes
  useEffect(() => {
    console.log("Theme changed to:", theme);
  }, [theme]);

  if (!mounted) {
    return (
      <button
        className="p-2 rounded-md border border-gray-400"
        aria-label="Loading theme"
        disabled
      >
        <div className="w-5 h-5 animate-pulse bg-gray-300 dark:bg-gray-700 rounded-full" />
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        const newTheme = theme === "dark" ? "light" : "dark";
        console.log("Switching theme to:", newTheme);
        setTheme(newTheme);
      }}
      className="p-2 rounded-md hover:bg-gray-200 border border-gray-400 dark:hover:bg-gray-800"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="w-5 h-5" />
      ) : (
        <Moon className="w-5 h-5" />
      )}
    </button>
  );
}
