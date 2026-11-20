"use client";

import { usePathname } from "next/navigation";
import Footer from "./footer";

export default function ConditionalFooter() {
  const pathname = usePathname();
  const isAdminPage = pathname?.startsWith("/admin");
  // The waiting-room TV is a full-screen display, not a site page.
  const isDisplayPage = pathname?.startsWith("/waiting-room");

  if (isAdminPage || isDisplayPage) {
    return null;
  }

  return <Footer />;
}
