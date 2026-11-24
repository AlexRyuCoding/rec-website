import type { Metadata } from "next";
import SplitReveal from "@/components/motion/split-reveal";
import { SITE } from "@/lib/site";

// The Notice of Privacy Practices HIPAA requires a clinic to give every
// new patient, post in the office and publish on its website. The text
// follows the U.S. Department of Health and Human Services model notice,
// with a short section on how this office handles information. It is
// also handed to new patients through Practice Better, with a signed
// acknowledgment of receipt; keep the two copies the same.
//
// Printed, the page is black on white without the site's header and
// footer (globals.css, @media print) — the front desk prints it from
// the browser.

export const metadata: Metadata = {
  title: "Notice of Privacy Practices",
  description:
    "How Ryu Acupuncture Clinic may use and share your health information, and your rights over it.",
};

const EFFECTIVE_DATE = "November 30, 2026";
const PRIVACY_OFFICER = "Jay Ryu";
const PRIVACY_EMAIL = "privacy@ryuacupuncture.com";

const HHS_COMPLAINTS = "https://www.hhs.gov/ocr/privacy/hipaa/complaints/";

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-14 font-serif text-title text-cream first:mt-0">
      {children}
    </h2>
  );
}

function Item({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <p className="mt-5 leading-relaxed text-cream/70">
      <strong className="font-semibold text-cream">{title}</strong> {children}
    </p>
  );
}

export default function PrivacyPractices() {
  return (
    <main className="print-notice">
      <section className="flex min-h-[50svh] flex-col justify-end px-4 pb-12 pt-28 lg:px-8">
        <p className="mb-6 text-sm font-medium text-cream/50">{SITE.name}</p>
        <SplitReveal
          as="h1"
          className="max-w-5xl font-serif text-display text-cream"
          segments={[
            { text: "Notice of" },
            { text: "Privacy Practices", italic: true },
          ]}
        />
      </section>

      <section className="px-4 pb-24 lg:px-8 lg:pb-40">
        <article className="max-w-3xl">
          <p className="text-sm text-cream/50">
            {SITE.name}, Inc. · {SITE.address.line} · {SITE.phone.display} ·{" "}
            {PRIVACY_EMAIL}
          </p>
          <p className="mt-2 text-sm text-cream/50">
            Effective date: {EFFECTIVE_DATE}
          </p>

          <p className="mt-8 border-l-2 border-cream/30 pl-5 font-semibold leading-relaxed text-cream">
            This notice describes how medical information about you may be used
            and disclosed and how you can get access to this information. Please
            review it carefully.
          </p>

          <H2>Your rights</H2>
          <p className="mt-5 leading-relaxed text-cream/70">
            You have the right to:
          </p>
          <Item title="Get a copy of your health record.">
            You can ask to see or get a copy of your health record and other
            health information we have about you. We will provide a copy or a
            summary, usually within 30 days of your request. We may charge a
            reasonable, cost-based fee.
          </Item>
          <Item title="Ask us to correct your record.">
            If you think information in your record is incorrect or incomplete,
            you can ask us to correct it. We may say no, but we will tell you
            why in writing within 60 days.
          </Item>
          <Item title="Request confidential communications.">
            You can ask us to contact you in a specific way (for example, by
            phone rather than email) or at a specific address. We will say yes
            to all reasonable requests.
          </Item>
          <Item title="Ask us to limit what we use or share.">
            You can ask us not to use or share certain health information for
            treatment, payment or our operations. We are not required to agree,
            and we may say no if it would affect your care. If you pay for a
            service in full out of pocket, you can ask us not to share
            information about that service with your health insurer for payment
            or operations, and we will agree unless the law requires us to share
            it.
          </Item>
          <Item title="Get a list of those with whom we have shared your information.">
            You can ask for a list of the times we have shared your health
            information in the six years before your request, who we shared it
            with and why. We will include all disclosures except those about
            treatment, payment and our operations, and certain others such as
            any you asked us to make. One list a year is free; we may charge a
            reasonable, cost-based fee for another within 12 months.
          </Item>
          <Item title="Get a copy of this notice.">
            You can ask for a paper copy at any time, even if you agreed to
            receive it electronically.
          </Item>
          <Item title="Choose someone to act for you.">
            If you have given someone medical power of attorney, or someone is
            your legal guardian, that person can exercise your rights and make
            choices about your health information. We will make sure the person
            has this authority before we act.
          </Item>
          <Item title="File a complaint if you feel your rights are violated.">
            You can complain to us using the contact details at the top of this
            notice. You can also file a complaint with the U.S. Department of
            Health and Human Services Office for Civil Rights, 200 Independence
            Avenue S.W., Washington, D.C. 20201, by calling 1-877-696-6775, or
            at{" "}
            <a
              href={HHS_COMPLAINTS}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-link text-cream"
            >
              www.hhs.gov/ocr/privacy/hipaa/complaints
            </a>
            . We will not retaliate against you for filing a complaint.
          </Item>

          <H2>Your choices</H2>
          <p className="mt-5 leading-relaxed text-cream/70">
            For the following, you can tell us what you would like us to do, and
            we will follow your instructions:
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-6 leading-relaxed text-cream/70">
            <li>
              sharing information with your family, close friends or others
              involved in your care;
            </li>
            <li>sharing information in a disaster relief situation.</li>
          </ul>
          <p className="mt-5 leading-relaxed text-cream/70">
            If you are not able to tell us your preference, for example if you
            are unconscious, we may share your information if we believe it is
            in your best interest, or if needed to lessen a serious and imminent
            threat to health or safety.
          </p>
          <p className="mt-5 leading-relaxed text-cream/70">
            We <strong className="font-semibold text-cream">never</strong> share
            your information for marketing purposes or sell it, and we do not
            use it for fundraising, unless you give us written permission.
          </p>

          <H2>How we use and share your health information</H2>
          <p className="mt-5 leading-relaxed text-cream/70">
            We typically use or share your health information in the following
            ways.
          </p>
          <Item title="To treat you.">
            We use your health information to provide your care and may share it
            with other professionals who treat you. For example, a doctor
            treating you for a condition may ask us about your course of
            acupuncture.
          </Item>
          <Item title="To run our clinic.">
            We use and share your information to run our practice, improve your
            care and contact you when necessary, for example to remind you of an
            appointment.
          </Item>
          <Item title="To bill for your services.">
            We use and share your health information to bill and get payment
            from health plans or other entities. For example, we give
            information about you to your health insurance plan so it will pay
            for your services.
          </Item>
          <p className="mt-8 leading-relaxed text-cream/70">
            We are also allowed or required to share your information in other
            ways, usually in ways that contribute to the public good, such as
            public health and research. We have to meet many conditions in the
            law before we can share your information for these purposes. These
            include:
          </p>
          <ul className="mt-4 list-disc space-y-3 pl-6 leading-relaxed text-cream/70">
            <li>
              <strong className="font-semibold text-cream">
                Public health and safety:
              </strong>{" "}
              preventing disease, reporting adverse reactions to products,
              reporting suspected abuse, neglect or domestic violence, and
              preventing or reducing a serious threat to anyone&apos;s health or
              safety.
            </li>
            <li>
              <strong className="font-semibold text-cream">Research,</strong>{" "}
              under conditions set by law.
            </li>
            <li>
              <strong className="font-semibold text-cream">
                Complying with the law,
              </strong>{" "}
              including showing the Department of Health and Human Services that
              we are complying with federal privacy law.
            </li>
            <li>
              <strong className="font-semibold text-cream">
                Organ and tissue donation requests,
              </strong>{" "}
              and working with a medical examiner or funeral director.
            </li>
            <li>
              <strong className="font-semibold text-cream">
                Workers&apos; compensation, law enforcement and other government
                requests,
              </strong>{" "}
              including health oversight agencies and special government
              functions such as military and national security.
            </li>
            <li>
              <strong className="font-semibold text-cream">
                Lawsuits and legal actions,
              </strong>{" "}
              in response to a court or administrative order or a subpoena.
            </li>
          </ul>

          <H2>How we handle information at the clinic</H2>
          <p className="mt-5 leading-relaxed text-cream/70">
            A few things specific to our office:
          </p>
          <ul className="mt-4 list-disc space-y-3 pl-6 leading-relaxed text-cream/70">
            <li>
              Your records are kept in Practice Better, our electronic health
              record system, which has a signed business associate agreement
              with us.
            </li>
            <li>
              Our check-in kiosk identifies you by a 4-digit PIN you choose. It
              stores your name, contact details and the time of your check-in.
            </li>
            <li>
              When your room is ready, the screen in the waiting room shows your
              first name and last initial and the room number. If you would
              prefer not to be called this way, tell the front desk and we will
              call you in person.
            </li>
            <li>
              The office is under 24-hour video surveillance for security.
            </li>
          </ul>

          <H2>Our responsibilities</H2>
          <ul className="mt-5 list-disc space-y-3 pl-6 leading-relaxed text-cream/70">
            <li>
              We are required by law to maintain the privacy and security of
              your protected health information.
            </li>
            <li>
              We will let you know promptly if a breach occurs that may have
              compromised the privacy or security of your information.
            </li>
            <li>
              We must follow the duties and privacy practices described in this
              notice and give you a copy of it.
            </li>
            <li>
              We will not use or share your information other than as described
              here unless you tell us we can in writing. If you tell us we can,
              you may change your mind at any time by letting us know in
              writing.
            </li>
          </ul>

          <H2>Changes to the terms of this notice</H2>
          <p className="mt-5 leading-relaxed text-cream/70">
            We can change the terms of this notice, and the changes will apply
            to all information we have about you. The new notice will be
            available on request, in our office and on our website at
            www.ryuacupuncture.com.
          </p>

          <H2>Questions</H2>
          <p className="mt-5 leading-relaxed text-cream/70">
            Our privacy officer is {PRIVACY_OFFICER}. Contact them at{" "}
            <a
              href={`mailto:${PRIVACY_EMAIL}`}
              className="underline-link text-cream"
            >
              {PRIVACY_EMAIL}
            </a>
            , by phone at{" "}
            <a href={SITE.phone.href} className="underline-link text-cream">
              {SITE.phone.display}
            </a>
            , or by mail at the address above.
          </p>
        </article>
      </section>
    </main>
  );
}
