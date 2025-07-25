import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./ui/globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import Header from "@/components/header";
import ConditionalFooter from "@/components/conditional-footer";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.ryuacupuncture.com"),
  title: "Ryu Acupuncture Clinic, Inc.",
  description:
    "Holistic acupuncture and Chinese medicine in Burbank, CA. Treating pain, stress, fertility, and chronic conditions with personalized care.",
  icons: {
    icon: "/rac-logo-blue-white.png",
  },
  openGraph: {
    title: "Ryu Acupuncture Clinic, Inc.",
    description:
      "Holistic acupuncture and Chinese medicine in Burbank, CA. Treating pain, stress, fertility, and chronic conditions with personalized care.",
    images: ["/rac-logo-blue-white.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${geist.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem={true}
          disableTransitionOnChange={false}
          storageKey="rac-theme"
        >
          <Header />
          {children}
          <ConditionalFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
