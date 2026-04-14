# CryptoPay API

All endpoints are JSON over HTTPS. Use your `sk_live_` secret API key for platform endpoints.

## Authentication

```
Authorization: Bearer sk_live_xxx
```

## Idempotency

```
Idempotency-Key: <unique-key>
```

## Create Payment Intent

`POST /v1/payments`

```json
{
  "amountFiat": 2500,
  "fiatCurrency": "INR",
  "settlementCurrency": "USDT",
  "network": "TRC20",
  "description": "Invoice #1042",
  "successUrl": "https://merchant.com/success",
  "cancelUrl": "https://merchant.com/cancel"
}
```

## Retrieve Payment

`GET /v1/payments/:id`

## Create Payment Link

`POST /v1/payment_links`

## Transactions

`GET /v1/transactions`

## Webhooks

`POST /v1/webhooks`

## Subscriptions

`GET /v1/subscriptions`

## Settlements & Invoices

`GET /v1/settlements`  
`GET /v1/invoices`
