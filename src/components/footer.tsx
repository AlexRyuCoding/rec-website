import Image from "next/image";
import Link from "next/link";
import { MapPin, Phone, Mail, Printer } from "lucide-react";

export default function Footer() {
  return (
    <footer className="w-full py-8 bg-brand-muted dark:bg-gray-800">
      <div className="container mx-auto px-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold">Contact Us</h3>
            <div className="flex items-start gap-2">
              <MapPin className="w-6 h-6" />
              <a
                href="https://www.google.com/maps/dir/?api=1&destination=3808+West+Riverside+Dr+Burbank+CA+91505"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                <p>3808 W. Riverside Dr. Ste. #510, Burbank, CA 91505</p>
              </a>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              <a
                href="mailto:ryuacupuncture@yahoo.com"
                className="hover:underline"
              >
                ryuacupuncture@yahoo.com
              </a>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              <a href="tel:818-841-9790" className="hover:underline">
                (818) 841-9790
              </a>
            </div>
            <div className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              <a href="tel:818-841-9092" className="hover:underline">
                (818) 841-9092
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold">Hours</h3>
            <p>Monday, Wednesday, Friday: 9:30 AM - 5:00 PM</p>
            <p>Saturday: 9:00 AM - 1:00 PM</p>

            <h3 className="text-lg font-semibold mt-4">Follow Us</h3>
            <div className="flex gap-4">
              <Link
                href="https://www.facebook.com/ryuacupuncture"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80"
              >
                <Image
                  src="/facebook.png"
                  alt="Facebook"
                  width={24}
                  height={24}
                />
              </Link>
              <Link
                href="https://www.instagram.com/ryuacupuncture"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80"
              >
                <Image
                  src="/instagram.svg"
                  alt="Instagram"
                  width={24}
                  height={24}
                />
              </Link>
              <Link
                href="https://www.yelp.com/biz/ryu-acupuncture-clinic-burbank"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80"
              >
                <Image
                  src="/yelp_burst.svg"
                  alt="Yelp"
                  width={24}
                  height={24}
                />
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex justify-center mb-4">
              <Link href="/">
                <Image
                  aria-hidden
                  src="/rac-logo-dark-moss.png"
                  alt="Ryu Acupuncture Clinic Logo"
                  width={100}
                  height={100}
                  className="block dark:hidden"
                />
                <Image
                  src="/rac-logo-white.png"
                  alt="Ryu Acupuncture Clinic Logo"
                  width={100}
                  height={100}
                  className="hidden dark:block"
                />
              </Link>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex flex-col gap-2">
                <Link
                  href="https://www.termsfeed.com/live/ea661088-687f-4c39-a92a-7a6acf1bdbc8"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  Privacy Policy
                </Link>
                <Link
                  href="https://www.termsfeed.com/live/ea661088-687f-4c39-a92a-7a6acf1bdbc8"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  Terms of Service
                </Link>
                <Link href="/report-a-grievance" className="hover:underline">
                  Report a Grievance
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full border-t border-gray-200 dark:border-gray-700 mt-8 pt-8">
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
          © {new Date().getFullYear()} Ryu Acupuncture Clinic. All rights
          reserved.
        </p>
      </div>
    </footer>
  );
}
