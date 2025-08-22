"use client";

import Image from "next/image";
import Link from "next/link";

export default function Page() {
  return (
    <section className="max-w-5xl mt-32 mx-auto px-6 py-16 space-y-16 dark:text-gray-100">
      <div className="space-y-6">
        <h1 className="text-4xl font-bold text-center">
          About Ryu Acupuncture Clinic
        </h1>
        <p className="text-lg text-center max-w-3xl mx-auto">
          <strong>
            Healing That Honors Tradition. Care That Feels Like Family.
          </strong>
        </p>
        <p className="text-lg leading-relaxed">
          Since opening our doors in <strong>1997</strong>, Ryu Acupuncture
          Clinic has grown into one of Burbank&apos;s most trusted holistic
          healing centers. What began as a small, family-run clinic has become a
          community cornerstone—offering compassionate, results-driven care
          rooted in the wisdom of Traditional Chinese Medicine (TCM).
        </p>
        <p className="text-lg leading-relaxed">
          Over the years, we&apos;ve helped thousands of patients reduce pain,
          restore balance, and reconnect with their body&apos;s natural healing
          process. Our mission remains simple: to provide exceptional care with
          heart, skill, and respect.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-10 items-center">
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">
            Meet Dr. Jay J. Ryu, L.Ac., Ph.D.
          </h2>
          <p className="text-lg">
            With nearly <strong>30 years of clinical experience</strong>, Dr.
            Jay J. Ryu brings deep expertise and a patient-first philosophy to
            every treatment. His background blends academic excellence with
            cultural wisdom, making him a highly respected practitioner in the
            field of Eastern medicine.
          </p>
          <ul className="list-disc list-inside space-y-1 text-base">
            <li>Ph.D. in Oriental Medicine – Yuin University</li>
            <li>
              Master&apos;s in Traditional Oriental Medicine – Dongguk Royal
              University
            </li>
            <li>Former Professor – Dongguk Royal University</li>
            <li>Core Member – Hongik Oriental Medical Association</li>
            <li>Instructor – Acupuncturist Continuing Education Programs</li>
          </ul>
          <p className="text-lg">
            Dr. Ryu is fluent in both English and Korean, and is especially
            known for his compassionate approach and ability to treat complex
            cases with clarity and care.
          </p>
        </div>
        <div className="flex items-center justify-center w-full">
          <Image
            src="/dr-jay-ryu-profile.png"
            alt="Dr. Jay Ryu profile picture"
            title="Profile photo of Dr. Jay Ryu"
            width="400"
            height="400"
            priority={true}
            className="rounded-3xl shadow-2xl"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-center">
          Areas of Specialty
        </h2>
        <ul className="grid sm:grid-cols-2 gap-4 text-base list-disc list-inside max-w-3xl mx-auto">
          <li>Infertility & Women&apos;s Health</li>
          <li>Allergy & Asthma Relief</li>
          <li>Back, Neck & Joint Pain Management</li>
          <li>Hormonal Imbalance & Stress Support</li>
        </ul>
        <div className="w-full flex justify-center py-6 ">
          <Image
            src="/dr-jay-ryu-candid-office.jpg"
            alt="Dr. Jay J. Ryu, L.Ac., Ph.D."
            className="w-full rounded-xl shadow-lg object-cover"
            width={1200}
            height={1200}
          />
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Our Philosophy</h2>
        <p className="text-lg leading-relaxed">
          We believe true healing happens when expertise meets empathy. At Ryu
          Acupuncture Clinic, every treatment plan is custom-tailored to support
          the whole person—not just the symptoms. We take time to listen,
          diagnose thoughtfully, and treat holistically.
        </p>
        <p className="text-lg leading-relaxed">
          Our team uses the ancient principles of TCM alongside a modern
          understanding of the body to restore harmony, prevent illness, and
          support lifelong wellness.
        </p>
        <div className="w-full flex justify-center py-6 gap-4">
          <Image
            aria-hidden
            src="/pic-w-pt.jpg"
            alt="Dr. Ryu with his patients"
            title="Dr. Ryu with his patients"
            width={400}
            height={400}
            className="rounded-3xl shadow-2xl"
          />
          <Image
            aria-hidden
            src="/pic-w-pt2.jpg"
            alt="Dr. Ryu with his patients"
            title="Dr. Ryu with his patients"
            width={500}
            height={400}
            className="rounded-3xl shadow-2xl"
          />
        </div>
      </div>

      <h2 className="text-2xl font-semibold">
        ✨ What Makes Our Clinic Unique?
      </h2>
      <ul className="text-lg list-disc list-inside space-y-1">
        <li>✅ Over 25 years of clinical experience</li>
        <li>✅ Fully personalized treatment plans</li>
        <li>✅ Warm, clean, and peaceful clinic space</li>
        <li>✅ Collaborative, integrative approach</li>
      </ul>

      <div className="text-center border-t pt-10">
        <h2 className="text-2xl font-semibold">A Legacy of Healing</h2>
        <p className="mt-2 text-lg max-w-xl mx-auto">
          Whether you&apos;re beginning your journey toward wellness or
          continuing a path of healing, our team is here to support you every
          step of the way.
        </p>
        <Link
          href="/request-an-appointment"
          className="mt-4 inline-block px-8 py-3 bg-brand-primary text-white font-semibold rounded-lg hover:bg-brand-secondary transition"
        >
          Request an Appointment
        </Link>
      </div>
    </section>
  );
}
