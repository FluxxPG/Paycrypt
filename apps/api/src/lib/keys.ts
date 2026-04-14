import { nanoid } from "nanoid";

export const createApiKeyPair = () => {
  const publicKey = `pk_live_${nanoid(24)}`;
  const secretKey = `sk_live_${nanoid(36)}`;
  return { publicKey, secretKey };
};

export const createPaymentReference = () => `pay_${nanoid(18)}`;
export const createPaymentLinkReference = () => `plink_${nanoid(18)}`;
export const createWalletAddress = (network: string) =>
  `${network.toLowerCase()}_${nanoid(28)}`;
