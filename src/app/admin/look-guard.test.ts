import { describe, expect, it } from "vitest";
import { blurredLayers, lookProblems } from "./look-guard";

// The detector behind the staff look's guard tests. It has tests of its
// own because a guard that lets things through is worse than none: the
// first version was a short deny-list, and a review walked a dozen
// one-theme colours straight past it.
const found = (classes: string, options = {}) =>
  lookProblems(`const c = "${classes}";`, options);

describe("lookProblems", () => {
  it.each([
    "text-red-500",
    "bg-black",
    "text-gray-400",
    "text-white",
    "bg-white/10",
    "border-neutral-700",
    "ring-rose-400",
    "divide-slate-200",
    "hover:bg-sky-900",
    "[&:hover>td]:bg-zinc-800",
    "placeholder:text-stone-400",
    "from-purple-500",
  ])("catches a palette colour: %s", (cls) =>
    expect(found(cls)).toEqual([cls])
  );

  it.each([
    "text-brand-primary",
    "border-brand-foreground/40",
    "text-cream/50",
    "text-gold",
    "bg-canvas",
    "text-surface",
    "text-ink",
    "border-error",
    "text-error",
  ])("catches the site's old names: %s", (cls) =>
    expect(found(cls)).toEqual([cls])
  );

  it.each(["text-[#123456]", "bg-[rgb(0,0,0)]", "border-[#fff]"])(
    "catches a literal colour: %s",
    (cls) => expect(found(cls)).toEqual([cls])
  );

  it("catches a named colour thinned with an opacity (every tint has its own name)", () =>
    expect(found("bg-ui-panel/50")).toEqual(["bg-ui-panel/50"]));

  it.each([
    "shadow",
    "shadow-sm",
    "shadow-lg",
    "shadow-2xl",
    "shadow-inner",
    "shadow-black/60",
    "drop-shadow-md",
    "blur-sm",
    "backdrop-blur-[2px]",
    "shadow-[0_4px_12px_rgba(0,0,0,0.3)]",
    "shadow-[0_2px_0_#000]",
  ])("catches a soft or unlisted shadow: %s", (cls) =>
    expect(found(cls)).toEqual([cls])
  );

  it("lets the look's own names through", () =>
    expect(
      found(
        "text-ui-text bg-ui-panel-2 border-ui-line-strong ring-ui-line divide-ui-line accent-ui-accent-fill outline-ui-accent-text hover:bg-ui-panel-2 [&:hover>td]:bg-ui-panel-2 focus-visible:outline-ui-accent-text placeholder:text-ui-text-3 shadow-lift-1 shadow-lift-2 shadow-lift-accent shadow-lift-danger shadow-sunk [&:not(:disabled)]:active:shadow-none bg-transparent border-transparent bg-current text-inherit"
      )
    ).toEqual([]));

  it("is not fooled by utilities that only share a prefix with colours", () =>
    expect(
      found(
        "text-sm text-[13px] text-left text-center text-xs border border-b border-t-0 border-dashed border-collapse ring-1 ring-inset ring-[3px] outline outline-2 outline-offset-2 divide-y bg-cover bg-center fill-none to-transparent decoration-2 text-balance border-separate"
      )
    ).toEqual([]));

  it("ignores words in comments", () =>
    expect(
      lookProblems(
        '// the canvas is cream, with a blur and text-white\n/* bg-black */\nconst c = "text-ui-text";'
      )
    ).toEqual([]));

  it("allows what is named as an exception, and only that", () => {
    expect(
      found("text-[#FF0000] text-[#00FF00]", { allow: ["text-[#FF0000]"] })
    ).toEqual(["text-[#00FF00]"]);
    expect(found("bg-amber-300", { allow: [/^(bg|text)-amber-\d+$/] })).toEqual(
      []
    );
  });

  it("with hardLedges, a zero-blur arbitrary shadow is allowed and a blurred one is not", () => {
    const options = { hardLedges: true };
    expect(
      found(
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_0_#034a35]",
        options
      )
    ).toEqual([]);
    expect(found("shadow-[0_-8px_24px_rgba(0,0,0,0.5)]", options)).toEqual([
      "shadow-[0_-8px_24px_rgba(0,0,0,0.5)]",
    ]);
    expect(found("shadow-lg", options)).toEqual(["shadow-lg"]);
  });
});

describe("blurredLayers", () => {
  it("tells a soft shadow from a ledge", () => {
    expect(blurredLayers("0 1px 2px rgba(0, 0, 0, 0.5)")).toHaveLength(1);
    expect(
      blurredLayers("inset 0 1px 0 #ffffff, 0 2px 0 rgba(0, 0, 0, 0.7)")
    ).toHaveLength(0);
    expect(blurredLayers("0 3px 0 0 #000, 0 8px 20px -8px #000")).toHaveLength(
      1
    );
  });
  it("counts a blur given in rem or em", () => {
    expect(blurredLayers("0 0.25rem 0.5rem #000")).toHaveLength(1);
    expect(blurredLayers("0 1em 1em #000")).toHaveLength(1);
  });
  it("reads a Tailwind arbitrary value (underscores for spaces)", () =>
    expect(blurredLayers("0_-8px_24px_rgba(0,0,0,0.5)")).toHaveLength(1));
});
