import crypto from "node:crypto";
import { env } from "../env.js";

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

const baseUrl = env.BINANCE_BASE_URL ?? "https://api.binance.com";

const signedRequest = async <T>(path: string, params: Record<string, string | number | undefined>) => {
  if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
    throw new Error("Binance API credentials are not configured");
  }

  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      query.append(key, String(value));
    }
  });
  query.append("timestamp", String(Date.now()));
  const signature = crypto.createHmac("sha256", env.BINANCE_API_SECRET).update(query.toString()).digest("hex");
  query.append("signature", signature);

  const response = await fetch(`${baseUrl}${path}?${query.toString()}`, {
    headers: {
      "X-MBX-APIKEY": env.BINANCE_API_KEY
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Binance request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
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

export const getBinanceBalances = async () => {
  const response = await signedRequest<{ balances: BinanceBalance[] }>("/sapi/v3/asset/getUserAsset", {});
  return response.balances ?? [];
};

export const getBinanceDepositHistory = async (asset?: string) => {
  const response = await signedRequest<Array<{ amount: string; coin: string; address?: string; txId?: string; status?: number }>>(
    "/sapi/v1/capital/deposit/hisrec",
    asset ? { coin: asset } : {}
  );
  return response ?? [];
};
