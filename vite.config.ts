import { defineConfig } from "vite";

export default defineConfig({
  // Must match the GitHub repository name for GitHub Pages.
  base: "/Shooting-range/",
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        // Three.js in its own chunk: better caching, smaller app chunk.
        manualChunks: {
          three: ["three"],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
