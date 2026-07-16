"use client";
import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useMotionPrefs } from "./motion-provider";

interface ScrollFillTextProps {
  text: string;
  className?: string;
}

export default function ScrollFillText({
  text,
  className,
}: ScrollFillTextProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { reduced } = useMotionPrefs();

  useGSAP(
    () => {
      if (!ref.current) return;
      if (reduced) {
        gsap.set(ref.current.querySelectorAll("[data-fill-word]"), {
          opacity: 1,
        });
        return;
      }
      gsap.to(ref.current.querySelectorAll("[data-fill-word]"), {
        opacity: 1,
        ease: "none",
        stagger: 0.5,
        scrollTrigger: {
          trigger: ref.current,
          start: "top 75%",
          end: "bottom 45%",
          scrub: true,
        },
      });
    },
    { scope: ref, dependencies: [reduced] }
  );

  return (
    <p ref={ref} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.split(" ").map((word, i) => (
          <span key={i} data-fill-word className="opacity-50">
            {word}{" "}
          </span>
        ))}
      </span>
    </p>
  );
}
