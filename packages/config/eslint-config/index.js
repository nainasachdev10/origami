/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
    "plugin:@typescript-eslint/stylistic-type-checked",
  ],
  plugins: ["@typescript-eslint"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
  },
  rules: {
    // Disallow any — hard rule from spec section 9
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-return": "error",
    "@typescript-eslint/no-unsafe-argument": "error",

    // Disallow localStorage/sessionStorage — hard rule from spec section 9
    "no-restricted-globals": [
      "error",
      { name: "localStorage", message: "Use server state or React state instead (spec rule #2)." },
      { name: "sessionStorage", message: "Use server state or React state instead (spec rule #2)." },
    ],
    "no-restricted-properties": [
      "error",
      {
        object: "window",
        property: "localStorage",
        message: "Use server state or React state instead (spec rule #2).",
      },
      {
        object: "window",
        property: "sessionStorage",
        message: "Use server state or React state instead (spec rule #2).",
      },
    ],

    // General quality rules
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports", fixStyle: "inline-type-imports" },
    ],
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    "@typescript-eslint/prefer-optional-chain": "error",
    "eqeqeq": ["error", "always"],
    "no-console": ["warn", { allow: ["warn", "error"] }],
  },
  ignorePatterns: [
    "node_modules/",
    "dist/",
    ".next/",
    ".turbo/",
    "*.config.js",
    "*.config.ts",
  ],
};
