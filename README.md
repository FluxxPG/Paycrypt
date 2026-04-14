# Crypto Gateway SaaS

Enterprise-grade cryptocurrency payment gateway monorepo with:

- `apps/web`: Next.js merchant + admin dashboard and hosted checkout
- `apps/api`: Express TypeScript API, JWT auth, API keys, and event publishing
- `apps/ws`: Dedicated Socket.IO gateway for realtime payment fan-out
- `apps/worker`: BullMQ workers for monitoring, webhooks, settlement
- `packages/shared`: Shared types, schemas, plan metadata
- `packages/sdk`: Node.js SDK for merchant integrations
- `supabase/migrations`: PostgreSQL schema for Supabase
- `infra`: Docker and AWS deployment assets

## Quick start

1. Copy `.env.example` into per-app env files.
2. Install dependencies: `npm install`
3. Run migrations: `node scripts/migrate-db.mjs`
4. Seed demo data: `npm run seed:demo`
5. Start services:
   - `npm run dev:api`
   - `npm run dev:ws`
   - `npm run dev:worker`
   - `npm run dev:web`

## Redis for BullMQ

BullMQ requires Redis 5+ with Lua scripting enabled. If you use a Redis-compatible server that disables Lua (for example, Garnet defaults),
BullMQ will not run and the worker will fall back to a lightweight Redis-list queue.

Recommended local options:

- Docker: `docker run --name redis7 -p 6379:6379 -d redis:7`
- WSL2: `sudo apt install redis-server`
- Remote Redis 6/7 (EC2/ElastiCache)

## Deployment

- Frontend: Vercel
- API / WebSocket / Workers / Redis: AWS EC2 with Docker Compose
- Database: Supabase PostgreSQL
