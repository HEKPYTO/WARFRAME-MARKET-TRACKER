FROM oven/bun:1.3.11-alpine AS deps
WORKDIR /app

COPY package.json tsconfig.base.json eslint.config.js ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/alert-engine/package.json packages/alert-engine/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/discord-client/package.json packages/discord-client/package.json
COPY packages/discord-alerts/package.json packages/discord-alerts/package.json
COPY packages/market-client/package.json packages/market-client/package.json
COPY packages/worker-health/package.json packages/worker-health/package.json

RUN bun install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY . .
RUN bun run build:web

FROM node:20-alpine AS runtime
WORKDIR /app/apps/web
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build /app/apps/web/.output ./.output

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
