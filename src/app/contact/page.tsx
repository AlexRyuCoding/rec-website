import Image from "next/image";
import Link from "next/link";

export default function Contact() {
  return (
    <div className="grid grid-rows-[40px_1fr_40px] items-center justify-items-center min-h-screen p-1 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)] relative">
      <div className="row-start-2">
        <main className="flex flex-col gap-4 max-w-4xl mx-auto">
          <p className="text-center text-2xl pb-4">
            We are always here to help you. Please feel free to contact us
            through the following channels:
          </p>
          <div className="flex flex-col items-center space-y-2 text-lg">
            <a
              href="mailto:ryuacupuncture@yahoo.com"
              className="hover:font-bold"
            >
              ryuacupuncture@yahoo.com
            </a>
            <br />
            <a href="tel:+18188419790" className="hover:font-bold">
              (818) 841-9790
            </a>
          </div>
          <div className="flex justify-center">
            <a
              href="https://patient.unifiedpractice.com/ryu-acupuncture"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 px-6 py-3 max-w-fit text-brand-background hover:bg-brand-gray-300 bg-brand-foreground rounded-md p-2 transition"
            >
              Book an Appointment With Us!
            </a>
          </div>
        </main>
      </div>
      <div className="absolute bottom-2 right-2 md:right-8 md:bottom-8">
        <Link href="/about">
          <Image
            src="/dr-jay-avatar.png"
            alt="Dr. Jay Avatar"
            className="w-36 h-36 md:w-48 md:h-48"
            width={200}
            height={200}
          />
        </Link>
      </div>
    </div>
  );
}
