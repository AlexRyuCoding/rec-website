module.exports = {
  root: true,
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
      // Standalone Node CLI scripts (scripts/sync-patients.js,
      // scripts/setup-pb-webhook.js) — run directly via `node scripts/x.js`,
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
  ],
};
