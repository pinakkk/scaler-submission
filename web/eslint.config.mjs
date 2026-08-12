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
    // Generated / build artifacts:
    "worker-configuration.d.ts", // written by `wrangler types`
    ".open-next/**", // written by `opennextjs-cloudflare build`
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
