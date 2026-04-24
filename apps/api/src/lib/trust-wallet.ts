import crypto from "node:crypto";
import { query } from "./db.js";
import { encryptSecret, decryptSecret } from "./security.js";
import { AppError } from "./errors.js";

export interface TrustWalletCredentials {
  clientId: string;
  clientSecret: string;
  environment: "testnet" | "mainnet";
}

export interface TrustWalletConfig {
  merchantId: string;
  credentials: TrustWalletCredentials;
  walletType: "non-custodial";
  isActive: boolean;
  supportedNetworks: string[];
  features: {
    multiChain: boolean;
    tokenSupport: boolean;
    nftSupport: boolean;
    swapSupport: boolean;
  };
}

export interface TrustWalletTransaction {
  id: string;
  merchantId: string;
  type: "send" | "receive" | "swap";
  fromAddress?: string;
  toAddress: string;
  asset: string;
  amount: string;
  network: string;
  txHash?: string;
  status: "pending" | "confirmed" | "failed";
  gasUsed?: string;
  gasPrice?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export class TrustWalletService {
  private static readonly BASE_URLS = {
    mainnet: "https://api.trustwallet.com",
    testnet: "https://api-testnet.trustwallet.com"
  };

  private static readonly ENDPOINTS = {
    // Wallet endpoints
    wallet: "/wallet",
    transaction: "/transaction",
    assets: "/assets",
    networks: "/networks",
    // Trading endpoints
    swap: "/swap",
    quote: "/quote",
    // NFT endpoints
    nft: "/nft",
    // User endpoints
    user: "/user",
    // Utilities
    utilities: "/price"
  };

  // Validate Trust Wallet credentials
  static validateCredentials(credentials: TrustWalletCredentials): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!credentials.clientId || credentials.clientId.length < 8) {
      errors.push("Client ID must be at least 8 characters");
    }

    if (!credentials.clientSecret || credentials.clientSecret.length < 32) {
      errors.push("Client secret must be at least 32 characters");
    }

    if (!/^[a-zA-Z0-9_\-]+$/.test(credentials.clientId)) {
      errors.push("Client ID contains invalid characters");
    }

    return { valid: errors.length === 0, errors };
  }

  // Get appropriate base URL
  private static getBaseUrl(environment: "testnet" | "mainnet"): string {
    return environment === "testnet" ? this.BASE_URLS.testnet : this.BASE_URLS.mainnet;
  }

  // Enhanced authentication with rate limiting
  static async authenticate(credentials: TrustWalletCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      const timestamp = Date.now();
      const message = `${timestamp}`;
      const signature = crypto
        .createHmac("sha256", credentials.clientSecret)
        .update(message)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.environment)}${this.ENDPOINTS.user}`, {
        method: "POST",
        headers: {
          "X-Client-ID": credentials.clientId,
          "X-Signature": signature,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          auth: {
            timestamp,
            signature
          }
        })
      });

      const data = await response.json();

      if (data.status !== "success") {
        return { success: false, error: data.message || "Authentication failed" };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Authentication failed" 
      };
    }
  }

  // Get wallet information
  static async getWalletInfo(credentials: TrustWalletCredentials): Promise<any> {
    try {
      const timestamp = Date.now();
      const message = `${timestamp}`;
      const signature = crypto
        .createHmac("sha256", credentials.clientSecret)
        .update(message)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.environment)}${this.ENDPOINTS.wallet}`, {
        headers: {
          "X-Client-ID": credentials.clientId,
          "X-Signature": signature,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new AppError(400, "trust_wallet_api_error", "Failed to fetch wallet info");
      }

      return await response.json();
    } catch (error) {
      throw new AppError(500, "trust_wallet_service_error", 
        error instanceof Error ? error.message : "Wallet info fetch failed");
    }
  }

  // Get supported assets
  static async getSupportedAssets(credentials: TrustWalletCredentials): Promise<any[]> {
    try {
      const timestamp = Date.now();
      const message = `${timestamp}`;
      const signature = crypto
        .createHmac("sha256", credentials.clientSecret)
        .update(message)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.environment)}${this.ENDPOINTS.assets}`, {
        headers: {
          "X-Client-ID": credentials.clientId,
          "X-Signature": signature,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new AppError(400, "trust_wallet_api_error", "Failed to fetch supported assets");
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      throw new AppError(500, "trust_wallet_service_error", 
        error instanceof Error ? error.message : "Assets fetch failed");
    }
  }

  // Get supported networks
  static async getSupportedNetworks(credentials: TrustWalletCredentials): Promise<any[]> {
    try {
      const timestamp = Date.now();
      const message = `${timestamp}`;
      const signature = crypto
        .createHmac("sha256", credentials.clientSecret)
        .update(message)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.environment)}${this.ENDPOINTS.networks}`, {
        headers: {
          "X-Client-ID": credentials.clientId,
          "X-Signature": signature,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new AppError(400, "trust_wallet_api_error", "Failed to fetch supported networks");
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      throw new AppError(500, "trust_wallet_service_error", 
        error instanceof Error ? error.message : "Networks fetch failed");
    }
  }

  // Send transaction
  static async sendTransaction(
    credentials: TrustWalletCredentials,
    transaction: {
      toAddress: string;
      asset: string;
      amount: string;
      network?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      const timestamp = Date.now();
      const message = `${timestamp}`;
      const signature = crypto
        .createHmac("sha256", credentials.clientSecret)
        .update(message)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.environment)}${this.ENDPOINTS.transaction}`, {
        method: "POST",
        headers: {
          "X-Client-ID": credentials.clientId,
          "X-Signature": signature,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "send",
          to: transaction.toAddress,
          asset: transaction.asset,
          amount: transaction.amount,
          ...(transaction.network && { network: transaction.network }),
          ...(transaction.metadata && { metadata: transaction.metadata })
        })
      });

      const data = await response.json();

      if (data.status !== "success") {
        return { 
          success: false, 
          error: data.message || "Transaction failed" 
        };
      }

      return { 
        success: true, 
        transactionId: data.data?.id 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Transaction failed" 
      };
    }
  }

  // Get transaction status
  static async getTransactionStatus(
    credentials: TrustWalletCredentials,
    transactionId: string
  ): Promise<any> {
    try {
      const timestamp = Date.now();
      const message = `${timestamp}`;
      const signature = crypto
        .createHmac("sha256", credentials.clientSecret)
        .update(message)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.environment)}${this.ENDPOINTS.transaction}/${transactionId}`, {
        headers: {
          "X-Client-ID": credentials.clientId,
          "X-Signature": signature,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new AppError(400, "trust_wallet_api_error", "Failed to fetch transaction status");
      }

      return await response.json();
    } catch (error) {
      throw new AppError(500, "trust_wallet_service_error", 
        error instanceof Error ? error.message : "Transaction status fetch failed");
    }
  }

  // Get swap quote
  static async getSwapQuote(
    credentials: TrustWalletCredentials,
    from: string,
    to: string,
    amount: string
  ): Promise<any> {
    try {
      const timestamp = Date.now();
      const message = `${timestamp}`;
      const signature = crypto
        .createHmac("sha256", credentials.clientSecret)
        .update(message)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.environment)}${this.ENDPOINTS.quote}`, {
        method: "POST",
        headers: {
          "X-Client-ID": credentials.clientId,
          "X-Signature": signature,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "swap",
          from,
          to,
          amount
        })
      });

      if (!response.ok) {
        throw new AppError(400, "trust_wallet_api_error", "Failed to fetch swap quote");
      }

      return await response.json();
    } catch (error) {
      throw new AppError(500, "trust_wallet_service_error", 
        error instanceof Error ? error.message : "Swap quote fetch failed");
    }
  }

  // Execute swap
  static async executeSwap(
    credentials: TrustWalletCredentials,
    swapData: {
      from: string;
      to: string;
      amount: string;
      slippage?: number;
    }
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      const timestamp = Date.now();
      const message = `${timestamp}`;
      const signature = crypto
        .createHmac("sha256", credentials.clientSecret)
        .update(message)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.environment)}${this.ENDPOINTS.swap}`, {
        method: "POST",
        headers: {
          "X-Client-ID": credentials.clientId,
          "X-Signature": signature,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "swap",
          from: swapData.from,
          to: swapData.to,
          amount: swapData.amount,
          ...(swapData.slippage && { slippage: swapData.slippage })
        })
      });

      const data = await response.json();

      if (data.status !== "success") {
        return { 
          success: false, 
          error: data.message || "Swap failed" 
        };
      }

      return { 
        success: true, 
        transactionId: data.data?.id 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Swap execution failed" 
      };
    }
  }

  // Store encrypted credentials in database
  static async storeMerchantCredentials(
    merchantId: string,
    credentials: TrustWalletCredentials,
    config: Partial<TrustWalletConfig>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const encryptedClientId = encryptSecret(credentials.clientId);
      const encryptedClientSecret = encryptSecret(credentials.clientSecret);

      await query(`
        INSERT INTO trust_wallet_credentials (
          merchant_id, client_id_encrypted, client_secret_encrypted, 
          environment, wallet_type, is_active, supported_networks, 
          features, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (merchant_id) 
        DO UPDATE SET
          client_id_encrypted = EXCLUDED.client_id_encrypted,
          client_secret_encrypted = EXCLUDED.client_secret_encrypted,
          environment = EXCLUDED.environment,
          wallet_type = EXCLUDED.wallet_type,
          is_active = EXCLUDED.is_active,
          supported_networks = EXCLUDED.supported_networks,
          features = EXCLUDED.features,
          updated_at = NOW()
      `, [
        merchantId,
        encryptedClientId,
        encryptedClientSecret,
        credentials.environment || "mainnet",
        "non-custodial",
        config.isActive !== false,
        JSON.stringify(config.supportedNetworks || ["ETH", "BSC", "POLYGON", "AVALANCHE"]),
        JSON.stringify(config.features || {
          multiChain: true,
          tokenSupport: true,
          nftSupport: true,
          swapSupport: true
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
  static async getMerchantCredentials(merchantId: string): Promise<TrustWalletConfig | null> {
    try {
      const result = await query(`
        SELECT 
          id, merchant_id, environment, wallet_type, is_active, 
          supported_networks, features, created_at, updated_at
        FROM trust_wallet_credentials 
        WHERE merchant_id = $1 AND is_active = true
      `, [merchantId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        merchantId: row.merchant_id,
        credentials: {
          clientId: decryptSecret(row.client_id_encrypted),
          clientSecret: decryptSecret(row.client_secret_encrypted),
          environment: row.environment
        },
        walletType: row.wallet_type,
        isActive: row.is_active,
        supportedNetworks: typeof row.supported_networks === 'string' 
          ? JSON.parse(row.supported_networks) 
          : row.supported_networks,
        features: typeof row.features === 'string' 
          ? JSON.parse(row.features) 
          : row.features
      };
    } catch (error) {
      throw new AppError(500, "trust_wallet_service_error", 
        error instanceof Error ? error.message : "Failed to retrieve credentials");
    }
  }

  // Test connection with enhanced validation
  static async testConnection(credentials: TrustWalletCredentials): Promise<{
    success: boolean;
    error?: string;
    walletInfo?: any;
  }> {
    try {
      const authResult = await this.authenticate(credentials);
      if (!authResult.success) {
        return { success: false, error: authResult.error };
      }

      const walletInfo = await this.getWalletInfo(credentials);
      
      return { 
        success: true, 
        walletInfo 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Connection test failed" 
      };
    }
  }

  // Monitor transaction status
  static async monitorTransaction(
    credentials: TrustWalletCredentials,
    transactionId: string
  ): Promise<any> {
    try {
      // This would typically use WebSocket or polling
      // For now, we'll implement polling-based monitoring
      const transaction = await this.getTransactionStatus(credentials, transactionId);

      return transaction || null;
    } catch (error) {
      throw new AppError(500, "trust_wallet_service_error", 
        error instanceof Error ? error.message : "Transaction monitoring failed");
    }
  }

  // Get current gas prices
  static async getGasPrices(credentials: TrustWalletCredentials): Promise<any> {
    try {
      const timestamp = Date.now();
      const message = `${timestamp}`;
      const signature = crypto
        .createHmac("sha256", credentials.clientSecret)
        .update(message)
        .digest("hex");

      const response = await fetch(`${this.getBaseUrl(credentials.environment)}${this.ENDPOINTS.utilities}`, {
        method: "GET",
        headers: {
          "X-Client-ID": credentials.clientId,
          "X-Signature": signature,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new AppError(400, "trust_wallet_api_error", "Failed to fetch gas prices");
      }

      return await response.json();
    } catch (error) {
      throw new AppError(500, "trust_wallet_service_error", 
        error instanceof Error ? error.message : "Gas prices fetch failed");
    }
  }
}
