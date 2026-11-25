import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Baileys garde une connexion WebSocket ouverte : on le charge tel quel avec
  // Node.js au lieu de le passer dans le bundler.
  serverExternalPackages: ["baileys", "pino", "qrcode", "puppeteer-core"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
