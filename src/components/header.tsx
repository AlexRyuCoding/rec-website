"use client";
import Image from "next/image";
import Link from "next/link";
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
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3 lg:px-4 lg:pt-4">
      <div className="glass-surface pointer-events-auto flex items-center justify-between gap-4 px-4 py-2 lg:px-6">
        <Link href="/" className="shrink-0">
          <Image
            src="/rac-logo-white.png"
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
              className="underline-link text-sm font-semibold text-cream"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
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
