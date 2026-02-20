import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/api/**/*.ts",
        "src/client/**/*.ts",
        "src/runtime/**/*.ts",
        "src/database/db/**/*.ts",
        "src/bridge/**/*.ts",
        "src/opencode/**/*.ts",
        "src/config/**/*.ts",
        "src/adapters/**/*.ts",
      ],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.types.ts",
        "src/**/*.schema.ts",
        "src/**/*.consts.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 90,
      },
    },
  },
});
