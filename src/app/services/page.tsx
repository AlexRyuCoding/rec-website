import type { Metadata } from "next";
import SplitReveal from "@/components/motion/split-reveal";
import Reveal from "@/components/motion/reveal";
import Parallax from "@/components/motion/parallax";
import PillLink from "@/components/ui/pill-link";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Acupuncture, electroacupuncture, Chinese herbal medicine, moxibustion, cupping, and nutritional support in Burbank, CA.",
};

const OFFERINGS = [
  {
    name: "Acupuncture & Electroacupuncture",
    copy: "Targeted needle therapy to stimulate healing, relieve pain, and improve circulation.",
  },
  {
    name: "Auriculotherapy",
    copy: "Ear acupuncture for nervous system regulation, detox, and chronic conditions.",
  },
  {
    name: "Herbal Medicine",
    copy: "Custom-formulated herbal prescriptions to balance internal systems and support immunity.",
  },
  {
    name: "Moxibustion & Cupping",
    copy: "Traditional therapies that boost circulation and reduce inflammation.",
  },
  {
    name: "Heat Therapy",
    copy: "Targeted warming treatments for muscle tension, chronic pain, and stagnation.",
  },
  {
    name: "Nutritional Supplements",
    copy: "Holistic guidance with high-quality supplements to optimize health from within.",
  },
];

const FAQ = [
  {
    q: "How many acupuncture sessions do I need?",
    a: "Acute conditions may improve in 4–6 sessions. Chronic issues often require a longer treatment plan.",
  },
  {
    q: "Can I combine acupuncture with Western treatments?",
    a: "Absolutely. Acupuncture often complements conventional medicine and may reduce medication dependency.",
  },
  {
    q: "Are there side effects?",
    a: "Mild side effects are rare — typically light bruising or soreness. Herbal prescriptions are personalized for safety.",
  },
  {
    q: "What's included in a first visit?",
    a: "We'll perform a full health intake, check tongue and pulse, then begin acupuncture or design your custom herbal plan.",
  },
  {
    q: "Do you take insurance?",
    a: "Many PPO plans do cover acupuncture. We'll provide a superbill or help verify your benefits.",
  },
];

const ACU_TREATS = [
  "Back, neck, joint pain, migraines, arthritis",
  "Anxiety, depression, insomnia, stress",
  "Fertility, menstrual pain, PMS, menopause",
  "IBS, bloating, acid reflux",
  "Asthma, allergies, sinus congestion",
  "Long-COVID, fatigue, burnout",
  "Injury rehab, post-surgery recovery",
];

const HERB_TREATS = [
  "Hormonal imbalances, fertility, menopause",
  "Skin conditions: eczema, acne, psoriasis",
  "Digestive issues and sensitivities",
  "Chronic fatigue, stress, insomnia",
  "Cold/flu immunity and recovery",
  "Fibromyalgia, autoimmune support",
];

function TreatList({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((t) => (
        <li
          key={t}
          className="border-t py-3 text-sm text-cream/70"
          style={{ borderColor: "var(--hairline-on-dark)" }}
        >
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function Services() {
  return (
    <main>
      <section className="flex min-h-[70svh] flex-col justify-end px-4 pb-12 pt-28 lg:px-8">
        <p className="mb-6 text-sm font-medium text-cream/50">Our services:</p>
        <SplitReveal
          as="h1"
          className="max-w-6xl font-serif text-display text-cream"
          segments={[
            { text: "Two foundations," },
            { text: "one goal —" },
            { text: "your health.", italic: true },
          ]}
        />
        <Reveal delay={0.3} className="mt-10 max-w-md">
          <p className="leading-relaxed text-cream/60">
            We focus on two foundational services: acupuncture and Chinese
            herbal medicine. These natural therapies have helped thousands of
            patients manage pain, reduce stress, boost immunity, and regain
            energy — all without dependency on pharmaceuticals.
          </p>
        </Reveal>
      </section>

      <section className="px-4 py-16 lg:px-8 lg:py-24">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div className="lg:w-[45%]">
            <h2 className="font-serif text-title text-cream">
              Acupuncture: restoring balance <i>through the needle.</i>
            </h2>
            <p className="mt-6 max-w-md leading-relaxed text-cream/60">
              Acupuncture is the practice of inserting very thin, sterile
              needles into specific points along the body&apos;s energy pathways
              (called meridians). This stimulates the body&apos;s innate ability
              to heal, regulate internal systems, and reduce pain. Most people
              feel minimal to no pain — sensations are often described as
              tingling, warmth, or a calming heaviness, and many patients fall
              asleep during treatment.
            </p>
            <p className="mb-2 mt-8 text-sm font-bold text-cream">
              What can acupuncture treat?
            </p>
            <TreatList items={ACU_TREATS} />
          </div>
          <Reveal className="media-ramp lg:w-1/2">
            <Parallax
              src="/acupuncture-treatment.jpg"
              alt="Acupuncture treatment"
              className="aspect-[4/5] rounded-card lg:aspect-[4/3]"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </Reveal>
        </div>
      </section>

      <section className="px-4 py-16 text-center lg:px-8 lg:py-24">
        <Reveal>
          <h2 className="mx-auto max-w-2xl font-serif text-heading text-cream">
            Meet with one of our <i>acupuncturists.</i>
          </h2>
          <p className="mx-auto mt-6 max-w-md leading-relaxed text-cream/60">
            The best way for us to get to know you and what you are coming for
            is through a comprehensive consultation and treatment.
          </p>
          <PillLink href="/request-an-appointment" className="mt-6">
            Set Up Your Appointment Today
          </PillLink>
        </Reveal>
      </section>

      <section className="px-4 py-16 lg:px-8 lg:py-24">
        <div className="flex flex-col gap-10 lg:flex-row-reverse lg:items-start lg:justify-between">
          <div className="lg:w-[45%]">
            <h2 className="font-serif text-title text-cream">
              Herbal medicine: custom formulas for <i>deep healing.</i>
            </h2>
            <p className="mt-6 max-w-md leading-relaxed text-cream/60">
              We use carefully selected roots, leaves, flowers, and minerals to
              create formulas tailored to your unique condition and constitution
              — in powder, pill, or tea form, based on your body type, symptoms,
              and the root cause of imbalance. We source only from
              third-party-tested, reputable suppliers. Formulas are
              custom-blended to be safe and effective.
            </p>
            <p className="mb-2 mt-8 text-sm font-bold text-cream">
              What can herbal medicine help with?
            </p>
            <TreatList items={HERB_TREATS} />
          </div>
          <Reveal className="media-ramp lg:w-1/2">
            <Parallax
              src="/herbal-medicine.jpg"
              alt="Chinese herbal medicine"
              className="aspect-[4/5] rounded-card lg:aspect-[4/3]"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </Reveal>
        </div>
      </section>

      <section className="px-4 py-16 lg:px-8 lg:py-24">
        <div className="rounded-card bg-island px-6 py-16 text-ink lg:px-16 lg:py-20">
          <h2 className="font-serif text-title">
            What we <i>offer</i>
          </h2>
          <ul className="mt-10">
            {OFFERINGS.map((o) => (
              <li
                key={o.name}
                className="flex flex-col gap-2 border-t py-6 lg:flex-row lg:items-baseline lg:justify-between"
                style={{ borderColor: "var(--hairline-on-light)" }}
              >
                <span className="font-serif text-card">{o.name}</span>
                <span className="max-w-sm text-sm text-ink/60">{o.copy}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 py-16 lg:px-8 lg:py-24">
        <h2 className="font-serif text-title text-cream">
          Common <i>questions</i>
        </h2>
        <div className="mt-10 max-w-3xl">
          {FAQ.map((f) => (
            <Reveal key={f.q}>
              <div
                className="border-t py-6"
                style={{ borderColor: "var(--hairline-on-dark)" }}
              >
                <p className="font-serif text-card text-cream">{f.q}</p>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-cream/60">
                  {f.a}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="px-4 pb-24 text-center lg:px-8 lg:pb-40">
        <Reveal>
          <h2 className="mx-auto max-w-2xl font-serif text-title text-cream">
            Ready to begin your <i>healing journey?</i>
          </h2>
          <p className="mx-auto mt-6 max-w-md leading-relaxed text-cream/60">
            Whether you&apos;re seeking pain relief, hormone balance, or overall
            well-being, acupuncture and herbal medicine offer time-tested
            solutions rooted in nature.
          </p>
          <p className="mx-auto mt-10 max-w-2xl font-serif text-heading text-cream">
            &ldquo;When you harmonize the body, the body knows{" "}
            <i>how to heal.</i>&rdquo;
          </p>
          <div className="mt-10 flex flex-col items-center gap-4">
            <PillLink href={SITE.bookingUrl} external variant="gold">
              Book a Consultation
            </PillLink>
            <Link
              href="/request-an-appointment"
              className="underline-link text-sm text-cream"
            >
              New patient? Request your first appointment
            </Link>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
