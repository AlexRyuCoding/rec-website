# Effect module: Liquid Glass (glass badge)

> **Source extraction:** https://www.bubbbly.com/app/github-glass-badge.html
> (public single-file demo). Values below were read from its stylesheet and
> shader verbatim — this file is the factory's pixel-level record of that
> design. The technique is reusable; the values are the extracted defaults.

## Factory usage

- **What it is:** a glassmorphism treatment for any component that holds text
  and floats on top of imagery — hero badges, review/stat tiles, booking CTA
  cards, sticky nav chrome, price cards over photo sections.
- **Opt-in only.** Apply when Alex asks for it ("glass badge", "liquid glass",
  "glassmorphism option") or when a spec names it. Never a silent default.
- **Where it's recorded:** spec §4, as an **Effect modules** line
  (`Effect modules: liquid-glass (Tier 1: <components>; Tier 2: <component or none>)`),
  and per-component in §6. The builder (`demo-builder`) then loads this file.
- **Bespoke rule still applies:** the effect ships an *ink system*, not a
  palette. `--ink` / `--ink-rgb` must be derived from the lead's §4 palette
  (usually near-white over photography, or the lead's darkest brand neutral
  over light imagery). The alpha recipe is fixed; the hue is theirs.
- **Hard requirement:** glass only works with something behind it. Use only
  over real imagery, video, or a rich gradient/canvas — never over a flat
  solid (it reads as a gray box). Images must be **local** per factory rules;
  Tier 2 additionally requires same-origin (CORS-readable) images.
- **Conflicts resolved:** `build-standards.md` quality floor applies on top —
  text contrast must survive the *busiest* region of the underlying image
  (see QA additions below). Where a style basis (e.g. sophisticated-noir's
  sharp 0px shape language) conflicts with the radii here, the style's shape
  language wins and only the surface recipe (fill/border/blur/shadow alphas)
  is kept.

There are two tiers. Tier 1 is pure CSS and is the default meaning of "the
glass option." Tier 2 is the WebGL "liquid lens" from the source page —
signature-grade, use for at most one hero component per demo.

---

## Tier 1 — CSS glass surface (extracted, exact)

The source page's control panel — the canonical glass card:

```css
.glass-surface {
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid rgba(255, 255, 255, 0.30);
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.18),        /* deep ambient drop */
    inset 0 1px 0 rgba(255, 255, 255, 0.35); /* top inner bevel = the "glass edge" */
  backdrop-filter: blur(22px) saturate(1.2);
  -webkit-backdrop-filter: blur(22px) saturate(1.2);
  color: #fff; /* factory: var(--ink) */
}
```

The load-bearing details, pixel-for-pixel:

| Property | Value | Why it matters |
|---|---|---|
| Surface fill | `rgba(255,255,255,0.10)` | milkiness without opacity — the background must stay legible through it |
| Border | `1px solid rgba(255,255,255,0.30)` | reads as the glass rim; brighter than the fill |
| Inset highlight | `inset 0 1px 0 rgba(255,255,255,0.35)` | 1px top bevel — the single biggest "real glass" tell |
| Drop shadow | `0 24px 60px rgba(0,0,0,0.18)` | large, soft, low-alpha; lifts the pane off the image |
| Blur | `blur(22px)` | heavy frost; below ~16px the background reads as noise behind text |
| Saturation | `saturate(1.2)` | pushes the blurred background *richer*, not grayer — the "liquid" tell vs. flat frosted glass |
| Radius | `26px` (panel) / `34px` (card) | generous; glass reads wrong with sharp corners unless a style basis dictates it |

### The ink system (nested elements)

Everything *inside* a glass surface is tinted with alphas of one ink color,
exposed as custom properties (this is how the source keeps the card
recolorable in one move):

```css
.glass-surface { --ink: #fff; --ink-rgb: 255, 255, 255; } /* derive per lead */
```

| Element | Recipe (extracted) |
|---|---|
| Sub-tile / stat box | `border: 1px solid rgba(var(--ink-rgb), 0.45); background: rgba(var(--ink-rgb), 0.07); border-radius: 15px` |
| Input / meta pill | same fill/border at `border-radius: 999px; height: 46px; padding: 0 15px` (input fill drops to `0.06`) |
| Glass button | fill `0.07`, border `0.45`, radius `16px`, height `48px`; **hover: fill `0.16`** (`transition: background .15s ease`) |
| Hairline rule | `border-bottom: 1.5px solid rgba(var(--ink-rgb), 0.6)` |
| Placeholder / secondary text | ink at `0.75`–`0.95` opacity |
| Small clear-pill | `padding: 4px 14px; radius 999px; border 0.5; fill 0.07` |

### Solid CTA on glass (the one non-glass element)

The primary action deliberately breaks the glass language — solid white pill,
dark ink text:

```css
.pill-solid {
  border: 0; border-radius: 999px; height: 46px; padding: 0 22px;
  background: #fff; color: #0f1a2a;           /* factory: lead's darkest neutral */
  font-weight: 800; font-size: 15px;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
  transition: transform .12s ease, box-shadow .12s ease;
}
.pill-solid:hover  { transform: translateY(-1px); }
.pill-solid:active { transform: translateY(1px);  }
```

Larger variant (download button): height `50px`, radius `16px`, shadow
`0 10px 26px rgba(0,0,0,0.22)`, font 16px/800.

### Small badge variant (extracted from the page's corner credit)

For low-emphasis floating chips (photo credits, "as seen in", tag chips):

```css
.glass-badge-sm {
  padding: 8px 14px; border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.20);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  font-size: 12px; font-weight: 600; color: rgba(255, 255, 255, 0.70);
}
```

### Typography on glass

The source runs everything **heavier than normal** because the low-contrast
surface eats thin strokes: body copy 600, labels 700, headings/CTAs 800,
letterspaced 12px/800 micro-labels (`letter-spacing: 2px`) for section heads.
Keep the spec's typefaces; adopt the weight floor (nothing under 600 on glass).

### Fallback (required)

`backdrop-filter` is missing on some older/energy-saver browsers. Ship:

```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass-surface { background: rgba(20, 24, 32, 0.72); } /* tune to ink polarity */
}
```

---

## Tier 2 — WebGL liquid lens (signature-grade, max one per demo)

On the source page the showcase card has **no CSS background at all**. A
fullscreen WebGL canvas sits behind the DOM and a fragment shader draws the
glass *into the background image* under the card's rect: refraction, frost,
rim lighting. The DOM card only carries text and ink-alpha sub-tiles from
Tier 1. This is what makes it read "liquid" instead of "frosted."

Extracted shader design (all constants verbatim from source):

1. **Shape field** — superellipse, not border-radius:
   `rb = |dx|^6 + |dy|^6` where `d = (fragCoord − cardCenter) / cardHalf`,
   and `cardHalf = DOM rect half-size **+ 4px**` (the glass extends 4px past
   the element). Exponent **6.0** gives the squircle corner.
2. **Three bands** from that field:
   - fill `rb1 = clamp((1.0 − rb) * 8.0, 0, 1)`
   - rim ring `rb2 = clamp((0.955 − rb·0.95) * 16.0) − clamp((0.91 − rb·0.95) * 16.0)` (a thin bright band just inside the edge)
   - outer halo `rb3 = clamp((1.5 − rb·1.1) * 2.0) − clamp((1.0 − rb·1.1) * 2.0)`
3. **Refraction** — sample the background pinched toward the card center:
   `lensUV = center + (uv − center) * (1.0 − rb * 0.22)`. The 0.22 is the
   lens strength; edges bend most because rb → 1 there.
4. **Frost** — 9×9 box blur of the refracted sample, offsets −4…+4 at
   **1.2px** spacing.
5. **Lighting** — vertical gradient added via rb1 (brighter above center,
   with rb3 shaping the lower falloff), plus the rim band at **+0.3**;
   composite `smoothstep(0, 1, rb1 + rb2)` between background and glass.
6. **Milkiness dial** — final `mix(lighting, white, whiteness)` where
   whiteness is user-tunable but **capped at 0.16** (16%); beyond that it
   stops reading as glass. Factory default: 0.
7. Background texture uses cover-fit UVs (aspect-corrected), linear filter,
   clamp-to-edge; `preserveDrawingBuffer: true` only needed if capturing.

Reference implementation written for the factory stack (vanilla, one card):

```html
<canvas id="lens" style="position:fixed;inset:0;width:100vw;height:100vh"></canvas>
<script id="lens-fs" type="x-shader/x-fragment">
precision mediump float;
uniform vec3 iRes; uniform vec2 uImg;   // canvas px, image px
uniform vec2 uPos; uniform vec2 uHalf;  // card centre (y-up), half-size (+4px)
uniform float uWhite;                    // 0..0.16
uniform sampler2D uTex;
vec2 cover(vec2 uv){
  float ca=iRes.x/iRes.y, ia=uImg.x/uImg.y;
  vec2 s = ca>ia ? vec2(1.0, ia/ca) : vec2(ca/ia, 1.0);
  return (uv-0.5)*s+0.5;
}
void main(){
  vec2 fc=gl_FragCoord.xy, uv=fc/iRes.xy;
  vec2 d=(fc-uPos)/uHalf;
  float rb=pow(abs(d.x),6.0)+pow(abs(d.y),6.0);
  float rb1=clamp((1.0-rb)*8.0,0.0,1.0);
  float rb2=clamp((0.955-rb*0.95)*16.0,0.0,1.0)-clamp((0.91-rb*0.95)*16.0,0.0,1.0);
  float rb3=clamp((1.5-rb*1.1)*2.0,0.0,1.0)-clamp((1.0-rb*1.1)*2.0,0.0,1.0);
  vec4 bg=texture2D(uTex,cover(uv));
  float t=smoothstep(0.0,1.0,rb1+rb2);
  vec4 col=bg;
  if(t>0.0){
    vec2 c=uPos/iRes.xy;
    vec2 lens=c+(uv-c)*(1.0-rb*0.22);
    vec4 acc=vec4(0.0);
    for(float x=-4.0;x<=4.0;x++)for(float y=-4.0;y<=4.0;y++)
      acc+=texture2D(uTex,cover(lens+vec2(x,y)*1.2/iRes.xy));
    acc/=81.0;
    float dy=uv.y-c.y;
    float grad=clamp((clamp(dy,0.0,0.2)+0.1)/2.0,0.0,1.0)
             + clamp((clamp(-dy,-1000.0,0.2)*rb3+0.1)/2.0,0.0,1.0);
    vec4 lit=clamp(acc+vec4(rb1)*grad+vec4(rb2)*0.3,0.0,1.0);
    lit=mix(lit,vec4(1.0),uWhite);
    col=mix(bg,lit,t);
  }
  gl_FragColor=vec4(col.rgb,1.0);
}
</script>
```

JS side (per frame, or on scroll/resize only if the card is static): pass
`uPos = (rect.left + rect.width/2, canvas.height − (rect.top + rect.height/2))`
and `uHalf = (rect.width/2 + 4, rect.height/2 + 4)` from
`card.getBoundingClientRect()`; upload the section's local hero image as
`uTex`. The DOM card gets `border-radius: 34px; padding: 26px 24px 22px;`
and **no background/border/blur of its own** — its children use the Tier 1
ink-alpha recipes.

**Constraints (from how the shader works):**
- One card per shader pass (uniforms describe a single rect). Two cards =
  two passes or extend the shader; in practice, keep it to one hero moment.
- The canvas must render the section background itself — so the shader owns
  that section's imagery. Simplest integration: a full-bleed hero/section
  where the canvas *is* the background and the glass card floats in it.
- Requires same-origin image (already factory policy: local assets only).
- **Mobile / low-power / `prefers-reduced-motion` + WebGL-unavailable:
  degrade to Tier 1 CSS** on the same markup. The source page itself pins
  the card into normal flow at ≤720px.
- GSAP/Lenis coexistence: update `uPos` in the same rAF you already run;
  never add a second animation loop.

---

## QA additions (append to the 06_qa pass when this module is used)

- [ ] Text on every glass surface stays ≥ 4.5:1 against the **busiest, lightest
      region** of the image behind it (scroll the section; if it fails, add a
      local scrim `rgba(ink-inverse, 0.25)` inside the surface, or raise fill
      alpha — do not thin the blur).
- [ ] Safari: `-webkit-backdrop-filter` present on every Tier-1 surface.
- [ ] `@supports not (backdrop-filter…)` fallback surface actually legible.
- [ ] Tier 2: card rect and shader glass stay registered while Lenis scrolls
      and on resize (the +4px bleed hides 1px drift; more = bug).
- [ ] Tier 2 on iOS Safari: no context-loss on backgrounding; Tier-1 fallback
      fires when `getContext('webgl')` returns null.
- [ ] Weight floor: no text under weight 600 sits on a glass surface.
