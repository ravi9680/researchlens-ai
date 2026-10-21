import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    /* jsdom (not node) so components can be mounted, clicked and typed
     * into — the previous "node" environment only allowed server rendering,
     * which meant no interaction was ever covered. */
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setup.ts"],
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
    css: false,
  },
});
