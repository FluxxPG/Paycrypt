import crypto from "node:crypto";

type PaymentRow = {
  id: string;
  merchant_id: string;
  settlement_currency: string;
  network: string;
  wallet_address: string;
  wallet_routes: Record<string, { asset: string; network: string; address: string; provider?: string; walletType?: string }>;
  status: string;
  amount_crypto?: string;
  created_at: string;
  tx_hash?: string | null;
};

type ProviderObservation = {
  txHash: string;
  confirmations: number;
  status: "pending" | "confirmed";
};

type EthereumLog = {
  transactionHash: string;
  blockNumber: string;
  data: string;
};

type EthereumBlock = {
  number: string;
  timestamp: string;
  transactions: Array<{
    hash: string;
    to?: string | null;
    value: string;
  }>;
};

type SolanaTransaction = {
  blockTime?: number | null;
  meta?: {
    innerInstructions?: Array<{
      instructions?: Array<{
        parsed?: {
          type?: string;
          info?: Record<string, unknown>;
        };
      }>;
    }>;
  };
  transaction?: {
    message?: {
      instructions?: Array<{
        parsed?: {
          type?: string;
          info?: Record<string, unknown>;
        };
      }>;
    };
  };
};

const binanceBaseUrl = process.env.BINANCE_BASE_URL ?? "https://api.binance.com";
const tronBaseUrl = process.env.TRONGRID_BASE_URL ?? "https://api.trongrid.io";
const ethereumRpcUrl = process.env.ETHEREUM_RPC_URL ?? "https://rpc.ankr.com/eth";
const solanaRpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

const erc20UsdtContract = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a6fca4d6b3";
const paymentTimeDriftMs = 30 * 60 * 1000;
const nativeEthToleranceWei = 1_000_000_000_000n;

export const requiredConfirmations: Record<string, number> = {
  BTC: 2,
  ERC20: 12,
  TRC20: 20,
  SOL: 32
};

const networkMap: Record<string, string> = {
  BTC: "BTC",
  ERC20: "ETH",
  TRC20: "TRX",
  SOL: "SOL"
};

const jsonRpc = async <T>(url: string, method: string, params: unknown[] = []) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params
    })
  });

  const payload = (await response.json()) as { result?: T; error?: { message: string } };
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `RPC request failed: ${response.status}`);
  }
  return payload.result as T;
};

const normalizeNumber = (value: string | number | undefined | null) => Number(value ?? 0);

const normalizeNetwork = (value: string | undefined | null) => {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "ETH") return "ERC20";
  if (normalized === "TRX") return "TRC20";
  return normalized;
};

const paymentCreatedAt = (payment: PaymentRow) => new Date(payment.created_at).getTime();

const isWithinPaymentWindow = (candidateTimeMs: number | undefined | null, payment: PaymentRow) => {
  if (!candidateTimeMs) return true;
  return candidateTimeMs >= paymentCreatedAt(payment) - paymentTimeDriftMs;
};

const parseDecimalToUnits = (value: string | number | undefined, decimals: number) => {
  const normalized = String(value ?? "0").trim();
  const negative = normalized.startsWith("-");
  const [whole, fraction = ""] = normalized.replace("-", "").split(".");
  const padded = `${whole || "0"}${fraction.padEnd(decimals, "0").slice(0, decimals)}`;
  const units = BigInt(padded || "0");
  return negative ? -units : units;
};

const amountMatchesUnits = (actual: bigint, expected: bigint, tolerance: bigint) => {
  const diff = actual > expected ? actual - expected : expected - actual;
  return diff <= tolerance;
};

const amountMatches = (
  actual: string | number | undefined,
  expected: string | number | undefined,
  decimals: number,
  toleranceUnits: bigint
) => amountMatchesUnits(parseDecimalToUnits(actual, decimals), parseDecimalToUnits(expected, decimals), toleranceUnits);

const toHex = (value: bigint) => `0x${value.toString(16)}`;

const confirmationsFor = (network: string, currentBlock: bigint, targetBlock: bigint) => {
  const confirmations = Number(currentBlock - targetBlock + 1n);
  return confirmations > 0 ? confirmations : 0;
};

const blockTimestampMs = (hexTimestamp: string) => Number(BigInt(hexTimestamp)) * 1000;

const findEthereumTransfer = async (
  payment: PaymentRow,
  latestBlock: bigint,
  expectedWei: bigint
): Promise<ProviderObservation | null> => {
  const maxBlocksToScan = 160n;

  for (let offset = 0n; offset < maxBlocksToScan && latestBlock > offset; offset += 1n) {
    const blockNumber = latestBlock - offset;
    const block = await jsonRpc<EthereumBlock>(ethereumRpcUrl, "eth_getBlockByNumber", [toHex(blockNumber), true]);
    if (!isWithinPaymentWindow(blockTimestampMs(block.timestamp), payment)) {
      break;
    }

    const tx = block.transactions.find((item) => {
      if (!item.to) return false;
      if (item.to.toLowerCase() !== payment.wallet_address.toLowerCase()) return false;
      return amountMatchesUnits(BigInt(item.value), expectedWei, nativeEthToleranceWei);
    });

    if (tx) {
      const confirmations = confirmationsFor(payment.network, latestBlock, blockNumber);
      return {
        txHash: tx.hash,
        confirmations,
        status: confirmations >= requiredConfirmations.ERC20 ? "confirmed" : "pending"
      };
    }
  }

  return null;
};

const monitorEthereum = async (payment: PaymentRow): Promise<ProviderObservation | null> => {
  const latestBlockHex = await jsonRpc<string>(ethereumRpcUrl, "eth_blockNumber");
  const latestBlock = BigInt(latestBlockHex);

  if (payment.settlement_currency === "ETH") {
    return findEthereumTransfer(payment, latestBlock, parseDecimalToUnits(payment.amount_crypto, 18));
  }

  const topicAddress = `0x${payment.wallet_address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
  const fromBlock = latestBlock > 30_000n ? toHex(latestBlock - 30_000n) : "0x0";
  const logs = await jsonRpc<EthereumLog[]>(ethereumRpcUrl, "eth_getLogs", [
    {
      fromBlock,
      toBlock: "latest",
      address: erc20UsdtContract,
      topics: [transferTopic, null, topicAddress]
    }
  ]);
  const expectedAmount = parseDecimalToUnits(payment.amount_crypto, 6);

  for (const log of logs.slice().reverse()) {
    const block = await jsonRpc<EthereumBlock>(ethereumRpcUrl, "eth_getBlockByNumber", [log.blockNumber, false]);
    if (!isWithinPaymentWindow(blockTimestampMs(block.timestamp), payment)) {
      continue;
    }

    const amount = BigInt(log.data);
    if (!amountMatchesUnits(amount, expectedAmount, 5_000n)) {
      continue;
    }

    const targetBlock = BigInt(log.blockNumber);
    const confirmations = confirmationsFor(payment.network, latestBlock, targetBlock);
    return {
      txHash: log.transactionHash,
      confirmations,
      status: confirmations >= requiredConfirmations.ERC20 ? "confirmed" : "pending"
    };
  }

  return null;
};

const monitorSolana = async (payment: PaymentRow): Promise<ProviderObservation | null> => {
  const signatures = await jsonRpc<
    Array<{ signature: string; confirmations: number | null; confirmationStatus?: "processed" | "confirmed" | "finalized" }>
  >(solanaRpcUrl, "getSignaturesForAddress", [payment.wallet_address, { limit: 15 }]);

  for (const signature of signatures) {
    const transaction = await jsonRpc<SolanaTransaction | null>(solanaRpcUrl, "getTransaction", [
      signature.signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }
    ]);
    const blockTimeMs = transaction?.blockTime ? transaction.blockTime * 1000 : undefined;
    if (!isWithinPaymentWindow(blockTimeMs, payment)) {
      continue;
    }

    const parsedInstructions = [
      ...(transaction?.transaction?.message?.instructions ?? []),
      ...(
        transaction?.meta?.innerInstructions?.flatMap((group) => group.instructions ?? []) ?? []
      )
    ];

    const match = parsedInstructions.find((instruction) => {
      const parsed = instruction.parsed;
      const info = parsed?.info ?? {};
      const destination = String(info.destination ?? "");
      if (destination !== payment.wallet_address) {
        return false;
      }

      if (payment.settlement_currency === "SOL") {
        const lamports = BigInt(String(info.lamports ?? "0"));
        return amountMatchesUnits(lamports, parseDecimalToUnits(payment.amount_crypto, 9), 5_000n);
      }

      const amount =
        info.tokenAmount && typeof info.tokenAmount === "object"
          ? String((info.tokenAmount as Record<string, unknown>).amount ?? "0")
          : String(info.amount ?? "0");
      return amountMatchesUnits(BigInt(amount), parseDecimalToUnits(payment.amount_crypto, 6), 5_000n);
    });

    if (!match) {
      continue;
    }

    const confirmations = signature.confirmations ?? 0;
    return {
      txHash: signature.signature,
      confirmations,
      status:
        signature.confirmationStatus === "finalized" || confirmations >= requiredConfirmations.SOL
          ? "confirmed"
          : "pending"
    };
  }

  return null;
};

const monitorTron = async (payment: PaymentRow): Promise<ProviderObservation | null> => {
  const response = await fetch(
    `${tronBaseUrl}/v1/accounts/${payment.wallet_address}/transactions/trc20?only_confirmed=false&limit=50`
  );
  if (!response.ok) {
    throw new Error(`TronGrid request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{
      transaction_id: string;
      confirmed?: boolean;
      value?: string;
      to?: string;
      block_timestamp?: number;
      token_info?: { symbol?: string; decimals?: number | string };
    }>;
  };

  const tx = payload.data?.find((item) => {
    const assetMatches = String(item.token_info?.symbol ?? "").toUpperCase() === payment.settlement_currency;
    const destinationMatches = item.to ? item.to === payment.wallet_address : true;
    const decimals = Number(item.token_info?.decimals ?? 6);
    const amountMatchesExpected = amountMatches(item.value ?? "0", payment.amount_crypto, decimals, 5_000n);
    return assetMatches && destinationMatches && amountMatchesExpected && isWithinPaymentWindow(item.block_timestamp, payment);
  });

  if (!tx) return null;

  return {
    txHash: tx.transaction_id,
    confirmations: tx.confirmed ? requiredConfirmations.TRC20 : 0,
    status: tx.confirmed ? "confirmed" : "pending"
  };
};

const monitorBinance = async (payment: PaymentRow): Promise<ProviderObservation | null> => {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) {
    return null;
  }

  const timestamp = Date.now();
  const query = new URLSearchParams({
    coin: payment.settlement_currency,
    startTime: String(Math.max(paymentCreatedAt(payment) - paymentTimeDriftMs, 0)),
    timestamp: String(timestamp)
  });
  const hash = crypto.createHmac("sha256", apiSecret).update(query.toString()).digest("hex");
  const response = await fetch(`${binanceBaseUrl}/sapi/v1/capital/deposit/hisrec?${query.toString()}&signature=${hash}`, {
    headers: {
      "X-MBX-APIKEY": apiKey
    }
  });
  if (!response.ok) {
    throw new Error(`Binance request failed: ${response.status}`);
  }

  const deposits = (await response.json()) as Array<{
    txId?: string;
    status?: number;
    coin?: string;
    address?: string;
    amount?: string;
    network?: string;
    insertTime?: number;
  }>;

  const match = deposits.find((item) => {
    const coinMatches = String(item.coin ?? "").toUpperCase() === payment.settlement_currency;
    const addressMatches = String(item.address ?? "") === payment.wallet_address;
    const amountMatchesExpected = amountMatches(item.amount, payment.amount_crypto, 8, 10_000n);
    const networkMatches =
      !item.network || normalizeNetwork(item.network) === normalizeNetwork(payment.network);
    const timeMatches = isWithinPaymentWindow(item.insertTime, payment);
    return coinMatches && addressMatches && amountMatchesExpected && networkMatches && timeMatches;
  });

  if (!match?.txId) return null;

  if (match.status === 1) {
    return {
      txHash: match.txId,
      confirmations: requiredConfirmations[payment.network] ?? requiredConfirmations.BTC,
      status: "confirmed"
    };
  }

  if (match.status === 0 || match.status === 6) {
    return {
      txHash: match.txId,
      confirmations: 0,
      status: "pending"
    };
  }

  return null;
};

export const observePayment = async (payment: PaymentRow): Promise<ProviderObservation | null> => {
  const route = payment.wallet_routes?.[payment.network];
  if (route?.provider === "binance") {
    return monitorBinance(payment);
  }

  switch (payment.network) {
    case "ERC20":
      return monitorEthereum(payment);
    case "TRC20":
      return monitorTron(payment);
    case "SOL":
      return monitorSolana(payment);
    default:
      return monitorBinance(payment);
  }
};
