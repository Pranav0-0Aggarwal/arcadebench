FROM node:26-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS base
WORKDIR /app

FROM base AS build
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
COPY . .

FROM build AS web
RUN pnpm install --frozen-lockfile --filter @arcadebench/web... && pnpm --filter @arcadebench/web build

FROM build AS deps
RUN pnpm install --frozen-lockfile --prod --filter @arcadebench/server...

FROM base AS run
LABEL org.opencontainers.image.source=https://github.com/Pranav0-0Aggarwal/arcadebench
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data WEB_DIST=/app/apps/web/dist NODE_OPTIONS=--max-old-space-size=160
COPY --from=deps /app ./
COPY --from=web /app/apps/web/dist apps/web/dist
RUN mkdir /data && chown node:node /data
USER node
WORKDIR /app/apps/server
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1:8787/arcadebench/api/v1/health || exit 1
CMD ["node", "--import", "tsx", "src/main.ts"]
