// ESLint flat config (ESLint 9). Next.js 16 removed `next lint`; the
// project runs `eslint .` directly. The rules are the ones the old
// .eslintrc.js applied, carried over one for one.
import js from "@eslint/js";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import tseslint from "typescript-eslint";
import globals from "globals";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      // Git worktrees made by tooling live inside the main checkout.
      ".claude/**",
      // Written by Next.js itself on every build and `next dev` ("this
      // file should not be edited"); it points at the generated route
      // types with a `/// <reference path>`, which the rules refuse.
      "next-env.d.ts",
    ],
  },
  js.configs.recommended,
  // Next's own set: the Next.js rules, React, React Hooks, jsx-a11y,
  // import, and the TypeScript parser.
  ...nextCoreWebVitals,
  ...tseslint.configs.recommended,
  prettierRecommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { react: { version: "detect" } },
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prettier/prettier": [
        "error",
        { singleQuote: false, trailingComma: "es5", semi: true },
      ],
      "react-hooks/exhaustive-deps": "warn",
      // New with eslint-config-next 16 (eslint-plugin-react-hooks 7):
      // rules written for the React Compiler, which this project does not
      // use. Both flag patterns the kiosk and the boards rely on on
      // purpose — a ref that holds the latest handler so a listener added
      // once always calls the current one, and effects that set state from
      // a timer or a reply. Rewriting those 44 places would risk the input
      // rules CLAUDE.md lists as "do not regress", for no gain without the
      // compiler. The compiler's other rules stay on (none fire).
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Standalone Node CLI scripts (scripts/setup-pb-webhook.js,
    // scripts/mint-db-jwt.js) — run directly via `node scripts/x.js`,
    // not part of the Next.js app. CommonJS + console output by design.
    files: ["scripts/**/*.js"],
    languageOptions: { sourceType: "commonjs" },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "off",
      "no-constant-condition": ["error", { checkLoops: false }],
    },
  },
  {
    // The Node half of deploy/ops/stamp-pins.sh, run inside the ops
    // image — not part of the Next.js app. Its counts are printed with
    // console.log by design.
    files: ["deploy/ops/**/*.mjs"],
    rules: { "no-console": "off" },
  },
];

export default config;
