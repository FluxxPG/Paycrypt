#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

cd "$APP_DIR"

if [[ ! -f ".env" ]]; then
  echo ".env is missing in $APP_DIR"
  exit 1
fi

echo "Installing dependencies"
npm ci

echo "Running database migrations"
npm run migrate:db

echo "Building and starting API, WS, worker, and Redis"
docker compose build api ws worker
docker compose up -d redis api ws worker

echo "Deployment complete"
docker compose ps
