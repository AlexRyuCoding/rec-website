import type { Metadata } from "next";
import SplitReveal from "@/components/motion/split-reveal";
import Reveal from "@/components/motion/reveal";
import Parallax from "@/components/motion/parallax";
import PillLink from "@/components/ui/pill-link";

export const metadata: Metadata = {
  title: "About",
  description:
    "Family-run acupuncture clinic in Burbank since 1997. Meet Dr. Jay J. Ryu, L.Ac., Ph.D. — nearly 30 years of clinical experience in Traditional Chinese Medicine.",
};

const CREDENTIALS = [
  "Ph.D. in Oriental Medicine – Yuin University",
  "Master's in Traditional Oriental Medicine – Dongguk Royal University",
  "Former Professor – Dongguk Royal University",
  "Core Member – Hongik Oriental Medical Association",
  "Instructor – Acupuncturist Continuing Education Programs",
];

const UNIQUE = [
  "Over 25 years of clinical experience",
  "Fully personalized treatment plans",
  "Warm, clean, and peaceful clinic space",
  "Collaborative, integrative approach",
];

const SPECIALTIES = [
  "Infertility & Women's Health",
  "Allergy & Asthma Relief",
  "Back, Neck & Joint Pain Management",
  "Hormonal Imbalance & Stress Support",
];

export default function About() {
  return (
    <main>
      <section className="flex min-h-[70svh] flex-col justify-end px-4 pb-12 pt-28 lg:px-8">
        <p className="mb-6 text-sm font-medium text-cream/50">About us:</p>
        <SplitReveal
          as="h1"
          className="max-w-6xl font-serif text-display text-cream"
          segments={[
            { text: "Healing that honors" },
            { text: "tradition.", italic: true },
          ]}
        />
        <Reveal delay={0.3} className="mt-10 max-w-md">
          <p className="leading-relaxed text-cream/60">
            Since opening our doors in 1997, Ryu Acupuncture Clinic has grown
            into one of Burbank&apos;s most trusted holistic healing centers.
            What began as a small, family-run clinic has become a community
            cornerstone—offering compassionate, results-driven care rooted in
            the wisdom of Traditional Chinese Medicine.
          </p>
          <p className="mt-6 leading-relaxed text-cream/60">
            Over the years, we&apos;ve helped thousands of patients reduce pain,
            restore balance, and reconnect with their body&apos;s natural
            healing process. Our mission remains simple: to provide exceptional
            care with heart, skill, and respect.
          </p>
        </Reveal>
      </section>

      <section className="px-4 py-12 lg:px-8">
        <div className="rounded-card bg-island px-6 py-16 text-ink lg:px-16 lg:py-24">
          <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
            <Reveal className="lg:w-[38%]">
              <Parallax
                src="/dr-jay-ryu-profile.png"
                alt="Dr. Jay Ryu profile picture"
                className="aspect-[0.8] rounded-chip"
                sizes="(min-width: 1024px) 38vw, 100vw"
              />
            </Reveal>
            <div className="flex max-w-lg flex-col gap-6">
              <h2 className="font-serif text-title">
                Meet Dr. Jay J. Ryu, <i>L.Ac., Ph.D.</i>
              </h2>
              <p className="leading-relaxed text-ink/70">
                With nearly 30 years of clinical experience, Dr. Jay J. Ryu
                brings deep expertise and a patient-first philosophy to every
                treatment. His background blends academic excellence with
                cultural wisdom, making him a highly respected practitioner in
                the field of Eastern medicine.
              </p>
              <ul>
                {CREDENTIALS.map((c) => (
                  <li
                    key={c}
                    className="border-t py-3 text-sm text-ink/70"
                    style={{ borderColor: "var(--hairline-on-light)" }}
                  >
                    {c}
                  </li>
                ))}
              </ul>
              <p className="leading-relaxed text-ink/70">
                Dr. Ryu is fluent in both English and Korean, and is especially
                known for his compassionate approach and ability to treat
                complex cases with clarity and care.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-24 lg:px-8 lg:py-40">
        <Reveal>
          <h2 className="max-w-4xl font-serif text-title text-cream">
            Our <i>philosophy</i>
          </h2>
          <p className="mt-8 max-w-md leading-relaxed text-cream/60">
            We believe true healing happens when expertise meets empathy. Every
            treatment plan is custom-tailored to support the whole person—not
            just the symptoms. We take time to listen, diagnose thoughtfully,
            and treat holistically.
          </p>
          <p className="mt-4 max-w-md leading-relaxed text-cream/60">
            Our team uses the ancient principles of TCM alongside a modern
            understanding of the body to restore harmony, prevent illness, and
            support lifelong wellness.
          </p>
        </Reveal>
        <div className="mt-16 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Reveal className="media-ramp">
            <Parallax
              src="/pic-w-pt.jpg"
              alt="Dr. Ryu treating a patient"
              className="aspect-[4/3] rounded-card"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </Reveal>
          <Reveal delay={0.15} className="media-ramp">
            <Parallax
              src="/pic-w-pt2.jpg"
              alt="Dr. Ryu with a longtime patient"
              className="aspect-[4/3] rounded-card"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </Reveal>
        </div>
      </section>

      <section className="px-4 py-24 lg:px-8 lg:py-40">
        <Reveal>
          <h2 className="max-w-4xl font-serif text-title text-cream">
            Areas of <i>specialty</i>
          </h2>
        </Reveal>
        <ul className="mt-16 max-w-3xl">
          {SPECIALTIES.map((s) => (
            <li
              key={s}
              className="border-t py-6 font-serif text-card text-cream"
              style={{ borderColor: "var(--hairline-on-dark)" }}
            >
              {s}
            </li>
          ))}
        </ul>
        <Reveal className="mt-16 media-ramp">
          <Parallax
            src="/dr-jay-ryu-candid-office.jpg"
            alt="Dr. Jay J. Ryu at work in his Burbank office"
            className="aspect-[4/3] rounded-card"
            sizes="100vw"
          />
        </Reveal>
      </section>

      <section className="px-4 pb-24 lg:px-8 lg:pb-40">
        <p className="mb-6 text-sm font-medium text-cream/50">
          What makes our clinic unique:
        </p>
        <ul className="max-w-3xl">
          {UNIQUE.map((u, i) => (
            <li
              key={u}
              className="flex items-baseline gap-6 border-t py-6 font-serif text-card text-cream"
              style={{ borderColor: "var(--hairline-on-dark)" }}
            >
              <span className="text-sm text-gold">0{i + 1}</span>
              {u}
            </li>
          ))}
        </ul>
        <Reveal className="mt-16">
          <p className="max-w-md leading-relaxed text-cream/60">
            Whether you&apos;re beginning your journey toward wellness or
            continuing a path of healing, our team is here to support you every
            step of the way.
          </p>
          <PillLink href="/request-an-appointment" className="mt-6">
            Request an Appointment
          </PillLink>
        </Reveal>
      </section>
    </main>
  );
}
