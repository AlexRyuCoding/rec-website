import type { Metadata } from "next";
import SplitReveal from "@/components/motion/split-reveal";
import Reveal from "@/components/motion/reveal";
import PillLink from "@/components/ui/pill-link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Request an Appointment",
  description:
    "New patients: request your first appointment. Returning patients: book your follow-up visit online with Ryu Acupuncture Clinic in Burbank, CA.",
};

const FIRST_VISIT = [
  "Holistic intake and assessment",
  "Pulse and tongue diagnosis",
  "Personalized treatment session",
  "Plenty of time for your questions",
];

export default function RequestAnAppointment() {
  return (
    <main>
      <section className="flex min-h-[60svh] flex-col justify-end px-4 pb-12 pt-28 lg:px-8">
        <p className="mb-6 text-sm font-medium text-cream/50">Appointments:</p>
        <SplitReveal
          as="h1"
          className="max-w-6xl font-serif text-display text-cream"
          segments={[
            { text: "Personalized healing" },
            { text: "starts here.", italic: true },
          ]}
        />
      </section>

      <section className="px-4 pb-16 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Reveal className="rounded-card bg-island p-8 text-ink lg:p-12">
            <h2 className="font-serif text-title">
              New to <i>our clinic?</i>
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-ink/70">
              Welcome—you&apos;re in great hands. Your first visit includes a
              full health intake, pulse and tongue diagnosis, and a customized
              treatment plan.
            </p>
            <ul className="mt-6">
              {FIRST_VISIT.map((f) => (
                <li
                  key={f}
                  className="border-t py-3 text-sm text-ink/70"
                  style={{ borderColor: "var(--hairline-on-light)" }}
                >
                  {f}
                </li>
              ))}
            </ul>
            <PillLink
              href="/request-an-appointment/request-form"
              variant="dark"
              className="mt-8"
            >
              Request Your First Appointment
            </PillLink>
          </Reveal>

          <Reveal
            delay={0.15}
            className="rounded-card bg-surface p-8 text-cream lg:p-12"
          >
            <h2 className="font-serif text-title">
              Returning <i>patient?</i>
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-cream/70">
              We&apos;re glad to have you back. Follow-up sessions help maintain
              your results and support your ongoing wellness journey. Book your
              appointment online below.
            </p>
            <PillLink href={SITE.bookingUrl} external className="mt-8">
              Book Your Follow-Up Visit
            </PillLink>
            <p className="mt-6 text-sm text-cream/50">
              Prefer to call?{" "}
              <a href={SITE.phone.href} className="underline-link text-cream">
                {SITE.phone.display}
              </a>
            </p>
          </Reveal>
        </div>
      </section>

      <section className="px-4 pb-24 lg:px-8 lg:pb-40">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold text-cream/50">Hours</p>
            {SITE.hours.map((h) => (
              <p key={h.days} className="text-sm text-cream/70">
                {h.days} · {h.time}
              </p>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold text-cream/50">Location</p>
            <p className="max-w-xs text-sm text-cream/70">
              {SITE.address.line}
            </p>
            <a
              href={SITE.address.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-link w-fit text-sm text-cream"
            >
              Get directions
            </a>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold text-cream/50">Phone</p>
            <a
              href={SITE.phone.href}
              className="underline-link w-fit font-serif text-card text-cream"
            >
              {SITE.phone.display}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
