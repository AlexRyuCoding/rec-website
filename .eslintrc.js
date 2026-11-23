module.exports = {
  root: true,
  // Written by Next.js itself on every build and `next dev` ("this file
  // should not be edited"). Since 15.5 it points at the generated route
  // types with a `/// <reference path>`, which the rules below refuse.
  ignorePatterns: ["next-env.d.ts"],
  env: {
    browser: true,
    node: true,
    es2021: true,
  },
  extends: [
    "next/core-web-vitals",
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:prettier/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 12,
    sourceType: "module",
  },
  plugins: ["react", "@typescript-eslint", "prettier"],
  settings: {
    react: {
      version: "detect",
    },
  },
  rules: {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "no-console": ["warn", { allow: ["warn", "error"] }],
    "prettier/prettier": [
      "error",
      {
        singleQuote: false,
        trailingComma: "es5",
        semi: true,
      },
    ],
    "react-hooks/exhaustive-deps": "warn",
  },
  overrides: [
    {
      // Standalone Node CLI scripts (scripts/setup-pb-webhook.js,
      // scripts/mint-db-jwt.js) — run directly via `node scripts/x.js`,
      // not part of the Next.js app. CommonJS + console output by design.
      files: ["scripts/**/*.js"],
      parserOptions: {
        sourceType: "script",
      },
      rules: {
        "@typescript-eslint/no-require-imports": "off",
        "no-console": "off",
        "no-constant-condition": ["error", { checkLoops: false }],
      },
    },
    {
      // The Node half of deploy/ops/stamp-pins.sh, run inside the ops
      // image — not part of the Next.js app. Its counts are printed with
      // console.log by design. (Naming *.mjs here is also what makes
      // `eslint .` look at these files at all.)
      files: ["deploy/ops/**/*.mjs"],
      rules: {
        "no-console": "off",
      },
    },
  ],
};
