import type { Metadata } from "next";
import Link from "next/link";
import SplitReveal from "@/components/motion/split-reveal";
import { SITE } from "@/lib/site";

// The website's privacy policy: what the public pages and the two forms
// collect, and nothing more. It replaced a generated policy (TermsFeed,
// August 2025) that described cookies, beacons, marketing and sharing
// the site does not do, and gave a free mailbox as the contact.
//
// Keep it true: if the site ever adds analytics, a cookie banner, a
// newsletter or a shop, this page changes in the same pull request.
// Patients' health information is covered by the Notice of Privacy
// Practices (/privacy-practices), not here.

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What the Ryu Acupuncture Clinic website collects about its visitors, how it is used, and how to contact us about it.",
};

const LAST_UPDATED = "November 24, 2026";
const PRIVACY_EMAIL = "privacy@ryuacupuncture.com";

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-14 font-serif text-title text-cream first:mt-0">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 leading-relaxed text-cream/70">{children}</p>;
}

const link = "underline-link text-cream";

export default function PrivacyPolicy() {
  return (
    <main className="print-notice">
      <section className="flex min-h-[50svh] flex-col justify-end px-4 pb-12 pt-28 lg:px-8">
        <p className="mb-6 text-sm font-medium text-cream/50">{SITE.name}</p>
        <SplitReveal
          as="h1"
          className="max-w-5xl font-serif text-display text-cream"
          segments={[{ text: "Privacy" }, { text: "Policy", italic: true }]}
        />
      </section>

      <section className="px-4 pb-24 lg:px-8 lg:pb-40">
        <article className="max-w-3xl">
          <p className="text-sm text-cream/50">
            {SITE.name}, Inc. · {SITE.address.line} · {SITE.phone.display} ·{" "}
            {PRIVACY_EMAIL}
          </p>
          <p className="mt-2 text-sm text-cream/50">
            Last updated: {LAST_UPDATED}
          </p>

          <P>
            This policy explains what this website collects about the people who
            visit it, what we do with it, and how to reach us about it. It
            covers www.ryuacupuncture.com only. How we handle your health
            information as a patient is described in our{" "}
            <Link href="/privacy-practices" className={link}>
              Notice of Privacy Practices
            </Link>
            .
          </P>

          <H2>What you give us</H2>
          <P>
            The website has two forms. The{" "}
            <strong className="font-semibold text-cream">
              appointment request
            </strong>{" "}
            form asks for your name, email address, phone number and a message.
            The <strong className="font-semibold text-cream">grievance</strong>{" "}
            form asks for a subject and a message; giving your name, email or
            phone number is optional.
          </P>
          <P>
            What you type is delivered to the clinic&apos;s own mailbox and used
            only to answer you or to look into your grievance. We keep the
            correspondence as long as we need it to deal with your request and
            as our record-keeping rules require. We never use it for marketing
            and never share it with anyone outside the clinic, except where the
            law requires.
          </P>

          <H2>What is collected automatically</H2>
          <P>
            Like every website, ours keeps standard server logs: the internet
            address your connection comes from, the pages requested, the time,
            and the kind of browser. We use them to keep the site running and
            secure, and for nothing else. When you send a form, your internet
            address is also noted for one hour so that nobody can flood the
            form; it is deleted after that.
          </P>
          <P>
            The public pages use{" "}
            <strong className="font-semibold text-cream">
              no analytics, no advertising and no tracking cookies
            </strong>
            . We do not use web beacons, and we do not build profiles of
            visitors. The only cookies this site sets are on the pages our staff
            sign in to and on the clinic&apos;s own check-in and waiting-room
            devices, to keep them signed in; those cookies are never set on the
            pages you visit.
          </P>

          <H2>Who else is involved</H2>
          <P>
            The website runs on Google Cloud, and our email runs on Google
            Workspace; both hold the information above on our behalf under
            agreements with us. We have no advertising partners and we do not
            sell or rent personal information.
          </P>
          <P>
            Some links take you to other companies&apos; sites, which have their
            own privacy policies: online booking goes to Practice Better,
            directions open in Google Maps, and our social links go to Facebook,
            Instagram and Yelp. What you do on those sites is between you and
            them.
          </P>

          <H2>Your choices</H2>
          <P>
            You can ask us what information we hold about you from this website,
            and ask us to correct or delete it, by writing to{" "}
            <a href={`mailto:${PRIVACY_EMAIL}`} className={link}>
              {PRIVACY_EMAIL}
            </a>
            . Requests about your health record follow the Notice of Privacy
            Practices instead. You can also use the website without sending any
            form at all, and call us on{" "}
            <a href={SITE.phone.href} className={link}>
              {SITE.phone.display}
            </a>{" "}
            instead.
          </P>

          <H2>Children</H2>
          <P>
            This website is not directed at children under 13, and we do not
            knowingly collect information from them through it. If you believe a
            child has sent us a form, write to us and we will delete it.
          </P>

          <H2>Security</H2>
          <P>
            The site is served over an encrypted connection, the clinic itself
            is the only one who can read what you send, and access is limited to
            the staff who need it.
          </P>

          <H2>Changes</H2>
          <P>
            If this website ever collects something new, this page changes
            first, with a new date at the top.
          </P>

          <H2>Contact</H2>
          <P>
            Privacy Officer, {SITE.name}, Inc., {SITE.address.line}.{" "}
            <a href={`mailto:${PRIVACY_EMAIL}`} className={link}>
              {PRIVACY_EMAIL}
            </a>{" "}
            ·{" "}
            <a href={SITE.phone.href} className={link}>
              {SITE.phone.display}
            </a>
          </P>
        </article>
      </section>
    </main>
  );
}
