# Live Status

This document records the actively verified live surfaces for the canonical deployment.

## Frontend

- Frontend URL: `https://paycrypt-web-live.vercel.app`
- Public docs: `https://paycrypt-web-live.vercel.app/docs`

## Backend

- API edge: `https://d1jm86cy6nqs8t.cloudfront.net`
- API ready: `https://d1jm86cy6nqs8t.cloudfront.net/ready`
- WS ready: `http://ec2-65-2-34-31.ap-south-1.compute.amazonaws.com:4001/ready`

## Verified on 2026-04-22

- frontend root returns `200`
- docs page returns `200`
- API `/` returns `200`
- API `/ready` returns `200`
- WS `/ready` returns `200`
- merchant login returns `200`
- admin login returns `200`
- hosted checkout page `/pay/[id]` returns `200`
- payment-link page `/links/[id]` returns `200`
- admin merchant creation returns a temporary password
- first merchant login returns `requiresPasswordSetup=true`
- dashboard access is blocked until password setup completes
- merchant delete removes the merchant and follow-up login fails

## Notes

- Binance custodial provisioning still requires real Binance API credentials in production.
- CloudFront websocket upgrade behavior may fall back to polling, but the realtime edge remains reachable.
