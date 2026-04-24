# Paycrypt SDK Integration Guide

## Overview

Paycrypt provides production-ready SDKs for both Node.js backend and browser frontend integration, supporting both crypto and UPI payment methods.

## Installation

### Node.js SDK

```bash
npm install @paycrypt/sdk
```

### Browser SDK

```html
<script src="https://cdn.paycrypt.com/sdk/browser.js"></script>
```

## Node.js SDK Usage

### Basic Setup

```javascript
const { CryptoPayClient } = require('@paycrypt/sdk');

const client = new CryptoPayClient({
  secretKey: 'your-secret-key',
  baseUrl: 'https://api.paycrypt.com'
});
```

### Creating Crypto Payments

```javascript
const payment = await client.payment.create({
  amountFiat: 1000,
  fiatCurrency: 'INR',
  settlementCurrency: 'USDT',
  network: 'TRC20',
  description: 'Product purchase',
  customerEmail: 'customer@example.com',
  successUrl: 'https://your-site.com/success',
  cancelUrl: 'https://your-site.com/cancel',
  method: 'crypto'
}, 'unique-idempotency-key');

console.log('Payment ID:', payment.id);
console.log('Wallet Address:', payment.wallet_address);
console.log('Amount Crypto:', payment.amount_crypto);
```

### Creating UPI Payments

```javascript
const { UPIClient } = require('@paycrypt/sdk');

const upiClient = new UPIClient({
  secretKey: 'your-secret-key',
  baseUrl: 'https://api.paycrypt.com'
});

const upiPayment = await upiClient.createPayment({
  amountFiat: 1000,
  fiatCurrency: 'INR',
  description: 'Product purchase',
  customerPhone: '+919876543210',
  successUrl: 'https://your-site.com/success',
  cancelUrl: 'https://your-site.com/cancel',
  method: 'upi',
  provider: 'phonepe' // auto-selected if not specified
}, 'unique-idempotency-key');

console.log('UPI Intent URL:', upiPayment.upi_intent_url);
console.log('QR Code:', upiPayment.upi_qr_code);
```

### Fetching Payment Status

```javascript
const payment = await client.payment.fetch('payment-id');
console.log('Status:', payment.status);
console.log('Amount:', payment.amount_fiat);
```

### Verifying Webhooks

```javascript
const crypto = require('crypto');

const isValid = client.verifyWebhook(
  webhookPayload,
  signature,
  'your-webhook-secret'
);

if (isValid) {
  // Process webhook
  console.log('Webhook signature valid');
} else {
  console.log('Invalid webhook signature');
}
```

### Real-time Payment Monitoring

```javascript
const monitor = upiClient.monitorPayment('payment-id', (update) => {
  console.log('Payment update:', update);
  
  if (update.type === 'status_update') {
    if (update.data.status === 'confirmed') {
      console.log('Payment confirmed!');
      monitor.stop(); // Stop monitoring
    }
  }
});
```

## Browser SDK Usage

### Basic Setup

```html
<script>
  const paycrypt = new PaycryptBrowserSDK({
    apiKey: 'your-api-key',
    baseUrl: 'https://api.paycrypt.com',
    environment: 'production'
  });
</script>
```

### Creating Payments

```javascript
const payment = await paycrypt.createPayment({
  amountFiat: 1000,
  fiatCurrency: 'INR',
  description: 'Product purchase',
  successUrl: 'https://your-site.com/success',
  cancelUrl: 'https://your-site.com/cancel'
});

// SDK automatically detects optimal payment method (UPI for mobile in India, crypto otherwise)
console.log('Payment method:', payment.payment_method);
```

### Manual Payment Method Selection

```javascript
// Create UPI payment
const upiPayment = await paycrypt.createUPIPayment({
  amountFiat: 1000,
  fiatCurrency: 'INR',
  description: 'Product purchase',
  provider: 'phonepe'
});

// Create crypto payment
const cryptoPayment = await paycrypt.createCryptoPayment({
  amountFiat: 1000,
  fiatCurrency: 'INR',
  settlementCurrency: 'USDT',
  network: 'TRC20'
});
```

### Real-time Updates

```javascript
const monitor = paycrypt.monitorPayment('payment-id', {
  onConnect: () => console.log('Connected to payment updates'),
  onUpdate: (update) => {
    console.log('Payment status:', update.data.status);
    
    if (update.data.status === 'confirmed') {
      // Redirect to success page
      window.location.href = '/success';
    }
  },
  onError: (error) => console.error('Monitoring error:', error),
  onDisconnect: () => console.log('Disconnected from payment updates')
});
```

### Generating Checkout URLs

```javascript
const checkoutUrl = paycrypt.generateCheckoutUrl('payment-id', {
  custom_param: 'value'
});

// Redirect to hosted checkout
window.location.href = checkoutUrl;
```

## Advanced Features

### Multi-Provider UPI Routing

The SDK automatically routes UPI payments to the best available provider based on:
- Provider health status
- Transaction success rates
- Processing time
- Merchant configuration

### Retry Logic

The SDK includes built-in retry logic with exponential backoff for failed requests:
- Initial retry: 1 second
- Subsequent retries: 2^n seconds
- Maximum retries: 3

### Error Handling

```javascript
try {
  const payment = await client.payment.create(paymentData);
} catch (error) {
  if (error instanceof CryptoPayError) {
    console.error('Payment failed:', error.message);
    console.error('Status:', error.status);
    console.error('Details:', error.payload);
  }
}
```

### Payment Validation

```javascript
const validation = upiClient.validatePaymentData(paymentData);

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
  // Handle validation errors
}
```

## Security Best Practices

1. **Never expose secret keys in frontend code** - Use API keys for browser SDK
2. **Always verify webhook signatures** - Prevent fraud and replay attacks
3. **Use idempotency keys** - Prevent duplicate payments
4. **Implement proper error handling** - Handle network failures gracefully
5. **Monitor payment status** - Use real-time updates for better UX

## API Reference

### CryptoPayClient

#### Constructor
```javascript
new CryptoPayClient(options)
```
- `secretKey` (string): Your secret API key
- `baseUrl` (string): API base URL (default: https://api.paycrypt.com)
- `fetcher` (function): Custom fetch function (optional)

#### Methods
- `payment.create(input, idempotencyKey)` - Create a payment
- `payment.fetch(paymentId)` - Fetch payment details
- `paymentLinks.create(input, idempotencyKey)` - Create payment link
- `invoices.list()` - List invoices
- `settlements.list()` - List settlements

### UPIClient

#### Constructor
```javascript
new UPIClient(options)
```
- `secretKey` (string): Your secret API key
- `baseUrl` (string): API base URL (default: https://api.paycrypt.com)
- `fetcher` (function): Custom fetch function (optional)

#### Methods
- `createPayment(input, idempotencyKey)` - Create UPI payment
- `fetchPayment(paymentId)` - Fetch UPI payment details
- `verifyPayment(paymentId)` - Verify UPI payment status
- `verifyWebhook(payload, signature, secret)` - Verify webhook signature
- `monitorPayment(paymentId, onUpdate)` - Monitor payment in real-time
- `createPaymentLink(input, idempotencyKey)` - Create UPI payment link

### PaycryptBrowserSDK

#### Constructor
```javascript
new PaycryptBrowserSDK(config)
```
- `apiKey` (string): Your public API key
- `baseUrl` (string): API base URL (default: https://api.paycrypt.com)
- `environment` (string): 'production' or 'development'

#### Methods
- `createPayment(paymentData, options)` - Create payment with auto method detection
- `createUPIPayment(paymentData, options)` - Create UPI payment
- `createCryptoPayment(paymentData, options)` - Create crypto payment
- `fetchPayment(paymentId)` - Fetch payment details
- `fetchUPIPayment(paymentId)` - Fetch UPI payment details
- `verifyPayment(paymentId, options)` - Verify payment status
- `createPaymentLink(paymentLinkData, options)` - Create payment link
- `monitorPayment(paymentId, callbacks)` - Monitor payment in real-time
- `generateCheckoutUrl(paymentId, options)` - Generate checkout URL

## Examples

### Complete Payment Flow (Node.js)

```javascript
const { CryptoPayClient } = require('@paycrypt/sdk');

async function processPayment() {
  const client = new CryptoPayClient({
    secretKey: process.env.PAYCRYPT_SECRET_KEY,
    baseUrl: 'https://api.paycrypt.com'
  });

  try {
    // Create payment
    const payment = await client.payment.create({
      amountFiat: 1000,
      fiatCurrency: 'INR',
      settlementCurrency: 'USDT',
      network: 'TRC20',
      description: 'Premium subscription',
      customerEmail: 'customer@example.com',
      successUrl: 'https://your-site.com/success',
      cancelUrl: 'https://your-site.com/cancel'
    }, `payment-${Date.now()}`);

    console.log('Payment created:', payment.id);

    // Monitor payment
    const monitor = client.monitorPayment(payment.id, (update) => {
      console.log('Payment update:', update);
      
      if (update.data.status === 'confirmed') {
        console.log('Payment confirmed!');
        // Update database, send confirmation email, etc.
      }
    });

    return payment;
  } catch (error) {
    console.error('Payment failed:', error);
    throw error;
  }
}

processPayment();
```

### Complete Payment Flow (Browser)

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.paycrypt.com/sdk/browser.js"></script>
</head>
<body>
  <button onclick="createPayment()">Pay ₹1,000</button>
  
  <script>
    const paycrypt = new PaycryptBrowserSDK({
      apiKey: 'your-api-key',
      baseUrl: 'https://api.paycrypt.com'
    });

    async function createPayment() {
      try {
        const payment = await paycrypt.createPayment({
          amountFiat: 1000,
          fiatCurrency: 'INR',
          description: 'Premium subscription',
          successUrl: 'https://your-site.com/success',
          cancelUrl: 'https://your-site.com/cancel'
        });

        // Monitor payment
        paycrypt.monitorPayment(payment.id, {
          onUpdate: (update) => {
            if (update.data.status === 'confirmed') {
              window.location.href = '/success';
            }
          }
        });

        // Redirect to checkout
        window.location.href = paycrypt.generateCheckoutUrl(payment.id);
      } catch (error) {
        alert('Payment failed: ' + error.message);
      }
    }
  </script>
</body>
</html>
```

## Support

For support and documentation:
- Documentation: https://docs.paycrypt.com
- API Reference: https://api.paycrypt.com/docs
- GitHub: https://github.com/paycrypt/sdk
- Email: support@paycrypt.com
