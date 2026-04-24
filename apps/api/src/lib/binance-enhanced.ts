import crypto from "node:crypto";
import { query } from "./db.js";
import { encryptSecret, decryptSecret } from "./security.js";
import { AppError } from "./errors.js";

export interface BinanceCredentials {
  apiKey: string;
  secretKey: string;
  testnet?: boolean;
}

export interface BinanceWalletConfig {
  merchantId: string;
  credentials: BinanceCredentials;
  walletType: "custodial" | "non-custodial";
  isActive: boolean;
  features: {
    spotTrading: boolean;
    futures: boolean;
    margin: boolean;
    options: boolean;
  };
}

export interface BinanceTransaction {
  id: string;
  merchantId: string;
  type: "deposit" | "withdrawal" | "trade";
  asset: string;
  amount: string;
  network: string;
  txHash?: string;
  status: "pending" | "confirmed" | "failed";
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export class BinanceEnhancedService {
  private static readonly BASE_URLS = {
    production: "https://api.binance.com",
    testnet: "https://testnet.binance.vision"
  };

  private static readonly ENDPOINTS = {
    // Account endpoints
    account: "/sapi/v1/account",
    // Wallet endpoints
    wallet: "/sapi/v1/capital/deposit/hisrec",
    // Trading endpoints
    spot: "/api/v3/account",
    // System status
    system: "/sapi/v1/system/status"
  };

  // Enhanced credential validation
  static validateCredentials(credentials: BinanceCredentials): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!credentials.apiKey || credentials.apiKey.length < 32) {
      errors.push("API key must be at least 32 characters");
    }

    if (!credentials.secretKey || credentials.secretKey.length < 32) {
      errors.push("Secret key must be at least 32 characters");
    }

    if (!/^[a-zA-Z0-9_\-]+$/.test(credentials.apiKey)) {
      errors.push("API key contains invalid characters");
    }

    return { valid: errors.length === 0, errors };
  }

  // Get appropriate base URL
  private static getBaseUrl(testnet = false): string {
    return testnet ? this.BASE_URLS.testnet : this.BASE_URLS.production;
  }

  // Enhanced authentication with rate limiting
  static async authenticate(credentials: BinanceCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto
        .createHmac("sha256", credentials.secretKey)
        .update(queryString)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.testnet)}/sapi/v1/system/status`, {
        headers: {
          "X-MBX-APIKEY": credentials.apiKey,
          "X-MBX-SIGNATURE": signature
        }
      });

      const data = await response.json();

      if (data.status !== 0) {
        return { success: false, error: "Binance API authentication failed" };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Authentication failed" 
      };
    }
  }

  // Get account information with enhanced details
  static async getAccountInfo(credentials: BinanceCredentials): Promise<any> {
    try {
      const timestamp = Date.now();
      const signature = crypto
        .createHmac("sha256", credentials.secretKey)
        .update(`timestamp=${timestamp}`)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.testnet)}${this.ENDPOINTS.account}`, {
        headers: {
          "X-MBX-APIKEY": credentials.apiKey,
          "X-MBX-SIGNATURE": signature
        }
      });

      if (!response.ok) {
        throw new AppError(400, "binance_api_error", "Failed to fetch account info");
      }

      return await response.json();
    } catch (error) {
      throw new AppError(500, "binance_service_error", 
        error instanceof Error ? error.message : "Account info fetch failed");
    }
  }

  // Enhanced wallet balance fetching
  static async getWalletBalances(credentials: BinanceCredentials): Promise<any[]> {
    try {
      const timestamp = Date.now();
      const signature = crypto
        .createHmac("sha256", credentials.secretKey)
        .update(`timestamp=${timestamp}`)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.testnet)}${this.ENDPOINTS.wallet}`, {
        headers: {
          "X-MBX-APIKEY": credentials.apiKey,
          "X-MBX-SIGNATURE": signature
        }
      });

      if (!response.ok) {
        throw new AppError(400, "binance_api_error", "Failed to fetch wallet balances");
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      throw new AppError(500, "binance_service_error", 
        error instanceof Error ? error.message : "Wallet balance fetch failed");
    }
  }

  // Get deposit history with filtering
  static async getDepositHistory(
    credentials: BinanceCredentials,
    options: {
      asset?: string;
      status?: string[];
      limit?: number;
      startTime?: number;
      endTime?: number;
    } = {}
  ): Promise<any[]> {
    try {
      const params = new URLSearchParams();
      if (options.asset) params.append("asset", options.asset);
      if (options.status) params.append("status", options.status.join(","));
      if (options.limit) params.append("limit", options.limit.toString());
      if (options.startTime) params.append("startTime", options.startTime.toString());
      if (options.endTime) params.append("endTime", options.endTime.toString());

      const timestamp = Date.now();
      const signature = crypto
        .createHmac("sha256", credentials.secretKey)
        .update(`timestamp=${timestamp}&${params.toString()}`)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.testnet)}${this.ENDPOINTS.wallet}?${params.toString()}`, {
        headers: {
          "X-MBX-APIKEY": credentials.apiKey,
          "X-MBX-SIGNATURE": signature
        }
      });

      if (!response.ok) {
        throw new AppError(400, "binance_api_error", "Failed to fetch deposit history");
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      throw new AppError(500, "binance_service_error", 
        error instanceof Error ? error.message : "Deposit history fetch failed");
    }
  }

  // Enhanced withdrawal processing
  static async processWithdrawal(
    credentials: BinanceCredentials,
    withdrawal: {
      asset: string;
      amount: string;
      address: string;
      network?: string;
      memo?: string;
    }
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      const timestamp = Date.now();
      const params = new URLSearchParams({
        asset: withdrawal.asset,
        amount: withdrawal.amount,
        address: withdrawal.address,
        ...(withdrawal.network && { network: withdrawal.network }),
        ...(withdrawal.memo && { memo: withdrawal.memo })
      });

      const signature = crypto
        .createHmac("sha256", credentials.secretKey)
        .update(`timestamp=${timestamp}&${params.toString()}`)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.testnet)}/sapi/v1/capital/withdraw/apply`, {
        method: "POST",
        headers: {
          "X-MBX-APIKEY": credentials.apiKey,
          "X-MBX-SIGNATURE": signature,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
      });

      const data = await response.json();

      if (data.code !== 0) {
        return { 
          success: false, 
          error: data.msg || "Withdrawal processing failed" 
        };
      }

      return { 
        success: true, 
        transactionId: data.data?.id 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Withdrawal processing failed" 
      };
    }
  }

  // Get withdrawal status
  static async getWithdrawalStatus(
    credentials: BinanceCredentials,
    withdrawalId: string
  ): Promise<any> {
    try {
      const timestamp = Date.now();
      const signature = crypto
        .createHmac("sha256", credentials.secretKey)
        .update(`timestamp=${timestamp}&withdrawalId=${withdrawalId}`)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.testnet)}/sapi/v1/capital/withdraw/history`, {
        method: "POST",
        headers: {
          "X-MBX-APIKEY": credentials.apiKey,
          "X-MBX-SIGNATURE": signature,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: `withdrawalId=${withdrawalId}`
      });

      if (!response.ok) {
        throw new AppError(400, "binance_api_error", "Failed to fetch withdrawal status");
      }

      return await response.json();
    } catch (error) {
      throw new AppError(500, "binance_service_error", 
        error instanceof Error ? error.message : "Withdrawal status fetch failed");
    }
  }

  // Enhanced trading capabilities
  static async getTradingStatus(credentials: BinanceCredentials): Promise<{
    canTrade: boolean;
    permissions: string[];
    restrictions: any;
  }> {
    try {
      const timestamp = Date.now();
      const signature = crypto
        .createHmac("sha256", credentials.secretKey)
        .update(`timestamp=${timestamp}`)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.testnet)}${this.ENDPOINTS.spot}`, {
        headers: {
          "X-MBX-APIKEY": credentials.apiKey,
          "X-MBX-SIGNATURE": signature
        }
      });

      if (!response.ok) {
        throw new AppError(400, "binance_api_error", "Failed to fetch trading status");
      }

      const data = await response.json();
      return {
        canTrade: data.canTrade || false,
        permissions: data.permissions || [],
        restrictions: data.restrictions || {}
      };
    } catch (error) {
      throw new AppError(500, "binance_service_error", 
        error instanceof Error ? error.message : "Trading status fetch failed");
    }
  }

  // Store encrypted credentials in database
  static async storeMerchantCredentials(
    merchantId: string,
    credentials: BinanceCredentials,
    config: Partial<BinanceWalletConfig>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const encryptedApiKey = encryptSecret(credentials.apiKey);
      const encryptedSecretKey = encryptSecret(credentials.secretKey);

      await query(`
        INSERT INTO binance_credentials (
          merchant_id, api_key_encrypted, secret_key_encrypted, 
          testnet, wallet_type, is_active, features, 
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (merchant_id) 
        DO UPDATE SET
          api_key_encrypted = EXCLUDED.api_key_encrypted,
          secret_key_encrypted = EXCLUDED.secret_key_encrypted,
          testnet = EXCLUDED.testnet,
          wallet_type = EXCLUDED.wallet_type,
          features = EXCLUDED.features,
          updated_at = NOW()
      `, [
        merchantId,
        encryptedApiKey,
        encryptedSecretKey,
        credentials.testnet || false,
        config.walletType || "custodial",
        config.isActive !== false,
        JSON.stringify(config.features || {
          spotTrading: true,
          futures: false,
          margin: false,
          options: false
        })
      ]);

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to store credentials" 
      };
    }
  }

  // Retrieve and decrypt merchant credentials
  static async getMerchantCredentials(merchantId: string): Promise<BinanceWalletConfig | null> {
    try {
      const result = await query(`
        SELECT 
          id, merchant_id, testnet, wallet_type, is_active, 
          features, created_at, updated_at
        FROM binance_credentials 
        WHERE merchant_id = $1 AND is_active = true
      `, [merchantId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        merchantId: row.merchant_id,
        credentials: {
          apiKey: decryptSecret(row.api_key_encrypted),
          secretKey: decryptSecret(row.secret_key_encrypted),
          testnet: row.testnet
        },
        walletType: row.wallet_type,
        isActive: row.is_active,
        features: typeof row.features === 'string' 
          ? JSON.parse(row.features) 
          : row.features
      };
    } catch (error) {
      throw new AppError(500, "binance_service_error", 
        error instanceof Error ? error.message : "Failed to retrieve credentials");
    }
  }

  // Test connection with enhanced validation
  static async testConnection(credentials: BinanceCredentials): Promise<{
    success: boolean;
    error?: string;
    accountInfo?: any;
  }> {
    try {
      const authResult = await this.authenticate(credentials);
      if (!authResult.success) {
        return { success: false, error: authResult.error };
      }

      const accountInfo = await this.getAccountInfo(credentials);
      
      return { 
        success: true, 
        accountInfo 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Connection test failed" 
      };
    }
  }

  // Enhanced transaction monitoring
  static async monitorTransaction(
    credentials: BinanceCredentials,
    transactionId: string
  ): Promise<any> {
    try {
      // This would typically use WebSocket or polling
      // For now, we'll implement polling-based monitoring
      const depositHistory = await this.getDepositHistory(credentials, {
        limit: 10
      });

      const transaction = depositHistory.find((tx: any) => 
        tx.txId === transactionId || tx.id === transactionId
      );

      return transaction || null;
    } catch (error) {
      throw new AppError(500, "binance_service_error", 
        error instanceof Error ? error.message : "Transaction monitoring failed");
    }
  }

  // Get system status with enhanced information
  static async getSystemStatus(credentials: BinanceCredentials): Promise<{
    status: number;
    message: string;
    systems: any;
  }> {
    try {
      const timestamp = Date.now();
      const signature = crypto
        .createHmac("sha256", credentials.secretKey)
        .update(`timestamp=${timestamp}`)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.testnet)}${this.ENDPOINTS.system}`, {
        headers: {
          "X-MBX-APIKEY": credentials.apiKey,
          "X-MBX-SIGNATURE": signature
        }
      });

      if (!response.ok) {
        throw new AppError(400, "binance_api_error", "Failed to fetch system status");
      }

      return await response.json();
    } catch (error) {
      throw new AppError(500, "binance_service_error", 
        error instanceof Error ? error.message : "System status fetch failed");
    }
  }
}
