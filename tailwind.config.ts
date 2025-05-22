import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}", // adjust to your project structure
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          background: "#ffffff",
          foreground: "#22404b",
          primary: "#2a9e8f",
          secondary: "#238b7e",
          accent: "#e9c46a",
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
    },
  },
  plugins: [],
};

export default config;
