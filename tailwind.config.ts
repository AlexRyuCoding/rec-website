import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      colors: {
        canvas: "#0e181d",
        surface: "#22404b",
        island: "#eceae6",
        ink: "#2e3d42",
        cream: "#eceae6",
        gold: "#e9c46a",
        error: "#ff3c3c",
        // Legacy palette — admin/kiosk still reference these. Task 13 re-points
        // the values to the new register; do not use brand-* in new code.
        brand: {
          background: "#ffffff",
          foreground: "#22404b",
          primary: "#2a9e8f",
          secondary: "#238b7e",
          accent: "#e9c46a",
          "accent-light": "#fcdf97",
          "accent-dark": "#e8b63c",
          tertiary: "#f4a261",
          muted: "#e5e7eb",
          highlight: "#fefae0",
          danger: "#e76f51",
          gray: {
            50: "#f9fafb",
            100: "#f3f4f6",
            200: "#e5e7eb",
            300: "#d1d5db",
            400: "#9ca3af",
            500: "#6b7280",
          },
        },
      },
      borderRadius: {
        card: "30px",
        chip: "24px",
        sheet: "40px",
      },
      transitionTimingFunction: {
        default: "cubic-bezier(0.24, 1, 0.36, 1)",
        "out-quint": "cubic-bezier(0.22, 1, 0.36, 1)",
        menu: "cubic-bezier(0.6, 0.14, 0, 1)",
      },
      fontSize: {
        display: [
          "clamp(3.25rem, 1.25rem + 8.9vw, 9rem)",
          { lineHeight: "0.86", letterSpacing: "-0.04em" },
        ],
        title: [
          "clamp(2.5rem, 1.4rem + 4.9vw, 5.25rem)",
          { lineHeight: "0.9", letterSpacing: "-0.03em" },
        ],
        heading: [
          "clamp(1.875rem, 1.4rem + 2.1vw, 3.5rem)",
          { lineHeight: "0.94", letterSpacing: "-0.03em" },
        ],
        card: [
          "clamp(1.375rem, 1.2rem + 0.9vw, 2.1875rem)",
          { lineHeight: "1", letterSpacing: "-0.02em" },
        ],
        lead: ["clamp(1.125rem, 1rem + 0.5vw, 1.375rem)", { lineHeight: "1.35" }],
      },
    },
  },
  plugins: [],
};

export default config;
