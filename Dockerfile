# Agent WhatsApp — image de production (Coolify / Docker)
# Node 24 : SQLite intégré (node:sqlite). Chromium : lecture des sites JavaScript.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS run
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji ca-certificates curl tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    BROWSER_PATH=/usr/bin/chromium \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Données persistantes : base + médias, et session WhatsApp (volumes Coolify).
RUN mkdir -p /app/data /app/.wa-auth
VOLUME ["/app/data", "/app/.wa-auth"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
# tini : arrête proprement Node et Chromium quand le conteneur s'arrête.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
