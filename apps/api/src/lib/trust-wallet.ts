import crypto from "node:crypto";
import { query } from "./db.js";
import { AppError } from "./errors.js";

export type NonCustodialWalletProvider = "Trust Wallet" | "MetaMask" | "Phantom" | "Merchant wallet";
export type NonCustodialNetwork = "TRC20" | "ERC20" | "SOL";

export interface NonCustodialWalletRegistration {
  merchantId: string;
  provider: NonCustodialWalletProvider;
  walletAddress: string;
  supportedNetworks: NonCustodialNetwork[];
  features?: Record<string, unknown>;
}

const providerSet = new Set<NonCustodialWalletProvider>([
  "Trust Wallet",
  "MetaMask",
  "Phantom",
  "Merchant wallet"
]);

export class TrustWalletService {
  static normalizeProvider(provider: string): NonCustodialWalletProvider {
    if (providerSet.has(provider as NonCustodialWalletProvider)) {
      return provider as NonCustodialWalletProvider;
    }
    throw new AppError(400, "invalid_wallet_provider", "Unsupported non-custodial wallet provider");
  }

  static validateAddress(network: NonCustodialNetwork, address: string) {
    const normalized = address.trim();
    if (!normalized) {
      throw new AppError(400, "wallet_address_required", "Wallet address is required");
    }

    if (network === "ERC20" && !/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
      throw new AppError(400, "invalid_wallet_address", "Invalid Ethereum/ERC20 wallet address");
    }
    if (network === "TRC20" && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(normalized)) {
      throw new AppError(400, "invalid_wallet_address", "Invalid TRON/TRC20 wallet address");
    }
    if (network === "SOL" && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(normalized)) {
      throw new AppError(400, "invalid_wallet_address", "Invalid Solana wallet address");
    }

    return normalized;
  }

  static createSignatureChallenge(input: {
    merchantId: string;
    provider: NonCustodialWalletProvider;
    network: NonCustodialNetwork;
    walletAddress: string;
  }) {
    const nonce = crypto.randomBytes(24).toString("hex");
    const issuedAt = new Date().toISOString();
    const message = [
      "Paycrypt wallet verification",
      `Merchant: ${input.merchantId}`,
      `Provider: ${input.provider}`,
      `Network: ${input.network}`,
      `Address: ${input.walletAddress}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`
    ].join("\n");

    return { nonce, issuedAt, message };
  }

  static async storeMerchantWalletAddress(input: NonCustodialWalletRegistration) {
    const provider = this.normalizeProvider(input.provider);
    const networks = input.supportedNetworks.map((network) => {
      const normalizedAddress = this.validateAddress(network, input.walletAddress);
      return { network, normalizedAddress };
    });

    if (!networks.length) {
      throw new AppError(400, "wallet_network_required", "At least one supported network is required");
    }

    const result = await query<{ id: string }>(
      `insert into trust_wallet_credentials (
         merchant_id, wallet_address, private_key_encrypted, is_active, supported_networks, features, error_message
       ) values ($1,$2,null,true,$3,$4::jsonb,null)
       returning id`,
      [
        input.merchantId,
        networks[0].normalizedAddress,
        networks.map((entry) => entry.network),
        JSON.stringify({
          provider,
          custodyModel: "non_custodial",
          storesPrivateKeys: false,
          ...(input.features ?? {})
        })
      ]
    );

    return {
      id: result.rows[0].id,
      provider,
      walletAddress: networks[0].normalizedAddress,
      supportedNetworks: networks.map((entry) => entry.network)
    };
  }

  static async listMerchantWalletAddresses(merchantId: string) {
    const result = await query(
      `select id, merchant_id, wallet_address, is_active, connected_at, last_synced_at,
              supported_networks, features, error_message, created_at, updated_at
         from trust_wallet_credentials
        where merchant_id = $1
        order by created_at desc`,
      [merchantId]
    );

    return result.rows;
  }

  static async deactivateMerchantWalletAddress(merchantId: string, walletId: string) {
    const result = await query<{ id: string }>(
      `update trust_wallet_credentials
          set is_active = false,
              updated_at = now()
        where id = $1 and merchant_id = $2
        returning id`,
      [walletId, merchantId]
    );

    if (!result.rows[0]) {
      throw new AppError(404, "wallet_not_found", "Trust Wallet route not found");
    }

    return { id: walletId, isActive: false };
  }
}
