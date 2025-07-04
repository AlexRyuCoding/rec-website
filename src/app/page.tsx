"use client";
import Image from "next/image";
import Link from "next/link";
import Testimonials from "@/components/testimonials";

export default function Home() {
  return (
    <section className="max-w-6xl mx-auto mt-40 px-6 pb-16 space-y-12">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
          Restore Balance. Heal Naturally.
        </h1>
        <p className="text-lg sm:text-xl max-w-3xl mx-auto">
          At Ryu Acupuncture Clinic, we blend the wisdom of Traditional Chinese
          Medicine with compassionate, personalized care to promote integrated
          health, energy, and vitality.
        </p>
        <Link
          href="/request-an-appointment"
          className="mt-4 inline-block px-8 py-3 bg-brand-primary text-white text-lg font-semibold rounded-lg hover:bg-brand-secondary transition"
        >
          Request an Appointment
        </Link>
      </div>

      {/* About Us */}
      <div className="grid sm:grid-cols-2 gap-10 items-center">
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">
            Your Partner in Holistic Healing
          </h2>
          <p>
            Since 1997, Ryu Acupuncture Clinic has been a trusted provider of
            Traditional Chinese Medicine in Burbank, CA. Our experienced team
            offers acupuncture, herbal therapy, and whole-body treatments to
            help you restore balance, reduce pain, and enhance your well-being.
          </p>
          <p>
            As a family-run practice, we take pride in providing a welcoming
            environment where each patient is treated with care, respect, and
            clinical expertise.
          </p>
          <Link
            href="/about"
            className="text-brand-primary font-medium hover:underline"
          >
            Learn more about our clinic →
          </Link>
        </div>
        <div>
          <Image
            src="/dr-jay-ryu-profile.png"
            alt="Dr. Jay Ryu at Ryu Acupuncture Clinic"
            className="w-full rounded-lg shadow-lg object-cover"
            width={1000}
            height={1000}
          />
        </div>
      </div>

      {/* Services Section */}
      <div className="space-y-6 text-center">
        <h2 className="text-2xl font-semibold">Our Specialties</h2>
        <p className="max-w-2xl mx-auto">
          We offer a full range of Traditional Chinese Medicine (TCM) therapies
          to treat chronic and acute conditions—while restoring your body&apos;s
          natural harmony.
        </p>
        <div className="grid sm:grid-cols-3 gap-6 text-left">
          <div className="bg-brand-muted dark:bg-gray-600 p-6 rounded-xl shadow-xl">
            <h3 className="font-semibold text-lg">
              Acupuncture & Electroacupuncture
            </h3>
            <p className="text-sm mt-2">
              Stimulate healing, reduce inflammation, and ease pain naturally.
            </p>
          </div>
          <div className="bg-brand-muted dark:bg-gray-600 p-6 rounded-xl shadow-xl">
            <h3 className="font-semibold text-lg">
              Herbal Medicine & Supplements
            </h3>
            <p className="text-sm mt-2">
              Customized herbal formulas to restore balance and improve internal
              health.
            </p>
          </div>
          <div className="bg-brand-muted dark:bg-gray-600 p-6 rounded-xl shadow-xl">
            <h3 className="font-semibold text-lg">
              Fertility & Women&apos;s Health
            </h3>
            <p className="text-sm mt-2">
              Gentle, natural support for fertility, menstrual health, and
              hormone balance.
            </p>
          </div>
        </div>
        <Link
          href="/services"
          className="mt-4 inline-block px-6 py-2 bg-brand-secondary text-white font-semibold rounded-lg hover:bg-brand-primary transition"
        >
          Explore All Services
        </Link>
      </div>

      {/* Patient Testimonials */}
      <Testimonials />

      {/* CTA Section */}
      <div className="text-center border-t pt-10">
        <h2 className="text-2xl font-semibold">Ready to Feel Better?</h2>
        <p className="mt-2">
          Whether you&apos;re seeking relief from pain, improving fertility, or
          starting a new chapter of wellness—we&apos;re here for you.
        </p>
        <Link
          href="/request-an-appointment"
          className="mt-4 inline-block px-8 py-3 bg-brand-primary text-white font-semibold rounded-lg hover:bg-brand-secondary transition"
        >
          Request Your Appointment Today
        </Link>
      </div>
    </section>
  );
}
