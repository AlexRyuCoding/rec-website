"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CircleButton from "@/components/ui/circle-button";

const QUOTES = [
  {
    text: "My pain is no longer chronic, and I wake up feeling so much better. The best way to describe my experience in being treated here is that I see the light at the end of the tunnel!",
    author: "M.O., Burbank, CA",
  },
  {
    text: "He checked my pulse, looked at my tongue, and was able to name off symptoms I was experiencing before I even told him my chief complaint.",
    author: "M. L., Alhambra, CA",
  },
  {
    text: "I had to stand up because I could not believe the pain was gone. From that day until today the pain has never come back and I have immense gratitude to Dr. Ryu for healing me.",
    author: "A. E., NY, NY",
  },
  {
    text: "I started seeing him for fertility issues and continued seeing him throughout the pandemic… I'm happy to say that treatments were successful, and I'm expecting my baby later this year.",
    author: "K. K., Burbank, CA",
  },
];

const INTERVAL_MS = 8000;
const RING_R = 17;
const RING_C = 2 * Math.PI * RING_R;

export default function Testimonials() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pauseCycle, setPauseCycle] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasPaused = useRef(false);

  const advance = useCallback(
    (dir: 1 | -1) =>
      setIndex((prev) => (prev + dir + QUOTES.length) % QUOTES.length),
    []
  );

  useEffect(() => {
    if (paused) return;
    timer.current = setInterval(() => advance(1), INTERVAL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, advance, index]);

  // Re-key the ring on the paused -> unpaused transition so it restarts
  // in lockstep with the auto-advance timer above (which also restarts
  // whenever `paused` flips to false).
  useEffect(() => {
    if (wasPaused.current && !paused) {
      setPauseCycle((c) => c + 1);
    }
    wasPaused.current = paused;
  }, [paused]);

  return (
    <section
      className="px-4 py-24 lg:px-8 lg:py-40"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setPaused(false);
        }
      }}
    >
      <p className="mb-10 text-sm font-medium text-cream/40">
        What our patients say:
      </p>
      <div className="relative min-h-56 max-w-4xl lg:min-h-48">
        {QUOTES.map((q, i) => (
          <blockquote
            key={q.author}
            aria-hidden={i !== index}
            className={`absolute inset-0 transition-all duration-700 ease-out-quint ${
              i === index
                ? "opacity-100"
                : "pointer-events-none opacity-0 translate-y-4"
            }`}
          >
            <p className="font-serif text-card text-cream">
              &ldquo;{q.text}&rdquo;
            </p>
            <footer className="mt-6 text-sm font-bold text-cream/60">
              — {q.author}
            </footer>
          </blockquote>
        ))}
      </div>
      <div className="mt-12 flex items-center gap-4">
        <CircleButton label="Previous testimonial" onClick={() => advance(-1)}>
          <ChevronLeft className="size-5" />
        </CircleButton>
        <CircleButton label="Next testimonial" onClick={() => advance(1)}>
          <ChevronRight className="size-5" />
        </CircleButton>
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          aria-hidden
          className="-rotate-90"
        >
          <circle
            cx="20"
            cy="20"
            r={RING_R}
            fill="none"
            stroke="var(--hairline-on-dark)"
            strokeWidth="1.5"
          />
          <circle
            key={`${index}-${pauseCycle}`}
            cx="20"
            cy="20"
            r={RING_R}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C}
            style={{
              animation: `ring-fill ${INTERVAL_MS}ms linear forwards`,
              animationPlayState: paused ? "paused" : "running",
            }}
          />
        </svg>
        <a
          href="https://www.yelp.com/biz/ryu-acupuncture-clinic-burbank-3?osq=Ryu+Acupuncture+Clinic#reviews"
          target="_blank"
          rel="noopener noreferrer"
          className="underline-link ml-auto text-sm font-medium text-cream"
        >
          Read more reviews
        </a>
      </div>
    </section>
  );
}
