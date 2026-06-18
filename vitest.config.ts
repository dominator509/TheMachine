import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@the-machine/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@the-machine/agent-runtime": path.resolve(__dirname, "packages/agent-runtime/src/index.ts"),
      "@the-machine/service": path.resolve(__dirname, "packages/service/src/index.ts"),
      "@the-machine/providers": path.resolve(__dirname, "packages/providers/src/index.ts"),
      "@the-machine/mcp": path.resolve(__dirname, "packages/mcp/src/index.ts"),
      "@the-machine/storage": path.resolve(__dirname, "packages/storage/src/index.ts"),
      "@the-machine/plugin-sdk": path.resolve(__dirname, "packages/plugin-sdk/src/index.ts"),
      "@the-machine/security": path.resolve(__dirname, "packages/security/src/index.ts"),
      "@the-machine/observability": path.resolve(__dirname, "packages/observability/src/index.ts"),
      "@the-machine/ui-components": path.resolve(__dirname, "packages/ui-components/src/index.ts"),
    },
  },
  test: {
    workspace: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.unit.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/**/*.integration.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
