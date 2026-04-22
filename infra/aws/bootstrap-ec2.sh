#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-ubuntu}"
APP_DIR="${APP_DIR:-/opt/cryptopay/crypto-gateway-saas}"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl git gnupg lsb-release software-properties-common

if ! command -v docker >/dev/null 2>&1; then
  apt-get install -y docker.io docker-compose-v2
fi

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

systemctl enable docker
systemctl start docker
usermod -aG docker "$APP_USER" || true

mkdir -p "$(dirname "$APP_DIR")"
chown -R "$APP_USER":"$APP_USER" "$(dirname "$APP_DIR")"

cat <<EOF
Bootstrap complete.

Next steps:
1. Clone the repo into $APP_DIR
2. Copy .env.example to .env and set production values
3. Run infra/aws/deploy.sh
4. Optionally install infra/aws/cryptopay-compose.service for boot persistence
EOF
