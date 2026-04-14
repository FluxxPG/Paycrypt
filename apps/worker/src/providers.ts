import crypto from "node:crypto";

type PaymentRow = {
  id: string;
  merchant_id: string;
  settlement_currency: string;
  network: string;
  wallet_address: string;
  wallet_routes: Record<string, { asset: string; network: string; address: string }>;
  status: string;
};

type ProviderObservation = {
  txHash: string;
  confirmations: number;
  status: "pending" | "confirmed";
};

const binanceBaseUrl = process.env.BINANCE_BASE_URL ?? "https://api.binance.com";
const tronBaseUrl = process.env.TRONGRID_BASE_URL ?? "https://api.trongrid.io";
const ethereumRpcUrl = process.env.ETHEREUM_RPC_URL ?? "https://rpc.ankr.com/eth";
const solanaRpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

const erc20UsdtContract = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a6fca4d6b3";
const confirmationThresholds: Record<string, number> = {
  BTC: 2,
  ERC20: 12,
  TRC20: 20,
  SOL: 32
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

const monitorEthereum = async (payment: PaymentRow): Promise<ProviderObservation | null> => {
  const topicAddress = `0x${payment.wallet_address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
  const logs = await jsonRpc<Array<{ transactionHash: string; blockNumber: string }>>(ethereumRpcUrl, "eth_getLogs", [
    {
      fromBlock: "0x0",
      toBlock: "latest",
      address: erc20UsdtContract,
      topics: [transferTopic, null, topicAddress]
    }
  ]);
  const latestLog = logs.at(-1);
  if (!latestLog) {
    return null;
  }

  const latestBlockHex = await jsonRpc<string>(ethereumRpcUrl, "eth_blockNumber");
  const latestBlock = BigInt(latestBlockHex);
  const blockNumber = BigInt(latestLog.blockNumber);
  const confirmations = Number(latestBlock - blockNumber + 1n);

  return {
    txHash: latestLog.transactionHash,
    confirmations,
    status: confirmations >= confirmationThresholds.ERC20 ? "confirmed" : "pending"
  };
};

const monitorSolana = async (payment: PaymentRow): Promise<ProviderObservation | null> => {
  const signatures = await jsonRpc<
    Array<{ signature: string; confirmations: number | null; confirmationStatus?: "processed" | "confirmed" | "finalized" }>
  >(solanaRpcUrl, "getSignaturesForAddress", [payment.wallet_address, { limit: 10 }]);
  const signature = signatures[0];
  if (!signature) return null;

  const statuses = await jsonRpc<{
    value: Array<{ confirmations: number | null; confirmationStatus?: "processed" | "confirmed" | "finalized" } | null>;
  }>(solanaRpcUrl, "getSignatureStatuses", [[signature.signature], { searchTransactionHistory: true }]);
  const status = statuses.value[0] ?? null;
  const confirmations = status?.confirmations ?? signature.confirmations ?? 0;
  const confirmationStatus = status?.confirmationStatus ?? signature.confirmationStatus;

  return {
    txHash: signature.signature,
    confirmations,
    status:
      confirmationStatus === "finalized" || confirmations >= confirmationThresholds.SOL
        ? "confirmed"
        : "pending"
  };
};

const monitorTron = async (payment: PaymentRow): Promise<ProviderObservation | null> => {
  const response = await fetch(
    `${tronBaseUrl}/v1/accounts/${payment.wallet_address}/transactions/trc20?only_confirmed=false&limit=10`
  );
  if (!response.ok) {
    throw new Error(`TronGrid request failed: ${response.status}`);
  }

  const payload = (await response.json()) as { data?: Array<{ transaction_id: string; confirmed?: boolean }> };
  const tx = payload.data?.[0];
  if (!tx) return null;

  return {
    txHash: tx.transaction_id,
    confirmations: tx.confirmed === false ? 0 : confirmationThresholds.TRC20,
    status: tx.confirmed === false ? "pending" : "confirmed"
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

  const deposits = (await response.json()) as Array<{ txId?: string; status?: number; coin?: string; amount?: string }>;
  const match = deposits.find((item) => String(item.coin ?? "") === payment.settlement_currency);
  if (!match?.txId) return null;

  const confirmed = match.status === 1 || match.status === 6 || match.status === undefined;
  return {
    txHash: match.txId,
    confirmations: confirmed ? confirmationThresholds.BTC : 0,
    status: confirmed ? "confirmed" : "pending"
  };
};

export const observePayment = async (payment: PaymentRow): Promise<ProviderObservation | null> => {
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
