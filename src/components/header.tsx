"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import PillLink from "@/components/ui/pill-link";
import MobileMenu from "@/components/mobile-menu";
import { SITE } from "@/lib/site";

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
