"use client";

import Image from "next/image";
import Link from "next/link";

export default function Services() {
  return (
    <div className="min-h-screen mt-40 px-4 pb-10 sm:p-10">
      <main className="flex flex-col gap-4 max-w-4xl mx-auto">
        <section className="space-y-4 text-xl pb-4">
          <p>
            At our clinic, we focus on two foundational services:{" "}
            <strong>Acupuncture</strong> and{" "}
            <strong>Chinese Herbal Medicine</strong>. These natural therapies
            have helped thousands of patients manage pain, reduce stress, boost
            immunity, and regain energy — all without dependency on
            pharmaceuticals.
          </p>
        </section>

        <section className="space-y-6 pb-10">
          <h2 className="text-3xl font-semibold">
            🌀 Acupuncture: Restoring Balance Through the Needle
          </h2>
          <div className="space-y-4">
            <p className="text-lg">
              <strong className="text-xl">What is Acupuncture?</strong> <br />
              Acupuncture is the practice of inserting very thin, sterile
              needles into specific points along the body&apos;s energy pathways
              (called <em>meridians</em>). This stimulates the body&apos;s
              innate ability to heal, regulate internal systems, and reduce
              pain.
            </p>
            <div className="flex flex-col items-center relative w-full h-[300px] sm:h-[500px] md:h-[600px]">
              <Image
                src="/acupuncture-treatment.jpg"
                alt="Acupuncture"
                title="Acupuncture"
                fill
                className="object-cover rounded-2xl"
              />
            </div>
            <p>
              <strong className="text-lg">What Can Acupuncture Treat?</strong>
            </p>
            <ul className="text-lg list-disc list-inside space-y-1">
              <li>Back, neck, joint pain, migraines, arthritis</li>
              <li>Anxiety, depression, insomnia, stress</li>
              <li>Fertility, menstrual pain, PMS, menopause</li>
              <li>IBS, bloating, acid reflux</li>
              <li>Asthma, allergies, sinus congestion</li>
              <li>Long-COVID, fatigue, burnout</li>
              <li>Injury rehab, post-surgery recovery</li>
            </ul>

            <p className="text-lg">
              <strong className="text-xl">What Does It Feel Like?</strong>{" "}
              <br />
              Most people feel minimal to no pain. Sensations are often
              described as tingling, warmth, or a calming heaviness. Many
              patients fall asleep during treatment!
            </p>
          </div>
        </section>

        <section className="space-y-4 text-center pb-10">
          <p className="text-3xl font-medium">
            Meet with our one of our Acupuncturists
          </p>
          <p className="text-lg">
            The best way for us to get to know you and what you are coming for
            is through a comprehensive consultation and treatment.
          </p>
          <Link
            href="/request-an-appointment"
            className="inline-block mt-4 px-6 py-3 bg-brand-primary text-white font-semibold rounded-lg hover:bg-brand-secondary transition"
          >
            Set Up Your Appointment Today
          </Link>
        </section>

        <section className="space-y-6 pb-10">
          <h2 className="text-3xl font-semibold">
            🌱 Chinese Herbal Medicine: Custom Formulas for Deep Healing
          </h2>
          <div className="space-y-4">
            <p className="text-lg">
              <strong className="text-xl">
                What is Chinese Herbal Medicine?
              </strong>{" "}
              <br />
              We use carefully selected roots, leaves, flowers, and minerals to
              create formulas tailored to your unique condition and
              constitution.
            </p>
            <div className="flex flex-col items-center relative w-full h-[300px] sm:h-[500px] md:h-[600px]">
              <Image
                src="/herbal-medicine.jpg"
                alt="Herbal Medicine"
                title="Herbal Medicine"
                fill
                className="object-cover rounded-2xl"
              />
            </div>
            <p className="text-lg">
              <strong className="text-xl">How Is It Prescribed?</strong> <br />
              You&apos;ll receive a personalized herbal prescription — in
              powder, pill, or tea form — based on your body type, symptoms, and
              the root cause of imbalance.
            </p>

            <p className="text-lg">
              <strong className="text-xl">
                What Can Herbal Medicine Help With?
              </strong>
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Hormonal imbalances, fertility, menopause</li>
              <li>Skin conditions: eczema, acne, psoriasis</li>
              <li>Digestive issues and sensitivities</li>
              <li>Chronic fatigue, stress, insomnia</li>
              <li>Cold/flu immunity and recovery</li>
              <li>Fibromyalgia, autoimmune support</li>
            </ul>

            <p className="text-lg">
              <strong className="text-xl">Are the Herbs Safe?</strong> <br />
              Yes. We source only from third-party-tested, reputable suppliers.
              Formulas are custom-blended to be safe and effective.
            </p>
          </div>
        </section>

        <section className="space-y-6 pb-10">
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold text-center">
              What We Offer
            </h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 text-sm">
              <div className="bg-brand-background dark:bg-brand-gray-500 p-4 rounded-lg shadow">
                <h3 className="font-semibold text-lg mb-1">
                  Acupuncture & Electroacupuncture
                </h3>
                <p>
                  Targeted needle therapy to stimulate healing, relieve pain,
                  and improve circulation.
                </p>
              </div>
              <div className="bg-brand-background dark:bg-brand-gray-500 p-4 rounded-lg shadow">
                <h3 className="font-semibold text-lg mb-1">Auriculotherapy</h3>
                <p>
                  Ear acupuncture for nervous system regulation, detox, and
                  chronic conditions.
                </p>
              </div>
              <div className="bg-brand-background dark:bg-brand-gray-500 p-4 rounded-lg shadow">
                <h3 className="font-semibold text-lg mb-1">Herbal Medicine</h3>
                <p>
                  Custom-formulated herbal prescriptions to balance internal
                  systems and support immunity.
                </p>
              </div>
              <div className="bg-brand-background dark:bg-brand-gray-500 p-4 rounded-lg shadow">
                <h3 className="font-semibold text-lg mb-1">
                  Moxibustion & Cupping
                </h3>
                <p>
                  Traditional therapies that boost circulation and reduce
                  inflammation.
                </p>
              </div>
              <div className="bg-brand-background dark:bg-brand-gray-500 p-4 rounded-lg shadow">
                <h3 className="font-semibold text-lg mb-1">Heat Therapy</h3>
                <p>
                  Targeted warming treatments for muscle tension, chronic pain,
                  and stagnation.
                </p>
              </div>
              <div className="bg-brand-background dark:bg-brand-gray-500 p-4 rounded-lg shadow">
                <h3 className="font-semibold text-lg mb-1">
                  Nutritional Supplements
                </h3>
                <p>
                  Holistic guidance with high-quality supplements to optimize
                  health from within.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6 pb-10">
          <h2 className="text-2xl font-semibold">
            🧠 Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            <div>
              <p className="font-semibold">
                Q: How many acupuncture sessions do I need?
              </p>
              <p className="text-lg">
                A: Acute conditions may improve in 4–6 sessions. Chronic issues
                often require a longer treatment plan.
              </p>
            </div>

            <div>
              <p className="font-semibold">
                Q: Can I combine acupuncture with Western treatments?
              </p>
              <p className="text-lg">
                A: Absolutely. Acupuncture often complements conventional
                medicine and may reduce medication dependency.
              </p>
            </div>

            <div>
              <p className="font-semibold">Q: Are there side effects?</p>
              <p className="text-lg">
                A: Mild side effects are rare — typically light bruising or
                soreness. Herbal prescriptions are personalized for safety.
              </p>
            </div>

            <div>
              <p className="font-semibold">
                Q: What&apos;s included in a first visit?
              </p>
              <p className="text-lg">
                A: We&apos;ll perform a full health intake, check tongue and
                pulse, then begin acupuncture or design your custom herbal plan.
              </p>
            </div>

            <div>
              <p className="font-semibold">Q: Do you take insurance?</p>
              <p className="text-lg">
                A: Many PPO plans do cover acupuncture. We&apos;ll provide a
                superbill or help verify your benefits.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4 text-center">
          <p className="text-3xl font-medium">
            Ready to Begin Your Healing Journey?
          </p>
          <p className="text-lg">
            Whether you&apos;re seeking pain relief, hormone balance, or overall
            well-being, acupuncture and herbal medicine offer time-tested
            solutions rooted in nature.
          </p>
          <p className="italic font-semibold">
            &quot;When you harmonize the body, the body knows how to heal.&quot;
          </p>

          <Link
            href="/request-an-appointment"
            className="inline-block mt-4 px-6 py-3 bg-brand-primary text-white font-semibold rounded-lg hover:bg-brand-secondary transition"
          >
            Book a Consultation
          </Link>
        </section>
      </main>
    </div>
  );
}
