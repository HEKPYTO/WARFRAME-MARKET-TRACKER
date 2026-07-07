# Warframe Market Tracker

[![CI](https://github.com/HEKPYTO/WARFRAME-MARKET-TRACKER/actions/workflows/ci.yml/badge.svg)](https://github.com/HEKPYTO/WARFRAME-MARKET-TRACKER/actions/workflows/ci.yml)

Public Warframe Market tracking app for watching item prices, managing rules, and sending Discord alert tests from a SolidStart/Bun workspace.

This repository is the public version. There is another private version with additional internal tooling; if you are interested in that version, please contact me.

## Features

- Track Warframe Market items with per-item platinum thresholds.
- Inspect live market context, online sellers, offline reserves, and alert history.
- Manage tracked rules from a responsive dashboard with desktop and mobile layouts.
- Pause/resume global tracking without deleting saved rules.
- Store Discord bot settings securely and send test messages before enabling alerts.
- Run a polling worker separately from the web app for cleaner deployment boundaries.
- Publish reproducible web and worker container images through GitHub Actions.

## Architecture

This repo is a Bun workspace with a SolidStart web app, a Bun worker, and shared packages:

| Path                      | Purpose                                                                       |
| ------------------------- | ----------------------------------------------------------------------------- |
| `apps/web`                | SolidStart dashboard, API routes, settings UI, and Playwright tests.          |
| `apps/worker`             | Background polling loop and Discord notification queue.                       |
| `packages/alert-engine`   | Watch-rule evaluation and alert decision logic.                               |
| `packages/db`             | PostgreSQL schema, persistence helpers, and encrypted Discord token handling. |
| `packages/market-client`  | Warframe Market API client and runtime polling configuration.                 |
| `packages/discord-alerts` | Discord alert/test message presentation.                                      |
| `packages/discord-client` | Discord API delivery client.                                                  |
| `packages/worker-health`  | Shared worker health contract.                                                |

## Requirements

- Bun `1.3.11`
- Docker and Docker Compose for container/e2e workflows
- PostgreSQL `17` for local or production-style deployments

## Local Development

```sh
bun install
bun run lint
bun run typecheck
bun run test
bun run build
```

Create a local `.env` from `.env.example` and provide your own secret values before running services outside test mode.

Useful commands:

```sh
bun run dev:web
bun run dev:worker
APP_SECRETS_MASTER_KEY="$(openssl rand -base64 32)" bun run test:e2e
```

## Configuration

Important environment variables:

| Variable                 | Purpose                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| `DATABASE_URL`           | PostgreSQL connection string.                                         |
| `APP_SECRETS_MASTER_KEY` | Base64-encoded 32-byte key used to encrypt stored Discord bot tokens. |
| `APP_BASE_URL`           | Public base URL used in generated links.                              |
| `MARKET_API_BASE_URL`    | Warframe Market API base URL.                                         |
| `MARKET_LANGUAGE`        | Marketplace language, usually `en`.                                   |
| `MARKET_PLATFORM`        | Marketplace platform, usually `pc`.                                   |
| `MARKET_CROSSPLAY`       | Enables crossplay marketplace requests when supported.                |
| `WFM_REALTIME_ENABLED`   | Enables worker realtime polling behavior.                             |

Generate an app secrets key with:

```sh
openssl rand -base64 32
```

Do not commit real `.env` files or production secrets.

## Docker

Local stack:

```sh
docker compose up --build
```

Production-style compose expects runtime secrets through environment variables:

```sh
POSTGRES_PASSWORD="change-me" \
APP_SECRETS_MASTER_KEY="$(openssl rand -base64 32)" \
APP_BASE_URL="https://example.com" \
APP_DOMAIN="example.com" \
docker compose -f compose.prod.yaml up --build -d
```

## Container Images

GitHub Actions publishes images to GitHub Container Registry after CI passes on `main`:

- `ghcr.io/hekpyto/warframe-market-tracker-web:latest`
- `ghcr.io/hekpyto/warframe-market-tracker-worker:latest`

Each image also receives a commit-SHA tag with the `main-` prefix.

## CI

The GitHub Actions workflow runs:

1. Frozen Bun install
2. ESLint
3. TypeScript typecheck
4. Bun unit tests
5. Production build
6. Docker-backed Playwright e2e tests
7. GHCR publish for web and worker images on `main`

The e2e job generates a temporary encryption key at runtime and does not require repository secrets.

## Security Notes

- Discord bot tokens are encrypted before storage when `APP_SECRETS_MASTER_KEY` is configured.
- `.env` files, generated builds, local test output, archives, and common key/certificate formats are ignored.
- Public CI uses `GITHUB_TOKEN` only for GHCR publishing on `main`.

## Public and Private Versions

This is the public version of the tracker. A private version with additional internal tooling also exists. If you are interested in that private version, please contact me.
