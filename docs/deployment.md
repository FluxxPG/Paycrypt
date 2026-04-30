# Deployment Guide

## Canonical Paths

- Local repo: `C:\Users\salma\paycrypt`
- Server deploy path: `/opt/paycrypt`
- Frontend project: `paycrypt`
- Frontend runtime: Next.js `16.2.4`

## Frontend Deployment On Vercel

Use the canonical monorepo and deploy the `apps/web` frontend through the linked Vercel project.

### Required project settings

- Framework Preset: `Next.js`
- Root Directory: `apps/web`
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `.next`

### Required env vars

```env
NEXT_PUBLIC_API_BASE_URL=https://d1jm86cy6nqs8t.cloudfront.net
NEXT_PUBLIC_WS_URL=https://d1jm86cy6nqs8t.cloudfront.net
NEXT_PUBLIC_APP_BASE_URL=https://paycrypt-omega.vercel.app
```

### Deploy

```bash
vercel --prod --yes
```

### Common failure

If Vercel reports:

`No Output Directory named "public" found after the Build completed`

the project has been configured as a static site. Remove the custom output directory from Vercel project settings.

## Backend Deployment On AWS EC2

Provision:

- Ubuntu 24.04
- Docker
- K3s
- Git
- SSM access

### Runtime services

- `edge-nginx`
- `api`
- `ws`
- `worker`
- `redis`

### Production env requirements

```env
DATABASE_URL=
REDIS_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
WEBHOOK_SIGNING_SECRET=
ENCRYPTION_KEY=
APP_BASE_URL=
COOKIE_DOMAIN=
BINANCE_API_KEY=
BINANCE_API_SECRET=
BINANCE_BASE_URL=
TRONGRID_BASE_URL=
ETHEREUM_RPC_URL=
SOLANA_RPC_URL=
WS_NODE_ID=
WORKER_NAME=
```

### Deploy steps

1. Clone the repo to `/opt/paycrypt`.
2. Copy the production env file into place.
3. Run migrations against Supabase.
4. Build and push images to ECR when changing backend code:

```bash
bash infra/kubernetes/ecr-push.sh
```

5. Deploy or refresh the K3s runtime:

```bash
bash infra/kubernetes/k3s-deploy.sh
```

6. Cut CloudFront-facing ports over to the Kubernetes Nginx edge:

```bash
bash infra/kubernetes/k3s-cutover.sh
```

CloudFront uses the same EC2 origin ports:

- API traffic -> `:4000`
- Socket.IO / websocket traffic -> `:4001`

## Supabase

- use the shared session pooler on IPv4 networks
- apply all migrations under `supabase/migrations`
- seed demo data only for non-production environments

## Production Notes

- The current live backend runs on K3s Kubernetes inside EC2.
- Nginx runs inside Kubernetes and binds the EC2 origin ports used by CloudFront.
- Docker Compose is now local/fallback infrastructure, not the live backend runtime.
- CloudFront is the public edge in front of the EC2/K3s deployment.
- Redis 7.4+ with Lua support is required for BullMQ. The live K3s deployment currently runs `redis:7.4-alpine`.
- Binance custodial features require real production API credentials.
- This is the lowest-cost Kubernetes path. For true multi-AZ high concurrency, promote the same manifests to EKS and replace in-cluster Redis with managed ElastiCache.
- For tighter origin security, request a security-group quota increase and restrict ports `4000` and `4001` to AWS managed prefix list `com.amazonaws.global.cloudfront.origin-facing`.
