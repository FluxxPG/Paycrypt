#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
KUBECTL="${KUBECTL:-sudo k3s kubectl}"

cd "$ROOT_DIR"

bash infra/kubernetes/k3s-deploy.sh

$KUBECTL -n paycrypt rollout status deployment/api --timeout=240s
$KUBECTL -n paycrypt rollout status deployment/ws --timeout=240s
$KUBECTL -n paycrypt rollout status deployment/worker --timeout=240s

docker compose down --remove-orphans

$KUBECTL apply -k infra/kubernetes/overlays/ec2-edge
$KUBECTL -n paycrypt rollout status deployment/edge-nginx --timeout=180s

curl -fsS http://127.0.0.1:4000/ready
curl -fsS http://127.0.0.1:4001/ready
