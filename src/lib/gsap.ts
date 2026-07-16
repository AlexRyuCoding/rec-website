import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, CustomEase, useGSAP);
  if (!CustomEase.get("house")) {
    CustomEase.create("house", "0.24,1,0.36,1");
    CustomEase.create("houseQuint", "0.22,1,0.36,1");
  }
}

export { gsap, ScrollTrigger, useGSAP };
