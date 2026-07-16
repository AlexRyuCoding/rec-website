"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import PillLink from "@/components/ui/pill-link";
import MobileMenu from "@/components/mobile-menu";
import { SITE } from "@/lib/site";

export const NAV_ITEMS = [
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/request-an-appointment", label: "Request an Appointment" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  const [hidden, setHidden] = useState(false);
  const [scrimmed, setScrimmed] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setHidden(y > 200 && y > lastY.current);
      setScrimmed(y > 500);
      lastY.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 transition-transform duration-500 ease-default ${
        hidden ? "-translate-y-full" : ""
      }`}
    >
      <div
        className={`flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-300 lg:px-8 ${
          scrimmed ? "bg-canvas/60 backdrop-blur-md" : ""
        }`}
      >
        <Link href="/" className="pointer-events-auto shrink-0">
          <Image
            src="/rac-logo-white.png"
            alt="Ryu Acupuncture Clinic"
            width={48}
            height={48}
          />
        </Link>

        <nav className="pointer-events-auto hidden items-center gap-8 lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="underline-link text-sm font-medium text-cream"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="pointer-events-auto flex items-center gap-3">
          <PillLink
            href={SITE.bookingUrl}
            external
            className="hidden lg:inline-block"
          >
            Book Now
          </PillLink>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
