// What may be written to the server log about an error: what KIND it was,
// never its words.
//
// An error's message, and the object around it, often quote what was
// being handled: a database error names the row that did not fit, a mail
// error names the address it could not reach, a failed request carries
// its body. The log is not the place for a patient's name. So routes log
//
//   console.error("Email sending failed:", errorLabel(error));
//
// and the label holds only short, fixed things: the error's class, a
// code, a status. error-label.test.ts fails if a file under src/ hands a
// caught error (or its message) to console.* directly.
const SAFE = /^[A-Za-z0-9_.:-]{1,40}$/;

function part(name: string, value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${name}=${value}`;
  }
  if (typeof value === "string" && SAFE.test(value)) return `${name}=${value}`;
  return null;
}

export function errorLabel(error: unknown): string {
  if (typeof error !== "object" || error === null) return "unknown";
  const e = error as Record<string, unknown>;
  const kind =
    typeof e.name === "string" && SAFE.test(e.name) ? e.name : "Error";
  const parts = [
    part("code", e.code),
    part("status", e.status ?? e.statusCode),
  ].filter((p): p is string => p !== null);
  return [kind, ...parts].join(" ");
}
