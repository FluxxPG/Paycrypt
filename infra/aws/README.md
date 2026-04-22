# AWS EC2 Deployment

This stack does not require Nginx. Front the API and websocket services with an AWS Application Load Balancer, or expose them directly with TLS terminated upstream.

## Services

- `api` on `4000`
- `ws` on `4001`
- `worker` internal only
- `redis` on `6379` internal only unless you explicitly need remote access

## Bootstrap

Run as root on Ubuntu 24.04:

```bash
bash infra/aws/bootstrap-ec2.sh
```

## Deploy

1. Clone the repo to `/opt/cryptopay/crypto-gateway-saas`
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
4. Run:

```bash
bash infra/aws/deploy.sh
```

## Optional boot persistence

Copy the systemd unit:

```bash
sudo cp infra/aws/cryptopay-compose.service /etc/systemd/system/cryptopay-compose.service
sudo systemctl daemon-reload
sudo systemctl enable cryptopay-compose.service
sudo systemctl start cryptopay-compose.service
```

## Load balancer guidance

- Route `api.yourdomain.com` to `:4000`
- Route `ws.yourdomain.com` to `:4001`
- Keep `6379` and worker access inside the private security group
- Deploy the frontend separately on Vercel and point it at the ALB URLs
