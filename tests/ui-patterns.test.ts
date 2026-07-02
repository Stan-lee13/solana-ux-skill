import { describe, it, expect } from "vitest";
import {
  createOptimisticBalanceManager,
  classifySolanaError,
  calculatePriorityFee,
  validateSlippage,
  createTxQueue,
} from "./ui-patterns";

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
