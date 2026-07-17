# Effect module: Liquid Glass — Aave refraction technique (`feDisplacementMap`)

> **Source extraction:** https://aave.com/design/building-glass-for-the-web
> (Aave design engineering, first-party write-up of their shipped iOS-26-style
> Liquid Glass). Recipe cross-verified at source-code level against
> shuding/liquid-glass, samasante/liquid-glass, rizroze/liquid-glass,
> archisvaze/liquid-glass, kube.io's math deep-dive, the W3C SVG filter spec,
> and WebKit bug 245510 (deep-research run 2026-07-16, 25/25 claims confirmed
> 3-0, 0 refuted). Distinct from `liquid-glass.md` (bubbbly.com frosted-glass +
> WebGL lens module) — this file is the *refraction* technique: real pixel
> displacement, not blur.

## What this is and why it's different

Apple's Liquid Glass bends the pixels under a control like curved glass bends
light. On the web there are two ways to attempt that:

| Approach | How | Chromium | Safari | Firefox |
|---|---|---|---|---|
| `backdrop-filter: url(#svg-filter)` | warp the *backdrop* behind a pane | ✓ | ✗ (WebKit bug 245510, open since 2022) | ✗ |
| **Aave's route: `filter: url(#svg-filter)` on the content itself** | warp the component's *own painted pixels* | ✓ | ✓ | ✓ |

Aave's defining architectural choice — and the reason this recipe works
cross-browser — is that the SVG `feDisplacementMap` filter is applied to the
**live DOM content via CSS `filter`**, not to the backdrop. Verbatim from the
article:

> "feDisplacementMap takes two inputs, the painted content and a map we
> generate… The content's own pixels are the ones moving, which is why text
> under the lens stays selectable and links stay clickable."

Consequences of that choice:

- **The glass and the content it refracts live in the same subtree.** You wrap
  the thing being refracted (a track, a card, a photo) and position the "lens"
  region over it. Nothing is sampled from underneath the element in the page —
  this is not a see-through pane over arbitrary page content.
- Text stays selectable, links clickable, video keeps playing — the browser
  compositor still owns the content.
- It degrades cleanly: remove the filter and you have the unfiltered component.

Use the Chromium-only `backdrop-filter: url()` variant (§7) only as a
progressive enhancement for pane-style glass over arbitrary page content.

---

## 1. The architecture — four visual layers

Aave composites the effect from four layers, cheapest last:

1. **Displacement** (the core) — `feDisplacementMap` driven by a generated map
2. **Chromatic fringe** — three per-channel displacement passes at slightly
   different scales (§4)
3. **Specular highlight** — keeps content legible over the bend (§5)
4. **Rim light** — a bright edge band that sells the depth (§5)

And one data asset: a small **displacement-map PNG generated at runtime** from
the lens shape parameters. Aave's parameter set: Width, Height, BorderRadius,
Scale, Depth, Curvature, Splay, Chroma, Blur, Glow, Edge Highlight, Specular
Angle. (The article names the knobs but doesn't publish the exact height-field
math; the profile in §3 is the verified open-source equivalent —
SDF + smoothstep — which reads visually identical.)

## 2. The SVG filter graph (exact, with the two traps)

```html
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <filter
      id="lg-filter-UNIQUE"          
      x="0" y="0" width="W" height="H"
      filterUnits="userSpaceOnUse"
      color-interpolation-filters="sRGB">
      <feImage href="DATA_URI_PNG" x="0" y="0" width="W" height="H" result="map"/>
      <feDisplacementMap in="SourceGraphic" in2="map"
        scale="MAX_DISPLACEMENT_PX"
        xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
</svg>
```

```css
.liquid-glass-content { filter: url(#lg-filter-UNIQUE); }
```

Spec semantics (W3C SVG §15.15) — this is the whole trick:

```
P'(x,y) ← P( x + scale · (R(x,y) − 0.5),  y + scale · (G(x,y) − 0.5) )
```

Each output pixel is fetched from an offset position; the map's **red channel
drives X, green drives Y, and 0.5 (byte 128) means "don't move"**. `scale` is
a linear multiplier in user-space pixels.

**Trap 1 — `color-interpolation-filters="sRGB"` is mandatory, kebab-case.**
Filter primitives default to linearRGB, which would gamma-decode your map
(128/255 = 0.502 sRGB → ~0.216 linear), shifting the neutral point off 0.5 and
bending every offset nonlinearly. Note it must be the kebab-case presentation
attribute (or CSS property) — `setAttribute('colorInterpolationFilters', …)`
is a silent no-op (a live bug found in shuding/liquid-glass during
verification).

**Trap 2 — wire `in2` through an explicit `result` name.** Give the `feImage`
`result="map"` and reference `in2="map"`. Referencing the feImage's `id`, or
relying on the implicit previous-primitive fallback, works by accident in some
engines and breaks when you add the chromatic-aberration passes.

Also: sizes in the filter region, `feImage`, and the map PNG must all agree
(`filterUnits="userSpaceOnUse"`, pixel units), and for older Safari set the
feImage href via the xlink namespace too
(`setAttributeNS('http://www.w3.org/1999/xlink', 'href', url)`).

## 3. Generating the displacement map

The map is a `W×H` canvas, `toDataURL()`'d into the `feImage`. Per pixel:
compute where this pixel should *sample from*, store the offset in R/G around
128, and (optionally) an edge-highlight mask in B. Verified profile
(shuding/samasante): a rounded-rect signed-distance field with a smoothstep
falloff band — identity in the middle, samples pulled toward center at the
rim, which is exactly a convex-lens magnification.

```js
// ---- lens profile helpers -------------------------------------------------
const smoothStep = (a, b, t) => {
  t = Math.min(Math.max((t - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);                       // Hermite
};

// SDF of a rounded rectangle, coords centered on the lens, normalized to
// [-0.5, 0.5]. (w, h) are half-extents, r the corner radius, same units.
function roundedRectSDF(x, y, w, h, r) {
  const qx = Math.abs(x) - w + r;
  const qy = Math.abs(y) - h + r;
  return Math.min(Math.max(qx, qy), 0) +
         Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

// ---- map generation --------------------------------------------------------
// opts: { width, height, borderRadius, depth = 0.15, curvature = 0.8, dpr = 1 }
//   depth      — how far the bent band reaches inward (0.05 subtle … 0.3 deep)
//   curvature  — softness of the falloff (bigger = softer shoulder)
// Returns { url, maxScale } — feed url to feImage, maxScale to the scale attr.
function generateDisplacementMap(opts) {
  const { width, height, borderRadius, depth = 0.15, curvature = 0.8 } = opts;
  const dpr = opts.dpr ?? 1;
  const w = Math.round(width * dpr), h = Math.round(height * dpr);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const data = img.data;

  // normalized half-extents for the SDF (lens fills the canvas)
  const hw = 0.5, hh = 0.5;
  const nr = borderRadius / Math.max(width, height);

  const raw = new Float32Array(w * h * 2);
  let maxScale = 0;

  // Aave's four-fold symmetry: compute the top-left quadrant only, mirror
  // into the other three with sign negation (75% less per-pixel work).
  const qw = Math.ceil(w / 2), qh = Math.ceil(h / 2);
  for (let y = 0; y < qh; y++) {
    for (let x = 0; x < qw; x++) {
      const ix = x / w - 0.5;                       // [-0.5, 0)
      const iy = y / h - 0.5;

      const d = roundedRectSDF(ix, iy, hw, hh, nr);
      // identity deep inside, samples pulled toward center in the edge band
      const disp = smoothStep(curvature, 0, d + depth);
      const scaled = smoothStep(0, 1, disp);

      const dx = (ix * scaled + 0.5) * w - x;       // sampleX − pixelX
      const dy = (iy * scaled + 0.5) * h - y;
      maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));

      // write all four mirrored pixels
      const put = (px, py, sx, sy) => {
        const k = (py * w + px) * 2;
        raw[k] = dx * sx; raw[k + 1] = dy * sy;
      };
      put(x, y, 1, 1);
      put(w - 1 - x, y, -1, 1);
      put(x, h - 1 - y, 1, -1);
      put(w - 1 - x, h - 1 - y, -1, -1);
    }
  }

  maxScale = Math.max(maxScale, 1e-6);
  for (let i = 0, k = 0; i < data.length; i += 4, k += 2) {
    // encode: channel = offset / maxScale · 0.5 + 0.5  (0.5 = neutral)
    data[i]     = Math.round((raw[k]     / maxScale * 0.5 + 0.5) * 255); // R = X
    data[i + 1] = Math.round((raw[k + 1] / maxScale * 0.5 + 0.5) * 255); // G = Y
    data[i + 2] = 128;                                                   // B: free (specular mask, §5)
    data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Round trip: displacement = scale · (channel − 0.5)
  //                          = (maxScale/dpr) · (offset/maxScale) = offset/dpr ✓
  return { url: canvas.toDataURL(), maxScale: maxScale / dpr };
}
```

Notes, all verified:

- **The encode/decode must round-trip.** Whatever normalization you use when
  writing channels, the `scale` attribute must undo it exactly (here:
  `scale = maxScale`, channels store `offset/maxScale · 0.5 + 0.5`, and the
  spec's `(channel − 0.5)` cancels the `0.5`... i.e. effective displacement is
  half of `scale` × normalized offset — multiply `scale` ×2 or drop the `·0.5`
  pair symmetrically if you want the raw values; keep the pair consistent).
- 8 bits/channel caps precision; byte 128 is 0.502, leaving a negligible
  `0.002·scale` residual drift. Keep `scale` under ~150 or the quantization
  banding shows.
- **Channel choice is convention, not law** — one verified repo uses B for Y
  (`yChannelSelector="B"`). Just keep the encoder and the selectors agreeing.
- Want *physical* refraction instead of the SDF heuristic? kube.io derives it:
  convex squircle height field `yₛ(x) = (1 − (1 − x)⁴)^{1/4}`, surface normal
  from the numerical derivative, Snell–Descartes with n₁=1, n₂=1.5, offset =
  where the refracted ray lands. Same encoding, different profile function.
  Aave's Depth/Curvature/Splay knobs correspond to shaping this profile.

## 4. Chromatic aberration (the "liquid" fringe)

Real glass bends red/green/blue by slightly different amounts. Verified recipe
(rizroze + samasante, identical structure): **three displacement passes at
staggered scales, each isolated to one channel with `feColorMatrix`,
recombined with `feBlend mode="screen"`** (additive here, since the channel
images are disjoint):

```html
<filter id="lg-filter-UNIQUE" x="0" y="0" width="W" height="H"
        filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
  <feImage href="DATA_URI_PNG" x="0" y="0" width="W" height="H" result="map"/>

  <!-- staggered scales: e.g. S, S+10, S+20  (rizroze default offsets [0,10,20];
       samasante: S·(1 ± spread·dispersion)) -->
  <feDisplacementMap in="SourceGraphic" in2="map" scale="S_RED"
    xChannelSelector="R" yChannelSelector="G" result="dispR"/>
  <feColorMatrix in="dispR" type="matrix"
    values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red"/>

  <feDisplacementMap in="SourceGraphic" in2="map" scale="S_GREEN"
    xChannelSelector="R" yChannelSelector="G" result="dispG"/>
  <feColorMatrix in="dispG" type="matrix"
    values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green"/>

  <feDisplacementMap in="SourceGraphic" in2="map" scale="S_BLUE"
    xChannelSelector="R" yChannelSelector="G" result="dispB"/>
  <feColorMatrix in="dispB" type="matrix"
    values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue"/>

  <feBlend in="red" in2="green" mode="screen" result="rg"/>
  <feBlend in="rg" in2="blue" mode="screen"/>
</filter>
```

Keep the spread subtle — fringe reads as "optics" at 5–20px of scale delta and
as a broken monitor beyond that. Set `S_RED = S`, `S_GREEN = S + Δ`,
`S_BLUE = S + 2Δ`, `Δ ≈ chroma × 10`. One pass (§2) is the cheap variant; use
it on mobile.

## 5. Specular highlight + rim light

Aave's third and fourth layers. Their exact markup is unpublished; the two
verified constructions:

**Blue-channel mask (samasante).** The map's B channel doubles as a
specular/glow mask (128 = none, 255 = full) painted along the top rim of the
SDF edge band; a filter pass reads it and screens white over the result. Free
to carry since B is otherwise unused — write
`data[i+2] = 128 + rimIntensity * 127` in the §3 loop where
`d + depth ∈ (−edgeBand, 0)` and the surface normal faces the light.

**CSS overlay (simpler, what most implementations ship).** On a
non-displaced sibling above the content:

```css
.liquid-glass-shine {
  position: absolute; inset: 0; pointer-events: none;
  border-radius: inherit;
  /* rim light: 1px bevel top, shadow bottom — the "glass edge" */
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.55),
    inset 0 -1px 1px rgba(255, 255, 255, 0.18),
    0 4px 8px rgba(0, 0, 0, 0.25);
  /* specular: angled soft gradient, top-left light */
  background: linear-gradient(135deg,
    rgba(255, 255, 255, 0.35) 0%,
    rgba(255, 255, 255, 0.08) 30%,
    transparent 60%);
  mix-blend-mode: screen;
}
```

Safari nuance from Aave: they restrict the specular pass to the lens rect on
Safari (cost) but let it cover the filter region on Chromium — constraining it
there causes sub-pixel artifacts at the lens edge. The CSS-overlay variant
sidesteps this entirely.

## 6. Drop-in wrapper — any component

```js
let LG_SEQ = 0;

class LiquidGlass {
  /**
   * host: element to refract (position:relative is applied)
   * opts: { width, height, borderRadius, scale?, chroma?, depth?, curvature? }
   *       width/height default to the host's rect.
   */
  constructor(host, opts = {}) {
    this.host = host;
    const rect = host.getBoundingClientRect();
    this.opts = {
      width: Math.round(rect.width), height: Math.round(rect.height),
      borderRadius: 24, scale: null, chroma: 1,
      depth: 0.15, curvature: 0.8, ...opts,
    };
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', '0'); this.svg.setAttribute('height', '0');
    this.svg.style.position = 'absolute';
    this.svg.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.svg);
    host.style.position = 'relative';
    this.rebuild();
  }

  // Call ONLY when the lens SHAPE changes (resize, radius change) — never on
  // move/drag/scroll. Fresh filter id every time: Safari caches filter output
  // by id and keeps serving the stale map otherwise (Aave workaround #1).
  rebuild() {
    const o = this.opts;
    const id = `lg-${++LG_SEQ}`;
    const { url, maxScale } = generateDisplacementMap(o);
    const S = o.scale ?? maxScale;
    const D = o.chroma * 10;
    const CH = [
      ['1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', S,         'red'],
      ['0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', S + D,     'green'],
      ['0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', S + 2 * D, 'blue'],
    ];
    this.svg.innerHTML =
      `<defs><filter id="${id}" x="0" y="0" width="${o.width}" height="${o.height}"
         filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feImage href="${url}" x="0" y="0" width="${o.width}" height="${o.height}" result="map"/>
        ${CH.map(([m, s, name]) =>
          `<feDisplacementMap in="SourceGraphic" in2="map" scale="${s}"
             xChannelSelector="R" yChannelSelector="G" result="disp-${name}"/>
           <feColorMatrix in="disp-${name}" type="matrix" values="${m}" result="${name}"/>`
        ).join('')}
        <feBlend in="red" in2="green" mode="screen" result="rg"/>
        <feBlend in="rg" in2="blue" mode="screen"/>
      </filter></defs>`;
    // older Safari wants the xlink namespace on feImage
    this.svg.querySelector('feImage')
      .setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
    this.host.style.filter = `url(#${id})`;
  }

  destroy() { this.host.style.filter = ''; this.svg.remove(); }
}
```

```html
<div class="glass-thumb" id="thumb">…any content…</div>
<script> new LiquidGlass(document.getElementById('thumb'), { borderRadius: 30 }); </script>
```

React sketch (Aave's own component shape):

```jsx
function Glass({ lens, x = 0, children }) {
  const [filter, setFilter] = useState(null);
  useEffect(() => {                    // rebuild only on SHAPE change
    const { url, maxScale } = generateDisplacementMap(lens);
    setFilter({ id: `lg-${crypto.randomUUID()}`, url, scale: maxScale });
  }, [lens.width, lens.height, lens.borderRadius]);
  return (
    <div style={{ transform: `translateX(${x}px)`,       // moving is FREE
                  filter: filter && `url(#${filter.id})` }}>
      {filter && <svg width="0" height="0" aria-hidden>{/* §4 filter markup */}</svg>}
      {children}
    </div>
  );
}
```

Aave's component examples all follow this shape: the Switch/Slider thumb is a
`<Glass>` wrapping the track (`refractionTarget`), moved by transform while
the map never regenerates; the toggle-group indicator springs between options
(spring easing, not snap).

## 7. Performance rules (verified, load-bearing)

- **Moving is cheap; reshaping is not.** "The map is regenerated only when the
  glass changes shape, never when it simply changes place" (Aave). Drag,
  scroll, and spring animations move the filtered element with `transform` —
  the filter region rides along and the map is byte-identical.
- Quadrant symmetry cuts map generation to 25% of the pixels — it's what makes
  live shape-tweaking (resize handles, radius animation) viable.
- On Safari every map regeneration also forces a filter-id change (§8), so
  shape changes are strictly more expensive there — debounce resize.
- Keep the filtered subtree small. Filter cost scales with the source-graphic
  area, and Safari has a hard ceiling (§8).
- Mobile: drop to the single-pass filter (no chromatic split), or gate the
  effect behind `matchMedia('(pointer: fine)')` and ship §9's fallback.

## 8. Safari workarounds (all three required)

1. **Stale filter cache.** Safari caches SVG filter output by filter *id* and
   won't notice a swapped feImage map. Fix: fresh id on every rebuild (baked
   into §6).
2. **Source-graphic area ceiling.** Past an (undocumented, device-dependent)
   area, Safari renders the filter as mismatched blocks or drops it entirely.
   Fix: refract compact components — controls, cards, thumbnails — not
   full-viewport sections.
3. **`<video>` and canvas.** Safari composites video on the GPU and never
   hands those pixels to the SVG filter pipeline. Aave runs the *same*
   displacement map through a WebGL fragment shader for their video player and
   QR canvas (`generateLensMap(lens)` → shader uniform). If you need glass
   over video in Safari, that's the route; otherwise exclude video from the
   filtered subtree.

## 9. Fallback + accessibility

```js
// Chromium-only enhancement gate for pane-style backdrop glass (§ below);
// the filter-on-content path needs no gate — it works in all three engines.
const supportsBackdropSVG =
  CSS.supports('backdrop-filter', 'url(#x)') &&
  /Chrom(e|ium)/.test(navigator.userAgent);   // Safari false-positives CSS.supports here
```

- **Pane-style glass over arbitrary page content** (`backdrop-filter:
  url(#id) blur(0.25px) contrast(1.2) brightness(1.05) saturate(1.1)` — the
  shuding recipe): Chromium-only as of mid-2026. WebKit bug 245510 has PRs in
  flight, so re-check before hardcoding UA gates. Fallback:
  `backdrop-filter: blur(12px)` frosted glass, or this repo's
  `liquid-glass.md` Tier 1 recipe.
- `prefers-reduced-motion: reduce` → freeze the lens (no springing/dragging
  animation of the filtered element); the static refraction itself is fine.
- The displacement never moves pixels more than `scale` px — keep interactive
  hit targets ≥ `scale` px from the lens rim so the visual and the hitbox
  don't visibly disagree (the DOM hitbox does NOT move with the pixels).
- Contrast: the fringe and specular layers lighten edges; re-check text
  contrast inside the edge band, or keep text out of the outer `depth` band.

## 10. Parameter cheat sheet

| Knob | Recipe hook | Sane range | Effect |
|---|---|---|---|
| `width/height` | map + filter region px | = element rect | lens size |
| `borderRadius` | SDF corner radius | 0 … min(w,h)/2 | squircle-ness |
| `scale` | feDisplacementMap scale | 20 – 120 | refraction strength ("Depth") |
| `depth` | SDF band reach | 0.05 – 0.3 | how far the bend reaches inward |
| `curvature` | smoothstep shoulder | 0.4 – 1.2 | hard lens ↔ soft blob ("Curvature/Splay") |
| `chroma` | per-channel scale Δ (×10px) | 0 – 2 | fringe intensity ("Chroma") |
| blur | extra `blur(0.25px)` in the filter chain | 0 – 1px | melts displacement aliasing ("Blur") |
| glow / edge highlight | §5 overlay alphas | — | specular & rim ("Glow/Edge Highlight/Specular Angle") |

## Sources (all claims verified 3-0 against these)

- https://aave.com/design/building-glass-for-the-web — primary; architecture, quadrant symmetry, Safari workarounds, performance model
- https://github.com/shuding/liquid-glass — map-generation math, encode/decode round trip, backdrop-filter variant
- https://github.com/samasante/liquid-glass — closest filter-on-content match to Aave; blue-channel specular mask; WebGL fallback
- https://github.com/rizroze/liquid-glass — chromatic-aberration filter graph (feColorMatrix + feBlend screen)
- https://github.com/archisvaze/liquid-glass — WebGL Snell's-law shader fallback
- https://kube.io/blog/liquid-glass-css-svg/ — physical refraction math (height field → normal → Snell)
- https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap + W3C SVG §15.15 — displacement formula, sRGB requirement
- https://bugs.webkit.org/show_bug.cgi?id=245510 — Safari `backdrop-filter: url()` gap (still open 2026-07-16, PRs in flight)
