import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    // Serve /ort/*.mjs files directly — Vite blocks dynamic import() of /public files,
    // but onnxruntime-web needs to import the JSEP module this way.
    {
      name: "ort-mjs-server",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url || "";
          if (url.startsWith("/ort/") && url.includes(".mjs")) {
            const filePath = resolve(process.cwd(), "public", url.split("?")[0].slice(1));
            if (existsSync(filePath)) {
              res.setHeader("Content-Type", "application/javascript");
              res.setHeader("Cache-Control", "no-cache");
              res.end(readFileSync(filePath, "utf-8"));
              return;
            }
          }
          next();
        });
      },
    },
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "Park Check",
        short_name: "ParkCheck",
        description: "Parking enforcement plate checker",
        theme_color: "#1e40af",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/,
            handler: "NetworkFirst",
            options: { cacheName: "api-cache" },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://web:8000",
        changeOrigin: true,
      },
    },
  },
});
