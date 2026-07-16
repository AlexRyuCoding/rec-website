import type { Metadata } from "next";
import GrievanceForm from "@/components/grievance-form";

export const metadata: Metadata = { title: "Report a Grievance" };

export default function Page() {
  return (
    <main>
      <GrievanceForm />
    </main>
  );
}
