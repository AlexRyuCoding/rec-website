"use client";
import type { ReactNode } from "react";
import { useThumb } from "./use-thumb";

// One choice of several (date range, kind of device, music source,
// theme): a sunken track with a raised thumb that slides to the chosen
// item. Items keep one font weight, chosen or not, so nothing shifts as
// the thumb moves.
//
// `semantics` keeps what each place already told a screen reader:
// "pressed" = a group of toggle buttons (aria-pressed), "radio" = a
// radiogroup (aria-checked).
export default function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  semantics = "pressed",
  size = "md",
  className = "",
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: {
    value: T;
    label: ReactNode;
    ariaLabel?: string;
    title?: string;
  }[];
  semantics?: "pressed" | "radio";
  size?: "md" | "icon";
  className?: string;
}) {
  const { containerRef, thumbRef, arm } = useThumb(value);
  const radio = semantics === "radio";
  return (
    <div
      ref={containerRef}
      role={radio ? "radiogroup" : "group"}
      aria-label={label}
      className={`relative inline-flex max-w-full flex-wrap rounded-[10px] border border-ui-line-strong bg-ui-well px-[3px] pb-[6px] pt-[5px] shadow-sunk ${className}`}
    >
      <span
        ref={thumbRef}
        aria-hidden="true"
        className="ui-thumb ui-thumb-still rounded-[7px] border border-ui-line-strong bg-ui-btn shadow-lift-1"
      />
      {options.map((option) => {
        const chosen = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            data-thumb-item={option.value}
            role={radio ? "radio" : undefined}
            aria-checked={radio ? chosen : undefined}
            aria-pressed={radio ? undefined : chosen}
            aria-label={option.ariaLabel}
            title={option.title}
            onPointerDown={arm}
            onKeyDown={arm}
            onClick={() => onChange(option.value)}
            className={`relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ui-accent-text ${
              size === "icon" ? "px-[9px] py-1.5" : "px-[13px] py-1.5"
            } ${chosen ? "text-ui-text" : "text-ui-text-2 hover:text-ui-text"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
