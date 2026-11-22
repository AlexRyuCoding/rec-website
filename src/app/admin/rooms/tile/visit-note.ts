import { VisitView } from "@/lib/patient-flow";

// What the board adds under a patient's name: "First visit" and today's
// service ("First visit · Fire cupping"). Empty when there is neither.
// The service tells the doctor what the visit is before walking in — fire
// cupping, for one, is two timed sessions.
export function visitNote(
  visit: Pick<VisitView, "service_name" | "first_visit">
): string {
  return [visit.first_visit ? "First visit" : null, visit.service_name]
    .filter(Boolean)
    .join(" · ");
}
