// Blinks/Actions helper logic — extracted from blinks-actions.test.ts (see
// vitest.config.ts for why this split exists).
import { PublicKey, Transaction, SystemProgram } from "@solana/web3.js";

export const ACTIONS_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function buildTransferTransaction(
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  lamports: number,
  recentBlockhash: string
): Transaction {
  const tx = new Transaction();
  tx.add(SystemProgram.transfer({ fromPubkey, toPubkey, lamports }));
  tx.recentBlockhash = recentBlockhash;
  tx.feePayer = fromPubkey;
  return tx;
}

export function buildActionGetResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    icon: "https://example.com/icon.png",
    title: "Stake SOL",
    description: "Stake your SOL to earn rewards",
    label: "Stake Now",
    links: {
      actions: [
        { label: "Stake 1 SOL", href: "/api/actions/stake?amount=1" },
        { label: "Stake 5 SOL", href: "/api/actions/stake?amount=5" },
        { label: "Custom Amount", href: "/api/actions/stake?amount={amount}", parameters: [
          { name: "amount", label: "Amount (SOL)", type: "number" }
        ]},
      ],
    },
    ...overrides,
  };
}

export function validateAmount(amount: number): number {
  if (!Number.isFinite(amount)) throw new Error("Amount must be a finite number");
  if (amount <= 0) throw new Error("Amount must be positive");
  if (amount > 1_000_000) throw new Error("Amount exceeds maximum");
  return amount;
}
