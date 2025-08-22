"use client";
import Link from "next/link";

interface MenuItem {
  href: string;
  label: string;
}

interface DesktopMenuProps {
  position: "left" | "right";
}

const menuItems: MenuItem[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  // { href: "/shop", label: "Shop" },
  { href: "/request-an-appointment", label: "Request An Appointment" },
];

export default function DesktopMenu({ position }: DesktopMenuProps) {
  const leftItems = menuItems.slice(0, Math.ceil(menuItems.length / 2));
  const rightItems = menuItems.slice(Math.ceil(menuItems.length / 2));

  const itemsToShow = position === "left" ? leftItems : rightItems;

  return (
    <nav className="hidden md:flex items-center justify-center space-x-12">
      {itemsToShow.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="text-base font-medium text-brand-foreground dark:text-brand-background hover:text-brand-accent dark:hover:text-brand-accent transition-colors duration-200 whitespace-nowrap"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
