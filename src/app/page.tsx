import type { Metadata } from "next";
import Hero from "@/components/home/hero";
import Mission from "@/components/home/mission";
import ServicesRunway from "@/components/home/services-runway";
import DoctorBand from "@/components/home/doctor-band";
import Testimonials from "@/components/home/testimonials";
import PreFooterCta from "@/components/home/pre-footer-cta";

export const metadata: Metadata = {
  title:
    "Ryu Acupuncture Clinic — Acupuncture & Chinese Medicine in Burbank, CA",
  description:
    "Family-run acupuncture and Traditional Chinese Medicine clinic in Burbank, CA since 1997. Pain relief, fertility support, herbal medicine, and whole-body care.",
};

export default function Home() {
  return (
    <>
      <Hero />
      <Mission />
      <ServicesRunway />
      <DoctorBand />
      <Testimonials />
      <PreFooterCta />
    </>
  );
}
