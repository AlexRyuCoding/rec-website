"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AlignJustify, X } from "lucide-react";
import PillLink from "@/components/ui/pill-link";
import { SITE } from "@/lib/site";

const MENU_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/request-an-appointment", label: "Request an Appointment" },
  { href: "/contact", label: "Contact" },
  { href: "/report-a-grievance", label: "Report a Grievance" },
];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Close on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock page scroll while the sheet is open
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  // Escape closes the sheet and returns focus to the trigger; opening
  // moves focus into the sheet's first link
  useEffect(() => {
    if (!open) return;

    navRef.current?.querySelector("a")?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex size-12 items-center justify-center rounded-full border border-cream/15 text-cream"
      >
        {open ? <X className="size-5" /> : <AlignJustify className="size-5" />}
      </button>

      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 -z-10 bg-canvas/50 backdrop-blur-md transition-opacity duration-500 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? "Site menu" : undefined}
        className={`fixed inset-x-0 bottom-0 rounded-t-sheet bg-island px-6 pb-10 pt-8 text-ink transition-transform duration-500 ease-menu ${
          open ? "translate-y-0" : "pointer-events-none translate-y-full"
        }`}
      >
        <nav ref={navRef} className="flex flex-col">
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="border-b py-4 font-serif text-3xl leading-none last:border-b-0"
              style={{ borderColor: "var(--hairline-on-light)" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 flex items-center justify-between">
          <span onClick={() => setOpen(false)}>
            <PillLink href={SITE.bookingUrl} external variant="dark">
              Book Now
            </PillLink>
          </span>
          <a
            href={SITE.phone.href}
            onClick={() => setOpen(false)}
            className="text-sm font-bold"
          >
            {SITE.phone.display}
          </a>
        </div>
      </div>
    </div>
  );
}
