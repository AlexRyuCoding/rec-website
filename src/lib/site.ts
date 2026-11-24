// Single source of truth for clinic facts. If a phone number, address, or
// the booking portal ever changes, change it here only.
export const SITE = {
  name: "Ryu Acupuncture Clinic",
  bookingUrl:
    "https://ryuacupunctureclinic.practicebetter.io/#/69a76ace301217c0cdc79550/bookings?r=6a583e048c01fe10f94ff69d",
  phone: { display: "(818) 841-9790", href: "tel:+18188419790" },
  fax: { display: "(818) 841-9092" },
  // What patients are shown and write to. On the clinic's Google
  // Workspace (covered by the clinic's HIPAA agreement), like FORMS_INBOX.
  email: "info@ryuacupuncture.com",
  address: {
    line: "3808 W. Riverside Dr. Ste. #510, Burbank, CA 91505",
    mapsUrl:
      "https://www.google.com/maps/dir/?api=1&destination=3808+West+Riverside+Dr+Burbank+CA+91505",
  },
  hours: [
    { days: "Monday · Wednesday · Friday", time: "9:30 AM – 5:00 PM" },
    { days: "Saturday", time: "9:00 AM – 1:00 PM" },
  ],
  socials: {
    facebook: "https://www.facebook.com/ryuacupuncture",
    instagram: "https://www.instagram.com/ryuacupuncture",
    yelp: "https://www.yelp.com/biz/ryu-acupuncture-clinic-burbank",
  },
  legalUrl:
    "https://www.termsfeed.com/live/ea661088-687f-4c39-a92a-7a6acf1bdbc8",
} as const;

// Where the website's forms (appointment request, grievance) are
// delivered. An address of its own so the inbox can tell a form from a
// letter; never shown to patients. site.test.ts fails if a form is sent
// anywhere else, or if any address in the site is a free mailbox: those
// are not covered by the clinic's HIPAA agreement.
export const FORMS_INBOX = "forms@ryuacupuncture.com";
