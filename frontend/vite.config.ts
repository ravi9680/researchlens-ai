import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:4000" } },
  build: {
    rollupOptions: {
      output: {
        /* Split the bundle by concern. Charts and the animation library are
         * large and only needed on a few routes, so they are cached
         * independently of the app shell. */
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          motion: ["framer-motion"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
});
