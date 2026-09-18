import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const web = fileURLToPath(new URL("./apps/web", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@ahaai/core": fileURLToPath(new URL("./packages/core/src", import.meta.url)),
      "@ahaai/db": fileURLToPath(new URL("./packages/db/src", import.meta.url)),
      "@ahaai/testing": fileURLToPath(
        new URL("./packages/testing/src", import.meta.url),
      ),
      "@": web,
      "server-only": fileURLToPath(
        new URL("./packages/testing/src/stubs/empty.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    // A shell that exports NODE_ENV=production would otherwise run the suite
    // against production React, which has no act(), and change cookie and CSP
    // semantics. Tests define their own environment.
    env: { NODE_ENV: "test" },
    setupFiles: ["./packages/testing/src/setup-env.ts"],
    include: [
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
    ],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
