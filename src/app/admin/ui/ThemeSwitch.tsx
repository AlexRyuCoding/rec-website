"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemeChoice } from "@/lib/staff-theme";
import Segmented from "./Segmented";

// Light / dark / match this computer — remembered on this browser
// (use-staff-theme.ts). Icons only, each with a name for screen readers
// and a tooltip.
export default function ThemeSwitch({
  choice,
  onChange,
}: {
  choice: ThemeChoice;
  onChange: (next: ThemeChoice) => void;
}) {
  const icon = "size-4";
  return (
    <Segmented<ThemeChoice>
      label="Colour theme"
      size="icon"
      value={choice}
      onChange={onChange}
      options={[
        {
          value: "system",
          label: <Monitor aria-hidden className={icon} />,
          ariaLabel: "Match this computer",
          title: "Match this computer",
        },
        {
          value: "light",
          label: <Sun aria-hidden className={icon} />,
          ariaLabel: "Light",
          title: "Light",
        },
        {
          value: "dark",
          label: <Moon aria-hidden className={icon} />,
          ariaLabel: "Dark",
          title: "Dark",
        },
      ]}
    />
  );
}
