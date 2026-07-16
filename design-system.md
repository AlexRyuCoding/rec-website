---
name: Aventura Dental Arts — Soft Scroll-Theater (Midnight Porcelain)
source_url: https://aventuradentalarts.com/
built_with: Nuxt SSR + GSAP (ScrollTrigger, ScrollTo, CustomEase, SplitText, DrawSVG, MorphSVG) + Lenis + Lottie + Swiper — by thefirstthelast.agency
extracted: 2026-07-09
extraction_method: >
  deep-research workflow over the downloaded production source (4 SSR HTML pages,
  all shipped CSS, all JS bundles) — 5 dimension analysts + 5 adversarial
  verifiers, every value spot-checked against the code. NOT a generative guess.
sibling_files: [tokens.json, motion.md]
notes: >
  All rem values are verbatim from source, where 1rem = 16px at a 1440px
  design frame (root font-size is calc(16/1440*100vw) — the whole site scales
  like a zoomed Figma frame, with one collapse to a 375px frame below 1024px).
  Values in px comments are that 1440-frame equivalent.

# ─────────────────────────────────────────────────────────────
# FONTS  (verified from @font-face — both families FREE on Google Fonts)
# ─────────────────────────────────────────────────────────────
fonts:
  display_serif:
    real: Instrument Serif          # ALL headlines h0–h5, big numerals, phone numbers
    weights: [400]                  # single weight; the ladder is pure size
    italic: true                    # italic <i> accents INSIDE headlines is the signature move
  sans_primary:
    real: Inter Tight               # body, UI, labels, nav, buttons, forms
    weights: [400, 500, 600, 700]   # labels/buttons run BOLD (700) at small sizes

# ─────────────────────────────────────────────────────────────
# COLORS  (verified :root tokens; strict 3-color system + alphas)
# ─────────────────────────────────────────────────────────────
colors:
  surface-dark: '#14151d'           # (verified --c-brand-navy) ink-navy — the PAGE CANVAS (body bg)
  surface-light: '#eae8e8'          # (verified --c-light-base) warm porcelain gray — light "islands" + text on dark
  ink: '#424346'                    # (verified --c-dark-base) soft charcoal body text on light — never pure black
  on-dark: '#eae8e8'                # light-base doubles as on-dark text
  muted-on-dark: 'hsla(0,5%,91%,.4)'    # (verified --c-light-40)
  muted-on-light: 'rgba(66,67,70,.4)'   # (verified --c-dark-40)
  surface-beige: '#d6d1d0'          # (verified --c-light-beige) the only warm note — tiny circle chips only
  border-on-dark: 'hsla(0,5%,91%,.15)'  # (verified --c-light-15) 1px hairlines
  border-on-light: 'rgba(66,67,70,.1)'  # (verified --c-dark-10)
  footer-floor: 'linear-gradient(180deg,#2a2b35,#010203)'  # (verified) giant circle bg behind footer
  media-wells: ['#111115', '#0d0d13', '#0e0e15', '#000203'] # (verified) near-blacks photos fade into — deliberately NOT the navy
  scrim: '#14151d80 + backdrop-blur(10–12px)'               # (verified) all overlays are navy-alpha + blur
  error: '#ff3c3c'                  # forms only
  # THE ACCENT IS INVERSION, NOT HUE: zero chromatic accent in production.
  # (A gold --c-brand-gold:#b38c61 token exists in source but is NEVER used — dead code.)
  # Hover/emphasis = navy↔light swap. Stat cards use desaturated navy/greige tints only.
  signature-gradient: >
    16-stop hand-eased navy alpha ramp (#14151d00 → #14151d, eased stops at
    12.19%/22.01%/29.8%/35.95%/40.81%/44.77%/48.18%/51.41%/54.84%/58.82%/
    63.73%/69.94%/77.8%/87.7%) — used wherever media meets the navy canvas.
    Verbatim in tokens.json.

# ─────────────────────────────────────────────────────────────
# TYPE SCALE  (verified; px = 1440-frame. Factory: map onto the template's clamp() scale)
# ─────────────────────────────────────────────────────────────
typography:
  # Serif ladder — Instrument Serif 400, tight negative tracking (-2% to -5%),
  # sub-100% line-heights (80–93%). No text-transform ANYWHERE on the site —
  # contrast comes from serif-vs-sans, ~10x size jumps, and italic accents.
  h0: { size: '329px', tracking: '-0.05em', lineHeight: '90%' }   # "ADA Partners" — monumental one-offs
  h1: { size: '276px', tracking: '-0.04em', lineHeight: '84%' }   # "Team of Experts", marquee words
  h2: { size: '153px', tracking: '-0.03em', lineHeight: '80%' }   # HERO LEVEL: "Premium Esthetic Dentistry"
  h3: { size: '83px',  tracking: '-0.02em', lineHeight: '93%' }   # "Our goal is", scroll-fill statements
  h4: { size: '55px',  tracking: '-0.03em', lineHeight: '87%' }   # counters "01", phone numbers, form titles
  h5: { size: '35px',  tracking: '-0.03em', lineHeight: '85%' }   # sub-lines, card names
  # Sans ladder — Inter Tight; small sizes, heavy weights
  p1: { size: '20px', weight: 600, lineHeight: '109%' }           # nav-level links, doctor names
  p2: { size: '15px', weight: 700, lineHeight: '113%' }           # tags, captions, addresses
  p3: { size: '15px', weight: 400, lineHeight: '105%', tracking: '+0.01em' }  # long body copy (only positive tracking on site)
  c1: { size: '14px', weight: 700 }                               # button labels
  c2: { size: '14px', weight: 500 }                               # header nav, eyebrows ("Our Solutions:")
  c3: { size: '12px', weight: 500 }                               # micro-labels ("Based in:")
  measure: 'body copy held to NARROW fixed columns (~224–388px at 1440) beside huge serif displays'
  italic-accent: 'one <i> serif-italic word inside display lines: "Premium Esthetic *Dentistry*", "*Book a call.*"'

# ─────────────────────────────────────────────────────────────
# SPACING & GRID  (verified — full-bleed, NO max-width container anywhere)
# ─────────────────────────────────────────────────────────────
spacing:
  container-max: none               # zero max-width wrappers; sections are 100vw colored canvases
  gutter-desktop: 32px              # 2rem — universal page margin
  gutter-mobile: 16px               # 1rem
  section-pad-desktop: '168–256px'  # 10.5–16rem monumental section paddings
  section-pad-mobile: '48–128px'
  left-column: '680px'              # recurring 42.5rem first grid column (footer bands, team blocks)
  gap-scale: [4, 8, 12, 16, 24, 32, 48, 72]  # px; .25/.5/.75/1/1.5/2/3/4.5rem
  breakpoint: '1023px'              # the ONLY breakpoint — no tablet tier
  list-row-pad: '48px 0'            # hairline-separated rows

# ─────────────────────────────────────────────────────────────
# SHAPE  (verified — everything soft; ZERO box-shadows in the entire site)
# ─────────────────────────────────────────────────────────────
shape:
  radius-card: '30px'               # 1.875rem — cards, images, dropdowns
  radius-card-sm: '24px'            # 1.5rem — mid cards, highlight chips
  radius-sheet: '40px 40px 0 0'     # 2.5rem — page-transition sheets, bottom modals
  radius-pill: '64px / 9999px'      # 4rem CTAs; form inputs fully pill (border-radius:1312.5rem)
  circles: '50% — icon buttons (80–96px), avatars, social chips'
  hairline: '1px solid at 10–15% alpha — row separators + left-border column dividers, never card outlines'
  shadows: 'NONE. Depth = color-field contrast + backdrop-blur navy scrims + mix-blend-mode (difference/color-dodge/luminosity/hard-light)'
  media-aspect: ['0.73 portrait cards', '1/1 thumbs', '86/81 hero', '2.77 banner chips']
---

## Factory usage (read first — how this style plugs into a spec)

This style is a **folder**: `design-system.md` (this file), `tokens.json`
(machine-readable mirror), `motion.md` (the build reference for animation).
Read all three when specing a demo on this basis.

- **Provenance.** Extracted from a live third-party site —
  aventuradentalarts.com, a three-location Miami-area luxury dental practice
  built by thefirstthelast.agency. It supplies a *register and vocabulary*,
  never a template: do not clone its section order, copy, imagery, or component
  order. **Proximity rule:** never use this style for a dental lead in the
  Miami / Aventura market — the demo would read as cloning a direct local
  competitor the lead likely knows.
- **Best fit.** Modern/premium general & cosmetic dentistry (the source
  vertical), and med spa / aesthetics leads whose brand leans quiet-luxury
  rather than clinical-bright. Poor fit for warm/earthy acupuncture brands —
  the register is cool ink-navy.
- **Orientation.** **Dark-first**: the page canvas is ink-navy `#14151d`;
  light porcelain sections are *islands* painted on top, and photos sink into
  near-black wells. This is the inverse of `sophisticated-noir` (light-first
  with black acts) — the two styles must never be blended.
- **Fonts.** Instrument Serif (400 + italic) and Inter Tight — **both free on
  Google Fonts**; use the real faces, no substitutes needed. That's two
  families, within build-standards limits. Serif carries *every* headline at
  one weight; hierarchy is size, not weight.
- **Fluid-scale translation.** The source scales type via a root
  `font-size:calc(16/1440*100vw)` "design frame" — the whole page zooms
  uniformly. The factory's spec template uses fluid `clamp()` instead, and
  **the template wins** (it respects user font-size prefs and Lighthouse
  accessibility). The px values above are the 1440-frame reference; map them
  onto the template's clamp() scale, preserving the *ratios* (hero ≈ 10× body)
  and the sub-100% line-heights / negative tracking.
- **Palette per lead — precedence.** The tokens above are *defaults* and lose
  to the lead's deliberate brand colors (Brand colors block in
  `scrape/copy.md`), per `_config/styles/README.md`. Adapt their hue into this
  register: their dark tone takes the canvas role (keep it near-black-plus-hue
  like `#14151d`, never a bright saturated field), a warm-gray light derived
  from their world takes the island role. Preserve the *discipline* — at most
  one chromatic accent, or none: on the source, **inversion is the accent**.
- **Motion vs. the concept ledger.** `motion.md`'s global rules (Lenis feel,
  ease trio, text-reveal system, hover roll-ups, page sheet transition, house
  0.3s micro-duration) are style-level and reusable. Its *signature
  interactions* (dual-layer clip-path hero, scroll-fill text, modal-becomes-
  page morph, physics-ball stats, `:has()` shrink-others grid, typewriter) are
  a menu — the demo's §3 signature element is still invented per lead and
  checked against `_config/concept-ledger.md`. Note the scroll-fill text
  mechanic is adjacent to sophisticated-noir's "word-by-word reveal" — if the
  ledger shows that was just used, pick differently.
- **Stack translation.** The source already runs the factory stack (GSAP +
  ScrollTrigger + Lenis, and pins via CSS `position:sticky`, not GSAP pins) —
  motion translates nearly 1:1. It additionally uses SplitText and DrawSVG
  (club plugins outside the pinned toolchain): replicate line-splits with a
  small manual span-wrapper and progress rings with `stroke-dashoffset`. See
  `motion.md`.
- **Performance.** The source ships a Lottie preloader, an autoplay hero
  video, and heavy scroll choreography. Demos must hit Lighthouse ≥ 90: skip
  the preloader unless the concept earns it, use a poster-first video (or a
  graded still), and keep the sticky runways to 2–3 sections. Serve woff2, not
  the source's TTF.

---

## 0. TL;DR — what this experience actually is

A **soft-geometry scroll theater**. One ink-navy canvas; porcelain-gray
sections float on it as rounded islands; every headline is a single-weight
serif at monumental size with one italic word; everything interactive is a
pill or a circle; there are **no shadows and no chromatic accent anywhere** —
depth comes from color-field contrast, navy-alpha blur scrims, and blend
modes; emphasis comes from inverting navy↔light. Long sticky "runways"
choreograph each home section to scroll (hero title splits and slides, a
service image FLIP-grows to half the viewport, a technology list scrubs past a
pinned title). The feel is *quiet luxury tech-atelier* — precise, calm,
rounded, expensive.

## 1. Motion system

> Full detail in `motion.md` — that file is the build reference. Summary:
> Lenis (duration 1.2) + a three-ease house palette (`default-ease`
> 0.24,1,0.36,1 · `ease-out-quint` 0.22,1,0.36,1 · `ease-menu` 0.6,0.14,0,1),
> 0.3s micro-interactions, 0.8s text roll-ups, scrub 0.4 parallax, CSS-sticky
> runways instead of GSAP pins, SplitText-style line reveals (y:110% → 0,
> stagger 0.08), scroll-scrubbed char color-fill, and a slide-up rounded-sheet
> page transition.

## 2. Flow / narrative (home page, in scroll order — reference only)

A demo never copies this spine; its §5 spine comes from the spec template and
the lead's content.

| # | Act | Bg | What happens |
|---|-----|----|----|
| 1 | **Preloader** | navy | Lottie mark + three service words stagger in; panel slides away (0.8s). |
| 2 | **Hero** | light island | Split layout: giant serif "Premium / Esthetic *Dentistry*" duplicated in two clip-path halves (white/black) sliding on scroll; right half is a muted autoplay video; "Based in:" location links. |
| 3 | **Our goal** | light island | "Our goal is" + long statement that **color-fills char-by-char on scroll**; avatar-stack proof chip ("+20"); pill CTA. |
| 4 | **Services** | navy | Sticky 4-slide deck: small image **FLIP-grows to 50vw×100vh**, titles crossfade, procedure list per slide. |
| 5 | **Banner** | photo well | Full-bleed parallax image; "Modern Dentistry: Faster / Smarter / Pain-Free" grid. |
| 6 | **Technology** | light island | Pinned title + counter "01 / 06"; six tools scrub past with image crossfade. |
| 7 | **Experts** | navy | Blend-mode title over slow-spinning bg; three doctor blurbs; char typewriter cycling promises. |
| 8 | **Why choose** | navy | Physics-ball Lottie drops 6 stat balls (greige/navy tints); then **auto-snaps scroll** to testimonials. |
| 9 | **Testimonials** | navy | Treatment-named tabs with SVG progress rings; quotes autoplay-advance. |
| 10 | **Pre-footer** | navy | Monumental serif "Bringing Your *Perfect* Smile *to Life*" in mix-blend-difference; tiny sans tip embedded inside it. |
| 11 | **Footer** | gradient circle | A giant radius-50% gradient disc rises (scales 2.7 on scroll); centered logo; **the lead form lives here**; 3-location cards; hairline columns. |

## 3. Components (verified details)

- **Header:** fixed, transparent, `pointer-events:none` shell (children
  re-enable) — "Menu" + "Services" buttons left with the logo, "Patient form"
  + phone dropdown + pill "Book A Call" right. Hides on scroll-down past
  200px, returns on any scroll-up; gains a bg fill past 500px.
- **Pill CTA:** light pill (`radius 4rem`, padding 16×24), label duplicated in
  two stacked spans that **roll up** on hover (−105%); navy variant on light
  sections via CSS-var theme swap. Icon-circle variant 80px.
- **Underline link:** duplicated-label roll-up + 1px underline that wipes out
  right / re-enters left (0.7s quint, 0.35s delay).
- **Form:** fully-pill inputs (1px 15%-alpha border, 32px padding), floating
  placeholder, location radios, circular "Send" submit; error state = red
  border + text. On mobile inputs flatten to bottom-border rows.
- **Cards:** 30px-radius portrait cards (aspect ≈ 0.73) — photo, eyebrow
  position, serif name, bio, "Read More" opening a modal. Hover lifts bg to a
  near-black, image scales 1.05–1.1.
- **Location card:** light 30px card on dark — name, address rows, tel link,
  hours split by hairline columns.
- **Slider chrome:** 96px circle prev/next buttons + "01 / 06" counter
  (serif numeral + sans "/ 06"); on desktop a **custom cursor** (180px
  gradient-stroke circle with arrow, flips by screen half) replaces buttons
  inside `data-cursor-place` zones.
- **Modals:** all slide up as 40px-top-radius sheets (0.5s ease-menu) over a
  navy-alpha blur scrim; the nav variant **morphs into the destination page**
  (sheet expands to full-bleed, radius→0, then routes).
- **Imagery:** full-color photography (no grayscale filter anywhere),
  integrated by fading bottoms into near-black wells via the 16-stop eased
  navy ramp; rounded corners on cards, square-cut when full-bleed.

## 4. Rebuild guidance

- **Get the canvas right first.** `body` is navy; light sections are islands.
  If the build reads as "white site with dark sections," the register is
  inverted and wrong.
- **One serif weight.** Resist adding weights — hierarchy is size (10× jumps),
  line-height 80–93%, tracking −2 to −5%, and the single italic accent word.
  No uppercase anywhere.
- **Radii are semantic:** 30px cards / 24px chips / 40px sheets / pill
  controls / circle icons. Zero shadows — if a surface needs separation, use a
  hairline, a blur scrim, or invert it.
- **The 16-stop navy ramp** (tokens.json) is the house scrim — use it wherever
  a photo meets the canvas; a linear 2-stop fade reads visibly cheaper.
- **Blend modes carry the "expensive" read** on dark acts: difference /
  color-dodge titles over photos and animated decor blobs (10s ease-in-out
  alternate drifts, 50s spin). Use 1–2 per page, not everywhere.
- **Narrow measures beside huge type:** body copy at 15–20px in ~230–390px
  columns; let the serif display own the width.
- **Conversion architecture worth copying:** no booking engine — a persistent
  "Book A Call" pill opens a callback-request sheet (name/phone/location);
  phone numbers surfaced per location everywhere; every section exits to
  either depth ("Learn More") or contact ("Book A Call").
