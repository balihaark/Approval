# Approvals backend — Fastify + TypeScript + Prisma.
# Multi-stage build: compile TS + generate Prisma client in `build`, then copy
# only what we need into a slim runtime image.

# ---- 1. build stage ---------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests first so `npm ci` layer caches until deps change.
COPY package.json package-lock.json* ./

# Some Prisma internals rely on openssl at install time.
RUN apk add --no-cache openssl \
 && npm ci --no-audit --no-fund

# Copy prisma schema (needed for `prisma generate` postinstall) + source.
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./

RUN npx prisma generate \
 && npm run build

# Prune dev deps for a smaller runtime layer.
RUN npm prune --omit=dev


# ---- 2. runtime stage -------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app

# Prisma's query engine needs openssl.
RUN apk add --no-cache openssl tini

ENV NODE_ENV=production
ENV PORT=3001

# Pull compiled JS + pruned node_modules + Prisma schema/migrations.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O - http://localhost:3001/health >/dev/null || exit 1

# Run migrations on start, then launch the server. `tini` reaps zombies so
# Fastify's graceful-shutdown handling actually gets SIGTERM.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
