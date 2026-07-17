// Liquid Glass — Aave refraction technique (liquid-glass-aave.md).
// Generates the displacement-map PNG that drives an SVG feDisplacementMap
// filter: R channel = X offset, G = Y, byte 128 = "don't move". The map is
// a rounded-rect SDF with a smoothstep falloff band — identity in the
// middle, samples pulled toward center at the rim (a convex lens).

export interface LensOptions {
  width: number;
  height: number;
  borderRadius: number;
  /** How far the bent band reaches inward (0.05 subtle … 0.3 deep) */
  depth?: number;
  /** Softness of the falloff shoulder (bigger = softer) */
  curvature?: number;
}

const smoothStep = (a: number, b: number, t: number): number => {
  t = Math.min(Math.max((t - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t); // Hermite
};

// SDF of a rounded rectangle, coords centered on the lens, normalized to
// [-0.5, 0.5]. (w, h) are half-extents, r the corner radius, same units.
function roundedRectSDF(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): number {
  const qx = Math.abs(x) - w + r;
  const qy = Math.abs(y) - h + r;
  return (
    Math.min(Math.max(qx, qy), 0) +
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
    r
  );
}

export function generateDisplacementMap(opts: LensOptions): {
  url: string;
  maxScale: number;
} {
  const { width, height, borderRadius, depth = 0.15, curvature = 0.8 } = opts;
  const w = Math.round(width);
  const h = Math.round(height);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { url: "", maxScale: 0 };
  const img = ctx.createImageData(w, h);
  const data = img.data;

  const hw = 0.5;
  const hh = 0.5;
  const nr = borderRadius / Math.max(width, height);

  const raw = new Float32Array(w * h * 2);
  let maxScale = 0;

  // Four-fold symmetry: compute the top-left quadrant only, mirror into the
  // other three with sign negation (75% less per-pixel work).
  const qw = Math.ceil(w / 2);
  const qh = Math.ceil(h / 2);
  for (let y = 0; y < qh; y++) {
    for (let x = 0; x < qw; x++) {
      const ix = x / w - 0.5;
      const iy = y / h - 0.5;

      const d = roundedRectSDF(ix, iy, hw, hh, nr);
      const disp = smoothStep(curvature, 0, d + depth);
      const scaled = smoothStep(0, 1, disp);

      const dx = (ix * scaled + 0.5) * w - x; // sampleX − pixelX
      const dy = (iy * scaled + 0.5) * h - y;
      maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));

      const put = (px: number, py: number, sx: number, sy: number) => {
        const k = (py * w + px) * 2;
        raw[k] = dx * sx;
        raw[k + 1] = dy * sy;
      };
      put(x, y, 1, 1);
      put(w - 1 - x, y, -1, 1);
      put(x, h - 1 - y, 1, -1);
      put(w - 1 - x, h - 1 - y, -1, -1);
    }
  }

  maxScale = Math.max(maxScale, 1e-6);
  for (let i = 0, k = 0; i < data.length; i += 4, k += 2) {
    // encode: channel = offset / maxScale · 0.5 + 0.5  (0.5 = neutral);
    // the scale attribute (= maxScale) undoes this exactly.
    data[i] = Math.round((raw[k] / maxScale + 1) * 0.5 * 255); // R = X
    data[i + 1] = Math.round((raw[k + 1] / maxScale + 1) * 0.5 * 255); // G = Y
    data[i + 2] = 128; // B unused
    data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Encode wrote offset/maxScale·0.5 around 0.5, and the spec applies
  // scale·(channel − 0.5) — so scale must be 2·maxScale to round-trip.
  return { url: canvas.toDataURL(), maxScale: maxScale * 2 };
}

// Pane-style glass over arbitrary page content requires
// backdrop-filter: url(#id) — Chromium-only as of mid-2026 (WebKit bug
// 245510). Safari false-positives CSS.supports here, hence the UA check.
// pointer:fine keeps the per-frame filter cost off low-end mobile.
export function supportsBackdropDisplacement(): boolean {
  if (typeof window === "undefined") return false;
  return (
    CSS.supports("backdrop-filter", "url(#x)") &&
    /Chrom(e|ium)/.test(navigator.userAgent) &&
    window.matchMedia("(pointer: fine)").matches
  );
}
