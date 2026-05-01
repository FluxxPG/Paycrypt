#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-359924468730}"
REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
TAG="${TAG:-current}"

AWS_BIN="${AWS_BIN:-aws}"

# On Windows, Git Bash often can't resolve aws on PATH.
# Allow callers to pass AWS_BIN="C:\Program Files\Amazon\AWSCLIV2\aws.exe"
if ! command -v "$AWS_BIN" >/dev/null 2>&1; then
  if [ -x "/mnt/c/Program Files/Amazon/AWSCLIV2/aws.exe" ]; then
    AWS_BIN="/mnt/c/Program Files/Amazon/AWSCLIV2/aws.exe"
  elif [ -x "/c/Program Files/Amazon/AWSCLIV2/aws.exe" ]; then
    AWS_BIN="/c/Program Files/Amazon/AWSCLIV2/aws.exe"
  fi
fi

"$AWS_BIN" ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"

docker build -t paycrypt-api:"$TAG" -f apps/api/Dockerfile .
docker build -t paycrypt-ws:"$TAG" -f apps/ws/Dockerfile .
docker build -t paycrypt-worker:"$TAG" -f apps/worker/Dockerfile .

docker tag paycrypt-api:"$TAG" "$REGISTRY/paycrypt/api-gateway:$TAG"
docker tag paycrypt-ws:"$TAG" "$REGISTRY/paycrypt/ws-service:$TAG"
docker tag paycrypt-worker:"$TAG" "$REGISTRY/paycrypt/worker-service:$TAG"

docker push "$REGISTRY/paycrypt/api-gateway:$TAG"
docker push "$REGISTRY/paycrypt/ws-service:$TAG"
docker push "$REGISTRY/paycrypt/worker-service:$TAG"
