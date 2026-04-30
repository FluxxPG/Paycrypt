import crypto from "node:crypto";
import { env } from "../env.js";
import { withCircuitBreaker } from "./circuit-breaker.js";

type BinanceDepositAddress = {
  address: string;
  tag?: string;
  coin: string;
  network?: string;
};

type BinanceBalance = {
  asset: string;
  free: string;
  locked: string;
};

type BinanceWithdrawalApplyResponse = {
  id?: string;
  msg?: string;
  success?: boolean;
};

export type BinanceCredentials = {
  apiKey: string;
  apiSecret: string;
};

const baseUrl = env.BINANCE_BASE_URL ?? "https://api.binance.com";

const signedRequest = async <T>(
  path: string,
  params: Record<string, string | number | undefined>,
  options: {
    credentials?: BinanceCredentials;
    method?: "GET" | "POST";
  } = {}
) => {
  const apiKey = (options.credentials?.apiKey ?? env.BINANCE_API_KEY ?? "").trim();
  const apiSecret = (options.credentials?.apiSecret ?? env.BINANCE_API_SECRET ?? "").trim();
  if (!apiKey || !apiSecret) {
    throw new Error("Binance API credentials are not configured");
  }

  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      query.append(key, String(value));
    }
  });
  if (!query.has("recvWindow")) {
    query.append("recvWindow", "60000");
  }
  query.append("timestamp", String(Date.now()));
  const signature = crypto.createHmac("sha256", apiSecret).update(query.toString()).digest("hex");
  query.append("signature", signature);

  const method = options.method ?? "GET";

  return withCircuitBreaker(
    "binance",
    async () => {
      const response = await fetch(`${baseUrl}${path}?${query.toString()}`, {
        method,
        headers: {
          Accept: "application/json",
          "X-MBX-APIKEY": apiKey
        }
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Binance request failed: ${response.status} ${text}`);
      }

      return (await response.json()) as T;
    },
    {
      failureThreshold: 5,
      openDurationMs: 30_000
    }
  );
};

const networkMap: Record<string, string> = {
  BTC: "BTC",
  ERC20: "ETH",
  TRC20: "TRX",
  SOL: "SOL"
};

export const getBinanceDepositAddress = async (asset: string, network: string): Promise<BinanceDepositAddress> => {
  const binanceNetwork = networkMap[network] ?? network;
  return signedRequest<BinanceDepositAddress>("/sapi/v1/capital/deposit/address", {
    coin: asset,
    network: binanceNetwork
  });
};

export const getBinanceDepositAddressForCredentials = async (
  asset: string,
  network: string,
  credentials: BinanceCredentials
): Promise<BinanceDepositAddress> => {
  const binanceNetwork = networkMap[network] ?? network;
  return signedRequest<BinanceDepositAddress>("/sapi/v1/capital/deposit/address", {
    coin: asset,
    network: binanceNetwork
  }, { credentials });
};

export const getBinanceBalances = async (credentials?: BinanceCredentials) => {
  const response = await signedRequest<
    BinanceBalance[] | { balances?: BinanceBalance[]; assets?: BinanceBalance[] }
  >("/sapi/v3/asset/getUserAsset", {}, { credentials, method: "POST" });
  if (Array.isArray(response)) {
    return response;
  }
  return response.balances ?? response.assets ?? [];
};

export const getBinanceDepositHistory = async (asset?: string, credentials?: BinanceCredentials) => {
  const response = await signedRequest<Array<{ amount: string; coin: string; address?: string; txId?: string; status?: number }>>(
    "/sapi/v1/capital/deposit/hisrec",
    asset ? { coin: asset } : {},
    { credentials }
  );
  return response ?? [];
};

export const applyBinanceWithdrawal = async (
  input: {
    asset: string;
    network: string;
    amount: string | number;
    address: string;
    addressTag?: string;
  },
  credentials?: BinanceCredentials
) => {
  const binanceNetwork = networkMap[input.network] ?? input.network;
  const response = await signedRequest<BinanceWithdrawalApplyResponse>(
    "/sapi/v1/capital/withdraw/apply",
    {
      coin: input.asset,
      network: binanceNetwork,
      amount: input.amount,
      address: input.address,
      addressTag: input.addressTag
    },
    { credentials, method: "POST" }
  );

  if (!response?.id) {
    throw new Error(response?.msg ?? "Binance withdrawal did not return a provider reference");
  }

  return response;
};

export const getBinanceWithdrawalHistory = async (asset?: string, credentials?: BinanceCredentials) => {
  const response = await signedRequest<
    Array<{
      id?: string;
      amount?: string;
      coin?: string;
      txId?: string;
      status?: number;
      address?: string;
      applyTime?: string;
      completeTime?: string;
      network?: string;
    }>
  >("/sapi/v1/capital/withdraw/history", asset ? { coin: asset } : {}, { credentials });
  return response ?? [];
};

export const validateBinanceCredentials = async (credentials: BinanceCredentials) => {
  await getBinanceBalances(credentials);
};
