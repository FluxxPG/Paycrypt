#!/bin/bash
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl git gnupg software-properties-common unzip docker.io docker-compose-v2

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

systemctl enable docker
systemctl start docker
usermod -aG docker ubuntu || true

mkdir -p /opt/paycrypt
chown -R ubuntu:ubuntu /opt/paycrypt
