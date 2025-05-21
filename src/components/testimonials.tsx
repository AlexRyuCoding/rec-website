"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

const testimonials = [
  {
    text: "My pain is no longer chronic, and I wake up feeling so much better. The best way to describe my experience in being treated here is that I see the light at the end of the tunnel!",
    author: "M.O., Burbank, CA",
  },
  {
    text: "He checked my pulse, looked at my tongue, and was able to name off symptoms I was experiencing before I even told him my chief complaint.",
    author: "M. L. Alhambra, CA",
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

export default function Testimonials() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startAutoAdvance = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      paginate(1);
    }, 8000);
  }, []);

  useEffect(() => {
    startAutoAdvance();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startAutoAdvance]);

  const paginate = (newDirection: number) => {
    setDirection(newDirection);
    setIndex((prev) =>
      newDirection === 1
        ? (prev + 1) % testimonials.length
        : (prev - 1 + testimonials.length) % testimonials.length
    );
    startAutoAdvance(); // reset timer on user interaction
  };

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  return (
    <div className="space-y-6 text-center relative">
      <div className="flex flex-col justify-between items-center">
        <h2 className="text-2xl font-semibold mb-6">What Our Patients Say</h2>

        <div className="relative w-full max-w-2xl mx-auto h-36 overflow-hidden">
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={index}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.5 }}
              className="absolute w-full px-6"
            >
              <p className="text-gray-600 dark:text-gray-300 text-lg">
                &quot;{testimonials[index].text}&quot;
              </p>
              <p className="italic text-sm mt-2">
                — {testimonials[index].author}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex justify-center gap-4 items-center mt-4">
          <button
            onClick={() => paginate(-1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            aria-label="Previous testimonial"
          >
            <ChevronLeft />
          </button>
          <button
            onClick={() => paginate(1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            aria-label="Next testimonial"
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      <a
        href="https://www.yelp.com/biz/ryu-acupuncture-clinic-burbank-3?osq=Ryu+Acupuncture+Clinic#reviews"
        target="_blank"
        rel="noopener noreferrer"
        className="text-emerald-600 font-medium hover:underline"
      >
        Read more reviews →
      </a>
    </div>
  );
}
