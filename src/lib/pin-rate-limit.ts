import { createServiceClient } from "@/lib/supabase";

// 4-digit PINs are guessable, so failed lookups are capped even behind
// staff auth: 20 misses per 10 minutes is generous for patients mistyping,
// useless for enumerating a 10,000-PIN space. Counters live in Supabase
// (pin_attempt_failures) so the cap survives serverless cold starts.
const MAX_FAILURES = 20;
const WINDOW_SECONDS = 600;
const RETENTION_MS = 24 * 60 * 60 * 1000;

// Fails closed: if the counter can't be read, treat the limit as reached.
export async function pinAttemptsExhausted(): Promise<boolean> {
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  const { count, error } = await supabase
    .from("pin_attempt_failures")
    .select("id", { count: "exact", head: true })
    .gte("attempted_at", cutoff);
  if (error) return true;
  return (count ?? 0) >= MAX_FAILURES;
}

export async function recordPinFailure(): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("pin_attempt_failures")
    .insert({ attempted_at: new Date().toISOString() });
  // Opportunistic cleanup so the table never grows unbounded
  await supabase
    .from("pin_attempt_failures")
    .delete()
    .lt("attempted_at", new Date(Date.now() - RETENTION_MS).toISOString());
}
