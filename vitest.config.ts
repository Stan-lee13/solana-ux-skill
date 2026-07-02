// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
      // Since Vitest v3.2 the v8 provider uses AST-based coverage remapping,
      // which deliberately excludes any file matched by `test.include` from
      // ever being a coverage target — even if it's also listed in
      // `coverage.include`. Every test file's implementation logic now lives
      // in a real sibling module (e.g. tests/wallet-state.ts exports
      // deriveWalletState; wallet-state.test.ts imports it) so it is
      // legitimately "imported during the test run" and gets counted.
      include: ["tests/*.ts"],
      exclude: ["tests/*.test.ts"],
      thresholds: { statements: 70, branches: 70, functions: 70, lines: 70 },
    },
    testTimeout: 30_000,
  },
});
