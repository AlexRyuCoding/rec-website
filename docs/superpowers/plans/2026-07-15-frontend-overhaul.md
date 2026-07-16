# Frontend Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public site as a dark-first GSAP "scroll theater" per `docs/superpowers/specs/2026-07-15-frontend-overhaul-design.md`, reskin admin/kiosk, replace Unified Practice links with the Practice Better portal, and harden security + code quality.

**Architecture:** Single dark theme (no toggle). Design tokens live in `globals.css` + `tailwind.config.ts`; motion primitives (`src/components/motion/`) wrap GSAP + Lenis and are composed by server-component pages with client islands. Site facts (booking URL, phone, hours) centralize in `src/lib/site.ts`. Public form APIs gain zod validation, honeypot, and durable Supabase rate limiting mirroring `src/lib/pin-rate-limit.ts`.

**Tech Stack:** Next.js 15.1 (App Router), Tailwind v3, GSAP 3.13+ (`gsap`, `@gsap/react`), `lenis`, `zod`, `vitest`, Supabase, Resend.

## Global Constraints

Every task implicitly includes these. Copied from the approved spec:

- **Colors:** canvas `#0e181d` · surface `#22404b` · island `#eceae6` · ink `#2e3d42` · accent gold `#e9c46a` (the ONLY chromatic accent, ~5 uses/page) · error `#ff3c3c`. Orange `#f4a261` must not appear on public pages.
- **Zero `box-shadow` / Tailwind `shadow-*` anywhere.** Separation = hairlines (10–15% alpha), blur scrims, or inversion.
- **No uppercase text / `text-transform` anywhere.** No emojis in UI copy.
- **Serif = Instrument Serif 400 only** (headlines; hierarchy by size; at most ONE italic word per display line). Sans = Inter Tight 400/500/600/700.
- **Radii:** cards `rounded-card` (30px) · chips `rounded-chip` (24px) · sheets `rounded-t-sheet` (40px top) · pills `rounded-full` · icon buttons circles.
- **Breakpoint:** `lg:` (1024px) is THE breakpoint. Gutters `px-4 lg:px-8`.
- **Every public page opens with a full-width hero on the dark canvas** (the transparent header depends on it — no `mt-40`-style clearance hacks).
- **Reduced motion:** every GSAP effect checks `useMotionPrefs().reduced` and degrades to static/fade.
- **Booking URL** (returning patients / "Book Now"): `https://ryuacupunctureclinic.practicebetter.io/#/69a76ace301217c0cdc79550/bookings?r=6a583e048c01fe10f94ff69d` — only ever referenced via `SITE.bookingUrl`.
- **No logic changes** to admin/kiosk flows, API contracts, auth, Supabase schema (beyond the new rate-limit table), or PB integration.
- Existing page copy carries over verbatim unless a task shows new copy.
- Each task ends with `npx tsc --noEmit` and `npm run lint` clean, then a commit. Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

```
src/lib/site.ts                      NEW  site facts (booking URL, phone, hours…)
src/lib/gsap.ts                      NEW  gsap plugin/ease registration, re-exports
src/lib/validation.ts                NEW  zod schemas for both public forms
src/lib/form-rate-limit.ts           NEW  durable per-IP limiter (mirrors pin-rate-limit)
src/lib/validation.test.ts           NEW  vitest schema tests
supabase/migrations/0003_form_rate_limit.sql  NEW
src/app/ui/globals.css               REWRITE  tokens, base, underline-link, media ramp
src/app/ui/fonts.ts                  REWRITE  Instrument Serif + Inter Tight
tailwind.config.ts                   REWRITE  token mapping (legacy brand kept until Task 14)
src/app/layout.tsx                   MODIFY   fonts, MotionProvider, drop ThemeProvider
src/components/ui/pill-link.tsx      NEW  pill CTA with rolling label
src/components/ui/circle-button.tsx  NEW
src/components/ui/form-field.tsx     NEW  pill input + floating label
src/components/motion/motion-provider.tsx  NEW  Lenis + reduced-motion context
src/components/motion/reveal.tsx           NEW
src/components/motion/split-reveal.tsx     NEW
src/components/motion/scroll-fill-text.tsx NEW
src/components/motion/parallax.tsx         NEW
src/components/header.tsx            REWRITE  transparent hide-on-scroll shell
src/components/mobile-menu.tsx       NEW  bottom sheet (replaces drop-down-menu)
src/components/footer.tsx            REWRITE  gradient disc
src/components/home/hero.tsx                 NEW
src/components/home/mission.tsx              NEW
src/components/home/services-runway.tsx      NEW
src/components/home/doctor-band.tsx          NEW
src/components/home/testimonials.tsx         NEW (replaces src/components/testimonials.tsx)
src/components/home/pre-footer-cta.tsx       NEW
src/app/page.tsx                     REWRITE  server component + metadata
src/app/about/page.tsx               REWRITE
src/app/services/page.tsx            REWRITE
src/app/contact/page.tsx             REWRITE
src/app/request-an-appointment/page.tsx      REWRITE
src/components/request-form.tsx      REWRITE  pill fields, honeypot, inline status
src/components/grievance-form.tsx    REWRITE  same
src/app/api/request-form/route.ts    MODIFY   zod + honeypot + rate limit
src/app/api/grievance-form/route.ts  MODIFY   same
next.config.js                       MODIFY   security headers
src/app/admin/login/page.tsx         REWRITE  (visual only)
src/app/admin/dashboard/page.tsx     MODIFY   class swaps only
src/components/signin-keypad.tsx     MODIFY   class swaps only
DELETE: src/components/desktop-menu.tsx, drop-down-menu.tsx, theme-toggle.tsx,
        theme-provider.tsx, testimonials.tsx, public/unified-practice-logo.png,
        public/fonts/ (after Task 2)
```

---

### Task 1: Dependencies & fonts

**Files:**
- Modify: `package.json` (via npm commands)
- Rewrite: `src/app/ui/fonts.ts`

**Interfaces:**
- Produces: `instrumentSerif` and `interTight` exports from `@/app/ui/fonts`, exposing CSS vars `--font-serif` and `--font-sans`. All later tasks assume `gsap`, `@gsap/react`, `lenis`, `zod`, `vitest` are installed.

- [ ] **Step 1: Install/align dependencies**

```bash
npm install gsap @gsap/react lenis zod
npm install -D eslint-config-next@15.1.11 vitest
npm uninstall @tailwindcss/postcss
```

Note: `motion` and `next-themes` are still imported by old pages — they are uninstalled in Task 14 after all consumers are rewritten.

- [ ] **Step 2: Rewrite `src/app/ui/fonts.ts`**

```ts
import { Instrument_Serif, Inter_Tight } from "next/font/google";

export const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const interTight = Inter_Tight({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
```

This breaks `layout.tsx`'s `generalSans` import — fix it now (minimal edit; full layout rewrite comes in Task 4). In `src/app/layout.tsx` replace the import and body class:

```tsx
import { instrumentSerif, interTight } from "./ui/fonts";
```

```tsx
      <body
        className={`${instrumentSerif.variable} ${interTight.variable} antialiased`}
        suppressHydrationWarning
      >
```

Also delete the Material Icons `<link>` block in `<head>` (grep confirms zero usages of `material-icons` in `src/`). The `<head>` element becomes empty — remove it entirely.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass. (Site still renders with old styles; body font falls back until Task 2 maps `--font-sans`.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add gsap/lenis/zod, swap to Instrument Serif + Inter Tight, align eslint-config-next"
```

---

### Task 2: Design tokens (globals.css + tailwind.config.ts)

**Files:**
- Rewrite: `src/app/ui/globals.css`
- Rewrite: `tailwind.config.ts`
- Delete: `public/fonts/` (General Sans woff2 files, now unreferenced)

**Interfaces:**
- Produces: Tailwind classes used by every later task — colors `canvas`, `surface`, `island`, `ink`, `cream`, `gold`, `error`; radii `rounded-card`, `rounded-chip`, `rounded-t-sheet`; easings `ease-default`, `ease-out-quint`, `ease-menu`; font sizes `text-display`, `text-title`, `text-heading`, `text-card`, `text-lead`; CSS classes `.underline-link`, `.media-ramp`; CSS vars `--canvas`, `--island`, `--ink`, `--accent`, `--hairline-on-dark`, `--hairline-on-light`, `--muted-on-dark`, `--muted-on-light`.

- [ ] **Step 1: Rewrite `src/app/ui/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --canvas: #0e181d;
  --surface: #22404b;
  --island: #eceae6;
  --ink: #2e3d42;
  --accent: #e9c46a;
  --error: #ff3c3c;
  --muted-on-dark: rgba(236, 234, 230, 0.4);
  --muted-on-light: rgba(46, 61, 66, 0.45);
  --hairline-on-dark: rgba(236, 234, 230, 0.14);
  --hairline-on-light: rgba(46, 61, 66, 0.12);
  --ease-default: cubic-bezier(0.24, 1, 0.36, 1);
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-menu: cubic-bezier(0.6, 0.14, 0, 1);
}

body {
  background: var(--canvas);
  color: var(--island);
  font-family: var(--font-sans), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

::selection {
  background: var(--accent);
  color: var(--canvas);
}

@layer components {
  /* Underline link: 1px line wipes out to the right, re-enters from the left */
  .underline-link {
    position: relative;
    display: inline-block;
  }
  .underline-link::before,
  .underline-link::after {
    content: "";
    position: absolute;
    left: 0;
    bottom: -3px;
    height: 1px;
    width: 100%;
    background: currentColor;
  }
  .underline-link::before {
    transform-origin: right;
    transition: transform 0.7s var(--ease-out-quint);
  }
  .underline-link::after {
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 0.7s var(--ease-out-quint) 0.35s;
  }
  .underline-link:hover::before {
    transform: scaleX(0);
  }
  .underline-link:hover::after {
    transform: scaleX(1);
  }

  /* 16-stop eased ramp fading media into the canvas (house scrim) */
  .media-ramp {
    position: relative;
  }
  .media-ramp::after {
    content: "";
    position: absolute;
    inset: auto 0 0 0;
    height: 45%;
    pointer-events: none;
    background: linear-gradient(
      180deg,
      rgba(14, 24, 29, 0) 0%,
      rgba(14, 24, 29, 0.013) 12.19%,
      rgba(14, 24, 29, 0.049) 22.01%,
      rgba(14, 24, 29, 0.104) 29.8%,
      rgba(14, 24, 29, 0.175) 35.95%,
      rgba(14, 24, 29, 0.259) 40.81%,
      rgba(14, 24, 29, 0.352) 44.77%,
      rgba(14, 24, 29, 0.45) 48.18%,
      rgba(14, 24, 29, 0.55) 51.41%,
      rgba(14, 24, 29, 0.648) 54.84%,
      rgba(14, 24, 29, 0.741) 58.82%,
      rgba(14, 24, 29, 0.825) 63.73%,
      rgba(14, 24, 29, 0.896) 69.94%,
      rgba(14, 24, 29, 0.951) 77.8%,
      rgba(14, 24, 29, 0.987) 87.7%,
      rgba(14, 24, 29, 1) 100%
    );
  }
}
```

Deliberate removals vs the old file: the light/dark `:root`/`.dark` blocks and the global `* { transition: … }` rule (it fights GSAP and hurts performance).

- [ ] **Step 2: Rewrite `tailwind.config.ts`**

```ts
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
```

Note `darkMode: "class"` is removed — `dark:` variants in not-yet-rebuilt files become inert (they can never activate; visual no-op) and are deleted as those files are rewritten.

- [ ] **Step 3: Delete the local font files**

```bash
git rm -r public/fonts
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: pass. Old pages will look temporarily wrong (light text conventions on the new dark body) — expected mid-migration; every page is rebuilt in Tasks 6–13.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: dark-first design tokens, type scale, house easings"
```

---

### Task 3: Site constants + kill Unified Practice links

**Files:**
- Create: `src/lib/site.ts`
- Modify: `src/app/contact/page.tsx:27`, `src/app/request-an-appointment/page.tsx:46,99`
- Delete: `public/unified-practice-logo.png`

**Interfaces:**
- Produces: `SITE` const from `@/lib/site` with the exact shape below. Every later task uses `SITE.bookingUrl`, `SITE.phone.display`, `SITE.phone.href`, `SITE.fax.display`, `SITE.email`, `SITE.address.line`, `SITE.address.mapsUrl`, `SITE.hours` (array of `{ days, time }`), `SITE.socials.{facebook,instagram,yelp}`, `SITE.legalUrl`.

This task ships the EHR-link fix independently of the visual work.

- [ ] **Step 1: Create `src/lib/site.ts`**

```ts
// Single source of truth for clinic facts. If a phone number, address, or
// the booking portal ever changes, change it here only.
export const SITE = {
  name: "Ryu Acupuncture Clinic",
  bookingUrl:
    "https://ryuacupunctureclinic.practicebetter.io/#/69a76ace301217c0cdc79550/bookings?r=6a583e048c01fe10f94ff69d",
  phone: { display: "(818) 841-9790", href: "tel:+18188419790" },
  fax: { display: "(818) 841-9092" },
  email: "ryuacupuncture@yahoo.com",
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
```

- [ ] **Step 2: Swap the three Unified Practice URLs**

In `src/app/contact/page.tsx` and `src/app/request-an-appointment/page.tsx`, add `import { SITE } from "@/lib/site";` and replace every
`href="https://patient.unifiedpractice.com/ryu-acupuncture"` with `href={SITE.bookingUrl}`. (Both files are fully rebuilt in Task 10 — this is the safety net so no UP link survives regardless.)

- [ ] **Step 3: Delete the logo asset**

```bash
git rm public/unified-practice-logo.png
grep -rn "unified" src public && echo "LEFTOVERS FOUND" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: pass.

```bash
git add -A
git commit -m "feat: centralize site facts, replace Unified Practice links with Practice Better portal"
```

---

### Task 4: Motion foundation (gsap lib, provider, layout wiring)

**Files:**
- Create: `src/lib/gsap.ts`, `src/components/motion/motion-provider.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: `import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap"` (plugins + eases `"house"`, `"houseQuint"` pre-registered); `useMotionPrefs(): { reduced: boolean }` from `@/components/motion/motion-provider`. Lenis runs on public routes only.

- [ ] **Step 1: Create `src/lib/gsap.ts`**

```ts
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
```

- [ ] **Step 2: Create `src/components/motion/motion-provider.tsx`**

```tsx
"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "@/lib/gsap";

const MotionContext = createContext<{ reduced: boolean }>({ reduced: false });

export function useMotionPrefs() {
  return useContext(MotionContext);
}

export default function MotionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [reduced, setReduced] = useState(false);
  const isAdmin = pathname?.startsWith("/admin") ?? false;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced || isAdmin) return;
    const lenis = new Lenis({ duration: 1.2 });
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, [reduced, isAdmin]);

  return (
    <MotionContext.Provider value={{ reduced }}>
      {children}
    </MotionContext.Provider>
  );
}
```

- [ ] **Step 3: Rewrite `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./ui/globals.css";
import Header from "@/components/header";
import ConditionalFooter from "@/components/conditional-footer";
import MotionProvider from "@/components/motion/motion-provider";
import { instrumentSerif, interTight } from "./ui/fonts";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.ryuacupuncture.com"),
  title: {
    default: "Ryu Acupuncture Clinic — Burbank, CA",
    template: "%s — Ryu Acupuncture Clinic",
  },
  description:
    "Holistic acupuncture and Chinese medicine in Burbank, CA. Treating pain, stress, fertility, and chronic conditions with personalized care.",
  icons: { icon: "/rac-logo-blue-white.png" },
  openGraph: {
    title: "Ryu Acupuncture Clinic, Inc.",
    description:
      "Holistic acupuncture and Chinese medicine in Burbank, CA. Treating pain, stress, fertility, and chronic conditions with personalized care.",
    images: ["/rac-logo-blue-white.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${instrumentSerif.variable} ${interTight.variable} antialiased`}
      >
        <MotionProvider>
          <Header />
          {children}
          <ConditionalFooter />
        </MotionProvider>
      </body>
    </html>
  );
}
```

`ThemeProvider` is gone from the tree, but `theme-provider.tsx`/`theme-toggle.tsx` files are deleted in Task 6 (old header still imports the toggle until then). `suppressHydrationWarning` (a next-themes artifact) is dropped.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npm run build`
Expected: pass. Start `npm run dev`, load `/` — smooth (Lenis) scrolling active; no console errors.

```bash
git add -A
git commit -m "feat: GSAP/Lenis motion foundation with reduced-motion support"
```

---

### Task 5: UI + motion primitives

**Files:**
- Create: `src/components/ui/pill-link.tsx`, `src/components/ui/circle-button.tsx`, `src/components/ui/form-field.tsx`
- Create: `src/components/motion/reveal.tsx`, `src/components/motion/split-reveal.tsx`, `src/components/motion/scroll-fill-text.tsx`, `src/components/motion/parallax.tsx`

**Interfaces:**
- Produces (consumed by all page tasks):
  - `PillLink({ href, children, variant?: "light" | "dark" | "gold", external?: boolean, className? })`
  - `CircleButton({ children, onClick?, label, className? })` — `label` is the aria-label
  - `FormField({ id, name, label, value, onChange, type?, textarea?, required?, rows? })`
  - `Reveal({ children, className?, delay?, y? })`
  - `SplitReveal({ segments, as?, className? })` where `segments: { text: string; italic?: boolean }[]`
  - `ScrollFillText({ text, className? })`
  - `Parallax({ src, alt, className?, sizes?, priority? })`

- [ ] **Step 1: Create `src/components/ui/pill-link.tsx`**

```tsx
import Link from "next/link";

const VARIANTS = {
  light: "bg-island text-ink",
  dark: "bg-surface text-cream",
  gold: "bg-gold text-canvas",
} as const;

interface PillLinkProps {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
  external?: boolean;
  className?: string;
}

// Label is duplicated in two stacked spans that roll up on hover (design
// system's signature pill interaction).
function RollingLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative block overflow-hidden">
      <span className="block transition-transform duration-300 ease-default group-hover:-translate-y-[105%]">
        {children}
      </span>
      <span
        aria-hidden
        className="absolute inset-0 block translate-y-[105%] transition-transform duration-300 ease-default group-hover:translate-y-0"
      >
        {children}
      </span>
    </span>
  );
}

export default function PillLink({
  href,
  children,
  variant = "light",
  external = false,
  className = "",
}: PillLinkProps) {
  const classes = `group inline-block rounded-full px-6 py-4 text-sm font-bold leading-none ${VARIANTS[variant]} ${className}`;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        <RollingLabel>{children}</RollingLabel>
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      <RollingLabel>{children}</RollingLabel>
    </Link>
  );
}
```

- [ ] **Step 2: Create `src/components/ui/circle-button.tsx`**

```tsx
interface CircleButtonProps {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  className?: string;
}

export default function CircleButton({
  children,
  label,
  onClick,
  className = "",
}: CircleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex size-14 items-center justify-center rounded-full border border-cream/15 text-cream transition-colors duration-300 ease-default hover:bg-island hover:text-ink ${className}`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Create `src/components/ui/form-field.tsx`**

Pill inputs with floating labels, styled for light (island) surfaces where all forms live:

```tsx
"use client";

interface FormFieldProps {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  type?: string;
  textarea?: boolean;
  required?: boolean;
  rows?: number;
}

const FIELD_CLASSES =
  "peer w-full border border-ink/20 bg-transparent px-6 pt-6 pb-2 text-base text-ink outline-none transition-colors duration-300 focus:border-ink/60";
const LABEL_CLASSES =
  "pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-muted-on-light text-base text-ink/50 transition-all duration-300 ease-default peer-focus:top-4 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-4 peer-[:not(:placeholder-shown)]:text-xs";

export default function FormField({
  id,
  name,
  label,
  value,
  onChange,
  type = "text",
  textarea = false,
  required = false,
  rows = 5,
}: FormFieldProps) {
  return (
    <div className="relative">
      {textarea ? (
        <textarea
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          rows={rows}
          placeholder=" "
          className={`${FIELD_CLASSES} rounded-chip`}
        />
      ) : (
        <input
          type={type}
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          placeholder=" "
          className={`${FIELD_CLASSES} rounded-full`}
        />
      )}
      <label
        htmlFor={id}
        className={`${LABEL_CLASSES} ${textarea ? "top-7" : ""}`}
      >
        {label}
        {required ? " *" : ""}
      </label>
    </div>
  );
}
```

(For textareas the label floats from `top-7` since the box is tall; the peer rules still shrink it on focus/filled.)

- [ ] **Step 4: Create `src/components/motion/reveal.tsx`**

```tsx
"use client";
import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useMotionPrefs } from "./motion-provider";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}

export default function Reveal({
  children,
  className,
  delay = 0,
  y = 32,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { reduced } = useMotionPrefs();

  useGSAP(
    () => {
      if (reduced || !ref.current) return;
      gsap.from(ref.current, {
        autoAlpha: 0,
        y,
        duration: 0.8,
        delay,
        ease: "houseQuint",
        scrollTrigger: { trigger: ref.current, start: "top 85%", once: true },
      });
    },
    { scope: ref, dependencies: [reduced] }
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Create `src/components/motion/split-reveal.tsx`**

Manual word-mask split (per the design system's rebuild guidance) — words rise from `y:110%` inside overflow-hidden wrappers, stagger 0.08:

```tsx
"use client";
import { createElement, useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useMotionPrefs } from "./motion-provider";

export interface SplitSegment {
  text: string;
  italic?: boolean;
}

interface SplitRevealProps {
  segments: SplitSegment[];
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
}

export default function SplitReveal({
  segments,
  as = "h2",
  className,
}: SplitRevealProps) {
  const ref = useRef<HTMLElement>(null);
  const { reduced } = useMotionPrefs();

  useGSAP(
    () => {
      if (reduced || !ref.current) return;
      gsap.from(ref.current.querySelectorAll("[data-word] > span"), {
        yPercent: 110,
        duration: 0.8,
        stagger: 0.08,
        ease: "houseQuint",
        scrollTrigger: { trigger: ref.current, start: "top 85%", once: true },
      });
    },
    { scope: ref, dependencies: [reduced] }
  );

  const words = segments.flatMap((seg, si) =>
    seg.text
      .split(" ")
      .filter(Boolean)
      .map((word, wi) => ({ word, italic: seg.italic, key: `${si}-${wi}` }))
  );

  return createElement(
    as,
    { ref, className },
    words.map(({ word, italic, key }) => (
      <span
        key={key}
        data-word
        className="inline-block overflow-hidden pb-[0.08em] align-top"
      >
        <span className={`inline-block will-change-transform ${italic ? "italic" : ""}`}>
          {word}
          {" "}
        </span>
      </span>
    ))
  );
}
```

- [ ] **Step 6: Create `src/components/motion/scroll-fill-text.tsx`**

```tsx
"use client";
import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useMotionPrefs } from "./motion-provider";

interface ScrollFillTextProps {
  text: string;
  className?: string;
}

export default function ScrollFillText({
  text,
  className,
}: ScrollFillTextProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { reduced } = useMotionPrefs();

  useGSAP(
    () => {
      if (!ref.current) return;
      if (reduced) {
        gsap.set(ref.current.querySelectorAll("[data-fill-word]"), {
          opacity: 1,
        });
        return;
      }
      gsap.to(ref.current.querySelectorAll("[data-fill-word]"), {
        opacity: 1,
        ease: "none",
        stagger: 0.5,
        scrollTrigger: {
          trigger: ref.current,
          start: "top 75%",
          end: "bottom 45%",
          scrub: true,
        },
      });
    },
    { scope: ref, dependencies: [reduced] }
  );

  return (
    <p ref={ref} className={className} aria-label={text}>
      {text.split(" ").map((word, i) => (
        <span key={i} aria-hidden data-fill-word className="opacity-20">
          {word}{" "}
        </span>
      ))}
    </p>
  );
}
```

- [ ] **Step 7: Create `src/components/motion/parallax.tsx`**

```tsx
"use client";
import { useRef } from "react";
import Image from "next/image";
import { gsap, useGSAP } from "@/lib/gsap";
import { useMotionPrefs } from "./motion-provider";

interface ParallaxProps {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

export default function Parallax({
  src,
  alt,
  className = "",
  sizes = "100vw",
  priority = false,
}: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { reduced } = useMotionPrefs();

  useGSAP(
    () => {
      if (reduced || !ref.current) return;
      gsap.fromTo(
        ref.current.querySelector("img"),
        { yPercent: -8 },
        {
          yPercent: 8,
          ease: "none",
          scrollTrigger: {
            trigger: ref.current,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.4,
          },
        }
      );
    },
    { scope: ref, dependencies: [reduced] }
  );

  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="scale-[1.18] object-cover"
      />
    </div>
  );
}
```

- [ ] **Step 8: Verify + commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: pass (components not yet consumed; that's fine).

```bash
git add -A
git commit -m "feat: UI primitives (pill, circle, form field) and motion primitives"
```

---

### Task 6: Header + mobile menu

**Files:**
- Rewrite: `src/components/header.tsx`
- Create: `src/components/mobile-menu.tsx`
- Delete: `src/components/desktop-menu.tsx`, `src/components/drop-down-menu.tsx`, `src/components/theme-toggle.tsx`, `src/components/theme-provider.tsx`

**Interfaces:**
- Consumes: `PillLink`, `SITE`.
- Produces: global `<Header />` (already mounted in layout). Fixed, transparent, `pointer-events-none` shell; hides scrolling down past 200px, returns on scroll-up, blur scrim past 500px.

- [ ] **Step 1: Rewrite `src/components/header.tsx`**

```tsx
"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import PillLink from "@/components/ui/pill-link";
import MobileMenu from "@/components/mobile-menu";
import { SITE } from "@/lib/site";

export const NAV_ITEMS = [
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/request-an-appointment", label: "Request an Appointment" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  const [hidden, setHidden] = useState(false);
  const [scrimmed, setScrimmed] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setHidden(y > 200 && y > lastY.current);
      setScrimmed(y > 500);
      lastY.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 transition-transform duration-500 ease-default ${
        hidden ? "-translate-y-full" : ""
      }`}
    >
      <div
        className={`flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-300 lg:px-8 ${
          scrimmed ? "bg-canvas/60 backdrop-blur-md" : ""
        }`}
      >
        <Link href="/" className="pointer-events-auto shrink-0">
          <Image
            src="/rac-logo-white.png"
            alt="Ryu Acupuncture Clinic"
            width={48}
            height={48}
          />
        </Link>

        <nav className="pointer-events-auto hidden items-center gap-8 lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="underline-link text-sm font-medium text-cream"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="pointer-events-auto flex items-center gap-3">
          <PillLink href={SITE.bookingUrl} external className="hidden lg:inline-block">
            Book Now
          </PillLink>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create `src/components/mobile-menu.tsx`**

Bottom sheet with 40px top radius over a blur scrim (design-system modal pattern):

```tsx
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AlignJustify, X } from "lucide-react";
import PillLink from "@/components/ui/pill-link";
import { SITE } from "@/lib/site";

const MENU_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/request-an-appointment", label: "Request an Appointment" },
  { href: "/contact", label: "Contact" },
  { href: "/report-a-grievance", label: "Report a Grievance" },
];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock page scroll while the sheet is open
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex size-12 items-center justify-center rounded-full border border-cream/15 text-cream"
      >
        {open ? <X className="size-5" /> : <AlignJustify className="size-5" />}
      </button>

      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 -z-10 bg-canvas/50 backdrop-blur-md transition-opacity duration-500 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        className={`fixed inset-x-0 bottom-0 rounded-t-sheet bg-island px-6 pb-10 pt-8 text-ink transition-transform duration-500 ease-menu ${
          open ? "translate-y-0" : "pointer-events-none translate-y-full"
        }`}
      >
        <nav className="flex flex-col">
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="border-b py-4 font-serif text-3xl leading-none last:border-b-0"
              style={{ borderColor: "var(--hairline-on-light)" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 flex items-center justify-between">
          <PillLink href={SITE.bookingUrl} external variant="dark">
            Book Now
          </PillLink>
          <a href={SITE.phone.href} className="text-sm font-bold">
            {SITE.phone.display}
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Delete the replaced components**

```bash
git rm src/components/desktop-menu.tsx src/components/drop-down-menu.tsx src/components/theme-toggle.tsx src/components/theme-provider.tsx
grep -rn "next-themes\|theme-provider\|theme-toggle\|desktop-menu\|drop-down-menu" src && echo "LEFTOVERS" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npm run build`
Expected: pass. Dev-check: header transparent at top, hides on scroll-down, returns on scroll-up, scrim past 500px; mobile sheet opens/closes; kiosk page (`/admin/patient-signin`) still lays out (it doesn't scroll, so the header simply stays).

```bash
git add -A
git commit -m "feat: transparent hide-on-scroll header with sheet mobile menu"
```

---

### Task 7: Footer

**Files:**
- Rewrite: `src/components/footer.tsx`

**Interfaces:**
- Consumes: `SITE`, `useMotionPrefs`, `@/lib/gsap`. `conditional-footer.tsx` continues to hide it on `/admin/*` — unchanged.

- [ ] **Step 1: Rewrite `src/components/footer.tsx`**

```tsx
"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useMotionPrefs } from "@/components/motion/motion-provider";
import { SITE } from "@/lib/site";

const SOCIALS = [
  { href: SITE.socials.facebook, src: "/facebook.png", alt: "Facebook" },
  { href: SITE.socials.instagram, src: "/instagram.svg", alt: "Instagram" },
  { href: SITE.socials.yelp, src: "/yelp_burst.svg", alt: "Yelp" },
];

export default function Footer() {
  const root = useRef<HTMLElement>(null);
  const { reduced } = useMotionPrefs();

  useGSAP(
    () => {
      if (reduced || !root.current) return;
      gsap.fromTo(
        root.current.querySelector("[data-disc]"),
        { scale: 1 },
        {
          scale: 2.4,
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top bottom",
            end: "bottom bottom",
            scrub: 0.4,
          },
        }
      );
    },
    { scope: root, dependencies: [reduced] }
  );

  return (
    <footer ref={root} className="relative overflow-hidden bg-canvas">
      {/* Rising gradient disc (design-system footer signature) */}
      <div
        data-disc
        aria-hidden
        className="absolute left-1/2 top-1/3 size-[130vw] -translate-x-1/2 rounded-full lg:size-[70vw]"
        style={{
          background:
            "radial-gradient(circle at 50% 25%, #22404b 0%, #101b21 55%, #010203 100%)",
        }}
      />

      <div className="relative px-4 pb-10 pt-24 lg:px-8 lg:pt-40">
        <div className="mb-16 flex flex-col items-center gap-6 text-center lg:mb-24">
          <Image
            src="/rac-logo-white.png"
            alt="Ryu Acupuncture Clinic"
            width={72}
            height={72}
          />
          <p className="font-serif text-title text-cream">
            Ryu Acupuncture <i>Clinic</i>
          </p>
        </div>

        <div
          className="grid grid-cols-1 gap-10 border-t pt-10 lg:grid-cols-3"
          style={{ borderColor: "var(--hairline-on-dark)" }}
        >
          <div className="flex flex-col gap-3 text-sm text-cream">
            <p className="font-bold">Contact</p>
            <a
              href={SITE.address.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-link w-fit text-cream/60"
            >
              {SITE.address.line}
            </a>
            <a href={`mailto:${SITE.email}`} className="underline-link w-fit text-cream/60">
              {SITE.email}
            </a>
            <a href={SITE.phone.href} className="underline-link w-fit text-cream/60">
              {SITE.phone.display}
            </a>
            <p className="text-cream/60">Fax: {SITE.fax.display}</p>
          </div>

          <div className="flex flex-col gap-3 text-sm text-cream">
            <p className="font-bold">Hours</p>
            {SITE.hours.map((h) => (
              <p key={h.days} className="text-cream/60">
                {h.days} · {h.time}
              </p>
            ))}
            <div className="mt-2 flex gap-3">
              {SOCIALS.map((s) => (
                <a
                  key={s.alt}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.alt}
                  className="flex size-10 items-center justify-center rounded-full border border-cream/15 transition-colors duration-300 hover:bg-island"
                >
                  <Image src={s.src} alt="" width={18} height={18} />
                </a>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 text-sm">
            <p className="font-bold text-cream">Legal</p>
            <a
              href={SITE.legalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-link w-fit text-cream/60"
            >
              Privacy Policy & Terms
            </a>
            <Link href="/report-a-grievance" className="underline-link w-fit text-cream/60">
              Report a Grievance
            </Link>
          </div>
        </div>

        <p
          className="mt-12 border-t pt-6 text-center text-xs text-cream/40"
          style={{ borderColor: "var(--hairline-on-dark)" }}
        >
          © {new Date().getFullYear()} Ryu Acupuncture Clinic. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit && npm run build`
Expected: pass. Dev-check: disc scales up as footer scrolls into view; hairline columns; roll-up hovers.

```bash
git add -A
git commit -m "feat: footer with rising gradient disc and hairline columns"
```

---

### Task 8: Home page

**Files:**
- Create: `src/components/home/hero.tsx`, `mission.tsx`, `services-runway.tsx`, `doctor-band.tsx`, `testimonials.tsx`, `pre-footer-cta.tsx`
- Rewrite: `src/app/page.tsx`
- Delete: `src/components/testimonials.tsx`

**Interfaces:**
- Consumes: `SplitReveal`, `ScrollFillText`, `Reveal`, `Parallax`, `PillLink`, `CircleButton`, `SITE`, `@/lib/gsap`, `useMotionPrefs`.
- Produces: nothing consumed later; `src/app/page.tsx` is a server component with `metadata`.

- [ ] **Step 1: Create `src/components/home/hero.tsx`**

```tsx
"use client";
import Link from "next/link";
import SplitReveal from "@/components/motion/split-reveal";
import Reveal from "@/components/motion/reveal";
import Parallax from "@/components/motion/parallax";
import PillLink from "@/components/ui/pill-link";
import { SITE } from "@/lib/site";

export default function Hero() {
  return (
    <section className="flex min-h-svh flex-col justify-end px-4 pb-8 pt-28 lg:px-8 lg:pb-12">
      <SplitReveal
        as="h1"
        className="font-serif text-display text-cream"
        segments={[
          { text: "Restore balance," },
          { text: "heal" },
          { text: "naturally.", italic: true },
        ]}
      />
      <div className="mt-10 flex flex-col gap-8 lg:mt-16 lg:flex-row lg:items-end lg:justify-between">
        <Reveal delay={0.3} className="max-w-sm">
          <p className="text-base leading-relaxed text-cream/60">
            At Ryu Acupuncture Clinic, we blend the wisdom of Traditional
            Chinese Medicine with compassionate, personalized care to promote
            integrated health, energy, and vitality.
          </p>
          <div className="mt-6 flex items-center gap-6">
            <PillLink href={SITE.bookingUrl} external>
              Book Now
            </PillLink>
            <Link
              href="/request-an-appointment"
              className="underline-link text-sm font-medium text-cream"
            >
              First visit? Start here
            </Link>
          </div>
        </Reveal>
        <Reveal delay={0.15} className="lg:w-[42%]">
          <div className="media-ramp">
            <Parallax
              src="/acupuncture-treatment.jpg"
              alt="Acupuncture treatment at Ryu Acupuncture Clinic"
              className="aspect-[4/3] rounded-card"
              sizes="(min-width: 1024px) 42vw, 100vw"
              priority
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create `src/components/home/mission.tsx`**

```tsx
"use client";
import ScrollFillText from "@/components/motion/scroll-fill-text";
import Reveal from "@/components/motion/reveal";

export default function Mission() {
  return (
    <section className="px-4 py-24 lg:px-8 lg:py-48">
      <p className="mb-8 text-sm font-medium text-cream/40">Our promise:</p>
      <ScrollFillText
        className="max-w-5xl font-serif text-heading text-cream"
        text="For over 25 years, our family-run clinic has helped Burbank restore balance, reduce pain, and reconnect with the body's natural healing process — with care, respect, and clinical expertise."
      />
      <Reveal className="mt-10 flex items-center gap-4">
        <span className="rounded-full border border-cream/15 px-5 py-2 text-sm font-bold text-gold">
          25+ years
        </span>
        <span className="rounded-full border border-cream/15 px-5 py-2 text-sm font-bold text-cream">
          Family-run since 1997
        </span>
      </Reveal>
    </section>
  );
}
```

- [ ] **Step 3: Create `src/components/home/services-runway.tsx`**

Sticky deck (CSS sticky, not GSAP pin). Reduced motion renders a static stacked list:

```tsx
"use client";
import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { gsap, useGSAP } from "@/lib/gsap";
import { useMotionPrefs } from "@/components/motion/motion-provider";

const SLIDES = [
  {
    title: "Acupuncture",
    sub: "& Electroacupuncture",
    copy: "Targeted needle therapy to stimulate healing, reduce inflammation, and ease pain naturally.",
    img: "/acupuncture-treatment.jpg",
  },
  {
    title: "Herbal Medicine",
    sub: "& Supplements",
    copy: "Customized herbal formulas to restore balance and improve internal health.",
    img: "/herbal-medicine.jpg",
  },
  {
    title: "Fertility",
    sub: "& Women's Health",
    copy: "Gentle, natural support for fertility, menstrual health, and hormone balance.",
    img: "/fire-cupping.jpg",
  },
];

export default function ServicesRunway() {
  const root = useRef<HTMLElement>(null);
  const { reduced } = useMotionPrefs();

  useGSAP(
    () => {
      if (reduced || !root.current) return;
      const tl = gsap.timeline({
        defaults: { duration: 1, ease: "none" },
        scrollTrigger: {
          trigger: root.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.4,
        },
      });
      SLIDES.forEach((_, i) => {
        if (i === 0) return;
        tl.to(`[data-slide="${i - 1}"]`, { autoAlpha: 0, y: -24 }, i)
          .fromTo(
            `[data-slide="${i}"]`,
            { autoAlpha: 0, y: 24 },
            { autoAlpha: 1, y: 0 },
            i
          )
          .fromTo(
            `[data-img="${i}"]`,
            { autoAlpha: 0, scale: 1.08 },
            { autoAlpha: 1, scale: 1 },
            i
          );
      });
    },
    { scope: root, dependencies: [reduced] }
  );

  if (reduced) {
    return (
      <section className="flex flex-col gap-16 px-4 py-24 lg:px-8">
        {SLIDES.map((s) => (
          <div key={s.title} className="flex flex-col gap-6 lg:flex-row lg:items-center">
            <div className="lg:w-1/2">
              <h3 className="font-serif text-title text-cream">
                {s.title} <i>{s.sub}</i>
              </h3>
              <p className="mt-4 max-w-sm text-cream/60">{s.copy}</p>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-card lg:w-1/2">
              <Image src={s.img} alt={s.title} fill className="object-cover" />
            </div>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section ref={root} className="relative h-[300vh]">
      <div className="sticky top-0 flex h-svh flex-col justify-center px-4 lg:px-8">
        <p className="mb-6 text-sm font-medium text-cream/40">What we treat with:</p>
        <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative h-56 lg:h-72 lg:w-1/2">
            {SLIDES.map((s, i) => (
              <div
                key={s.title}
                data-slide={i}
                className="absolute inset-0"
                style={i > 0 ? { opacity: 0, visibility: "hidden" } : undefined}
              >
                <h3 className="font-serif text-title text-cream">
                  {s.title} <i>{s.sub}</i>
                </h3>
                <p className="mt-4 max-w-sm text-cream/60">{s.copy}</p>
                <Link
                  href="/services"
                  className="underline-link mt-6 inline-block text-sm font-medium text-cream"
                >
                  Explore all services
                </Link>
              </div>
            ))}
          </div>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card lg:w-[42%]">
            {SLIDES.map((s, i) => (
              <div
                key={s.title}
                data-img={i}
                className="absolute inset-0"
                style={i > 0 ? { opacity: 0, visibility: "hidden" } : undefined}
              >
                <Image
                  src={s.img}
                  alt={s.title}
                  fill
                  sizes="(min-width: 1024px) 42vw, 100vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>
        <p className="mt-8 font-serif text-card text-cream/40" data-counter>
          <span className="text-cream">01</span> / 03
        </p>
      </div>
    </section>
  );
}
```

(The counter is decorative; updating it per-slide is optional polish — if added, use the same timeline with a `.set()` swapping `textContent`, but static "01 / 03" is acceptable.)

- [ ] **Step 4: Create `src/components/home/doctor-band.tsx`**

Light island:

```tsx
"use client";
import Reveal from "@/components/motion/reveal";
import Parallax from "@/components/motion/parallax";
import SplitReveal from "@/components/motion/split-reveal";
import PillLink from "@/components/ui/pill-link";

export default function DoctorBand() {
  return (
    <section className="px-4 py-12 lg:px-8">
      <div className="rounded-card bg-island px-6 py-16 text-ink lg:px-16 lg:py-24">
        <SplitReveal
          as="h2"
          className="font-serif text-title"
          segments={[{ text: "Your partner in" }, { text: "holistic healing.", italic: true }]}
        />
        <div className="mt-12 flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <Reveal className="lg:w-[38%]">
            <Parallax
              src="/dr-jay-ryu-profile.png"
              alt="Dr. Jay Ryu at Ryu Acupuncture Clinic"
              className="aspect-[0.8] rounded-chip"
              sizes="(min-width: 1024px) 38vw, 100vw"
            />
          </Reveal>
          <Reveal delay={0.15} className="flex max-w-md flex-col gap-6">
            <p className="font-serif text-card">Dr. Jay J. Ryu, L.Ac., Ph.D.</p>
            <p className="leading-relaxed text-ink/70">
              For over 25 years, Ryu Acupuncture Clinic has been a trusted
              provider of Traditional Chinese Medicine in Burbank, CA. Our
              experienced team offers acupuncture, herbal therapy, and
              whole-body treatments to help you restore balance, reduce pain,
              and enhance your well-being.
            </p>
            <p className="leading-relaxed text-ink/70">
              As a family-run practice, we take pride in providing a welcoming
              environment where each patient is treated with care, respect,
              and clinical expertise.
            </p>
            <PillLink href="/about" variant="dark" className="w-fit">
              About the clinic
            </PillLink>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create `src/components/home/testimonials.tsx`** and delete the old component

Auto-advance with an SVG progress ring (`stroke-dashoffset` animated via CSS keyed on index):

```tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CircleButton from "@/components/ui/circle-button";

const QUOTES = [
  {
    text: "My pain is no longer chronic, and I wake up feeling so much better. The best way to describe my experience in being treated here is that I see the light at the end of the tunnel!",
    author: "M.O., Burbank, CA",
  },
  {
    text: "He checked my pulse, looked at my tongue, and was able to name off symptoms I was experiencing before I even told him my chief complaint.",
    author: "M. L., Alhambra, CA",
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

const INTERVAL_MS = 8000;
const RING_R = 17;
const RING_C = 2 * Math.PI * RING_R;

export default function Testimonials() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const advance = useCallback(
    (dir: 1 | -1) =>
      setIndex((prev) => (prev + dir + QUOTES.length) % QUOTES.length),
    []
  );

  useEffect(() => {
    if (paused) return;
    timer.current = setInterval(() => advance(1), INTERVAL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, advance, index]);

  return (
    <section
      className="px-4 py-24 lg:px-8 lg:py-40"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <p className="mb-10 text-sm font-medium text-cream/40">
        What our patients say:
      </p>
      <div className="relative min-h-56 max-w-4xl lg:min-h-48">
        {QUOTES.map((q, i) => (
          <blockquote
            key={q.author}
            aria-hidden={i !== index}
            className={`absolute inset-0 transition-all duration-700 ease-out-quint ${
              i === index ? "opacity-100" : "pointer-events-none opacity-0 translate-y-4"
            }`}
          >
            <p className="font-serif text-card text-cream">
              &ldquo;{q.text}&rdquo;
            </p>
            <footer className="mt-6 text-sm font-bold text-cream/60">
              — {q.author}
            </footer>
          </blockquote>
        ))}
      </div>
      <div className="mt-12 flex items-center gap-4">
        <CircleButton label="Previous testimonial" onClick={() => advance(-1)}>
          <ChevronLeft className="size-5" />
        </CircleButton>
        <CircleButton label="Next testimonial" onClick={() => advance(1)}>
          <ChevronRight className="size-5" />
        </CircleButton>
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="-rotate-90">
          <circle cx="20" cy="20" r={RING_R} fill="none" stroke="var(--hairline-on-dark)" strokeWidth="1.5" />
          <circle
            key={paused ? `p-${index}` : index}
            cx="20"
            cy="20"
            r={RING_R}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C}
            style={{
              animation: paused
                ? "none"
                : `ring-fill ${INTERVAL_MS}ms linear forwards`,
            }}
          />
        </svg>
        <a
          href="https://www.yelp.com/biz/ryu-acupuncture-clinic-burbank-3?osq=Ryu+Acupuncture+Clinic#reviews"
          target="_blank"
          rel="noopener noreferrer"
          className="underline-link ml-auto text-sm font-medium text-cream"
        >
          Read more reviews
        </a>
      </div>
    </section>
  );
}
```

Add the keyframes to `src/app/ui/globals.css` (inside `@layer components`):

```css
  @keyframes ring-fill {
    to {
      stroke-dashoffset: 0;
    }
  }
```

```bash
git rm src/components/testimonials.tsx
```

- [ ] **Step 6: Create `src/components/home/pre-footer-cta.tsx`**

```tsx
"use client";
import SplitReveal from "@/components/motion/split-reveal";
import Reveal from "@/components/motion/reveal";
import PillLink from "@/components/ui/pill-link";
import { SITE } from "@/lib/site";

export default function PreFooterCta() {
  return (
    <section className="px-4 py-24 text-center lg:px-8 lg:py-48">
      <SplitReveal
        as="h2"
        className="mx-auto max-w-5xl font-serif text-display text-cream"
        segments={[{ text: "Ready to" }, { text: "feel better?", italic: true }]}
      />
      <Reveal delay={0.2} className="mt-10 flex flex-col items-center gap-4">
        <PillLink href={SITE.bookingUrl} external variant="gold">
          Book Now
        </PillLink>
        <p className="text-sm text-cream/40">
          New patient?{" "}
          <a href="/request-an-appointment" className="underline-link text-cream">
            Request your first appointment
          </a>
        </p>
      </Reveal>
    </section>
  );
}
```

- [ ] **Step 7: Rewrite `src/app/page.tsx`** (server component)

```tsx
import type { Metadata } from "next";
import Hero from "@/components/home/hero";
import Mission from "@/components/home/mission";
import ServicesRunway from "@/components/home/services-runway";
import DoctorBand from "@/components/home/doctor-band";
import Testimonials from "@/components/home/testimonials";
import PreFooterCta from "@/components/home/pre-footer-cta";

export const metadata: Metadata = {
  title: "Ryu Acupuncture Clinic — Acupuncture & Chinese Medicine in Burbank, CA",
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
```

- [ ] **Step 8: Verify + commit**

Run: `npx tsc --noEmit && npm run build`
Expected: pass; home page no longer imports `motion/react`.
Dev-check at 1440px and 375px: hero words rise on load; mission fills on scroll; runway pins and crossfades 3 slides; island band; testimonial auto-advance with ring; pre-footer + footer disc. Toggle OS reduced-motion: everything static/faded, runway renders stacked list, native scroll.

```bash
git add -A
git commit -m "feat: home page scroll theater (hero, mission, services runway, doctor band, testimonials, CTA)"
```

---

### Task 9: About + Services pages

**Files:**
- Rewrite: `src/app/about/page.tsx`
- Rewrite: `src/app/services/page.tsx`

**Interfaces:**
- Consumes: `SplitReveal`, `Reveal`, `Parallax`, `PillLink`, `SITE`. Both are server components with metadata wrapping the same client primitives (already `"use client"` internally).

- [ ] **Step 1: Rewrite `src/app/about/page.tsx`**

Carry all existing copy; strip emoji/checkmark bullets into hairline rows. Full file:

```tsx
import type { Metadata } from "next";
import SplitReveal from "@/components/motion/split-reveal";
import Reveal from "@/components/motion/reveal";
import Parallax from "@/components/motion/parallax";
import PillLink from "@/components/ui/pill-link";

export const metadata: Metadata = {
  title: "About",
  description:
    "Family-run acupuncture clinic in Burbank since 1997. Meet Dr. Jay J. Ryu, L.Ac., Ph.D. — nearly 30 years of clinical experience in Traditional Chinese Medicine.",
};

const CREDENTIALS = [
  "Ph.D. in Oriental Medicine – Yuin University",
  "Master's in Traditional Oriental Medicine – Dongguk Royal University",
  "Former Professor – Dongguk Royal University",
  "Core Member – Hongik Oriental Medical Association",
  "Instructor – Acupuncturist Continuing Education Programs",
];

const UNIQUE = [
  "Over 25 years of clinical experience",
  "Fully personalized treatment plans",
  "Warm, clean, and peaceful clinic space",
  "Collaborative, integrative approach",
];

export default function About() {
  return (
    <>
      <section className="flex min-h-[70svh] flex-col justify-end px-4 pb-12 pt-28 lg:px-8">
        <p className="mb-6 text-sm font-medium text-cream/40">About us:</p>
        <SplitReveal
          as="h1"
          className="max-w-6xl font-serif text-display text-cream"
          segments={[
            { text: "Healing that honors" },
            { text: "tradition.", italic: true },
          ]}
        />
        <Reveal delay={0.3} className="mt-10 max-w-md">
          <p className="leading-relaxed text-cream/60">
            Since opening our doors in 1997, Ryu Acupuncture Clinic has grown
            into one of Burbank&apos;s most trusted holistic healing centers.
            What began as a small, family-run clinic has become a community
            cornerstone—offering compassionate, results-driven care rooted in
            the wisdom of Traditional Chinese Medicine.
          </p>
        </Reveal>
      </section>

      <section className="px-4 py-12 lg:px-8">
        <div className="rounded-card bg-island px-6 py-16 text-ink lg:px-16 lg:py-24">
          <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
            <Reveal className="lg:w-[38%]">
              <Parallax
                src="/dr-jay-ryu-profile.png"
                alt="Dr. Jay Ryu profile picture"
                className="aspect-[0.8] rounded-chip"
                sizes="(min-width: 1024px) 38vw, 100vw"
              />
            </Reveal>
            <div className="flex max-w-lg flex-col gap-6">
              <h2 className="font-serif text-title">
                Meet Dr. Jay J. Ryu, <i>L.Ac., Ph.D.</i>
              </h2>
              <p className="leading-relaxed text-ink/70">
                With nearly 30 years of clinical experience, Dr. Jay J. Ryu
                brings deep expertise and a patient-first philosophy to every
                treatment. His background blends academic excellence with
                cultural wisdom, making him a highly respected practitioner in
                the field of Eastern medicine.
              </p>
              <ul>
                {CREDENTIALS.map((c) => (
                  <li
                    key={c}
                    className="border-t py-3 text-sm text-ink/70"
                    style={{ borderColor: "var(--hairline-on-light)" }}
                  >
                    {c}
                  </li>
                ))}
              </ul>
              <p className="leading-relaxed text-ink/70">
                Dr. Ryu is fluent in both English and Korean, and is especially
                known for his compassionate approach and ability to treat
                complex cases with clarity and care.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-24 lg:px-8 lg:py-40">
        <Reveal>
          <h2 className="max-w-4xl font-serif text-title text-cream">
            Our <i>philosophy</i>
          </h2>
          <p className="mt-8 max-w-md leading-relaxed text-cream/60">
            We believe true healing happens when expertise meets empathy. Every
            treatment plan is custom-tailored to support the whole person—not
            just the symptoms. We take time to listen, diagnose thoughtfully,
            and treat holistically.
          </p>
        </Reveal>
        <div className="mt-16 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Reveal className="media-ramp">
            <Parallax
              src="/pic-w-pt.jpg"
              alt="Dr. Ryu with his patients"
              className="aspect-[4/3] rounded-card"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </Reveal>
          <Reveal delay={0.15} className="media-ramp">
            <Parallax
              src="/pic-w-pt2.jpg"
              alt="Dr. Ryu with his patients"
              className="aspect-[4/3] rounded-card"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </Reveal>
        </div>
      </section>

      <section className="px-4 pb-24 lg:px-8 lg:pb-40">
        <p className="mb-6 text-sm font-medium text-cream/40">
          What makes our clinic unique:
        </p>
        <ul className="max-w-3xl">
          {UNIQUE.map((u, i) => (
            <li
              key={u}
              className="flex items-baseline gap-6 border-t py-6 font-serif text-card text-cream"
              style={{ borderColor: "var(--hairline-on-dark)" }}
            >
              <span className="text-sm text-gold">0{i + 1}</span>
              {u}
            </li>
          ))}
        </ul>
        <Reveal className="mt-16">
          <p className="max-w-md leading-relaxed text-cream/60">
            Whether you&apos;re beginning your journey toward wellness or
            continuing a path of healing, our team is here to support you
            every step of the way.
          </p>
          <PillLink href="/request-an-appointment" className="mt-6">
            Request an Appointment
          </PillLink>
        </Reveal>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Rewrite `src/app/services/page.tsx`**

Carry all copy; two feature sections + hairline offer rows + FAQ rows. Full file:

```tsx
import type { Metadata } from "next";
import SplitReveal from "@/components/motion/split-reveal";
import Reveal from "@/components/motion/reveal";
import Parallax from "@/components/motion/parallax";
import PillLink from "@/components/ui/pill-link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Acupuncture, electroacupuncture, Chinese herbal medicine, moxibustion, cupping, and nutritional support in Burbank, CA.",
};

const OFFERINGS = [
  {
    name: "Acupuncture & Electroacupuncture",
    copy: "Targeted needle therapy to stimulate healing, relieve pain, and improve circulation.",
  },
  {
    name: "Auriculotherapy",
    copy: "Ear acupuncture for nervous system regulation, detox, and chronic conditions.",
  },
  {
    name: "Herbal Medicine",
    copy: "Custom-formulated herbal prescriptions to balance internal systems and support immunity.",
  },
  {
    name: "Moxibustion & Cupping",
    copy: "Traditional therapies that boost circulation and reduce inflammation.",
  },
  {
    name: "Heat Therapy",
    copy: "Targeted warming treatments for muscle tension, chronic pain, and stagnation.",
  },
  {
    name: "Nutritional Supplements",
    copy: "Holistic guidance with high-quality supplements to optimize health from within.",
  },
];

const FAQ = [
  {
    q: "How many acupuncture sessions do I need?",
    a: "Acute conditions may improve in 4–6 sessions. Chronic issues often require a longer treatment plan.",
  },
  {
    q: "Can I combine acupuncture with Western treatments?",
    a: "Absolutely. Acupuncture often complements conventional medicine and may reduce medication dependency.",
  },
  {
    q: "Are there side effects?",
    a: "Mild side effects are rare — typically light bruising or soreness. Herbal prescriptions are personalized for safety.",
  },
  {
    q: "What's included in a first visit?",
    a: "We'll perform a full health intake, check tongue and pulse, then begin acupuncture or design your custom herbal plan.",
  },
  {
    q: "Do you take insurance?",
    a: "Many PPO plans do cover acupuncture. We'll provide a superbill or help verify your benefits.",
  },
];

const ACU_TREATS = [
  "Back, neck, joint pain, migraines, arthritis",
  "Anxiety, depression, insomnia, stress",
  "Fertility, menstrual pain, PMS, menopause",
  "IBS, bloating, acid reflux",
  "Asthma, allergies, sinus congestion",
  "Long-COVID, fatigue, burnout",
  "Injury rehab, post-surgery recovery",
];

const HERB_TREATS = [
  "Hormonal imbalances, fertility, menopause",
  "Skin conditions: eczema, acne, psoriasis",
  "Digestive issues and sensitivities",
  "Chronic fatigue, stress, insomnia",
  "Cold/flu immunity and recovery",
  "Fibromyalgia, autoimmune support",
];

function TreatList({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((t) => (
        <li
          key={t}
          className="border-t py-3 text-sm text-cream/70"
          style={{ borderColor: "var(--hairline-on-dark)" }}
        >
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function Services() {
  return (
    <>
      <section className="flex min-h-[70svh] flex-col justify-end px-4 pb-12 pt-28 lg:px-8">
        <p className="mb-6 text-sm font-medium text-cream/40">Our services:</p>
        <SplitReveal
          as="h1"
          className="max-w-6xl font-serif text-display text-cream"
          segments={[
            { text: "Two foundations," },
            { text: "one goal —" },
            { text: "your health.", italic: true },
          ]}
        />
        <Reveal delay={0.3} className="mt-10 max-w-md">
          <p className="leading-relaxed text-cream/60">
            We focus on two foundational services: acupuncture and Chinese
            herbal medicine. These natural therapies have helped thousands of
            patients manage pain, reduce stress, boost immunity, and regain
            energy — all without dependency on pharmaceuticals.
          </p>
        </Reveal>
      </section>

      <section className="px-4 py-16 lg:px-8 lg:py-24">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div className="lg:w-[45%]">
            <h2 className="font-serif text-title text-cream">
              Acupuncture: restoring balance <i>through the needle.</i>
            </h2>
            <p className="mt-6 max-w-md leading-relaxed text-cream/60">
              Acupuncture is the practice of inserting very thin, sterile
              needles into specific points along the body&apos;s energy
              pathways (called meridians). This stimulates the body&apos;s
              innate ability to heal, regulate internal systems, and reduce
              pain. Most people feel minimal to no pain — many patients fall
              asleep during treatment.
            </p>
            <p className="mb-2 mt-8 text-sm font-bold text-cream">
              What can acupuncture treat?
            </p>
            <TreatList items={ACU_TREATS} />
          </div>
          <Reveal className="media-ramp lg:w-1/2">
            <Parallax
              src="/acupuncture-treatment.jpg"
              alt="Acupuncture treatment"
              className="aspect-[4/5] rounded-card lg:aspect-[4/3]"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </Reveal>
        </div>
      </section>

      <section className="px-4 py-16 lg:px-8 lg:py-24">
        <div className="flex flex-col gap-10 lg:flex-row-reverse lg:items-start lg:justify-between">
          <div className="lg:w-[45%]">
            <h2 className="font-serif text-title text-cream">
              Herbal medicine: custom formulas for <i>deep healing.</i>
            </h2>
            <p className="mt-6 max-w-md leading-relaxed text-cream/60">
              We use carefully selected roots, leaves, flowers, and minerals to
              create formulas tailored to your unique condition and
              constitution — in powder, pill, or tea form, based on your body
              type, symptoms, and the root cause of imbalance. We source only
              from third-party-tested, reputable suppliers.
            </p>
            <p className="mb-2 mt-8 text-sm font-bold text-cream">
              What can herbal medicine help with?
            </p>
            <TreatList items={HERB_TREATS} />
          </div>
          <Reveal className="media-ramp lg:w-1/2">
            <Parallax
              src="/herbal-medicine.jpg"
              alt="Chinese herbal medicine"
              className="aspect-[4/5] rounded-card lg:aspect-[4/3]"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </Reveal>
        </div>
      </section>

      <section className="px-4 py-16 lg:px-8 lg:py-24">
        <div className="rounded-card bg-island px-6 py-16 text-ink lg:px-16 lg:py-20">
          <h2 className="font-serif text-title">
            What we <i>offer</i>
          </h2>
          <ul className="mt-10">
            {OFFERINGS.map((o) => (
              <li
                key={o.name}
                className="flex flex-col gap-2 border-t py-6 lg:flex-row lg:items-baseline lg:justify-between"
                style={{ borderColor: "var(--hairline-on-light)" }}
              >
                <span className="font-serif text-card">{o.name}</span>
                <span className="max-w-sm text-sm text-ink/60">{o.copy}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 py-16 lg:px-8 lg:py-24">
        <h2 className="font-serif text-title text-cream">
          Common <i>questions</i>
        </h2>
        <div className="mt-10 max-w-3xl">
          {FAQ.map((f) => (
            <Reveal key={f.q}>
              <div
                className="border-t py-6"
                style={{ borderColor: "var(--hairline-on-dark)" }}
              >
                <p className="font-serif text-card text-cream">{f.q}</p>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-cream/60">
                  {f.a}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="px-4 pb-24 text-center lg:px-8 lg:pb-40">
        <Reveal>
          <p className="mx-auto max-w-2xl font-serif text-heading text-cream">
            &ldquo;When you harmonize the body, the body knows{" "}
            <i>how to heal.</i>&rdquo;
          </p>
          <div className="mt-10 flex flex-col items-center gap-4">
            <PillLink href={SITE.bookingUrl} external variant="gold">
              Book a Consultation
            </PillLink>
            <a
              href="/request-an-appointment"
              className="underline-link text-sm text-cream"
            >
              New patient? Request your first appointment
            </a>
          </div>
        </Reveal>
      </section>
    </>
  );
}
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npm run build`
Expected: pass. Dev-check both pages at both widths.

```bash
git add -A
git commit -m "feat: rebuild About and Services pages in the new register"
```

---

### Task 10: Contact + Request-an-Appointment pages

**Files:**
- Rewrite: `src/app/contact/page.tsx`
- Rewrite: `src/app/request-an-appointment/page.tsx`

**Interfaces:**
- Consumes: `SplitReveal`, `Reveal`, `PillLink`, `SITE`.

- [ ] **Step 1: Rewrite `src/app/contact/page.tsx`**

```tsx
import type { Metadata } from "next";
import SplitReveal from "@/components/motion/split-reveal";
import Reveal from "@/components/motion/reveal";
import PillLink from "@/components/ui/pill-link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact Ryu Acupuncture Clinic in Burbank, CA — phone, email, hours, and directions.",
};

export default function Contact() {
  return (
    <>
      <section className="flex min-h-[60svh] flex-col justify-end px-4 pb-12 pt-28 lg:px-8">
        <p className="mb-6 text-sm font-medium text-cream/40">Contact:</p>
        <SplitReveal
          as="h1"
          className="font-serif text-display text-cream"
          segments={[{ text: "We're here" }, { text: "to help.", italic: true }]}
        />
      </section>

      <section className="px-4 pb-24 lg:px-8 lg:pb-40">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
          <Reveal className="flex flex-col gap-4">
            <p className="text-sm font-bold text-cream/40">Reach us</p>
            <a
              href={SITE.phone.href}
              className="underline-link w-fit font-serif text-card text-cream"
            >
              {SITE.phone.display}
            </a>
            <a
              href={`mailto:${SITE.email}`}
              className="underline-link w-fit text-cream/70"
            >
              {SITE.email}
            </a>
            <p className="text-sm text-cream/40">Fax: {SITE.fax.display}</p>
          </Reveal>

          <Reveal delay={0.1} className="flex flex-col gap-4">
            <p className="text-sm font-bold text-cream/40">Visit us</p>
            <p className="max-w-xs text-cream/70">{SITE.address.line}</p>
            <a
              href={SITE.address.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-link w-fit text-sm font-medium text-cream"
            >
              Get directions
            </a>
          </Reveal>

          <Reveal delay={0.2} className="flex flex-col gap-4">
            <p className="text-sm font-bold text-cream/40">Hours</p>
            {SITE.hours.map((h) => (
              <div
                key={h.days}
                className="border-t pt-3"
                style={{ borderColor: "var(--hairline-on-dark)" }}
              >
                <p className="text-sm text-cream">{h.days}</p>
                <p className="text-sm text-cream/50">{h.time}</p>
              </div>
            ))}
          </Reveal>
        </div>

        <Reveal className="mt-20 flex flex-col items-start gap-4">
          <PillLink href={SITE.bookingUrl} external variant="gold">
            Book an Appointment
          </PillLink>
          <p className="text-sm text-cream/40">
            Questions before you book?{" "}
            <a
              href="/request-an-appointment/request-form"
              className="underline-link text-cream"
            >
              Send us a message
            </a>
          </p>
        </Reveal>
      </section>
    </>
  );
}
```

(This removes the old dead `href="#"` link and the floating avatar image.)

- [ ] **Step 2: Rewrite `src/app/request-an-appointment/page.tsx`**

```tsx
import type { Metadata } from "next";
import SplitReveal from "@/components/motion/split-reveal";
import Reveal from "@/components/motion/reveal";
import PillLink from "@/components/ui/pill-link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Request an Appointment",
  description:
    "New patients: request your first appointment. Returning patients: book your follow-up visit online with Ryu Acupuncture Clinic in Burbank, CA.",
};

const FIRST_VISIT = [
  "Holistic intake and assessment",
  "Pulse and tongue diagnosis",
  "Personalized treatment session",
  "Plenty of time for your questions",
];

export default function RequestAnAppointment() {
  return (
    <>
      <section className="flex min-h-[60svh] flex-col justify-end px-4 pb-12 pt-28 lg:px-8">
        <p className="mb-6 text-sm font-medium text-cream/40">Appointments:</p>
        <SplitReveal
          as="h1"
          className="max-w-6xl font-serif text-display text-cream"
          segments={[
            { text: "Personalized healing" },
            { text: "starts here.", italic: true },
          ]}
        />
      </section>

      <section className="px-4 pb-16 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Reveal className="rounded-card bg-island p-8 text-ink lg:p-12">
            <h2 className="font-serif text-title">
              New to <i>our clinic?</i>
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-ink/70">
              Welcome—you&apos;re in great hands. Your first visit includes a
              full health intake, pulse and tongue diagnosis, and a customized
              treatment plan.
            </p>
            <ul className="mt-6">
              {FIRST_VISIT.map((f) => (
                <li
                  key={f}
                  className="border-t py-3 text-sm text-ink/70"
                  style={{ borderColor: "var(--hairline-on-light)" }}
                >
                  {f}
                </li>
              ))}
            </ul>
            <PillLink
              href="/request-an-appointment/request-form"
              variant="dark"
              className="mt-8"
            >
              Request Your First Appointment
            </PillLink>
          </Reveal>

          <Reveal delay={0.15} className="rounded-card bg-surface p-8 text-cream lg:p-12">
            <h2 className="font-serif text-title">
              Returning <i>patient?</i>
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-cream/70">
              We&apos;re glad to have you back. Follow-up sessions help
              maintain your results and support your ongoing wellness journey.
              Book your appointment online below.
            </p>
            <PillLink href={SITE.bookingUrl} external className="mt-8">
              Book Your Follow-Up Visit
            </PillLink>
            <p className="mt-6 text-sm text-cream/50">
              Prefer to call?{" "}
              <a href={SITE.phone.href} className="underline-link text-cream">
                {SITE.phone.display}
              </a>
            </p>
          </Reveal>
        </div>
      </section>

      <section className="px-4 pb-24 lg:px-8 lg:pb-40">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold text-cream/40">Hours</p>
            {SITE.hours.map((h) => (
              <p key={h.days} className="text-sm text-cream/70">
                {h.days} · {h.time}
              </p>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold text-cream/40">Location</p>
            <p className="max-w-xs text-sm text-cream/70">{SITE.address.line}</p>
            <a
              href={SITE.address.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-link w-fit text-sm text-cream"
            >
              Get directions
            </a>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold text-cream/40">Phone</p>
            <a
              href={SITE.phone.href}
              className="underline-link w-fit font-serif text-card text-cream"
            >
              {SITE.phone.display}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 3: Verify no Unified Practice references anywhere**

```bash
grep -rn "unifiedpractice" src && echo "FAIL" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npm run build`
Expected: pass.

```bash
git add -A
git commit -m "feat: rebuild Contact and Request-an-Appointment pages"
```

---

### Task 11: Form components (request + grievance)

**Files:**
- Rewrite: `src/components/request-form.tsx`
- Rewrite: `src/components/grievance-form.tsx`

**Interfaces:**
- Consumes: `FormField`, `SITE`.
- Produces: both forms POST the same JSON shape as before **plus** a `company` honeypot key (empty string for humans). API contracts unchanged for the human path. Task 12's schemas expect exactly: request `{ name, email, phone, message, company }`, grievance `{ name?, email?, phone?, subject, message, company }`.
- Page shells (`request-form/page.tsx`, `report-a-grievance/page.tsx`) keep rendering these; no change needed there beyond metadata (added here).

- [ ] **Step 1: Rewrite `src/components/request-form.tsx`**

```tsx
"use client";
import { useState } from "react";
import FormField from "@/components/ui/form-field";

const INITIAL = { name: "", email: "", phone: "", message: "", company: "" };

export default function RequestForm() {
  const [formData, setFormData] = useState(INITIAL);
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/request-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setStatus({ kind: "sent" });
        setFormData(INITIAL);
      } else {
        const data = await res.json().catch(() => null);
        setStatus({
          kind: "error",
          message: data?.error ?? "Failed to submit. Please try again.",
        });
      }
    } catch {
      setStatus({
        kind: "error",
        message: "Something went wrong. Please try again.",
      });
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (status.kind === "error") setStatus({ kind: "idle" });
  };

  return (
    <section className="px-4 pb-24 pt-28 lg:px-8 lg:pb-40">
      <div className="mx-auto max-w-2xl rounded-card bg-island p-8 text-ink lg:p-14">
        <h1 className="font-serif text-title">
          Request an <i>appointment</i>
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink/60">
          Tell us a little about yourself and what you&apos;d like help with —
          we&apos;ll get back to you to schedule your first visit.
        </p>

        {status.kind === "sent" ? (
          <div role="status" className="mt-10 rounded-chip bg-surface p-6 text-cream">
            <p className="font-serif text-card">Thank you.</p>
            <p className="mt-2 text-sm text-cream/70">
              Your request has been sent. We&apos;ll get back to you soon.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-4">
            <FormField id="name" name="name" label="Name" value={formData.name} onChange={handleChange} required />
            <FormField id="email" name="email" label="Email" type="email" value={formData.email} onChange={handleChange} required />
            <FormField id="phone" name="phone" label="Phone number" type="tel" value={formData.phone} onChange={handleChange} required />
            <FormField id="message" name="message" label="How can we help?" textarea value={formData.message} onChange={handleChange} required />

            {/* Honeypot: invisible to humans, bots fill it and get silently dropped */}
            <div aria-hidden className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
              <label htmlFor="company">Company</label>
              <input
                type="text"
                id="company"
                name="company"
                value={formData.company}
                onChange={handleChange}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            {status.kind === "error" && (
              <p role="alert" className="text-sm text-error">
                {status.message}
              </p>
            )}

            <button
              type="submit"
              disabled={status.kind === "sending"}
              className="group mt-2 inline-block w-fit rounded-full bg-surface px-8 py-4 text-sm font-bold leading-none text-cream transition-opacity disabled:opacity-50"
            >
              {status.kind === "sending" ? "Sending…" : "Submit Request"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
```

Also update `src/app/request-an-appointment/request-form/page.tsx` to add metadata (keep rendering `<RequestForm />`):

```tsx
import type { Metadata } from "next";
import RequestForm from "@/components/request-form";

export const metadata: Metadata = { title: "Request Form" };

export default function Page() {
  return <RequestForm />;
}
```

- [ ] **Step 2: Rewrite `src/components/grievance-form.tsx`**

Same pattern; fields `name` (optional), `email` (optional), `phone` (optional), `subject` (required), `message` (required), honeypot `company`. Full file:

```tsx
"use client";
import { useState } from "react";
import FormField from "@/components/ui/form-field";

const INITIAL = {
  name: "",
  email: "",
  phone: "",
  subject: "",
  message: "",
  company: "",
};

export default function GrievanceForm() {
  const [formData, setFormData] = useState(INITIAL);
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/grievance-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setStatus({ kind: "sent" });
        setFormData(INITIAL);
      } else {
        setStatus({
          kind: "error",
          message:
            data?.error ?? "Failed to submit grievance. Please try again.",
        });
      }
    } catch {
      setStatus({
        kind: "error",
        message: "Something went wrong. Please try again.",
      });
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (status.kind === "error") setStatus({ kind: "idle" });
  };

  return (
    <section className="px-4 pb-24 pt-28 lg:px-8 lg:pb-40">
      <div className="mx-auto max-w-2xl rounded-card bg-island p-8 text-ink lg:p-14">
        <h1 className="font-serif text-title">
          Submit a <i>grievance</i>
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink/60">
          We take every concern seriously. Contact details are optional — share
          them if you&apos;d like a response.
        </p>

        {status.kind === "sent" ? (
          <div role="status" className="mt-10 rounded-chip bg-surface p-6 text-cream">
            <p className="font-serif text-card">Received.</p>
            <p className="mt-2 text-sm text-cream/70">
              Your grievance has been submitted. We will review your issue(s)
              and get back to you soon.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-4">
            <FormField id="name" name="name" label="Name" value={formData.name} onChange={handleChange} />
            <FormField id="email" name="email" label="Email" type="email" value={formData.email} onChange={handleChange} />
            <FormField id="phone" name="phone" label="Phone number" type="tel" value={formData.phone} onChange={handleChange} />
            <FormField id="subject" name="subject" label="Subject" value={formData.subject} onChange={handleChange} required />
            <FormField id="message" name="message" label="Detailed description" textarea rows={7} value={formData.message} onChange={handleChange} required />

            <div aria-hidden className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
              <label htmlFor="g-company">Company</label>
              <input
                type="text"
                id="g-company"
                name="company"
                value={formData.company}
                onChange={handleChange}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            {status.kind === "error" && (
              <p role="alert" className="text-sm text-error">
                {status.message}
              </p>
            )}

            <button
              type="submit"
              disabled={status.kind === "sending"}
              className="mt-2 inline-block w-fit rounded-full bg-surface px-8 py-4 text-sm font-bold leading-none text-cream transition-opacity disabled:opacity-50"
            >
              {status.kind === "sending" ? "Submitting…" : "Submit Grievance"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
```

Update `src/app/report-a-grievance/page.tsx` the same way (metadata `title: "Report a Grievance"`, render `<GrievanceForm />`).

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npm run build`
Expected: pass. Dev-check: floating labels, inline success state replaces `alert()`, honeypot invisible and skipped by Tab.

```bash
git add -A
git commit -m "feat: pill-styled forms with floating labels, inline status, honeypot field"
```

---

### Task 12: API hardening (zod validation + honeypot + durable rate limit)

**Files:**
- Create: `src/lib/validation.ts`, `src/lib/validation.test.ts`, `src/lib/form-rate-limit.ts`
- Create: `supabase/migrations/0003_form_rate_limit.sql`
- Modify: `src/app/api/request-form/route.ts`, `src/app/api/grievance-form/route.ts`, `package.json` (test script)

**Interfaces:**
- Consumes: `createServiceClient` from `@/lib/supabase` (existing), `zod`, form payloads from Task 11.
- Produces: `requestFormSchema`, `grievanceFormSchema` (zod schemas), `getClientIp(req: Request): string`, `formSubmissionsExhausted(ip: string): Promise<boolean>`, `recordFormSubmission(ip: string): Promise<void>`.

- [ ] **Step 1: Add test script to `package.json`**

In `"scripts"`, add: `"test": "vitest run"`.

- [ ] **Step 2: Write failing tests — `src/lib/validation.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { grievanceFormSchema, requestFormSchema } from "./validation";

const validRequest = {
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "(818) 555-1234",
  message: "I'd like to book a first appointment.",
  company: "",
};

describe("requestFormSchema", () => {
  it("accepts a valid submission", () => {
    expect(requestFormSchema.safeParse(validRequest).success).toBe(true);
  });

  it("rejects a missing email", () => {
    expect(
      requestFormSchema.safeParse({ ...validRequest, email: "" }).success
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      requestFormSchema.safeParse({ ...validRequest, email: "not-an-email" })
        .success
    ).toBe(false);
  });

  it("rejects an oversized message", () => {
    expect(
      requestFormSchema.safeParse({
        ...validRequest,
        message: "x".repeat(2001),
      }).success
    ).toBe(false);
  });

  it("rejects a phone with letters", () => {
    expect(
      requestFormSchema.safeParse({ ...validRequest, phone: "call me" })
        .success
    ).toBe(false);
  });

  it("keeps the honeypot value for the route to inspect", () => {
    const parsed = requestFormSchema.safeParse({
      ...validRequest,
      company: "SpamBot Inc",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.company).toBe("SpamBot Inc");
  });
});

const validGrievance = {
  subject: "Billing concern",
  message: "Detailed description of my concern.",
  company: "",
};

describe("grievanceFormSchema", () => {
  it("accepts a valid submission without optional contact info", () => {
    expect(grievanceFormSchema.safeParse(validGrievance).success).toBe(true);
  });

  it("treats empty-string contact fields as absent", () => {
    const parsed = grievanceFormSchema.safeParse({
      ...validGrievance,
      name: "",
      email: "",
      phone: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing subject", () => {
    expect(
      grievanceFormSchema.safeParse({ ...validGrievance, subject: " " })
        .success
    ).toBe(false);
  });

  it("rejects an invalid optional email when provided", () => {
    expect(
      grievanceFormSchema.safeParse({ ...validGrievance, email: "nope" })
        .success
    ).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `./validation` does not exist.

- [ ] **Step 4: Create `src/lib/validation.ts`**

```ts
import { z } from "zod";

const PHONE_RE = /^\+?[\d\s().-]{7,30}$/;

// Empty string → undefined, so optional fields accept "" from the form.
const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

export const requestFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().min(1).max(200).email(),
  phone: z.string().trim().regex(PHONE_RE, "Invalid phone number"),
  message: z.string().trim().min(1).max(2000),
  // Honeypot — must parse cleanly; the route decides what to do with it.
  company: z.string().max(200).optional().default(""),
});

export const grievanceFormSchema = z.object({
  name: optionalTrimmed(100),
  email: optionalTrimmed(200).pipe(z.string().email().optional()),
  phone: optionalTrimmed(30).pipe(
    z.string().regex(PHONE_RE, "Invalid phone number").optional()
  ),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  company: z.string().max(200).optional().default(""),
});

export type RequestFormData = z.infer<typeof requestFormSchema>;
export type GrievanceFormData = z.infer<typeof grievanceFormSchema>;

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (10 tests).

- [ ] **Step 6: Create `supabase/migrations/0003_form_rate_limit.sql`**

```sql
-- Durable per-IP rate limiting for the public email-sending forms
-- (request-form, grievance-form). Mirrors 0002_pin_attempt_limit.sql.
-- Idempotent — safe to paste into the Supabase SQL editor.

create table if not exists public.form_submission_events (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  submitted_at timestamptz not null default now()
);

create index if not exists form_submission_events_ip_time_idx
  on public.form_submission_events (ip, submitted_at);

-- RLS on with no policies: only the service-role key can touch it.
alter table public.form_submission_events enable row level security;
```

- [ ] **Step 7: Create `src/lib/form-rate-limit.ts`**

```ts
import { createServiceClient } from "@/lib/supabase";

// The public forms send email via Resend; without a cap anyone can script
// unlimited sends. 5 submissions per hour per IP is generous for humans.
// Counters live in Supabase so the cap survives serverless cold starts.
// Fails closed, matching src/lib/pin-rate-limit.ts.
const MAX_PER_WINDOW = 5;
const WINDOW_SECONDS = 3600;
const RETENTION_MS = 24 * 60 * 60 * 1000;

export async function formSubmissionsExhausted(ip: string): Promise<boolean> {
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  const { count, error } = await supabase
    .from("form_submission_events")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("submitted_at", cutoff);
  if (error || count === null) {
    console.error("Form rate-limit counter unreadable — failing closed");
    return true;
  }
  return count >= MAX_PER_WINDOW;
}

export async function recordFormSubmission(ip: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("form_submission_events")
    .insert({ ip, submitted_at: new Date().toISOString() });
  if (error) console.error("Failed to record form submission:", error.code);
  await supabase
    .from("form_submission_events")
    .delete()
    .lt("submitted_at", new Date(Date.now() - RETENTION_MS).toISOString());
}
```

- [ ] **Step 8: Rewrite `src/app/api/request-form/route.ts`**

```ts
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getClientIp, requestFormSchema } from "@/lib/validation";
import {
  formSubmissionsExhausted,
  recordFormSubmission,
} from "@/lib/form-rate-limit";

// Sender must be on a Resend-verified domain in production.
// onboarding@resend.dev only delivers to the Resend account owner's inbox.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
const TO_EMAIL = "ryuacupuncture@yahoo.com";
const RATE_LIMIT_MSG =
  "Too many requests. Please call us at (818) 841-9790 instead.";

export async function POST(req: Request) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const parsed = requestFormSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please check the form fields and try again." },
        { status: 400 }
      );
    }
    const { name, email, phone, message, company } = parsed.data;

    // Honeypot tripped: report success, send nothing.
    if (company) {
      return NextResponse.json({ success: true });
    }

    const ip = getClientIp(req);
    if (await formSubmissionsExhausted(ip)) {
      return NextResponse.json({ error: RATE_LIMIT_MSG }, { status: 429 });
    }
    await recordFormSubmission(ip);

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: `Appointment Request <${FROM_EMAIL}>`,
      to: TO_EMAIL,
      replyTo: email,
      subject: `☎️📞New Appointment Request from ${name}⚠️`,
      text: `
You received a new appointment request:

Name: ${name}
Email: ${email}
Phone: ${phone}
Message:
${message}
      `,
    });

    if (error) {
      console.error("Email sending failed:", error);
      return NextResponse.json(
        { error: "Failed to send email" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email sending failed:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 9: Rewrite `src/app/api/grievance-form/route.ts`**

```ts
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getClientIp, grievanceFormSchema } from "@/lib/validation";
import {
  formSubmissionsExhausted,
  recordFormSubmission,
} from "@/lib/form-rate-limit";

// Sender must be on a Resend-verified domain in production.
// onboarding@resend.dev only delivers to the Resend account owner's inbox.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
const TO_EMAIL = "ryuacupuncture@yahoo.com";
const RATE_LIMIT_MSG =
  "Too many requests. Please call us at (818) 841-9790 instead.";

export async function POST(req: Request) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const parsed = grievanceFormSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please check the form fields and try again." },
        { status: 400 }
      );
    }
    const { name, email, phone, subject, message, company } = parsed.data;

    if (company) {
      return NextResponse.json({ success: true });
    }

    const ip = getClientIp(req);
    if (await formSubmissionsExhausted(ip)) {
      return NextResponse.json({ error: RATE_LIMIT_MSG }, { status: 429 });
    }
    await recordFormSubmission(ip);

    const timestamp = new Date().toLocaleString();
    const emailContent = `
New Grievance Submission
Time: ${timestamp}

Subject: ${subject}

Message:
${message}

Contact Information:
${name ? `Name: ${name}` : "Name: Not provided"}
${email ? `Email: ${email}` : "Email: Not provided"}
${phone ? `Phone: ${phone}` : "Phone: Not provided"}
    `.trim();

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: `Grievance Form <${FROM_EMAIL}>`,
      to: TO_EMAIL,
      ...(email ? { replyTo: email } : {}),
      subject: `‼️⚠️New Grievance: ${subject}`,
      text: emailContent,
    });

    if (error) {
      console.error("Grievance email failed:", error.message);
      return NextResponse.json(
        { error: "Failed to process grievance" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Grievance submitted successfully",
    });
  } catch (error) {
    console.error("Error processing grievance:", error);
    return NextResponse.json(
      { error: "Failed to process grievance" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 10: Verify + commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: pass. Manual: with dev server + real env, submit the request form → email path works; fill the hidden `company` field via devtools → success response, no email; 6 rapid submissions → 6th returns 429.

**Deploy note (surface to the user at completion):** `supabase/migrations/0003_form_rate_limit.sql` must be pasted into the Supabase SQL editor before this ships — until then the limiter fails closed and forms return 429.

```bash
git add -A
git commit -m "feat: harden public form APIs — zod validation, honeypot, durable per-IP rate limit"
```

---

### Task 13: Security headers + admin/kiosk reskin

**Files:**
- Modify: `next.config.js`
- Modify: `tailwind.config.ts` (re-point legacy `brand.*` values)
- Rewrite: `src/app/admin/login/page.tsx` (markup/classes only — logic identical)
- Modify: `src/app/admin/dashboard/page.tsx`, `src/components/signin-keypad.tsx` (class swaps only)

**Interfaces:**
- Consumes: existing admin logic (unchanged), token classes from Task 2.

- [ ] **Step 1: Update `next.config.js` headers**

Replace the `headers` block with:

```js
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  headers: async () => {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

Notes: `'unsafe-eval'` is required by Next dev/react-refresh and some GSAP internals; `'unsafe-inline'` covers Next's inline runtime + GSAP style writes. next/font self-hosts Google fonts so no external font/style origins are needed (Material Icons link was removed in Task 1). Deprecated `X-XSS-Protection` is dropped; `X-Frame-Options` upgraded to `DENY` to match `frame-ancestors 'none'`. Google OAuth is redirect-based — no external `connect-src` needed.

Verify after `npm run dev`: `curl -sI http://localhost:3000 | grep -i "content-security\|referrer\|permissions"` shows the three new headers, then click through Google login and the kiosk once — no CSP violations in the console.

- [ ] **Step 2: Re-point the legacy `brand` palette in `tailwind.config.ts`**

The admin surfaces are built almost entirely from `brand-*` semantic classes (grep-verified), so flipping the values reskins them wholesale. Replace the `brand` block values:

```ts
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
```

- [ ] **Step 3: Targeted class fixes in dashboard + keypad**

Apply this mapping wherever the classes appear (grep each; also check template-literal `bg-${...}` strings in `signin-keypad.tsx` for dynamic members):

| Old class | New class |
|---|---|
| `text-gray-500`, `text-gray-700` | `text-cream/50` |
| `bg-gray-600` | `bg-surface` |
| `text-amber-600` | `text-gold` |
| `dark:*` variants | delete (inert since Task 2) |
| `shadow`, `shadow-*` | delete (zero-shadow rule) |
| `border-white` | `border-cream/30` |
| `text-red-400`, `text-red-600` | `text-error` |
| `bg-red-300`, `bg-red-400`, `bg-red-500`, `bg-red-600` | `bg-error` (keep any `hover:` prefix) |

Keypad specifics: digit buttons become circles — on the numpad button element ensure `rounded-full border border-cream/15 text-cream` (replacing any square/rounded-md styles); confirmation and thank-you headline elements get `font-serif` added. Do NOT touch handlers, timers, fetch calls, or state.

- [ ] **Step 4: Rewrite `src/app/admin/login/page.tsx` visuals**

Keep the exact logic (error effect, `handleSignIn`); replace the returned JSX with:

```tsx
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-card bg-island p-10 text-ink">
        <h1 className="text-center font-serif text-3xl">
          Staff <i>login</i>
        </h1>
        <p className="text-center text-sm text-ink/60">
          Sign in with your staff Google account to unlock the kiosk.
        </p>
        {error && (
          <p role="alert" className="text-center text-sm text-error">
            {error}
          </p>
        )}
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="flex items-center justify-center gap-3 rounded-full bg-surface py-4 text-sm font-bold text-cream transition-opacity disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M21.35 11.1H12v2.9h5.35c-.5 2.35-2.45 3.7-5.35 3.7a5.7 5.7 0 1 1 0-11.4c1.45 0 2.75.5 3.8 1.5l2.15-2.15A8.55 8.55 0 0 0 12 3.15a8.85 8.85 0 1 0 0 17.7c5.1 0 8.5-3.6 8.5-8.65 0-.35-.05-.75-.15-1.1Z"
            />
          </svg>
          {loading ? "Redirecting…" : "Sign in with Google"}
        </button>
      </div>
    </div>
  );
```

- [ ] **Step 5: Kiosk regression check**

With dev server + env configured: `/admin/login` → Google sign-in → kiosk renders one viewport tall, keypad circles; enter a wrong PIN → error message styled `text-error`; dashboard tables show hairline rows. **No behavioral differences.**

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: pass.

```bash
git add -A
git commit -m "feat: security headers (CSP, referrer, permissions) + admin/kiosk dark reskin"
```

---

### Task 14: Cleanup, docs, final QA

**Files:**
- Modify: `package.json` (remove `motion`, `next-themes`), `CLAUDE.md`
- Verify-only: whole repo

- [ ] **Step 1: Remove dead dependencies**

```bash
grep -rn "motion/react\|framer-motion\|next-themes" src && echo "STILL USED — fix first" || npm uninstall motion next-themes
```

Expected: no grep hits, uninstall proceeds.

- [ ] **Step 2: Sweep for banned patterns**

```bash
grep -rn "shadow-\|uppercase\|#f4a261\|unifiedpractice" src --include="*.tsx" --include="*.ts" --include="*.css" | grep -v "text-shadow-none" && echo "REVIEW HITS ABOVE" || echo "clean"
grep -rn "dark:" src && echo "REVIEW dark: leftovers" || echo "clean"
grep -rn "mt-40\|mt-32\|pt-28" src/app --include="*.tsx" | grep -v admin
```

Fix any hits (public pages must rely on hero padding `pt-28` only as set by Tasks 8–11; that's the sanctioned pattern — the grep is to catch *stray* legacy clearance hacks like `mt-40`).

- [ ] **Step 3: Update `CLAUDE.md` tech stack section**

In the `## Tech Stack` list, add:

```markdown
- Frontend: single dark theme (no light/dark toggle); GSAP + ScrollTrigger +
  Lenis for public-page motion; Instrument Serif + Inter Tight via next/font
- Public forms (/api/request-form, /api/grievance-form): zod-validated,
  honeypot field `company`, per-IP rate limit (5/hour) in Supabase
  (form_submission_events table, migration 0003 — must be applied)
```

- [ ] **Step 4: Full verification suite**

```bash
npm test && npm run lint:strict && npx tsc --noEmit && npm run build
```

Expected: all pass with zero warnings.

- [ ] **Step 5: Browser QA (use the browse/gstack skill)**

Screenshot every public page (`/`, `/about`, `/services`, `/contact`, `/request-an-appointment`, `/request-an-appointment/request-form`, `/report-a-grievance`) at 1440×900 and 375×812. Check: no horizontal scroll, no invisible text (cream-on-island or ink-on-canvas mistakes), header hide/return works, mobile sheet menu works, forms submit, all "Book Now"/follow-up CTAs open the Practice Better portal. Run Lighthouse on `/` — performance and accessibility ≥ 90. Toggle `prefers-reduced-motion` (devtools rendering tab) → reveals become static, native scrolling.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove dead deps, doc updates, final QA sweep"
```

---

## Self-Review (completed)

- **Spec coverage:** palette/tokens (T2) · typography (T1/T2) · layout+shape (T2, page tasks) · motion system incl. reduced-motion (T4/T5) · header fix (T6) · footer disc (T7) · home theater (T8) · interior pages (T9/T10) · forms (T11) · booking links + site.ts + asset deletion (T3, verified again T10) · server components + metadata (T8–T11) · admin/kiosk reskin, no logic changes (T13) · security headers (T13) · form API validation/honeypot/rate-limit (T12) · eslint bump + @tailwindcss/postcss removal (T1) · shared primitives (T5) · dead-dep removal (T14) · verification incl. Lighthouse, kiosk regression, reduced motion (T13/T14). Shop page untouched per spec.
- **Type consistency:** `SITE` shape defined in T3 matches all uses in T6–T11; `useMotionPrefs` returns `{ reduced }` everywhere; schema field names in T12 match form payloads in T11 (`company` honeypot included); `PillLink` prop names consistent across T6–T11.
- **Placeholders:** none — every code step contains the full code; the two class-mapping steps (T13) are exact find/replace rules against grep-verified class inventories.
