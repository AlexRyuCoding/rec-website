import type { Metadata } from "next";
import "./ui/globals.css";
import ConditionalHeader from "@/components/conditional-header";
import ConditionalFooter from "@/components/conditional-footer";
import MotionProvider from "@/components/motion/motion-provider";
import { instrumentSerif, interTight } from "./ui/fonts";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.ryuacupuncture.com"),
  title: {
    default: "Ryu Acupuncture Clinic — Burbank, CA",
    template: "%s — Ryu Acupuncture Clinic",
  },
  description:
    "Holistic acupuncture and Chinese medicine in Burbank, CA. Treating pain, stress, fertility, and chronic conditions with personalized care.",
  icons: { icon: "/rac-logo-blue-white.png" },
  openGraph: {
    title: "Ryu Acupuncture Clinic, Inc.",
    description:
      "Holistic acupuncture and Chinese medicine in Burbank, CA. Treating pain, stress, fertility, and chronic conditions with personalized care.",
    images: ["/rac-logo-blue-white.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the themed staff pages put
    // data-staff-theme on <html> before React starts (so the page never
    // flashes the wrong theme); without this React warns in development
    // about an attribute it did not render. It covers this one element's
    // attributes only.
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${instrumentSerif.variable} ${interTight.variable} antialiased`}
      >
        <MotionProvider>
          <ConditionalHeader />
          {children}
          <ConditionalFooter />
        </MotionProvider>
      </body>
    </html>
  );
}
