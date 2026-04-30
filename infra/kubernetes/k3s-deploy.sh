#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
KUBECTL="${KUBECTL:-sudo k3s kubectl}"

cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "Missing .env at $ROOT_DIR/.env" >&2
  exit 1
fi

docker build -t paycrypt-api:current -f apps/api/Dockerfile .
docker build -t paycrypt-ws:current -f apps/ws/Dockerfile .
docker build -t paycrypt-worker:current -f apps/worker/Dockerfile .

docker save paycrypt-api:current | sudo k3s ctr images import -
docker save paycrypt-ws:current | sudo k3s ctr images import -
docker save paycrypt-worker:current | sudo k3s ctr images import -

$KUBECTL create namespace paycrypt --dry-run=client -o yaml | $KUBECTL apply -f -
$KUBECTL -n paycrypt create secret generic paycrypt-runtime --from-env-file=.env --dry-run=client -o yaml | $KUBECTL apply -f -
$KUBECTL apply -k infra/kubernetes/overlays/k3s

$KUBECTL -n paycrypt rollout status deployment/api --timeout=240s
$KUBECTL -n paycrypt rollout status deployment/ws --timeout=240s
$KUBECTL -n paycrypt rollout status deployment/worker --timeout=240s

curl -fsS http://127.0.0.1:31040/ready
curl -fsS http://127.0.0.1:31041/ready
