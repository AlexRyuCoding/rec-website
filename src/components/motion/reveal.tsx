"use client";
import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useMotionPrefs } from "./motion-provider";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}

export default function Reveal({
  children,
  className,
  delay = 0,
  y = 32,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { reduced } = useMotionPrefs();

  useGSAP(
    () => {
      if (reduced || !ref.current) return;
      gsap.from(ref.current, {
        autoAlpha: 0,
        y,
        duration: 0.8,
        delay,
        ease: "houseQuint",
        scrollTrigger: { trigger: ref.current, start: "top 85%", once: true },
      });
    },
    { scope: ref, dependencies: [reduced] }
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
