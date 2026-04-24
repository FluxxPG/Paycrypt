// Shared types for Paycrypt SDK
export const PaymentStatus = {
  CREATED: 'created',
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  EXPIRED: 'expired'
};

export const PaymentMethod = {
  CRYPTO: 'crypto',
  UPI: 'upi'
};

export const UPIProvider = {
  PHONEPE: 'phonepe',
  PAYTM: 'paytm',
  RAZORPAY: 'razorpay',
  FREECHARGE: 'freecharge'
};

export const Asset = {
  BTC: 'BTC',
  ETH: 'ETH',
  USDT: 'USDT',
  USDC: 'USDC',
  BUSD: 'BUSD'
};

export const Network = {
  BITCOIN: 'BTC',
  ETHEREUM: 'ERC20',
  POLYGON: 'POLYGON',
  TRON: 'TRC20',
  BINANCE_SMART_CHAIN: 'BSC'
};

// Validation schemas
export const CreatePaymentSchema = {
  amountFiat: 'number',
  fiatCurrency: 'string',
  settlementCurrency: 'string',
  network: 'string',
  customerEmail: 'string',
  customerName: 'string',
  description: 'string',
  metadata: 'object',
  successUrl: 'string',
  cancelUrl: 'string',
  expiresInMinutes: 'number'
};

export const CreateUpiPaymentSchema = {
  ...CreatePaymentSchema,
  method: 'upi',
  provider: 'string',
  customerPhone: 'string'
};

export const CreateCryptoPaymentSchema = {
  ...CreatePaymentSchema,
  method: 'crypto'
};

export const PaymentLinkSchema = {
  amountFiat: 'number',
  fiatCurrency: 'string',
  settlementCurrency: 'string',
  network: 'string',
  description: 'string',
  successUrl: 'string',
  cancelUrl: 'string',
  expiresInMinutes: 'number'
};

export const UpiPaymentLinkSchema = {
  ...PaymentLinkSchema,
  paymentMethod: 'upi'
};

export const CryptoPaymentLinkSchema = {
  ...PaymentLinkSchema,
  paymentMethod: 'crypto'
};

// Error types
export class SDKError extends Error {
  constructor(message, code, details = null) {
    super(message);
    this.name = 'SDKError';
    this.code = code;
    this.details = details;
  }
}

// Response types
export class PaymentResponse {
  constructor(data) {
    this.id = data.id;
    this.status = data.status;
    this.amountFiat = data.amount_fiat;
    this.amountCrypto = data.amount_crypto;
    this.exchangeRate = data.exchange_rate;
    this.network = data.network;
    this.walletAddress = data.wallet_address;
    this.expiresAt = data.expires_at;
    this.successUrl = data.success_url;
    this.cancelUrl = data.cancel_url;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }
}

export class UpiPaymentResponse {
  constructor(data) {
    this.id = data.id;
    this.merchantId = data.merchant_id;
    this.amountFiat = data.amount_fiat;
    this.fiatCurrency = data.fiat_currency;
    this.paymentMethod = data.payment_method;
    this.upiProvider = data.upi_provider;
    this.upiTransactionId = data.upi_transaction_id;
    this.upiIntentUrl = data.upi_intent_url;
    this.upiQrCode = data.upi_qr_code;
    this.status = data.upi_status;
    this.description = data.description;
    this.expiresAt = data.expires_at;
    this.successUrl = data.success_url;
    this.cancelUrl = data.cancel_url;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }
}

export class PaymentLinkResponse {
  constructor(data) {
    this.id = data.id;
    this.url = data.url;
    this.amountFiat = data.amount_fiat;
    this.fiatCurrency = data.fiat_currency;
    this.description = data.description;
    this.expiresAt = data.expires_at;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }
}

// Utility types
export class PaymentReference {
  constructor(id, type) {
    this.id = id;
    this.type = type;
    this.createdAt = new Date().toISOString();
  }
}

export class WebhookEvent {
  constructor(type, data, timestamp) {
    this.type = type;
    this.data = data;
    this.timestamp = timestamp || new Date().toISOString();
  }
}
