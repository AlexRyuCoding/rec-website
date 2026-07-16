"use client";
import ScrollFillText from "@/components/motion/scroll-fill-text";
import Reveal from "@/components/motion/reveal";

export default function Mission() {
  return (
    <section className="px-4 py-24 lg:px-8 lg:py-48">
      <p className="mb-8 text-sm font-medium text-cream/50">Our promise:</p>
      <ScrollFillText
        className="max-w-5xl font-serif text-heading text-cream"
        text="For over 25 years, our family-run clinic has helped Burbank restore balance, reduce pain, and reconnect with the body's natural healing process — with care, respect, and clinical expertise."
      />
      <Reveal className="mt-10 flex items-center gap-4">
        <span className="rounded-full border border-cream/15 px-5 py-2 text-sm font-bold text-gold">
          25+ years
        </span>
        <span className="rounded-full border border-cream/15 px-5 py-2 text-sm font-bold text-cream">
          Family-run since 1997
        </span>
      </Reveal>
    </section>
  );
}
