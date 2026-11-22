// The detector behind the staff look's guard tests (staff-theme.test.ts,
// rooms/rooms-look.test.ts): given a source file's text, which of its
// Tailwind classes break the look's rules?
//
// - A colour that is not one of the theme's names. One-theme colours are
//   the whole risk of a light/dark switch: `text-white` is invisible on a
//   light panel. Caught: every Tailwind palette colour, the site's old
//   names (brand-…, cream, …), literal colours (`text-[#123456]`), and a
//   named colour thinned with an opacity (`bg-ui-panel/50` — every tint
//   has its own name).
// - A soft shadow. Depth is a hard ledge: only the five ledge names, or —
//   where `hardLedges` allows literal ones (room tiles, which carry their
//   own colours) — an arbitrary shadow whose every layer has zero blur.
//
// It reads class names out of the text and ignores comments. Anything it
// reports is either fixed or named in `allow`, so every exception is
// written down where the next person will see it.

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white";
// tailwind.config.ts, outside the `ui` group.
const OLD_NAMES = "brand-[a-z0-9-]+|cream|gold|canvas|surface|island|ink|error";
const COLOUR_PREFIX =
  "text|bg|border(?:-[trblxyse])?|ring|ring-offset|outline|divide|accent|fill|stroke|decoration|placeholder|caret|from|via|to|shadow";

const COLOUR = new RegExp(`^(?:${COLOUR_PREFIX})-(.+)$`);
const PALETTE_COLOUR = new RegExp(`^(?:${PALETTE})(?:-\\d{2,3})?(?:/\\d+)?$`);
const OLD_COLOUR = new RegExp(`^(?:${OLD_NAMES})(?:/\\d+)?$`);
const LITERAL_COLOUR = /^\[(?:#|rgb|hsl|oklch|color:)/;
const THINNED_NAME = /^ui-[a-z0-9-]+\/\d+$/;
const LEDGE = /^shadow-(?:lift-1|lift-2|lift-accent|lift-danger|sunk|none)$/;
const SOFT_SHADOW = /^shadow(?:-(?:sm|md|lg|xl|2xl|inner))?$/;
const ARBITRARY_SHADOW = /^shadow-\[(.+)\]$/;
const BLUR = /^(?:drop-shadow|blur|backdrop-blur)(?:-.+)?$/;

// The layers of a box-shadow value whose blur radius is not zero. Accepts
// CSS ("0 2px 0 #000, …") or a Tailwind arbitrary value, where the parts
// are joined by underscores.
export function blurredLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value.replace(/_/g, " ")) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      layers.push(current);
      current = "";
    } else current += ch;
  }
  layers.push(current);
  return layers
    .map((layer) => layer.trim())
    .filter((layer) => {
      const lengths = layer
        .replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|var\([^)]*\)/gi, " ")
        .split(/\s+/)
        .filter((t) => /^-?\d*\.?\d+(?:px|rem|em)?$/.test(t));
      return lengths.length >= 3 && parseFloat(lengths[2]) !== 0;
    });
}

// `hover:bg-x` → `bg-x`; `[&:hover>td]:bg-x` → `bg-x`.
function utilityOf(token: string): string {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    else if (ch === ":" && depth === 0) start = i + 1;
  }
  return token.slice(start).replace(/^[!-]/, "");
}

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

export interface LookOptions {
  // Exceptions, each one a decision: the whole class as written, or a
  // pattern for the utility (the part after any `hover:` and the like).
  allow?: (string | RegExp)[];
  // Literal zero-blur shadows are allowed (things that carry their own
  // colours, like a room tile, need a ledge in their own shade).
  hardLedges?: boolean;
}

// The classes in `source` that break the look's rules, as written.
export function lookProblems(
  source: string,
  { allow = [], hardLedges = false }: LookOptions = {}
): string[] {
  const problems: string[] = [];
  for (const token of withoutComments(source).split(/[\s"'`]+/)) {
    if (!token) continue;
    const utility = utilityOf(token);
    if (
      allow.some((a) =>
        typeof a === "string" ? a === token || a === utility : a.test(utility)
      )
    ) {
      continue;
    }
    if (LEDGE.test(utility)) continue;
    if (SOFT_SHADOW.test(utility) || BLUR.test(utility)) {
      problems.push(token);
      continue;
    }
    const arbitrary = ARBITRARY_SHADOW.exec(utility);
    if (arbitrary) {
      if (!hardLedges || blurredLayers(arbitrary[1]).length > 0) {
        problems.push(token);
      }
      continue;
    }
    const colour = COLOUR.exec(utility);
    if (!colour) continue;
    const value = colour[1];
    if (
      PALETTE_COLOUR.test(value) ||
      OLD_COLOUR.test(value) ||
      LITERAL_COLOUR.test(value) ||
      THINNED_NAME.test(value)
    ) {
      problems.push(token);
    }
  }
  return problems;
}
