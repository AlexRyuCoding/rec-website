// Class strings of the staff look, for the places that are not a
// component of their own (links styled as buttons, inputs, tables).
//
// The rule of the look: rectangles are pressed, pills are read — and what
// can be pressed is raised on a hard ledge, what is typed in is sunken,
// what is only read is flat. Colours and ledges: ../staff-theme.css.

export type ButtonVariant = "default" | "primary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent-text";

// Pressing moves a button down onto its ledge (2px) — not when it is
// disabled, and not for people who asked for less motion. (The
// reduced-motion class repeats the :not(:disabled) part on purpose: with
// less of the selector it loses to the press it is meant to cancel.)
const BUTTON_BASE = `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium transition-[transform,box-shadow,background-color,border-color,color] duration-100 [&:not(:disabled)]:active:translate-y-[2px] [&:not(:disabled)]:active:shadow-none motion-reduce:[&:not(:disabled)]:active:translate-y-0 disabled:opacity-50 ${FOCUS}`;

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  default:
    "border-ui-line-strong bg-ui-btn text-ui-text shadow-lift-1 hover:border-ui-text-3",
  primary:
    "border-ui-accent-fill-hover bg-ui-accent-fill font-semibold text-ui-on-accent shadow-lift-accent hover:bg-ui-accent-fill-hover",
  danger:
    "border-ui-error-fill bg-ui-error-fill font-semibold text-ui-on-accent shadow-lift-danger",
  // Flat: for the quiet actions of a toolbar (Refresh, Sign out).
  quiet:
    "border-transparent bg-transparent text-ui-text-2 hover:bg-ui-panel-2 hover:text-ui-text",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-1 text-sm",
  md: "px-3.5 py-2",
  lg: "px-5 py-3 text-base",
};

export function buttonClass({
  variant = "default",
  size = "md",
}: { variant?: ButtonVariant; size?: ButtonSize } = {}): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]}`;
}

// Sunken: somewhere to type. The base has no padding or corner size of
// its own (two utilities for the same property do not override each other
// by their order in the class list); fieldClass is the ordinary field.
export const fieldBaseClass = `min-w-0 max-w-full border border-ui-line-strong bg-ui-well text-ui-text shadow-sunk placeholder:text-ui-text-3 ${FOCUS}`;
export const fieldClass = `${fieldBaseClass} rounded-lg px-3 py-2`;

// Raised like a button: it opens when pressed.
export const selectClass = `min-w-0 max-w-full rounded-lg border border-ui-line-strong bg-ui-btn px-3 py-2 text-ui-text shadow-lift-1 ${FOCUS}`;

// A text link among buttons (the least of a row's actions).
export const linkClass = `rounded px-1.5 py-1 text-sm text-ui-text-2 underline underline-offset-[3px] hover:text-ui-text ${FOCUS}`;

// Tables: a quiet header row, hairlines between rows, a hover that helps
// the eye stay on one row across seven columns.
export const tableClass = "w-full border-collapse text-left";
export const thClass =
  "whitespace-nowrap border-b border-ui-line bg-ui-panel-2 px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-ui-text-3 first:pl-[18px] last:pr-[18px]";
export const trClass =
  "[&:last-child>td]:border-b-0 [&:hover>td]:bg-ui-panel-2";
export const tdClass =
  "border-b border-ui-line px-3.5 py-[11px] transition-colors duration-100 first:pl-[18px] last:pr-[18px]";
