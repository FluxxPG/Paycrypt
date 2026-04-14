import type {
  BillingInvoice,
  CreatePaymentInput,
  CreatePaymentLinkInput,
  SettlementRecord
} from "@cryptopay/shared";

export interface CryptoPayClientOptions {
  secretKey: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export class CryptoPayError extends Error {
  constructor(
    message: string,
    public status: number,
    public payload?: unknown
  ) {
    super(message);
  }
}

export class CryptoPayClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  readonly payment = {
    create: (input: CreatePaymentInput, idempotencyKey?: string) => this.paymentCreate(input, idempotencyKey),
    fetch: (paymentId: string) => this.paymentFetch(paymentId)
  };

  readonly paymentLinks = {
    create: (input: CreatePaymentLinkInput, idempotencyKey?: string) =>
      this.paymentLinksCreate(input, idempotencyKey)
  };

  readonly billing = {
    invoices: {
      list: () => this.invoicesList()
    },
    settlements: {
      list: () => this.settlementsList()
    }
  };

  constructor(private readonly options: CryptoPayClientOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.example.com";
    this.fetcher = options.fetcher ?? fetch;
  }

  async paymentCreate(input: CreatePaymentInput, idempotencyKey?: string) {
    const headers = idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined;
    return this.request("/v1/payments", {
      method: "POST",
      body: JSON.stringify(input),
      headers
    });
  }

  async paymentFetch(paymentId: string) {
    return this.request(`/v1/payments/${paymentId}`, {
      method: "GET"
    });
  }

  async paymentLinksCreate(input: CreatePaymentLinkInput, idempotencyKey?: string) {
    const headers = idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined;
    return this.request("/v1/payment_links", {
      method: "POST",
      body: JSON.stringify(input),
      headers
    });
  }

  async invoicesList() {
    return this.request<{ data: BillingInvoice[] }>("/v1/invoices", {
      method: "GET"
    });
  }

  async settlementsList() {
    return this.request<{ data: SettlementRecord[] }>("/v1/settlements", {
      method: "GET"
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.secretKey}`,
        ...(init.headers ?? {})
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new CryptoPayError(payload.message ?? "Request failed", response.status, payload);
    }

    return payload as T;
  }
}

export const createClient = (options: CryptoPayClientOptions) => new CryptoPayClient(options);
