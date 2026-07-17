# Frontend Overhaul — Design Spec

**Date:** 2026-07-15
**Status:** Approved by Alex (brainstorming session)
**Basis:** `design-system.md` (Soft Scroll-Theater register), adapted to the
clinic's existing brand colors per that file's palette-precedence rule.

## Goal

Rebuild the public site of ryuacupuncture.com as an ultra-modern, dark-first
"scroll theater" with GSAP-driven animation; reskin the admin/kiosk surfaces
to match without touching their logic; replace all Unified Practice (former
EHR) booking links with the Practice Better portal; and harden the codebase
(security + code quality).

**Chosen approach (A):** full rebuild of public pages, tokens-and-components
reskin of admin/kiosk. Rejected: B (restyle in place — can't deliver the
full-bleed island architecture), C (theatrical rebuild of kiosk — risks the
recently polished check-in flow).

## 1. Palette

Single dark-first theme. `next-themes` and the theme toggle are removed;
`dark:` Tailwind variants cleaned up.

| Token | Value | Role |
|---|---|---|
| `--canvas` | `#0e181d` | Page body — brand teal `#22404b` deepened to near-black ink-teal |
| `--surface` | `#22404b` | Elevated cards / stat tints on the canvas |
| `--island` | `#eceae6` | Warm porcelain light sections painted on the canvas |
| `--ink` | `#2e3d42` | Text on light — soft teal-charcoal, never pure black |
| `--on-dark` | `#eceae6` | Text on canvas (island color doubles as on-dark text) |
| `--accent` | `#e9c46a` | Gold — the ONLY chromatic accent; small chips, active states, ~5 uses/page |
| `--muted-on-dark` / `--muted-on-light` | 40%-alpha of on-dark/ink | Secondary text |
| `--hairline-on-dark` / `--hairline-on-light` | 12–15% / 10% alpha | 1px separators — the only separation device |
| `--error` | `#ff3c3c` | Forms only |

Rules: **zero box-shadows site-wide**; emphasis = teal↔porcelain inversion;
orange `#f4a261` retired from public pages; photos meet the canvas through a
16-stop eased teal-alpha ramp (port of the reference's navy ramp, hue-shifted
to `#0e181d`).

## 2. Typography

- **Instrument Serif 400 (+ italic)** — every headline. One weight; hierarchy
  is size. Signature move: exactly one italic word inside display lines.
  No uppercase anywhere on the site.
- **Inter Tight 400/500/600/700** — body, UI, labels, nav, buttons. Labels
  and buttons run bold (700) at small sizes (14px).
- Loaded via `next/font/google`; local General Sans files and
  `src/app/ui/fonts.ts` removed.
- Fluid `clamp()` type scale preserving the reference ratios (not the
  source's viewport-zoom root-font hack): display ≈ 8–10× body at desktop,
  line-heights 80–93%, tracking −2% to −4% on serif, +1% on long body copy.
  Reference ladder (1440px equivalents): hero ~120–150px, section titles
  ~64–83px, card titles ~35px, body 15–16px, labels 14px, micro 12px.
- Body copy in narrow measures (~330–390px) beside huge serif displays.

## 3. Layout & shape

- Full-bleed sections as colored canvases; **no max-width containers**.
  Gutters 32px desktop / 16px mobile. Section padding 96–200px desktop,
  48–96px mobile. Single breakpoint: **1023px** (no tablet tier).
- Semantic radii: 30px cards · 24px chips · `40px 40px 0 0` sheets (mobile
  menu, modals) · pill (9999px) CTAs and form inputs · 50% circle icon
  buttons (56–96px).
- Hairline-separated list rows (`padding: 48px 0`) for services/hours-type
  content.

## 4. Motion system

**Dependencies:** add `gsap` (core + ScrollTrigger + SplitText — all free
since GSAP 3.13) and `lenis`. Remove `motion` (framer-motion) and
`next-themes`.

- Lenis smooth scroll, duration 1.2, disabled under
  `prefers-reduced-motion` and on the kiosk/admin routes.
- House eases: `default` cubic-bezier(0.24,1,0.36,1) ·
  `out-quint` (0.22,1,0.36,1) · `menu` (0.6,0.14,0,1).
- Durations: 0.3s micro-interactions · 0.8s text roll-ups · 0.7s underline
  wipes · scrub 0.4 parallax.
- Text reveals: lines rise from `y:110%` inside overflow-hidden wrappers,
  stagger 0.08 (SplitText).
- Sticky runways via CSS `position: sticky` (not GSAP pins), max 2–3,
  home page only.
- Reduced motion: all reveals collapse to opacity fades; no scroll scrubbing.
- Shared primitives in `src/components/motion/`: `SplitReveal`,
  `ScrollFillText`, `Parallax`, `useLenis` (+ a `MotionProvider` handling
  reduced-motion + route awareness). Pages compose primitives; no bespoke
  GSAP timelines scattered per page.
- Interactive signatures: pill-button labels duplicated in stacked spans that
  roll up on hover (−105%); underline links wipe out right / re-enter left.

## 5. Header (rebuilt)

Fixes: current fixed opaque bar blocks content (pages compensate with
`mt-40`), nav split around a center logo is clunky.

- Fixed, transparent, `pointer-events: none` shell; children re-enable
  pointer events. No page-level margin hacks — every page opens with a hero
  designed under the transparent header.
- Behavior: hides on scroll-down past 200px, returns on any scroll-up;
  gains a canvas-alpha + `backdrop-blur` scrim past 500px.
- Desktop layout: logo (links home) left · nav center-right: About,
  Services, Contact, Request an Appointment · pill **"Book Now"** CTA →
  Practice Better portal. Theme toggle removed.
- Mobile: logo + circle menu button; menu is a full sheet sliding up with
  40px top radius over a blur scrim (ease-menu, 0.5s).

## 6. Pages

All pages become **server components with client motion islands**, enabling
per-page `metadata` (title, description, OpenGraph) — currently impossible
because every page is `"use client"`.

### Home (full scroll-theater)
1. Hero — giant serif with split-line reveal, one italic word
   ("Restore Balance, Heal *Naturally.*"), clinic photo in a near-black well,
   "Book Now" + "First visit?" CTAs.
2. Mission statement — long line that color-fills word-by-word on scroll
   (muted → on-dark), avatar/25-years proof chip.
3. Services runway — sticky deck: Acupuncture & Electroacupuncture / Herbal
   Medicine & Supplements / Fertility & Women's Health; image grows per
   slide, titles crossfade; exits to /services.
4. Dr. Ryu band — porcelain island: portrait, bio excerpt, stat chips
   (25+ years, family-run), exits to /about.
5. Testimonials — existing quotes restyled: auto-advancing with SVG progress
   ring (stroke-dashoffset), pause on hover.
6. Pre-footer — monumental serif CTA ("Ready to *Feel Better?*") → Book Now.
7. Footer — rising gradient-disc backdrop, centered logo, contact/hours/
   socials/legal in hairline columns.

### Interior pages (lighter choreography — reveals + parallax only)
- **About** — rebuilt with serif display intro, portrait parallax, story.
- **Services** — hairline-separated rows: serif title, narrow description,
  image; existing copy carried over.
- **Contact** — real page: contact methods, hours, map link, Book Now;
  fixes the current dead `href="#"` link.
- **Request an Appointment** — new patient → internal request form;
  returning patient → Practice Better portal.
- **Forms** (request + grievance) — pill inputs, floating labels, circular
  submit, error states per design system. Same fields and API contracts.
- **Shop** — remains hidden (commented out of nav), untouched.

### Booking links
All three `patient.unifiedpractice.com` URLs (contact ×1,
request-an-appointment ×2) →
`https://ryuacupunctureclinic.practicebetter.io/#/69a76ace301217c0cdc79550/bookings?r=6a583e048c01fe10f94ff69d`.
Defined once as `BOOKING_URL` in a new `src/lib/site.ts` alongside phone,
fax, email, address, hours (currently copy-pasted across ≥4 files).
`public/unified-practice-logo.png` deleted.

## 7. Admin & kiosk reskin

Tokens, fonts, and component styles only — **zero logic changes, zero scroll
choreography**.

- Kiosk (`/admin/patient-signin`): keypad → circle buttons on the dark
  canvas; serif headlines on confirm/thank-you screens. PIN flow, new-patient
  flow, duplicate-check-in window, and reset timers untouched.
- Dashboard: dark tables with hairline rows, pill filter/export buttons.
- Login: centered card on canvas with Google sign-in button.
- `dark:` variant classes collapsed to the single theme.

## 8. Hardening

### Security
- Headers in `next.config.ts`: HSTS, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, minimal
  `Permissions-Policy`, `frame-ancestors 'none'`, and a pragmatic CSP
  compatible with Next inline scripts.
- Public email-sending endpoints (`/api/request-form`,
  `/api/grievance-form`) — currently unauthenticated and unlimited:
  - zod input validation (types, length caps, email format),
  - honeypot field (silently accept, don't send),
  - durable per-IP rate limiting via Supabase, reusing the
    `pin-rate-limit` pattern (fails closed).

### Code quality
- `eslint-config-next` 14.1.0 → 15.1.x (match Next 15.1.11).
- Remove stray `@tailwindcss/postcss` v4 package (project is Tailwind v3).
- Verify/enable strict TypeScript settings.
- Shared primitives in `src/components/ui/` (`PillButton`, `PillLink`,
  `Section`, `Input`, `UnderlineLink`) replace ~10 copy-pasted button/link
  class strings.
- Remove dead deps after migration: `motion`, `next-themes`.

## 9. Verification

- `next build`, `lint:strict`, `tsc --noEmit` all clean.
- Browser QA of every public page at 375px and 1440px with screenshots.
- Kiosk regression: PIN check-in, wrong PIN, new-patient setup, duplicate
  check-in message, 60s reset.
- Lighthouse ≥ 90 (performance + accessibility) on home.
- Reduced-motion spot check (OS setting → fades only, native scroll).

## Constraints & non-goals

- No copy rewrites beyond what new sections require; existing copy carries.
- No changes to API routes' contracts, auth, Supabase schema, or PB
  integration (beyond the two form endpoints' validation/rate-limit).
- No dependency major-version upgrades (Next stays 15.1.x, Tailwind stays
  v3) — explicitly deferred by Alex.
- Design-system provenance note: register adapted to brand hue per the
  file's own precedence rule; section order/copy of the reference site is
  not cloned.
