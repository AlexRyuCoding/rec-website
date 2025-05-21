"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Home,
  Users,
  HandHeart,
  Calendar,
  MessageSquareWarning,
  AlignJustify,
  // Mail,
  // UserCheck,
  // ShoppingCart,
} from "lucide-react";

interface MenuItem {
  href: string;
  icon: React.ReactNode;
  label: string;
  isRoundedTop?: boolean;
  isRoundedBottom?: boolean;
}

const menuItems: MenuItem[] = [
  {
    href: "/",
    icon: <Home className="w-5 h-5" />,
    label: "Home",
    isRoundedTop: true,
  },
  { href: "/about", icon: <Users className="w-5 h-5" />, label: "About" },
  {
    href: "/services",
    icon: <HandHeart className="w-5 h-5" />,
    label: "Services",
  },
  // { href: "/contact", icon: <Mail className="w-5 h-5" />, label: "Contact" },
  // {
  //   href: "/patient-signin",
  //   icon: <UserCheck className="w-5 h-5" />,
  //   label: "Patient Sign In",
  // },
  // {
  //   href: "/shop",
  //   icon: <ShoppingCart className="w-5 h-5" />,
  //   label: "Shop",
  // },
  {
    href: "/request-an-appointment",
    icon: <Calendar className="w-5 h-5" />,
    label: "Request An Appointment",
  },
  {
    href: "/report-a-grievance",
    icon: <MessageSquareWarning className="w-5 h-5" />,
    label: "Report A Grievance",
    isRoundedBottom: true,
  },
];

export default function DropdownMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!mounted) {
    return (
      <div className="relative inline-block text-left rounded-md border border-gray-400">
        <button
          className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800"
          aria-haspopup="true"
          aria-expanded={false}
        >
          <AlignJustify className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative inline-block text-left rounded-md border border-gray-400"
      ref={menuRef}
    >
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <AlignJustify className="w-5 h-5" />
      </button>

      <div
        style={{
          minWidth: "max-content",
          maxWidth: "320px",
          width: "230px",
        }}
        className={`absolute right-0 mt-2 w-48 rounded-lg shadow-2xl border border-gray-300 bg-gray-100 dark:bg-gray-800 ring-0 ring-orange-500 ring-opacity-5 z-50 transform transition-all duration-80 ease-out origin-top ${
          open
            ? "scale-100 opacity-100"
            : "scale-90 opacity-0 pointer-events-none"
        }`}
      >
        <div>
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-2 text-sm hover:font-semibold hover:bg-[#E9C46A] dark:hover:bg-gray-700 transition ${
                item.isRoundedTop ? "rounded-t-lg" : ""
              } ${item.isRoundedBottom ? "rounded-b-lg" : ""}`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
