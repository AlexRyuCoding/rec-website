"use client";

import {
  animate,
  AnimatePresence,
  motion,
  useIsPresent,
  useMotionValue,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * For the overlay circles, this example uses elements with
 * a high blur radius. A more performant approach could be to
 * bake these circles into background-images as pre-blurred pngs.
 */

export default function WarpOverlay({
  intensity = 0.1,
  isOpen = false,
  onClose,
}: {
  intensity?: number;
  isOpen?: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    setSize({
      width: ref.current?.clientWidth || 0,
      height: ref.current?.clientHeight || 0,
    });
  }, [ref]);

  const deform = useMotionValue(0);
  const rotateX = useTransform(() => deform.get() * -5);
  const skewY = useTransform(() => deform.get() * -1.5);
  const scaleY = useTransform(() => 1 + deform.get() * intensity);
  const scaleX = useTransform(() => 1 - deform.get() * intensity * 0.6);

  useEffect(() => {
    if (isOpen) {
      animate([
        [deform, 1, { duration: 0.3, ease: [0.65, 0, 0.35, 1] }],
        [deform, 0, { duration: 1.5, ease: [0.22, 1, 0.36, 1] }],
      ]);
    }
  }, [isOpen, deform]);

  return (
    <div>
      <div className="app-content" ref={ref}>
        <motion.div
          style={{
            rotateX,
            skewY,
            scaleY,
            scaleX,
            originX: 0.5,
            originY: 0,
            transformPerspective: 500,
            willChange: "transform",
          }}
        ></motion.div>
      </div>

      <AnimatePresence>
        {isOpen ? (
          <ImmersiveOverlay close={onClose} itemCount={1} size={size} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function GradientOverlay({
  size,
}: {
  size: { width: number; height: number };
}) {
  const breathe = useMotionValue(0);
  const isPresent = useIsPresent();

  useEffect(() => {
    if (!isPresent) {
      animate(breathe, 0, { duration: 0.5, ease: "easeInOut" });
    }
    async function playBreathingAnimation() {
      await animate(breathe, 1, {
        duration: 0.5,
        delay: 0.35,
        ease: [0, 0.55, 0.45, 1],
      });
      animate(breathe, [null, 0.7, 1], {
        duration: 15,
        repeat: Infinity,
        repeatType: "loop",
        ease: "easeInOut",
      });
    }
    playBreathingAnimation();
  }, [isPresent]);

  const enterDuration = 0.75;
  const exitDuration = 0.5;
  const expandingCircleRadius = size.width / 3;

  return (
    <div className="gradient-container absolute inset-0 z-0 overflow-hidden backdrop-blur-sm">
      <motion.div
        className="expanding-circle absolute"
        initial={{
          scale: 0,
          opacity: 1,
          backgroundColor: "rgb(233, 167, 160)",
        }}
        animate={{
          scale: 10,
          opacity: 0.2,
          backgroundColor: "rgb(246, 63, 42)",
          transition: {
            duration: enterDuration,
            opacity: { duration: enterDuration, ease: "easeInOut" },
          },
        }}
        exit={{
          scale: 0,
          opacity: 1,
          backgroundColor: "rgb(233, 167, 160)",
          transition: { duration: exitDuration },
        }}
        style={{
          top: "100%",
          left: `calc(50% - ${expandingCircleRadius / 2}px)`,
          width: expandingCircleRadius,
          height: expandingCircleRadius,
          transformOrigin: "center bottom",
        }}
      >
        {/* <Image
        src="/diffused-red-circle.png"
        alt="Diffused red circle"
        width={200}
        height={200}
        className="w-full h-full"
      /> */}
      </motion.div>
      <motion.div
        className="gradient-circle top-left"
        initial={{ opacity: 0 }}
        animate={{
          opacity: 0.9,
          transition: { duration: enterDuration },
        }}
        exit={{
          opacity: 0,
          transition: { duration: 0.5 },
        }}
        style={{
          scale: breathe,
          width: size.width * 2,
          height: size.width * 2,
          top: -size.width,
          left: -size.width,
        }}
      >
        {/* <Image
        src="/diffused-red-circle.png"
        alt="Diffused red circle"
        width={200}
        height={200}
        className="w-full h-full"
      /> */}
      </motion.div>
      <motion.div
        className="gradient-circle bottom-right"
        initial={{ opacity: 0 }}
        animate={{
          opacity: 0.9,
          transition: { duration: enterDuration },
        }}
        exit={{
          opacity: 0,
          transition: { duration: exitDuration },
        }}
        style={{
          scale: breathe,
          width: size.width * 2,
          height: size.width * 2,
          top: size.height - size.width,
          left: 0,
        }}
      />
    </div>
  );
}

function ImmersiveOverlay({
  close,
  itemCount,
  size,
}: {
  close: () => void;
  itemCount: number;
  size: { width: number; height: number };
}) {
  const transition = {
    duration: 0.35,
    ease: [0.59, 0, 0.35, 1],
  };

  const enteringState = {
    rotateX: 0,
    skewY: 0,
    scaleY: 1,
    scaleX: 1,
    y: 0,
    transition: {
      ...transition,
      y: { type: "spring", visualDuration: 0.7, bounce: 0.2 },
    },
  };

  const exitingState = {
    rotateX: -5,
    skewY: -1.5,
    scaleY: 2,
    scaleX: 0.4,
    y: 100,
  };
  return (
    <div className="overlay-root" onClick={close}>
      <GradientOverlay size={size} />
      <motion.div
        className="overlay-content"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transition}
      >
        <motion.div
          className="modal-content"
          onClick={(e) => e.stopPropagation()}
          initial={exitingState}
          animate={enteringState}
          exit={exitingState}
          transition={transition}
          style={{
            transformPerspective: 1000,
            originX: 0.5,
            originY: 0,
          }}
        >
          <header>
            <h2 className="h3">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </h2>
          </header>
        </motion.div>
      </motion.div>
    </div>
  );
}
