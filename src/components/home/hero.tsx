"use client";
import Link from "next/link";
import SplitReveal from "@/components/motion/split-reveal";
import Reveal from "@/components/motion/reveal";
import Parallax from "@/components/motion/parallax";
import PillLink from "@/components/ui/pill-link";
import { SITE } from "@/lib/site";

export default function Hero() {
  return (
    <section className="flex min-h-svh flex-col justify-end px-4 pb-8 pt-28 lg:px-8 lg:pb-12">
      <SplitReveal
        as="h1"
        className="font-serif text-display text-cream"
        segments={[
          { text: "Restore balance," },
          { text: "heal" },
          { text: "naturally.", italic: true },
        ]}
      />
      <div className="mt-10 flex flex-col gap-8 lg:mt-16 lg:flex-row lg:items-end lg:justify-between">
        <Reveal delay={0.3} className="max-w-sm">
          <p className="text-base leading-relaxed text-cream/60">
            At Ryu Acupuncture Clinic, we blend the wisdom of Traditional
            Chinese Medicine with compassionate, personalized care to promote
            integrated health, energy, and vitality.
          </p>
          <div className="mt-6 flex items-center gap-6">
            <PillLink href={SITE.bookingUrl} external>
              Book Now
            </PillLink>
            <Link
              href="/request-an-appointment"
              className="underline-link text-sm font-medium text-cream"
            >
              First visit? Start here
            </Link>
          </div>
        </Reveal>
        <Reveal delay={0.15} className="lg:w-[42%]">
          <div className="media-ramp">
            <Parallax
              src="/acupuncture-treatment.jpg"
              alt="Acupuncture treatment at Ryu Acupuncture Clinic"
              className="aspect-[4/3] rounded-card"
              sizes="(min-width: 1024px) 42vw, 100vw"
              priority
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
