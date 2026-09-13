import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(
        new URL("./test/stubs/empty.ts", import.meta.url),
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
    setupFiles: ["./test/setup-env.ts"],
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
