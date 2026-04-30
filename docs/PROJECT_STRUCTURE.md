# Project Structure

The canonical workspace is:

- `C:\Users\salma\paycrypt`

There are no secondary repo folders or duplicate deploy workspaces in active use. All code, infrastructure config, scripts, and documentation live under this single root.

## Top-Level Layout

```text
paycrypt/
|-- apps/
|   |-- api/        # Express REST API
|   |-- web/        # Next.js App Router frontend
|   |-- ws/         # Socket.IO realtime gateway
|   `-- worker/     # BullMQ workers and chain observers
|-- packages/
|   |-- shared/     # shared schemas, types, plan definitions
|   `-- sdk/        # Node SDK for merchant integrations
|-- supabase/
|   `-- migrations/ # PostgreSQL schema and follow-up migrations
|-- infra/
|   |-- aws/        # EC2, CloudFront, and host bootstrap assets
|   `-- kubernetes/ # K3s, ECR, Nginx, and Kubernetes manifests
|-- scripts/        # migration and seed scripts
|-- docs/           # setup, API, deployment, Binance, and repo docs
|-- .dockerignore
|-- .env.example
|-- docker-compose.yml
|-- package.json
|-- README.md
`-- vercel.json
```

## App Responsibilities

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

## Runtime Infrastructure

- Vercel deploys the frontend from `apps/web`.
- CloudFront is the public backend edge.
- EC2 runs K3s as the low-cost Kubernetes runtime.
- Kubernetes runs `edge-nginx`, `api`, `ws`, `worker`, and `redis`.
- ECR stores the backend API, WS, and worker images.
- Docker Compose is retained for local development and emergency fallback.

## Conventions

- root `.env` is the source for local development
- AWS backend deploys from `/opt/paycrypt`
- shared contracts live in `packages/shared`
- public integration code lives in `packages/sdk`
