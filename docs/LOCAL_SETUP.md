# Local Setup

This project is a monorepo with:

- `apps/web` for the Next.js frontend
- `apps/api` for the REST API
- `apps/ws` for realtime Socket.IO
- `apps/worker` for BullMQ background jobs

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Redis running locally on `localhost:6379`
- access to the shared Supabase database or your own compatible Postgres database

## Root `.env`

Create a root `.env` file beside `package.json`.

Use this working local template:

```env
NODE_ENV=development
PORT=4000
WS_PORT=4001

NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=http://localhost:4001
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3003

DATABASE_URL=postgresql://postgres.lqpionhiifsjehyqeydm:Numanshaikh%407862@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://lqpionhiifsjehyqeydm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service-role-key

JWT_ACCESS_SECRET=dev-access-secret-change-me
JWT_REFRESH_SECRET=dev-refresh-secret-change-me
REDIS_URL=redis://localhost:6379
COOKIE_DOMAIN=localhost
APP_BASE_URL=http://localhost:3003

BINANCE_API_KEY=
BINANCE_API_SECRET=
BINANCE_BASE_URL=https://api.binance.com
TRONGRID_BASE_URL=https://api.trongrid.io
ETHEREUM_RPC_URL=https://rpc.ankr.com/eth
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
PRICE_ORACLE_BASE_URL=https://api.coingecko.com

WEBHOOK_SIGNING_SECRET=dev-webhook-secret
ENCRYPTION_KEY=dev-encryption-key-32-bytes-lenx
```

## Install

```bash
npm install
```

## Run Locally

Open four terminals from the repo root:

```bash
npm run dev:api
npm run dev:web
npm run dev:ws
npm run dev:worker
```

Local URLs:

- frontend: `http://localhost:3003`
- api: `http://localhost:4000`
- websocket: `http://localhost:4001`

## Demo Credentials

- Merchant: `owner@nebula.dev` / `ChangeMe123!`
- Admin: `admin@cryptopay.dev` / `AdminChangeMe123!`

`npm run seed:demo` creates only these login identities. It does not create demo payments, wallets, invoices, or analytics rows.

## Common Local Errors

### API fails with missing `DATABASE_URL` or `JWT_ACCESS_SECRET`

Cause:

- root `.env` is missing
- root `.env` is in the wrong directory
- the values are empty

Fix:

- make sure the `.env` file is at the repo root, not inside `apps/api`

### Frontend loads but login fails

Cause:

- `NEXT_PUBLIC_API_BASE_URL` is missing or incorrect
- API is not running on `http://localhost:4000`

Fix:

- confirm the API is running
- confirm the root `.env` contains the `NEXT_PUBLIC_*` values above

### Redis or worker issues

Cause:

- Redis is not running locally

Fix:

- start Redis on `localhost:6379`

## Vercel Frontend Deployment

If deploying the monorepo directly:

- import the repo into Vercel
- set `Framework Preset` to `Next.js`
- leave `Output Directory` empty or let `vercel.json` handle it
- if needed, set the project root to the repo root and let the repo `vercel.json` run the frontend build

Required frontend env vars:

```env
NEXT_PUBLIC_API_BASE_URL=https://d1jm86cy6nqs8t.cloudfront.net
NEXT_PUBLIC_WS_URL=https://d1jm86cy6nqs8t.cloudfront.net
NEXT_PUBLIC_APP_BASE_URL=https://paycrypt-web-live.vercel.app
```

If Vercel shows:

`No Output Directory named "public" found`

that means the Vercel project has been configured like a static site. Remove the custom `Output Directory` value from project settings.
