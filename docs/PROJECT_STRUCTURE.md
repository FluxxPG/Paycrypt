# Project Structure

The canonical workspace is:

- `C:\Users\salma\paycrypt`

There are no secondary repo folders or duplicate deploy workspaces in active use. All code, infrastructure config, scripts, and documentation now live under this single root.

## Top-level layout

```text
paycrypt/
├─ apps/
│  ├─ api/        # Express REST API
│  ├─ web/        # Next.js App Router frontend
│  ├─ ws/         # Socket.IO realtime gateway
│  └─ worker/     # BullMQ workers and chain observers
├─ packages/
│  ├─ shared/     # shared schemas, types, plan definitions
│  └─ sdk/        # Node SDK for merchant integrations
├─ supabase/
│  └─ migrations/ # PostgreSQL schema and follow-up migrations
├─ infra/
│  └─ aws/        # EC2, Docker, CloudFront, and deploy assets
├─ scripts/       # migration and seed scripts
├─ docs/          # setup, API, deployment, Binance, and repo docs
├─ .env.example   # local and deployment env template
├─ docker-compose.yml
├─ package.json
├─ README.md
└─ vercel.json
```

## App responsibilities

### `apps/web`

- landing page
- merchant login and dashboard
- admin login and dashboard
- hosted checkout
- public payment-link pages
- developer docs page

### `apps/api`

- JWT auth and refresh flow
- merchant dashboard APIs
- admin APIs
- public checkout/payment APIs
- API key authentication
- webhook registration and delivery orchestration hooks

### `apps/ws`

- merchant room subscriptions
- payment room subscriptions
- Redis-backed realtime fan-out
- WS health reporting

### `apps/worker`

- BullMQ queues
- payment confirmation polling
- Binance custody observation
- chain monitoring adapters
- webhook retry and settlement processing

## Conventions

- root `.env` is the source for local development
- Vercel deploys from the canonical repo root using `vercel.json`
- AWS backend deploys from `/opt/paycrypt`
- shared contracts live in `packages/shared`
- public integration code lives in `packages/sdk`
