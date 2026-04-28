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

export interface TreasuryBalance {
  balance_type: string;
  asset: string;
  network: string;
  amount_crypto: number;
  amount_fiat_equivalent: number;
}

export interface TreasuryWithdrawal {
  id: string;
  asset: string;
  network: string;
  amount_crypto: number;
  amount_fiat_equivalent: number;
  final_amount_crypto: number;
  destination_address: string;
  status: string;
  created_at: string;
}

export interface CreateWithdrawalInput {
  asset: string;
  network: string;
  amountCrypto: number;
  destinationAddress: string;
  destinationWalletProvider?: string;
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

  readonly treasury = {
    getSummary: () => this.treasuryGetSummary(),
    createWithdrawal: (input: CreateWithdrawalInput) => this.treasuryCreateWithdrawal(input),
    listWithdrawals: () => this.treasuryListWithdrawals(),
    listAdjustments: () => this.treasuryListAdjustments()
  };

  constructor(private readonly options: CryptoPayClientOptions) {
    this.baseUrl = options.baseUrl ?? "http://localhost:4000";
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

  async treasuryGetSummary() {
    return this.request<{ data: { balances: TreasuryBalance[]; withdrawals: TreasuryWithdrawal[]; transactions: unknown[] } }>(
      "/dashboard/treasury",
      {
        method: "GET"
      }
    );
  }

  async treasuryCreateWithdrawal(input: CreateWithdrawalInput) {
    return this.request<{ data: { withdrawalId: string; fees: unknown } }>("/dashboard/treasury/withdrawals", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  async treasuryListWithdrawals() {
    return this.request<{ data: TreasuryWithdrawal[] }>("/dashboard/treasury/withdrawals", {
      method: "GET"
    });
  }

  async treasuryListAdjustments() {
    return this.request<{ data: unknown[] }>("/dashboard/treasury/adjustments", {
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
