# Warframe Market Tracker

Public version of a Warframe Market tracking app for watching item prices, managing tracked rules, and sending Discord alert tests from a SolidStart/Bun workspace.

This repository is the public version. There is another private version with additional internal tooling; if you are interested in that version, please contact me.

## What is included

- SolidStart web app for managing watch rules and viewing market data.
- Bun worker for polling tracked items and preparing Discord notifications.
- Shared packages for alert evaluation, marketplace access, Discord payloads, database access, and worker health.
- Docker Compose files for local, production, and e2e-style environments.
- GitHub Actions CI for linting, typechecking, unit tests, production build, and browser e2e checks.

## Local development

```sh
bun install
bun run lint
bun run typecheck
bun run test
bun run build
```

For Docker-backed browser tests:

```sh
APP_SECRETS_MASTER_KEY="$(openssl rand -base64 32)" bun run test:e2e
```

Create a local `.env` from `.env.example` and provide your own secret values before running services outside test mode.
