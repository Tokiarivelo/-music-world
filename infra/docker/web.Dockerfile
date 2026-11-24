# syntax=docker/dockerfile:1
# Next.js standalone image. Build context: repository root.
FROM node:22-alpine AS build
RUN npm install -g pnpm@10.29.3
ENV npm_config_store_dir=/pnpm/store
WORKDIR /repo
# Manifests first: the install layer is rebuilt only when a dependency changes. The pnpm store cache mount keeps
# downloaded packages between builds (not part of the image).
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/schemas/package.json packages/schemas/
RUN --mount=type=cache,id=music-world-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @music-world/web...
COPY apps/web/ apps/web/
ENV NEXT_TELEMETRY_DISABLED=1
# .next/cache (Turbopack / webpack incremental cache) survives between builds: only changed modules are rebuilt.
RUN --mount=type=cache,id=music-world-next,target=/repo/apps/web/.next/cache pnpm -C apps/web build

FROM node:22-alpine
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
# outputFileTracingRoot is the repo root, so server.js sits under apps/web/ in the standalone tree.
COPY --from=build --chown=node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
