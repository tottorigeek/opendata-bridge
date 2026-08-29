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
    // prisma/seed.ts は Node の TypeScript 型ストリップで直接実行するため
    // CommonJS(require)で記述されている。ESM の import にすると Prisma の
    // CJS クライアント解決に失敗するため、意図的な記述である。
    files: ["prisma/seed.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
