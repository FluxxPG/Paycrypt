# Deployment Guide

## Canonical Paths

- Local repo: `C:\Users\salma\paycrypt`
- Server deploy path: `/opt/paycrypt`
- Frontend project: `paycrypt-web-live`

## Frontend Deployment On Vercel

Use the canonical repo root with the repo `vercel.json`.

### Required project settings

- Framework Preset: `Next.js`
- Output Directory: leave empty
- Root Directory: repo root

### Required env vars

```env
NEXT_PUBLIC_API_BASE_URL=https://d1jm86cy6nqs8t.cloudfront.net
NEXT_PUBLIC_WS_URL=https://d1jm86cy6nqs8t.cloudfront.net
NEXT_PUBLIC_APP_BASE_URL=https://paycrypt-web-live.vercel.app
```

### Deploy

```bash
vercel --prod
```

### Common failure

If Vercel reports:

`No Output Directory named "public" found after the Build completed`

the project has been configured as a static site. Remove the custom output directory from Vercel project settings.

## Backend Deployment On AWS EC2

Provision:

- Ubuntu 24.04
- Docker
- Docker Compose
- Git

### Runtime services

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
4. Build and start the containers:

```bash
docker compose build api ws worker
docker compose up -d api ws worker redis
```

5. Place CloudFront in front of the API and websocket origins.

## Supabase

- use the shared session pooler on IPv4 networks
- apply all migrations under `supabase/migrations`
- seed demo data only for non-production environments

## Production Notes

- No Nginx is required for this stack.
- Redis 6/7 with Lua support is required for BullMQ.
- Binance custodial features require real production API credentials.
