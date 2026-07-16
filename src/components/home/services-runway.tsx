"use client";
import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { gsap, useGSAP } from "@/lib/gsap";
import { useMotionPrefs } from "@/components/motion/motion-provider";

const SLIDES = [
  {
    title: "Acupuncture",
    sub: "& Electroacupuncture",
    copy: "Targeted needle therapy to stimulate healing, reduce inflammation, and ease pain naturally.",
    img: "/acupuncture-treatment.jpg",
  },
  {
    title: "Herbal Medicine",
    sub: "& Supplements",
    copy: "Customized herbal formulas to restore balance and improve internal health.",
    img: "/herbal-medicine.jpg",
  },
  {
    title: "Fertility",
    sub: "& Women's Health",
    copy: "Gentle, natural support for fertility, menstrual health, and hormone balance.",
    img: "/fire-cupping.jpg",
  },
];

export default function ServicesRunway() {
  const root = useRef<HTMLElement>(null);
  const { reduced } = useMotionPrefs();

  useGSAP(
    () => {
      if (reduced || !root.current) return;
      const tl = gsap.timeline({
        defaults: { duration: 1, ease: "none" },
        scrollTrigger: {
          trigger: root.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.4,
        },
      });
      SLIDES.forEach((_, i) => {
        if (i === 0) return;
        tl.to(`[data-slide="${i - 1}"]`, { autoAlpha: 0, y: -24 }, i)
          .fromTo(
            `[data-slide="${i}"]`,
            { autoAlpha: 0, y: 24 },
            { autoAlpha: 1, y: 0 },
            i
          )
          .fromTo(
            `[data-img="${i}"]`,
            { autoAlpha: 0, scale: 1.08 },
            { autoAlpha: 1, scale: 1 },
            i
          );
      });
    },
    { scope: root, dependencies: [reduced] }
  );

  if (reduced) {
    return (
      <section className="flex flex-col gap-16 px-4 py-24 lg:px-8">
        {SLIDES.map((s) => (
          <div
            key={s.title}
            className="flex flex-col gap-6 lg:flex-row lg:items-center"
          >
            <div className="lg:w-1/2">
              <h2 className="font-serif text-title text-cream">
                {s.title} <i>{s.sub}</i>
              </h2>
              <p className="mt-4 max-w-sm text-cream/60">{s.copy}</p>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-card lg:w-1/2">
              <Image src={s.img} alt={s.title} fill className="object-cover" />
            </div>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section ref={root} className="relative h-[300vh]">
      <div className="sticky top-0 flex h-svh flex-col justify-center px-4 lg:px-8">
        <p className="mb-6 text-sm font-medium text-cream/50">
          What we treat with:
        </p>
        <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative h-56 lg:h-72 lg:w-1/2">
            {SLIDES.map((s, i) => (
              <div
                key={s.title}
                data-slide={i}
                className="absolute inset-0"
                style={i > 0 ? { opacity: 0, visibility: "hidden" } : undefined}
              >
                <h2 className="font-serif text-title text-cream">
                  {s.title} <i>{s.sub}</i>
                </h2>
                <p className="mt-4 max-w-sm text-cream/60">{s.copy}</p>
                <Link
                  href="/services"
                  className="underline-link mt-6 inline-block text-sm font-medium text-cream"
                >
                  Explore all services
                </Link>
              </div>
            ))}
          </div>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card lg:w-[42%]">
            {SLIDES.map((s, i) => (
              <div
                key={s.title}
                data-img={i}
                className="absolute inset-0"
                style={i > 0 ? { opacity: 0, visibility: "hidden" } : undefined}
              >
                <Image
                  src={s.img}
                  alt={s.title}
                  fill
                  sizes="(min-width: 1024px) 42vw, 100vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>
        <p className="mt-8 font-serif text-card text-cream/50" data-counter>
          <span className="text-cream">01</span> / 03
        </p>
      </div>
    </section>
  );
}
