# Binance Integration Reference

This project integrates Binance Spot Wallet endpoints (`/sapi`) for custodial wallets.

## Base URL

```text
https://api.binance.com
```

## Wallet Endpoints Used

```text
GET /sapi/v1/capital/deposit/address
GET /sapi/v1/capital/deposit/hisrec
POST /sapi/v3/asset/getUserAsset
```

These endpoints are `USER_DATA` and require signed requests with `timestamp` and `signature`.

## Notes

- Deposits are used to match inbound payments for custodial wallets.
- Balances are used for custodial treasury monitoring.
