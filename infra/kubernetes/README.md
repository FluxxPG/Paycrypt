# Paycrypt Kubernetes Deployment

This directory contains the Kubernetes deployment path for Paycrypt. It keeps the same service split as the Docker runtime:

- `api`: REST API on `4000`
- `ws`: Socket.IO realtime gateway on `4001`
- `worker`: BullMQ/background processing with health on `4002`
- `redis`: Redis 7 with persistent storage

## Layout

```text
infra/kubernetes/
|-- base/
|   |-- api.yaml
|   |-- ws.yaml
|   |-- worker.yaml
|   |-- redis.yaml
|   |-- disruption-budgets.yaml
|   `-- kustomization.yaml
`-- overlays/
    |-- k3s/
    `-- production/
```

## Runtime Secret

Create the runtime secret from the same production `.env` used by Docker Compose:

```bash
kubectl create namespace paycrypt --dry-run=client -o yaml | kubectl apply -f -
kubectl -n paycrypt create secret generic paycrypt-runtime --from-env-file=.env --dry-run=client -o yaml | kubectl apply -f -
```

The manifests intentionally do not commit secrets. The workloads read database, JWT, encryption, webhook, Binance, chain RPC, and application URLs from `paycrypt-runtime`.

## K3s Test Overlay

The K3s overlay is for testing on a single EC2 host without changing live CloudFront traffic:

```bash
kubectl apply -k infra/kubernetes/overlays/k3s
kubectl -n paycrypt rollout status deployment/api
kubectl -n paycrypt rollout status deployment/ws
kubectl -n paycrypt rollout status deployment/worker
```

It exposes internal test NodePorts:

- API: `31040`
- WS: `31041`

Those ports are not required to be public. They are for on-host verification with `curl http://127.0.0.1:31040/ready` and `curl http://127.0.0.1:31041/ready`.

## EC2 Edge Overlay

The EC2 edge overlay binds the in-cluster Nginx deployment to the EC2 host network on the same ports CloudFront already uses:

- `4000` for API traffic
- `4001` for Socket.IO traffic

Use it only after the API, WS, worker, and Redis pods are healthy:

```bash
bash infra/kubernetes/k3s-cutover.sh
```

That script verifies Kubernetes readiness, stops the old Docker Compose stack, applies the host-network Nginx edge, and checks `127.0.0.1:4000/ready` plus `127.0.0.1:4001/ready`.

## Production Overlay

The production overlay points images at ECR and enables HPA objects:

```bash
kubectl apply -k infra/kubernetes/overlays/production
```

For a real multi-node production cluster, use EKS with:

- managed node groups or Fargate profiles
- metrics-server for HPA
- AWS Load Balancer Controller or API Gateway integration
- managed Redis/ElastiCache instead of the in-cluster Redis StatefulSet
- Secrets Manager or External Secrets Operator for `paycrypt-runtime`
- private subnets for workloads and controlled ingress for API/WS

## ECR Images

The current ECR repositories are:

- `359924468730.dkr.ecr.ap-south-1.amazonaws.com/paycrypt/api-gateway`
- `359924468730.dkr.ecr.ap-south-1.amazonaws.com/paycrypt/ws-service`
- `359924468730.dkr.ecr.ap-south-1.amazonaws.com/paycrypt/worker-service`

Push the latest service images with:

```bash
bash infra/kubernetes/ecr-push.sh
```
