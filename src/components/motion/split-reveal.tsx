"use client";
import { createElement, Fragment, useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useMotionPrefs } from "./motion-provider";

export interface SplitSegment {
  text: string;
  italic?: boolean;
}

interface SplitRevealProps {
  segments: SplitSegment[];
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
}

export default function SplitReveal({
  segments,
  as = "h2",
  className,
}: SplitRevealProps) {
  const ref = useRef<HTMLElement>(null);
  const { reduced } = useMotionPrefs();

  useGSAP(
    () => {
      if (reduced || !ref.current) return;
      gsap.from(ref.current.querySelectorAll("[data-word] > span"), {
        yPercent: 110,
        duration: 0.8,
        stagger: 0.08,
        ease: "houseQuint",
        scrollTrigger: { trigger: ref.current, start: "top 85%", once: true },
      });
    },
    { scope: ref, dependencies: [reduced] }
  );

  const words = segments.flatMap((seg, si) =>
    seg.text
      .split(" ")
      .filter(Boolean)
      .map((word, wi) => ({ word, italic: seg.italic, key: `${si}-${wi}` }))
  );

  return createElement(
    as,
    { ref, className },
    words.map(({ word, italic, key }) => (
      <Fragment key={key}>
        <span
          data-word
          className="inline-block overflow-hidden pb-[0.08em] align-top"
        >
          <span
            className={`inline-block will-change-transform ${italic ? "italic" : ""}`}
          >
            {word}
          </span>
        </span>{" "}
      </Fragment>
    ))
  );
}
