import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/lib/database.types.ts",
  ]),
  {
    rules: {
      // Prose in JSX is full of apostrophes; escaping them hurts readability.
      "react/no-unescaped-entities": "off",
      // Async Server Components read Date.now() on purpose (schedules, cutoffs).
      "react-hooks/purity": "off",
    },
  },
]);

export default eslintConfig;
