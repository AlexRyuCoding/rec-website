import { createServiceClient } from "@/lib/supabase";

// The public forms send email via Resend; without a cap anyone can script
// unlimited sends. 5 submissions per hour per IP is generous for humans.
// Counters live in Supabase so the cap survives serverless cold starts.
// Fails closed, matching src/lib/pin-rate-limit.ts.
const MAX_PER_WINDOW = 5;
const WINDOW_SECONDS = 3600;
const RETENTION_MS = 24 * 60 * 60 * 1000;

export async function formSubmissionsExhausted(ip: string): Promise<boolean> {
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  const { count, error } = await supabase
    .from("form_submission_events")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("submitted_at", cutoff);
  if (error || count === null) {
    console.error("Form rate-limit counter unreadable — failing closed");
    return true;
  }
  return count >= MAX_PER_WINDOW;
}

export async function recordFormSubmission(ip: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("form_submission_events")
    .insert({ ip, submitted_at: new Date().toISOString() });
  if (error) console.error("Failed to record form submission:", error.code);
  await supabase
    .from("form_submission_events")
    .delete()
    .lt("submitted_at", new Date(Date.now() - RETENTION_MS).toISOString());
}
