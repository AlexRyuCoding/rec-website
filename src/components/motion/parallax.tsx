"use client";
import { useRef } from "react";
import Image from "next/image";
import { gsap, useGSAP } from "@/lib/gsap";
import { useMotionPrefs } from "./motion-provider";

interface ParallaxProps {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

export default function Parallax({
  src,
  alt,
  className = "",
  sizes = "100vw",
  priority = false,
}: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { reduced } = useMotionPrefs();

  useGSAP(
    () => {
      if (reduced || !ref.current) return;
      gsap.fromTo(
        ref.current.querySelector("img"),
        { yPercent: -8 },
        {
          yPercent: 8,
          ease: "none",
          scrollTrigger: {
            trigger: ref.current,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.4,
          },
        }
      );
    },
    { scope: ref, dependencies: [reduced] }
  );

  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="scale-[1.18] object-cover"
      />
    </div>
  );
}
