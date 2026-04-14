# CryptoPay Node SDK

Production-ready Node SDK for the CryptoPay API.

## Install

```bash
npm install @cryptopay/sdk
```

## Usage

```ts
import { createClient } from "@cryptopay/sdk";

const client = createClient({
  secretKey: "sk_live_xxx",
  baseUrl: "https://api.yourdomain.com"
});

const payment = await client.payment.create({
  amountFiat: 2450,
  fiatCurrency: "INR",
  settlementCurrency: "USDT",
  network: "TRC20",
  description: "Order #4881",
  successUrl: "https://merchant.com/success",
  cancelUrl: "https://merchant.com/cancel",
  expiresInMinutes: 30
});
```

## Payment Links

```ts
await client.paymentLinks.create({
  title: "Annual plan",
  description: "Enterprise subscription",
  amountFiat: 15000,
  fiatCurrency: "INR",
  settlementCurrency: "USDT",
  network: "TRC20",
  successUrl: "https://merchant.com/success",
  cancelUrl: "https://merchant.com/cancel"
});
```

## Billing

```ts
const invoices = await client.billing.invoices.list();
const settlements = await client.billing.settlements.list();
```

## Idempotency

```ts
await client.payment.create(input, "idem_123");
```

## Errors

`CryptoPayError` includes status code and response payload.

```ts
try {
  await client.payment.fetch("pay_xxx");
} catch (error) {
  if (error instanceof CryptoPayError) {
    console.error(error.status, error.payload);
  }
}
```
