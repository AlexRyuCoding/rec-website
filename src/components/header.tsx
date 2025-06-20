"use client";
import DropdownMenu from "./drop-down-menu";
import Image from "next/image";
import Link from "next/link";
import ThemeToggle from "./theme-toggle";
import { useState, useEffect } from "react";

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setIsScrolled(scrollPosition > 0);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 flex items-center justify-between w-full px-8 bg-brand-muted dark:bg-gray-800 transition-all duration-300 z-50 ${
        isScrolled ? "py-1" : "py-4"
      }`}
    >
      <div className="flex-1" /> {/* Spacer */}
      <div className="flex items-center justify-center">
        <Link href="/">
          {/* Light mode logo */}
          <Image
            src="/rac-logo-dark-moss.png"
            alt="Ryu Acupuncture Clinic logo (light mode)"
            width={isScrolled ? 30 : 80}
            height={isScrolled ? 30 : 80}
            className="block dark:hidden transition-all duration-300"
          />
          {/* Dark mode logo */}
          <Image
            src="/rac-logo-white.png"
            alt="Ryu Acupuncture Clinic logo (dark mode)"
            width={isScrolled ? 35 : 80}
            height={isScrolled ? 35 : 80}
            className="hidden dark:block transition-all duration-300"
          />
        </Link>
      </div>
      <div className="flex items-center gap-2 flex-1 justify-end">
        <ThemeToggle />
        <DropdownMenu />
      </div>
    </header>
  );
}
