"use client";

import Link from "next/link";

export default function RequestAnAppointment() {
  return (
    <div className="max-w-6xl mx-auto mt-40 px-6 pb-16 space-y-12">
      <main className="flex flex-col gap-4 max-w-4xl mx-auto">
        <section className="max-w-4xl mx-auto pb-10 space-y-10">
          <p className="text-3xl font-semibold">
            Personalized Healing Starts Here
          </p>

          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-semibold">New to Our Clinic?</h2>
              <p className="mt-2 text-lg">
                Welcome—you&apos;re in great hands. Your first visit includes a
                full health intake, pulse and tongue diagnosis, and a customized
                treatment plan.
              </p>
              <ul className="list-disc list-inside mt-4 space-y-1 text-base">
                <li>Holistic intake and assessment</li>
                <li>Personalized treatment session</li>
                <li>Plenty of time for your questions</li>
              </ul>
              <Link
                href="/request-an-appointment/request-form"
                className="inline-block mt-4 px-6 py-2 bg-brand-primary text-white font-semibold rounded-lg hover:bg-blue-500 transition"
              >
                Request Your First Appointment
              </Link>
            </div>

            <div>
              <h2 className="text-2xl font-semibold">
                Returning or Existing Patient?
              </h2>
              <p className="mt-2 text-lg">
                We&apos;re glad to have you back. Follow-up sessions help
                maintain your results and support your ongoing wellness journey.
                <br />
                Sign in and book your appointment below.
              </p>
              <a
                href="https://patient.unifiedpractice.com/ryu-acupuncture"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 px-6 py-2 bg-brand-primary text-white font-semibold rounded-lg hover:bg-blue-500 transition"
              >
                Book Your Follow-Up Visit
              </a>
            </div>

            <div className="text-lg border-t pt-6 space-y-4">
              <h2 className="text-xl font-semibold">Clinic Hours & Location</h2>
              <div>
                <div className="flex items-start gap-2">
                  <strong>Hours:</strong>{" "}
                  <div>
                    Monday, Wednesday, Friday: 9:30 AM - 5:00 PM
                    <br />
                    Saturday: 9:00 AM - 1:00 PM
                  </div>
                </div>
              </div>
              <div>
                <strong>Address:</strong> 3808 W Riverside Dr., Burbank, CA
                91505
              </div>
              <a
                href="https://www.google.com/maps/dir/?api=1&destination=3808+West+Riverside+Dr+Burbank+CA+91505"
                className="text-brand-primary underline hover:text-brand-secondary"
                target="_blank"
                rel="noopener noreferrer"
              >
                Get Directions
              </a>
              <p className="mt-2">
                <strong>Phone:</strong>{" "}
                <a href="tel:818-841-9790" className="hover:underline">
                  (818) 841-9790
                </a>
              </p>
            </div>

            <div className="text-center border-t pt-6">
              <p className="text-lg">
                Have questions before you book?{" "}
                <a
                  href="#"
                  className="text-brand-primary underline hover:text-brand-secondary"
                >
                  Contact us here
                </a>
                .
              </p>
              <a
                href="https://patient.unifiedpractice.com/ryu-acupuncture"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 px-6 py-2 bg-brand-primary text-white font-semibold rounded-lg hover:bg-blue-500 transition"
              >
                Book an Appointment With Us Today!
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
