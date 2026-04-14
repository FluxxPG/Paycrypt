# Deployment Guide

## Vercel

- Deploy `apps/web`
- Set:
  - `NEXT_PUBLIC_API_BASE_URL`
  - `NEXT_PUBLIC_WS_URL`

## AWS EC2

- Provision Ubuntu 24.04 instance
- Install Docker and Docker Compose
- Clone the repository
- Copy `.env.example` to `.env`
- Set production values for:
  - `DATABASE_URL`
  - `REDIS_URL`
  - `JWT_ACCESS_SECRET`
  - `JWT_REFRESH_SECRET`
  - `WEBHOOK_SIGNING_SECRET`
  - `ENCRYPTION_KEY`
  - `BINANCE_API_KEY` / `BINANCE_API_SECRET`
  - `BINANCE_BASE_URL`
  - `TRONGRID_BASE_URL`
  - `ETHEREUM_RPC_URL`
  - `SOLANA_RPC_URL`
  - `WS_NODE_ID`
  - `WORKER_NAME`
  - wallet provider credentials
- Run `docker compose up -d --build`
- Expose the API container on port `4000` directly or front it with an AWS Application Load Balancer
- Expose the realtime gateway on port `4001` directly or keep it private behind the same security group
- Terminate TLS outside the container stack if you need HTTPS, for example at the ALB or CloudFront edge
- Use Redis 6/7 with Lua scripting enabled (BullMQ requires Lua).
 - Configure a dedicated Binance API key with `Enable Spot & Margin Trading` + `Enable Withdrawals` (if settlement requires).
 - Whitelist your EC2 IP in Binance API settings if IP restrictions are enabled.

## Supabase

- Create a Supabase project
- Run `supabase/migrations/20260413_init.sql`
- Seed users with bcrypt-hashed passwords and merchant ids

## Recommended production split

- `api`: Express + Socket.IO service on EC2 or ECS with health checks
- `ws`: Dedicated Socket.IO gateway that fans out Redis payment events to merchants
- `worker`: BullMQ consumers
- `redis`: managed Redis or dedicated EC2 instance
- `postgres`: Supabase managed PostgreSQL
- `web`: Vercel project
