FROM node:22-alpine AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY workers/media-processor/package.json ./workers/media-processor/package.json
RUN pnpm install --frozen-lockfile --filter @loopline/media-processor...

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/workers/media-processor/node_modules ./workers/media-processor/node_modules
COPY workers/media-processor ./workers/media-processor
RUN ./workers/media-processor/node_modules/.bin/tsc -p workers/media-processor/tsconfig.json

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache ffmpeg tini \
  && addgroup --system --gid 1001 worker \
  && adduser --system --uid 1001 --ingroup worker worker
COPY --from=builder --chown=worker:worker /app/node_modules ./node_modules
COPY --from=builder --chown=worker:worker /app/workers/media-processor/node_modules ./workers/media-processor/node_modules
COPY --from=builder --chown=worker:worker /app/workers/media-processor/dist ./workers/media-processor/dist
COPY --from=builder --chown=worker:worker /app/workers/media-processor/package.json ./workers/media-processor/package.json
USER worker
WORKDIR /app/workers/media-processor
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
