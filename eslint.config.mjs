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
  ]),
  {
    rules: {
      // Smell de rendimiento (espejar props en estado con un efecto), no un
      // crash. Queda como aviso para que la CI no lo bloquee; se ataca en la
      // fase 4 del saneamiento (empezando por ActasElementRow). Ver
      // docs/auditoria-2026-08.md §4.2.
      "react-hooks/set-state-in-effect": "warn",
      // Deja sin usar variables prefijadas con «_» (patrón void _ctx del repo).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
