# Live Status

This document records the actively verified live surfaces for the canonical deployment.

## Frontend

- Frontend URL: `https://paycrypt-omega.vercel.app`
- Latest Vercel deployment URL: `https://paycrypt-qaiz3qe2y-numans-projects-a947d1ec.vercel.app`
- Public docs: `https://paycrypt-omega.vercel.app/docs`
- Frontend runtime: Next.js `16.2.4`

## Backend

- API edge: `https://d1jm86cy6nqs8t.cloudfront.net`
- API ready: `https://d1jm86cy6nqs8t.cloudfront.net/ready`
- WS ready: `http://ec2-65-2-34-31.ap-south-1.compute.amazonaws.com:4001/ready`
- Runtime: K3s Kubernetes on EC2
- Edge inside cluster: `edge-nginx`
- Workloads: `api`, `ws`, `worker`, `redis`
- Redis: `7.4.8`
- Worker queue mode: `BullMQ`
- Registry: AWS ECR

## Verified on 2026-04-30

- frontend root returns `200`
- frontend `/login` returns `200`
- frontend `/admin/login` returns `200`
- docs page returns `200`
- API `/` returns `200`
- API `/ready` returns `200`
- WS `/ready` returns `200`
- Socket.IO polling handshake returns `200`
- Socket.IO websocket transport connects successfully through CloudFront
- merchant login returns `200`
- admin login returns `200`
- ECR images tagged `current` were pushed for API, WS, and worker
- old ECS cluster, ECS services, ALB, and target groups were deleted
- old ElastiCache Redis replication group was deleted
- old ECS Secrets Manager entries were deleted
- unused Paycrypt security groups were deleted; only `paycrypt-backend-sg` remains
- Docker Compose app containers are stopped; Kubernetes pods are the live backend runtime
- hosted checkout page `/pay/[id]` returns `200`
- live checkout preview creates payment records backed by Supabase and serves them from `/pay/[id]`
- payment-link page `/links/[id]` returns `200`
- admin merchant creation returns a temporary password
- first merchant login returns `requiresPasswordSetup=true`
- dashboard access is blocked until password setup completes
- merchant delete removes the merchant and follow-up login fails

## Notes

- Binance custodial provisioning still requires real Binance API credentials in production.
- CloudFront websocket and polling transports are both reachable on the shared API edge.
- The temporary EC2 SSH ingress used for the April 30 deployment was removed after the deploy completed.
- The current K3s-on-EC2 setup is intentionally low-cost. It is microservices-ready, but millions of concurrent users require multi-node autoscaling, managed Redis, and a larger cluster footprint.
- EC2 origin ports `4000` and `4001` are currently open for CloudFront origin access. Restricting them to the AWS managed CloudFront prefix list needs a security-group rule quota increase because AWS counts that prefix list as many rules.
- `npm audit --omit=dev` still reports Next stable's nested PostCSS advisory. The fixed PostCSS version is present in Next canary, but the production deployment intentionally stays on stable Next `16.2.4`.
