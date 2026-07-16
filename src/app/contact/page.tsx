import type { Metadata } from "next";
import SplitReveal from "@/components/motion/split-reveal";
import Reveal from "@/components/motion/reveal";
import PillLink from "@/components/ui/pill-link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact Ryu Acupuncture Clinic in Burbank, CA — phone, email, hours, and directions.",
};

export default function Contact() {
  return (
    <>
      <section className="flex min-h-[60svh] flex-col justify-end px-4 pb-12 pt-28 lg:px-8">
        <p className="mb-6 text-sm font-medium text-cream/40">Contact:</p>
        <SplitReveal
          as="h1"
          className="font-serif text-display text-cream"
          segments={[
            { text: "We're here" },
            { text: "to help.", italic: true },
          ]}
        />
      </section>

      <section className="px-4 pb-24 lg:px-8 lg:pb-40">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
          <Reveal className="flex flex-col gap-4">
            <p className="text-sm font-bold text-cream/40">Reach us</p>
            <a
              href={SITE.phone.href}
              className="underline-link w-fit font-serif text-card text-cream"
            >
              {SITE.phone.display}
            </a>
            <a
              href={`mailto:${SITE.email}`}
              className="underline-link w-fit text-cream/70"
            >
              {SITE.email}
            </a>
            <p className="text-sm text-cream/40">Fax: {SITE.fax.display}</p>
          </Reveal>

          <Reveal delay={0.1} className="flex flex-col gap-4">
            <p className="text-sm font-bold text-cream/40">Visit us</p>
            <p className="max-w-xs text-cream/70">{SITE.address.line}</p>
            <a
              href={SITE.address.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-link w-fit text-sm font-medium text-cream"
            >
              Get directions
            </a>
          </Reveal>

          <Reveal delay={0.2} className="flex flex-col gap-4">
            <p className="text-sm font-bold text-cream/40">Hours</p>
            {SITE.hours.map((h) => (
              <div
                key={h.days}
                className="border-t pt-3"
                style={{ borderColor: "var(--hairline-on-dark)" }}
              >
                <p className="text-sm text-cream">{h.days}</p>
                <p className="text-sm text-cream/50">{h.time}</p>
              </div>
            ))}
          </Reveal>
        </div>

        <Reveal className="mt-20 flex flex-col items-start gap-4">
          <PillLink href={SITE.bookingUrl} external variant="gold">
            Book an Appointment
          </PillLink>
          <p className="text-sm text-cream/40">
            Questions before you book?{" "}
            <a
              href="/request-an-appointment/request-form"
              className="underline-link text-cream"
            >
              Send us a message
            </a>
          </p>
        </Reveal>
      </section>
    </>
  );
}
