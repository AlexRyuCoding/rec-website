"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import PillLink from "@/components/ui/pill-link";
import MobileMenu from "@/components/mobile-menu";
import { SITE } from "@/lib/site";
import {
  generateDisplacementMap,
  supportsBackdropDisplacement,
} from "@/lib/liquid-glass";

let lgSeq = 0;

const NAV_ITEMS = [
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/request-an-appointment", label: "Request an Appointment" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  // Flips the header's ink from cream to dark teal whenever the glass bar
  // overlaps a light island section, so text stays readable over both
  // registers. Scoped to `main .bg-island` — the portaled mobile sheet is
  // also bg-island but lives on <body>, and must not trigger inversion.
  const [overLight, setOverLight] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const bar = barRef.current;
      if (!bar) return;
      const { top, bottom } = bar.getBoundingClientRect();
      // div.bg-island only: PillLink renders as a.bg-island and must not
      // flip the header; the height floor skips any future small chips.
      const islands = document.querySelectorAll("main div.bg-island");
      let hit = false;
      islands.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height > 150 && r.top < bottom && r.bottom > top) hit = true;
      });
      setOverLight(hit);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pathname]);

  // Aave-style refraction (liquid-glass-aave.md): a runtime displacement map
  // drives an SVG feDisplacementMap applied via backdrop-filter, bending the
  // page behind the bar like curved glass. Chromium-only; other engines keep
  // the CSS frosted fallback. Map rebuilds only on resize (shape change),
  // never on scroll — moving is free, reshaping is not.
  useEffect(() => {
    if (!supportsBackdropDisplacement()) return;
    const bar = barRef.current;
    if (!bar) return;
    let svg: SVGSVGElement | null = null;
    let timer: number | undefined;

    const build = () => {
      const rect = bar.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (!w || !h) return;
      const { url, maxScale } = generateDisplacementMap({
        width: w,
        height: h,
        borderRadius: 26,
        depth: 0.36,
        curvature: 1.0,
      });
      if (!url) return;
      // Fresh filter id per rebuild (filter output is cached by id)
      const id = `lg-header-${++lgSeq}`;
      const next = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      next.setAttribute("width", "0");
      next.setAttribute("height", "0");
      next.setAttribute("aria-hidden", "true");
      next.style.position = "absolute";
      // 1.4× overshoot past the round-trip-neutral scale = stronger bend
      // (doc's "Depth" knob; keep the product under ~150 to avoid banding)
      const strength = Math.min(maxScale * 1.4, 150);
      next.innerHTML = `<defs><filter id="${id}" x="0" y="0" width="${w}" height="${h}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feImage href="${url}" x="0" y="0" width="${w}" height="${h}" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="${strength.toFixed(1)}" xChannelSelector="R" yChannelSelector="G"/></filter></defs>`;
      document.body.appendChild(next);
      // Refraction + light frost: the lens bend stays visible at the rim
      // while the blur keeps nav text legible over light-island headlines.
      bar.style.backdropFilter = `url(#${id}) blur(3px) saturate(1.2)`;
      svg?.remove();
      svg = next;
    };

    build();
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(build, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(timer);
      svg?.remove();
      bar.style.backdropFilter = "";
    };
  }, []);

  const ink = overLight ? "text-ink" : "text-cream";

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3 lg:px-4 lg:pt-4">
      <div
        ref={barRef}
        className={`glass-surface pointer-events-auto flex items-center justify-between gap-4 px-4 py-2 transition-colors duration-300 lg:px-6 ${
          overLight ? "glass-surface--ink" : ""
        }`}
      >
        <Link href="/" className="shrink-0">
          <Image
            src={overLight ? "/rac-logo-dark-moss.png" : "/rac-logo-white.png"}
            alt="Ryu Acupuncture Clinic"
            width={48}
            height={48}
          />
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`underline-link text-sm font-semibold transition-colors duration-300 ${ink}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <PillLink
            href={SITE.bookingUrl}
            external
            variant={overLight ? "dark" : "light"}
            className="hidden lg:inline-block"
          >
            Book Now
          </PillLink>
          <MobileMenu inverted={overLight} />
        </div>
      </div>
    </header>
  );
}
