"use client";
import Reveal from "@/components/motion/reveal";
import Parallax from "@/components/motion/parallax";
import SplitReveal from "@/components/motion/split-reveal";
import PillLink from "@/components/ui/pill-link";

export default function DoctorBand() {
  return (
    <section className="px-4 py-12 lg:px-8">
      <div className="rounded-card bg-island px-6 py-16 text-ink lg:px-16 lg:py-24">
        <SplitReveal
          as="h2"
          className="font-serif text-title"
          segments={[
            { text: "Your partner in" },
            { text: "holistic healing.", italic: true },
          ]}
        />
        <div className="mt-12 flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <Reveal className="lg:w-[38%]">
            <Parallax
              src="/dr-jay-ryu-profile.png"
              alt="Dr. Jay Ryu at Ryu Acupuncture Clinic"
              className="aspect-[0.8] rounded-chip"
              sizes="(min-width: 1024px) 38vw, 100vw"
            />
          </Reveal>
          <Reveal delay={0.15} className="flex max-w-md flex-col gap-6">
            <p className="font-serif text-card">Dr. Jay J. Ryu, L.Ac., Ph.D.</p>
            <p className="leading-relaxed text-ink/70">
              For over 25 years, Ryu Acupuncture Clinic has been a trusted
              provider of Traditional Chinese Medicine in Burbank, CA. Our
              experienced team offers acupuncture, herbal therapy, and
              whole-body treatments to help you restore balance, reduce pain,
              and enhance your well-being.
            </p>
            <p className="leading-relaxed text-ink/70">
              As a family-run practice, we take pride in providing a welcoming
              environment where each patient is treated with care, respect, and
              clinical expertise.
            </p>
            <PillLink href="/about" variant="dark" className="w-fit">
              About the clinic
            </PillLink>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
