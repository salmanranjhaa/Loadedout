import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null, // registered manually in main.jsx with a periodic update check
      manifest: {
        name: "Loadedout - Fitness & Lifestyle",
        short_name: "Loadedout",
        description: "Dark-themed fitness & lifestyle PWA for tracking workouts, meals, schedule, budget, and more.",
        theme_color: "#0A0A0F",
        background_color: "#0A0A0F",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
        shortcuts: [
          { name: "Log Workout", short_name: "Workout", description: "Start a new workout session", url: "/workout", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
          { name: "Log Meal", short_name: "Meal", description: "Log a meal", url: "/meals", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
        ],
      },
      workbox: {
        // Take over immediately on update and drop old precaches — without
        // this an installed PWA can keep serving a stale bundle for days.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // The SW must never SPA-fallback file downloads or backend routes —
        // navigating to /loadedout.apk used to render a blank app shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/mcp\//, /\.apk$/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp)/,
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 100, maxAgeSeconds: 2592000 },
            },
          },
          {
            urlPattern: /^\/api\/v1\/(workout|meals|analytics|schedule)/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ["recharts"],
        },
      },
    },
  },
});
