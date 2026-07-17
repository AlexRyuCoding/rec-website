"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { KeyRound, LayoutDashboard } from "lucide-react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useMotionPrefs } from "@/components/motion/motion-provider";
import { SITE } from "@/lib/site";

const SOCIALS = [
  { href: SITE.socials.facebook, src: "/facebook.png", alt: "Facebook" },
  { href: SITE.socials.instagram, src: "/instagram.svg", alt: "Instagram" },
  { href: SITE.socials.yelp, src: "/yelp_burst.svg", alt: "Yelp" },
];

export default function Footer() {
  const root = useRef<HTMLElement>(null);
  const { reduced } = useMotionPrefs();

  useGSAP(
    () => {
      if (reduced || !root.current) return;
      gsap.fromTo(
        root.current.querySelector("[data-disc]"),
        { scale: 1 },
        {
          scale: 2.4,
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top bottom",
            end: "bottom bottom",
            scrub: 0.4,
          },
        },
      );
    },
    { scope: root, dependencies: [reduced] },
  );

  return (
    <footer ref={root} className="relative overflow-hidden bg-canvas">
      {/* Rising gradient disc (design-system footer signature) */}
      <div
        data-disc
        aria-hidden
        className="absolute left-1/2 top-1/3 size-[130vw] -translate-x-1/2 rounded-full lg:size-[70vw]"
        style={{
          background:
            "radial-gradient(circle at 50% 25%, #22404b 0%, #101b21 55%, #010203 100%)",
        }}
      />

      <div className="relative px-4 pb-10 pt-24 lg:px-8 lg:pt-40">
        <div className="mb-16 flex flex-col items-center gap-6 text-center lg:mb-24">
          <Image
            src="/rac-logo-white.png"
            alt="Ryu Acupuncture Clinic"
            width={72}
            height={72}
          />
          <p className="font-serif text-title text-cream">
            Ryu Acupuncture <i>Clinic</i>
          </p>
        </div>

        <div
          className="grid grid-cols-1 gap-10 border-t pt-10 lg:grid-cols-3"
          style={{ borderColor: "var(--hairline-on-dark)" }}
        >
          <div className="flex flex-col gap-3 text-sm text-cream">
            <p className="font-bold">Contact</p>
            <a
              href={SITE.address.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-link w-fit text-cream/60"
            >
              {SITE.address.line}
            </a>
            <a
              href={`mailto:${SITE.email}`}
              className="underline-link w-fit text-cream/60"
            >
              {SITE.email}
            </a>
            <a
              href={SITE.phone.href}
              className="underline-link w-fit text-cream/60"
            >
              {SITE.phone.display}
            </a>
            <p className="text-cream/60">Fax: {SITE.fax.display}</p>
          </div>

          <div className="flex flex-col gap-3 text-sm text-cream">
            <p className="font-bold">Hours</p>
            {SITE.hours.map((h) => (
              <p key={h.days} className="text-cream/60">
                {h.days} · {h.time}
              </p>
            ))}
            <div className="mt-2 flex gap-3">
              {SOCIALS.map((s) => (
                <a
                  key={s.alt}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.alt}
                  className="flex size-10 items-center justify-center rounded-full border border-cream/15 transition-colors duration-300 hover:bg-island"
                >
                  <Image
                    src={s.src}
                    alt=""
                    width={18}
                    height={18}
                    className="size-[18px] object-contain"
                  />
                </a>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 text-sm">
            <p className="font-bold text-cream">Legal</p>
            <a
              href={SITE.legalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-link w-fit text-cream/60"
            >
              Privacy Policy & Terms
            </a>
            <Link
              href="/report-a-grievance"
              className="underline-link w-fit text-cream/60"
            >
              Report a Grievance
            </Link>
            <div className="mt-2 flex gap-4">
              <Link
                href="/admin/dashboard"
                aria-label="Staff dashboard"
                className="text-cream/20 transition-colors duration-300 hover:text-cream/60"
              >
                <LayoutDashboard className="size-6" />
              </Link>
              <Link
                href="/admin/patient-signin"
                aria-label="Patient check-in kiosk"
                className="text-cream/20 transition-colors duration-300 hover:text-cream/60"
              >
                <KeyRound className="size-6" />
              </Link>
            </div>
          </div>
        </div>

        <p
          className="mt-12 border-t pt-6 text-center text-xs text-cream/50"
          style={{ borderColor: "var(--hairline-on-dark)" }}
        >
          © {new Date().getFullYear()} Ryu Acupuncture Clinic. All rights
          reserved.
        </p>
      </div>
    </footer>
  );
}
