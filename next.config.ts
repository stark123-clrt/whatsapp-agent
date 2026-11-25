import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Baileys garde une connexion WebSocket ouverte : on le charge tel quel avec
  // Node.js au lieu de le passer dans le bundler.
  serverExternalPackages: ["baileys", "pino", "qrcode", "puppeteer-core"],
  // Serveur autonome pour Docker / Coolify (dossier .next/standalone).
  output: "standalone",
  // Ne jamais embarquer les données, la session WhatsApp ni les secrets dans le serveur construit.
  outputFileTracingExcludes: {
    "*": ["data/**", ".wa-auth/**", ".env*", ".git/**", "**/*.db", "**/*.db-*"],
  },
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
