#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_PROJECT_NAME="warframe-market-tracker-e2e"
COMPOSE_FILES=(-f "$ROOT_DIR/compose.e2e.yaml")

cleanup() {
  docker compose \
    -p "$COMPOSE_PROJECT_NAME" \
    "${COMPOSE_FILES[@]}" \
    down -v --remove-orphans
}

trap cleanup EXIT

docker compose \
  -p "$COMPOSE_PROJECT_NAME" \
  "${COMPOSE_FILES[@]}" \
  up -d --build postgres web

bun run --cwd "$ROOT_DIR/apps/web" test:e2e
