// UI-pattern decision logic — extracted from ui-patterns.test.ts (see
// vitest.config.ts for why this split exists).
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export function createOptimisticBalanceManager(initialBalance: number) {
  let balance = initialBalance;
  let isPending = false;

  return {
    getBalance: () => balance,
    isPending: () => isPending,
    executeWithOptimism: async (
      amount: number,
      action: () => Promise<void>,
      options: { shouldFail?: boolean; realBalance?: number } = {}
    ) => {
      const prevBalance = balance;
      balance -= amount;
      isPending = true;
      try {
        if (options.shouldFail) throw new Error("TX failed");
        await action();
        // Sync real balance after confirm
        if (options.realBalance !== undefined) balance = options.realBalance;
        isPending = false;
      } catch (e) {
        balance = prevBalance; // rollback
        isPending = false;
        throw e;
      }
    },
  };
}

export function classifySolanaError(errorMessage: string): {
  userMessage: string;
  shouldRetry: boolean;
  severity: string;
} {
  // BUG FIX: "0x1" was matched with a plain .includes(), which also matches
  // as a substring of totally different, longer error codes like "0x1770"
  // (slippage) or "0x1786" — so any slippage/anchor-custom-error message
  // was silently misclassified as "insufficient balance" (shouldRetry:
  // false) instead of its own, more specific branch (shouldRetry: true).
  // Never caught because this whole test file failed to load at all (see
  // package.json — @solana/web3.js was never declared as a dependency), so
  // the test that exercises exactly this collision never actually ran.
  // Fixed with a word-boundary-aware match: "0x1" only matches when it is
  // NOT immediately followed by another hex digit.
  const isExactCode0x1 = /0x1(?![0-9a-fA-F])/.test(errorMessage);
  if (errorMessage.includes("0x1770") || errorMessage.includes("slippage")) {
    return { userMessage: "Price moved too much. Increase slippage tolerance or try again.", shouldRetry: true, severity: "warning" };
  }
  if (isExactCode0x1 || errorMessage.includes("insufficient lamports")) {
    return { userMessage: "Insufficient balance for this transaction", shouldRetry: false, severity: "error" };
  }
  if (errorMessage.includes("blockhash not found") || errorMessage.includes("Blockhash not found")) {
    return { userMessage: "Transaction expired. Please try again.", shouldRetry: true, severity: "warning" };
  }
  if (errorMessage.includes("User rejected") || errorMessage.includes("Transaction cancelled")) {
    return { userMessage: "Transaction cancelled", shouldRetry: false, severity: "info" };
  }
  if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
    return { userMessage: "Too many requests. Please wait a moment.", shouldRetry: true, severity: "warning" };
  }
  return { userMessage: "Transaction failed. Please try again.", shouldRetry: true, severity: "error" };
}

// Priority fee calculator (from skill/ui-patterns.md)
export function calculatePriorityFee(
  congestionLevel: "low" | "medium" | "high" | "critical",
  baseMicroLamports = 1_000
): { microLamports: number; estimatedCostSOL: number; label: string } {
  const multipliers = { low: 1, medium: 5, high: 25, critical: 100 };
  const microLamports = baseMicroLamports * multipliers[congestionLevel];
  // 200K CU default × microLamports / 1_000_000 = lamports
  const estimatedCostSOL = (200_000 * microLamports) / 1_000_000 / LAMPORTS_PER_SOL;
  const labels = {
    low: "Economy — may be slow",
    medium: "Standard — typical speed",
    high: "Fast — priority processing",
    critical: "Turbo — immediate inclusion",
  };
  return { microLamports, estimatedCostSOL, label: labels[congestionLevel] };
}

// BUG FIX: the `bps > 1000` rejection branch previously sat AFTER the
// `bps > 500` warning branch. Since bps > 1000 always implies bps > 500,
// the reject-branch was unreachable dead code — validateSlippage(1500)
// returned { valid: true, warning: "High slippage..." } instead of
// { valid: false }, silently letting a >10% slippage value (a near-certain
// UI bug or sandwich-attack indicator) through as "valid". This was never
// caught because the whole test file failed to even load (missing
// @solana/web3.js dependency — see package.json) on every CI run, so the
// assertion that should have caught it never executed.
export function validateSlippage(bps: number): { valid: boolean; warning?: string } {
  if (!Number.isFinite(bps) || bps < 0) return { valid: false };
  if (bps === 0) return { valid: false }; // zero slippage always fails on-chain
  if (bps > 1000) return { valid: false }; // > 10% = reject — must be checked before the 500 warning branch
  if (bps < 10) return { valid: true, warning: "Very tight slippage — transaction likely to fail" };
  if (bps > 500) return { valid: true, warning: "High slippage — you may receive significantly less" };
  return { valid: true };
}

export type TxStatus = "pending" | "signing" | "submitted" | "confirmed" | "failed";
export interface TxQueueItem { id: string; status: TxStatus; description: string }

export function createTxQueue(items: TxQueueItem[]) {
  const queue = [...items];
  return {
    getAll: () => queue,
    getActive: () => queue.find((t) => t.status === "signing" || t.status === "submitted"),
    getPending: () => queue.filter((t) => t.status === "pending"),
    getCompleted: () => queue.filter((t) => t.status === "confirmed"),
    getFailed: () => queue.filter((t) => t.status === "failed"),
    advance: (id: string, status: TxStatus) => {
      const item = queue.find((t) => t.id === id);
      if (item) item.status = status;
    },
    canProceed: () => !queue.some((t) => t.status === "failed"),
    progressPct: () => {
      const done = queue.filter((t) => t.status === "confirmed").length;
      return (done / queue.length) * 100;
    },
  };
}
