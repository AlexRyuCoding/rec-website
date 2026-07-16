"use client";
import { useState } from "react";
import FormField from "@/components/ui/form-field";

const INITIAL = {
  name: "",
  email: "",
  phone: "",
  subject: "",
  message: "",
  company: "",
};

export default function GrievanceForm() {
  const [formData, setFormData] = useState(INITIAL);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/grievance-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setStatus({ kind: "sent" });
        setFormData(INITIAL);
      } else {
        setStatus({
          kind: "error",
          message:
            data?.error ?? "Failed to submit grievance. Please try again.",
        });
      }
    } catch {
      setStatus({
        kind: "error",
        message: "Something went wrong. Please try again.",
      });
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (status.kind === "error") setStatus({ kind: "idle" });
  };

  return (
    <section className="px-4 pb-24 pt-28 lg:px-8 lg:pb-40">
      <div className="mx-auto max-w-2xl rounded-card bg-island p-8 text-ink lg:p-14">
        <h1 className="font-serif text-title">
          Submit a <i>grievance</i>
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink/60">
          We take every concern seriously. Contact details are optional — share
          them if you&apos;d like a response.
        </p>

        {status.kind === "sent" ? (
          <div
            role="status"
            className="mt-10 rounded-chip bg-surface p-6 text-cream"
          >
            <p className="font-serif text-card">Received.</p>
            <p className="mt-2 text-sm text-cream/70">
              Your grievance has been submitted. We will review your issue(s)
              and get back to you soon.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-4">
            <FormField
              id="name"
              name="name"
              label="Name"
              value={formData.name}
              onChange={handleChange}
            />
            <FormField
              id="email"
              name="email"
              label="Email"
              type="email"
              value={formData.email}
              onChange={handleChange}
            />
            <FormField
              id="phone"
              name="phone"
              label="Phone number"
              type="tel"
              value={formData.phone}
              onChange={handleChange}
            />
            <FormField
              id="subject"
              name="subject"
              label="Subject"
              value={formData.subject}
              onChange={handleChange}
              required
            />
            <FormField
              id="message"
              name="message"
              label="Detailed description"
              textarea
              rows={7}
              value={formData.message}
              onChange={handleChange}
              required
            />

            <div
              aria-hidden
              className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden"
            >
              <label htmlFor="g-company">Company</label>
              <input
                type="text"
                id="g-company"
                name="company"
                value={formData.company}
                onChange={handleChange}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            {status.kind === "error" && (
              <p role="alert" className="text-sm text-error">
                {status.message}
              </p>
            )}

            <button
              type="submit"
              disabled={status.kind === "sending"}
              className="mt-2 inline-block w-fit rounded-full bg-surface px-8 py-4 text-sm font-bold leading-none text-cream transition-opacity disabled:opacity-50"
            >
              {status.kind === "sending" ? "Submitting…" : "Submit Grievance"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
