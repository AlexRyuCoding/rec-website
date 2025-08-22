"use client";
import DropdownMenu from "./drop-down-menu";
import DesktopMenu from "./desktop-menu";
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
      <div className="flex items-center justify-end flex-1">
        <DesktopMenu position="left" />
      </div>

      <div className="flex items-center justify-center px-8 md:px-8">
        <Link href="/">
          <Image
            src="/rac-logo-dark-moss.png"
            alt="Ryu Acupuncture Clinic logo (light mode)"
            width={isScrolled ? 30 : 80}
            height={isScrolled ? 30 : 80}
            className="block dark:hidden transition-all duration-300"
          />
          <Image
            src="/rac-logo-white.png"
            alt="Ryu Acupuncture Clinic logo (dark mode)"
            width={isScrolled ? 30 : 80}
            height={isScrolled ? 30 : 80}
            className="hidden dark:block transition-all duration-300"
          />
        </Link>
      </div>

      <div className="flex items-center gap-2 flex-1 justify-start">
        <DesktopMenu position="right" />
        <ThemeToggle />
        <DropdownMenu />
      </div>
    </header>
  );
}
