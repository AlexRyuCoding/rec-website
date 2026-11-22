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
        // The staff look (dashboard and rooms board). Values live in
        // src/app/admin/staff-theme.css, one set per theme, under
        // html[data-staff-theme]. No opacity modifiers on these — every
        // tint has its own name.
        ui: {
          page: "var(--ui-page)",
          panel: "var(--ui-panel)",
          "panel-2": "var(--ui-panel-2)",
          well: "var(--ui-well)",
          btn: "var(--ui-btn)",
          line: "var(--ui-line)",
          "line-strong": "var(--ui-line-strong)",
          text: "var(--ui-text)",
          "text-2": "var(--ui-text-2)",
          "text-3": "var(--ui-text-3)",
          "accent-fill": "var(--ui-accent-fill)",
          "accent-fill-hover": "var(--ui-accent-fill-hover)",
          "accent-text": "var(--ui-accent-text)",
          "on-accent": "var(--ui-on-accent)",
          "tab-accent": "var(--ui-tab-accent)",
          error: "var(--ui-error)",
          "error-fill": "var(--ui-error-fill)",
          caution: "var(--ui-caution)",
          "st-waiting": "var(--ui-st-waiting)",
          "st-waiting-bg": "var(--ui-st-waiting-bg)",
          "st-next": "var(--ui-st-next)",
          "st-next-bg": "var(--ui-st-next-bg)",
          "st-called": "var(--ui-st-called)",
          "st-called-bg": "var(--ui-st-called-bg)",
          "st-doctor": "var(--ui-st-doctor)",
          "st-doctor-bg": "var(--ui-st-doctor-bg)",
          "st-in-use": "var(--ui-st-in-use)",
          "st-in-use-bg": "var(--ui-st-in-use-bg)",
          "st-complete": "var(--ui-st-complete)",
          "st-complete-bg": "var(--ui-st-complete-bg)",
          "st-overtime": "var(--ui-st-overtime)",
          "st-overtime-bg": "var(--ui-st-overtime-bg)",
          "st-turnover": "var(--ui-st-turnover)",
          "st-turnover-bg": "var(--ui-st-turnover-bg)",
          "st-open": "var(--ui-st-open)",
        },
        // Legacy palette — now aliased to the dark register. Admin/kiosk only.
        brand: {
          background: "#0e181d", // canvas
          foreground: "#eceae6", // cream
          primary: "#2a9e8f",
          secondary: "#238b7e",
          accent: "#e9c46a",
          "accent-light": "#fcdf97",
          "accent-dark": "#e8b63c",
          tertiary: "#f4a261",
          muted: "#22404b", // surface
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
      // Hard ledges of the staff look — never a blur (staff-theme.css).
      boxShadow: {
        "lift-1": "var(--ui-lift-1)",
        "lift-2": "var(--ui-lift-2)",
        "lift-accent": "var(--ui-lift-accent)",
        "lift-danger": "var(--ui-lift-danger)",
        sunk: "var(--ui-sunk)",
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
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fadeIn 300ms ease",
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
        lead: [
          "clamp(1.125rem, 1rem + 0.5vw, 1.375rem)",
          { lineHeight: "1.35" },
        ],
      },
    },
  },
  plugins: [],
};

export default config;
