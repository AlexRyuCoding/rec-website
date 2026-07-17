"use client";
import Link from "next/link";
import SplitReveal from "@/components/motion/split-reveal";
import Reveal from "@/components/motion/reveal";
import PillLink from "@/components/ui/pill-link";
import { SITE } from "@/lib/site";

export default function PreFooterCta() {
  return (
    <section className="px-4 py-24 text-center lg:px-8 lg:py-48">
      <SplitReveal
        as="h2"
        className="mx-auto max-w-5xl font-serif text-display text-cream"
        segments={[
          { text: "Ready to" },
          { text: "feel better?", italic: true },
        ]}
      />
      <Reveal delay={0.2} className="mt-10 flex flex-col items-center gap-4">
        <PillLink href={SITE.bookingUrl} external variant="gold">
          Book Now
        </PillLink>
        <p className="text-sm text-cream/50">
          New patient?{" "}
          <Link
            href="/request-an-appointment"
            className="underline-link text-cream"
          >
            Request your first appointment
          </Link>
        </p>
      </Reveal>
    </section>
  );
}
