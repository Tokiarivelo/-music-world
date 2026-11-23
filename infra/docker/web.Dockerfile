# Next.js standalone image. Build context: repository root.
FROM node:22-alpine AS build
RUN npm install -g pnpm@10.29.3
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/schemas/package.json packages/schemas/
RUN pnpm install --frozen-lockfile --filter @music-world/web...
COPY apps/web/ apps/web/
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm -C apps/web build

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
