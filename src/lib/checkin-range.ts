// The date ranges of the dashboard's check-ins view. Pure.
//
// Days are the calendar days of the computer the dashboard is open on,
// and are stepped as calendar days — never as "24 hours": on the two days
// a year the clocks change a day is 23 or 25 hours long, and adding 24
// hours to midnight lands on 11 pm or 1 am.

export type RangePreset = "today" | "yesterday" | "week" | "month" | "custom";

export interface DateRange {
  // From the first moment of the first day…
  from: Date;
  // …up to (not including) the first moment of the day after the last.
  to: Date;
}

const startOfDay = (d: Date, addDays = 0) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + addDays);

export function presetRange(
  preset: Exclude<RangePreset, "custom">,
  now: Date
): DateRange {
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: startOfDay(now, 1) };
    case "yesterday":
      return { from: startOfDay(now, -1), to: startOfDay(now) };
    case "week":
      // Today and the six days before it.
      return { from: startOfDay(now, -6), to: startOfDay(now, 1) };
    case "month":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: startOfDay(now, 1),
      };
  }
}

// YYYY-MM-DD, as <input type="date"> holds it.
export function dateInputValue(d: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// The range between two typed dates, both days included. Typed the wrong
// way round, they are swapped rather than answered with nothing. Null
// until both are real dates.
export function customRange(
  fromValue: string,
  toValue: string
): DateRange | null {
  const a = parseDateInput(fromValue);
  const b = parseDateInput(toValue);
  if (!a || !b) return null;
  const [first, last] = a <= b ? [a, b] : [b, a];
  return { from: first, to: startOfDay(last, 1) };
}

// What "Custom" opens with: the last 30 days, today included. Check-ins
// are never in the future, so the range ends today.
export function defaultCustomDates(now: Date): { from: string; to: string } {
  return {
    from: dateInputValue(startOfDay(now, -29)),
    to: dateInputValue(now),
  };
}

// Does the range reach the present? Only then can new check-ins appear
// in it, so only then does the view keep itself up to date.
export function rangeIncludesNow(range: DateRange, now: Date): boolean {
  return range.from <= now && now < range.to;
}
