# AWS EC2 Deployment

The live backend now runs on K3s Kubernetes inside the EC2 instance. Docker remains installed for image builds and local fallback, but Docker Compose is not the live runtime.

Live runtime:

- `edge-nginx` binds the EC2 origin ports `4000` and `4001`
- `api` runs behind Nginx on Kubernetes service port `4000`
- `ws` runs behind Nginx on Kubernetes service port `4001`
- `worker` runs inside Kubernetes with health on `4002`
- `redis` runs as a Kubernetes StatefulSet

TLS and origin masking are handled upstream by CloudFront.

## Bootstrap

Run as root on Ubuntu 24.04:

```bash
bash infra/aws/bootstrap-ec2.sh
```

## Deploy

1. Clone the repo to `/opt/paycrypt`
2. Copy `.env.example` to `.env`
3. Set production values for:
   - `DATABASE_URL`
   - `JWT_ACCESS_SECRET`
   - `JWT_REFRESH_SECRET`
   - `WEBHOOK_SIGNING_SECRET`
   - `ENCRYPTION_KEY`
   - `REDIS_URL`
   - `BINANCE_API_KEY`
   - `BINANCE_API_SECRET`
   - `BINANCE_BASE_URL`
   - `TRONGRID_BASE_URL`
   - `ETHEREUM_RPC_URL`
   - `SOLANA_RPC_URL`
   - `APP_BASE_URL`
   - `NEXT_PUBLIC_API_BASE_URL`
   - `NEXT_PUBLIC_WS_URL`
4. Build and push backend service images:

```bash
bash infra/kubernetes/ecr-push.sh
```

5. Deploy or refresh K3s workloads:

```bash
bash infra/kubernetes/k3s-deploy.sh
```

6. Cut CloudFront-facing ports to Kubernetes Nginx:

```bash
bash infra/kubernetes/k3s-cutover.sh
```

## Edge Guidance

- Route HTTPS traffic to the EC2 origin ports through CloudFront
- Forward API traffic to `:4000`
- Forward websocket / Socket.IO traffic to `:4001`
- Keep Redis and worker access internal to the Kubernetes node/network
- Deploy the frontend separately on Vercel and point it at CloudFront
