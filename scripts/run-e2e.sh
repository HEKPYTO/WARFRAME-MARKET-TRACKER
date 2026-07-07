#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_PROJECT_NAME="warframe-market-tracker-e2e"
COMPOSE_FILES=(-f "$ROOT_DIR/compose.e2e.yaml")

cleanup() {
  local status=$?

  if [ "$status" -ne 0 ]; then
    docker compose \
      -p "$COMPOSE_PROJECT_NAME" \
      "${COMPOSE_FILES[@]}" \
      logs --no-color web postgres || true
  fi

  docker compose \
    -p "$COMPOSE_PROJECT_NAME" \
    "${COMPOSE_FILES[@]}" \
    down -v --remove-orphans

  exit "$status"
}

trap cleanup EXIT

docker compose \
  -p "$COMPOSE_PROJECT_NAME" \
  "${COMPOSE_FILES[@]}" \
  up -d --build postgres web

bun run --cwd "$ROOT_DIR/apps/web" test:e2e
