import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/server-only-stub.ts"),
    },
  },
  test: { environment: "node", setupFiles: ["tests/setup-env.ts"], hookTimeout: 120000, include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "apps/backend/test/**/*.test.ts"], testTimeout: 120000 },
});
