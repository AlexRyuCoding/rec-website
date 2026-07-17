import type { Metadata } from "next";
import "./ui/globals.css";
import Header from "@/components/header";
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
    <html lang="en">
      <body
        className={`${instrumentSerif.variable} ${interTight.variable} antialiased`}
      >
        <MotionProvider>
          <Header />
          {children}
          <ConditionalFooter />
        </MotionProvider>
      </body>
    </html>
  );
}
