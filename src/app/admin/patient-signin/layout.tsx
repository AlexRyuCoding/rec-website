import type { Viewport } from "next";

// The kiosk must stay at its natural size: no pinch or double-tap zoom.
// (iPad Safari ignores part of this for accessibility; the kiosk page also
// blocks zoom gestures itself — see use-scroll-lock.ts.)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
