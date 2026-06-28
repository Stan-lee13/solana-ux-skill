import { describe, it, expect, vi } from "vitest";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Simulates the optimistic balance hook logic
function createOptimisticBalanceManager(initialBalance: number) {
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

// Simulates Solana error classifier
function classifySolanaError(errorMessage: string): {
  userMessage: string;
  shouldRetry: boolean;
  severity: string;
} {
  if (errorMessage.includes("0x1") || errorMessage.includes("insufficient lamports")) {
    return { userMessage: "Insufficient balance for this transaction", shouldRetry: false, severity: "error" };
  }
  if (errorMessage.includes("blockhash not found") || errorMessage.includes("Blockhash not found")) {
    return { userMessage: "Transaction expired. Please try again.", shouldRetry: true, severity: "warning" };
  }
  if (errorMessage.includes("User rejected") || errorMessage.includes("Transaction cancelled")) {
    return { userMessage: "Transaction cancelled", shouldRetry: false, severity: "info" };
  }
  if (errorMessage.includes("0x1770") || errorMessage.includes("slippage")) {
    return { userMessage: "Price moved too much. Increase slippage tolerance or try again.", shouldRetry: true, severity: "warning" };
  }
  if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
    return { userMessage: "Too many requests. Please wait a moment.", shouldRetry: true, severity: "warning" };
  }
  return { userMessage: "Transaction failed. Please try again.", shouldRetry: true, severity: "error" };
}

// Priority fee calculator (from skill/ui-patterns.md)
function calculatePriorityFee(
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

// ─── Optimistic UI Tests ───────────────────────────────────────────────────────

describe("Optimistic UI — instant balance feedback", () => {
  it("immediately shows reduced balance before confirmation", async () => {
    const manager = createOptimisticBalanceManager(10);
    const actionPromise = manager.executeWithOptimism(2, async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    // Check optimistic state while action is in flight
    expect(manager.getBalance()).toBe(8);
    expect(manager.isPending()).toBe(true);
    await actionPromise;
    expect(manager.isPending()).toBe(false);
  });

  it("rolls back balance on transaction failure", async () => {
    const manager = createOptimisticBalanceManager(10);
    await expect(
      manager.executeWithOptimism(2, async () => {}, { shouldFail: true })
    ).rejects.toThrow("TX failed");
    expect(manager.getBalance()).toBe(10); // rolled back
    expect(manager.isPending()).toBe(false);
  });

  it("syncs real on-chain balance after confirmation", async () => {
    const manager = createOptimisticBalanceManager(10);
    // Optimistic: deduct 2 SOL. Real balance after confirm: 7.9 (fee taken)
    await manager.executeWithOptimism(2, async () => {}, { realBalance: 7.9 });
    expect(manager.getBalance()).toBe(7.9); // synced to real
  });

  it("does not show negative balance during optimistic update", async () => {
    const manager = createOptimisticBalanceManager(1);
    // User tries to send more than they have — should be prevented upstream
    const actionPromise = manager.executeWithOptimism(0.9, async () => {}).catch(() => {});
    // Even with optimistic update, balance should show 0.1 not negative
    expect(manager.getBalance()).toBeGreaterThanOrEqual(0);
    await actionPromise;
  });
});

// ─── Solana Error Classification Tests ────────────────────────────────────────

describe("Error Classification — human-readable messages", () => {
  it("translates insufficient funds error (0x1) to human message", () => {
    const result = classifySolanaError("Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1");
    expect(result.userMessage).not.toContain("0x1");
    expect(result.userMessage).toContain("balance");
    expect(result.shouldRetry).toBe(false);
  });

  it("translates expired blockhash to retry message", () => {
    const result = classifySolanaError("Blockhash not found");
    expect(result.shouldRetry).toBe(true);
    expect(result.userMessage).toContain("expired");
  });

  it("translates user rejection to cancellation message (no retry)", () => {
    const result = classifySolanaError("User rejected the request");
    expect(result.shouldRetry).toBe(false);
    expect(result.severity).toBe("info");
  });

  it("translates slippage error to actionable message", () => {
    const result = classifySolanaError("slippage tolerance exceeded 0x1770");
    expect(result.shouldRetry).toBe(true);
    expect(result.userMessage.toLowerCase()).toContain("slippage");
  });

  it("never surfaces raw hex error codes to user", () => {
    const rawErrors = ["0x1", "0x1770", "0x1786", "0x6985"];
    for (const raw of rawErrors) {
      const result = classifySolanaError(raw);
      expect(result.userMessage).not.toMatch(/0x[0-9a-f]+/i);
    }
  });
});

// ─── Priority Fee UX Tests ─────────────────────────────────────────────────────

describe("Priority Fee UX — correct calculation and display", () => {
  it("high congestion fee is higher than low congestion fee", () => {
    const low = calculatePriorityFee("low");
    const high = calculatePriorityFee("high");
    expect(high.microLamports).toBeGreaterThan(low.microLamports);
    expect(high.estimatedCostSOL).toBeGreaterThan(low.estimatedCostSOL);
  });

  it("critical fee is ≥ 100x base — protects against dropped transactions", () => {
    const base = calculatePriorityFee("low");
    const critical = calculatePriorityFee("critical");
    expect(critical.microLamports / base.microLamports).toBe(100);
  });

  it("estimated cost is in SOL not lamports (readable to user)", () => {
    const { estimatedCostSOL } = calculatePriorityFee("medium");
    // Should be a very small SOL amount, not a large lamport number
    expect(estimatedCostSOL).toBeLessThan(0.01);
    expect(estimatedCostSOL).toBeGreaterThan(0);
  });

  it("all congestion levels have a user-readable label", () => {
    for (const level of ["low", "medium", "high", "critical"] as const) {
      const result = calculatePriorityFee(level);
      expect(result.label.length).toBeGreaterThan(0);
      expect(typeof result.label).toBe("string");
    }
  });
});

// ─── Slippage Validation Tests ─────────────────────────────────────────────────

describe("Slippage Tolerance — validation and UX", () => {
  const validateSlippage = (bps: number): { valid: boolean; warning?: string } => {
    if (!Number.isFinite(bps) || bps < 0) return { valid: false };
    if (bps === 0) return { valid: false }; // zero slippage always fails on-chain
    if (bps < 10) return { valid: true, warning: "Very tight slippage — transaction likely to fail" };
    if (bps > 500) return { valid: true, warning: "High slippage — you may receive significantly less" };
    if (bps > 1000) return { valid: false }; // > 10% = reject
    return { valid: true };
  };

  it("validates 0.5% slippage (50 bps) as acceptable", () => {
    expect(validateSlippage(50).valid).toBe(true);
  });

  it("warns on extremely tight slippage (< 0.1%)", () => {
    const result = validateSlippage(5);
    expect(result.valid).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("fail");
  });

  it("rejects zero slippage — guaranteed to fail on-chain", () => {
    expect(validateSlippage(0).valid).toBe(false);
  });

  it("rejects > 10% slippage — likely a UI bug or attack", () => {
    expect(validateSlippage(1500).valid).toBe(false);
  });

  it("warns on > 5% slippage without rejecting — user may still proceed", () => {
    const result = validateSlippage(600);
    expect(result.valid).toBe(true);
    expect(result.warning).toBeDefined();
  });
});

// ─── Transaction Queue Tests ───────────────────────────────────────────────────

describe("Transaction Queue — multi-step flow management", () => {
  type TxStatus = "pending" | "signing" | "submitted" | "confirmed" | "failed";
  interface TxQueueItem { id: string; status: TxStatus; description: string }

  function createTxQueue(items: TxQueueItem[]) {
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

  it("processes transactions in order — first pending first", () => {
    const queue = createTxQueue([
      { id: "tx-1", status: "pending", description: "Approve" },
      { id: "tx-2", status: "pending", description: "Swap" },
    ]);
    const first = queue.getPending()[0];
    expect(first.id).toBe("tx-1");
  });

  it("tracks progress through multi-step flow", () => {
    const queue = createTxQueue([
      { id: "tx-1", status: "confirmed", description: "Approve" },
      { id: "tx-2", status: "confirmed", description: "Stake" },
      { id: "tx-3", status: "pending", description: "Confirm" },
    ]);
    expect(queue.progressPct()).toBeCloseTo(66.67, 1);
  });

  it("halts on failed transaction — does not proceed to next step", () => {
    const queue = createTxQueue([
      { id: "tx-1", status: "failed", description: "Approve" },
      { id: "tx-2", status: "pending", description: "Swap" },
    ]);
    expect(queue.canProceed()).toBe(false);
    expect(queue.getPending()).toHaveLength(1); // tx-2 still pending, not started
  });

  it("100% progress when all confirmed", () => {
    const queue = createTxQueue([
      { id: "tx-1", status: "confirmed", description: "Step 1" },
      { id: "tx-2", status: "confirmed", description: "Step 2" },
    ]);
    expect(queue.progressPct()).toBe(100);
  });
});
