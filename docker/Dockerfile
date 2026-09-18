# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: compile the frontend to static files and bundle the API.
# ---------------------------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app

# Bun is the bundler for the API.
RUN npm install -g bun@1.4.2

# Copy only the manifests first, so a source change does not redo the install.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/testing/package.json packages/testing/
RUN npm ci --include=dev

COPY . .

RUN npm run build --workspace @ahaai/web \
 && npm run build --workspace @ahaai/api

# ---------------------------------------------------------------------------
# Runtime stage: one container serving the API and the static frontend.
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# The two modules the bundle deliberately leaves external: ioredis is only
# loaded when REDIS_URL is set, and PGlite only for the embedded dev database.
COPY docker/runtime-package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/apps/api/dist/index.js ./dist/index.js
COPY --from=builder /app/packages/db/drizzle ./drizzle
COPY --from=builder /app/apps/web/out ./web

# `import.meta.url` cannot locate the migration folder once the code is bundled,
# so it is pinned here. STATIC_ROOT plus SERVE_STATIC makes the API also serve
# the frontend, which keeps everything on one origin.
ENV AHAALI_MIGRATIONS_DIR=/app/drizzle \
    STATIC_ROOT=/app/web \
    SERVE_STATIC=1 \
    PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "dist/index.js"]
