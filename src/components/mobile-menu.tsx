"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

export default function MobileMenu({
  inverted = false,
}: {
  inverted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Portal target only exists client-side
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Remove the sheet (its links + pill) from tab order while closed —
  // React 18 has no `inert` prop, so set the DOM property directly.
  useEffect(() => {
    const sheetEl = sheetRef.current;
    if (!sheetEl) return;
    (sheetEl as HTMLElement & { inert: boolean }).inert = !open;
  }, [open, mounted]);

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

  // The overlay + sheet are portaled to <body>: position:fixed breaks inside
  // the header because its glass surface (backdrop-filter) — or any ancestor
  // transform — becomes their containing block, dragging the "closed" sheet
  // into view. That was the scroll-opens-menu bug.
  const sheet = (
    <>
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-canvas/50 backdrop-blur-md transition-opacity duration-500 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        ref={sheetRef}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? "Site menu" : undefined}
        className={`fixed inset-x-3 bottom-3 z-50 rounded-sheet bg-island px-6 pb-8 pt-6 text-ink transition-transform duration-500 ease-menu ${
          open ? "translate-y-0" : "pointer-events-none translate-y-[110%]"
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
    </>
  );

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className={`flex size-11 items-center justify-center rounded-full border transition-colors duration-300 ${
          inverted ? "border-ink/20 text-ink" : "border-cream/15 text-cream"
        }`}
      >
        {open ? <X className="size-5" /> : <AlignJustify className="size-5" />}
      </button>

      {mounted && createPortal(sheet, document.body)}
    </div>
  );
}
