import { type SupportedAsset } from "@cryptopay/shared";
import { env } from "../env.js";
import { AppError } from "./errors.js";

const ASSET_IDS: Record<SupportedAsset, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether"
};

type QuoteCacheEntry = {
  rate: number;
  fetchedAt: number;
};

const quoteCache = new Map<string, QuoteCacheEntry>();
const quoteCacheTtlMs = 30_000;

type CoinGeckoResponse = Record<string, Record<string, number>>;

export type CryptoQuote = {
  asset: SupportedAsset;
  fiatCurrency: string;
  exchangeRate: number;
  amountCrypto: number;
  quotedAt: string;
  source: string;
};

const getOracleBaseUrl = () => env.PRICE_ORACLE_BASE_URL ?? "https://api.coingecko.com";

export const quoteCryptoAmount = async (
  asset: SupportedAsset,
  fiatCurrency: string,
  amountFiat: number
): Promise<CryptoQuote> => {
  const currency = fiatCurrency.toLowerCase();
  const cacheKey = `${asset}:${currency}`;
  const cached = quoteCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < quoteCacheTtlMs) {
    return {
      asset,
      fiatCurrency,
      exchangeRate: cached.rate,
      amountCrypto: Number((amountFiat / cached.rate).toFixed(8)),
      quotedAt: new Date(cached.fetchedAt).toISOString(),
      source: new URL(getOracleBaseUrl()).hostname
    };
  }

  const url = new URL("/api/v3/simple/price", getOracleBaseUrl());
  url.searchParams.set("ids", ASSET_IDS[asset]);
  url.searchParams.set("vs_currencies", currency);
  url.searchParams.set("include_last_updated_at", "true");

  const response = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    if (cached) {
      return {
        asset,
        fiatCurrency,
        exchangeRate: cached.rate,
        amountCrypto: Number((amountFiat / cached.rate).toFixed(8)),
        quotedAt: new Date(cached.fetchedAt).toISOString(),
        source: `${new URL(getOracleBaseUrl()).hostname}:cache`
      };
    }
    throw new AppError(502, "quote_unavailable", "Unable to fetch a live crypto quote");
  }

  const payload = (await response.json()) as CoinGeckoResponse;
  const rate = Number(payload[ASSET_IDS[asset]]?.[currency]);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new AppError(502, "quote_unavailable", "The price oracle returned an invalid quote");
  }

  quoteCache.set(cacheKey, { rate, fetchedAt: Date.now() });

  return {
    asset,
    fiatCurrency,
    exchangeRate: rate,
    amountCrypto: Number((amountFiat / rate).toFixed(8)),
    quotedAt: new Date().toISOString(),
    source: new URL(getOracleBaseUrl()).hostname
  };
};
