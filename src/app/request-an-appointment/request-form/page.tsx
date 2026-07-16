import type { Metadata } from "next";
import RequestForm from "@/components/request-form";

export const metadata: Metadata = { title: "Request Form" };

export default function Page() {
  return (
    <main>
      <RequestForm />
    </main>
  );
}
