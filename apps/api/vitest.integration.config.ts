import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/api/test/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 10_000,
    hookTimeout: 10_000
  }
});
