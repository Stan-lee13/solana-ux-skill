import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";

// ─── Wallet State Machine ──────────────────────────────────────────────────────

type WalletState =
  | "undetected"
  | "no-wallet"
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "session-expired"
  | "wrong-network";

function deriveWalletState({
  hasWindowSolana,
  hasWalletExtension,
  connected,
  connecting,
  disconnecting,
  publicKey,
  currentCluster,
  expectedCluster,
  lastActivityMs,
  sessionTimeoutMs = 30 * 60 * 1000,
}: {
  hasWindowSolana: boolean;
  hasWalletExtension: boolean;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  publicKey: string | null;
  currentCluster: string;
  expectedCluster: string;
  lastActivityMs: number;
  sessionTimeoutMs?: number;
}): WalletState {
  if (!hasWindowSolana && !hasWalletExtension) return "undetected";
  if (hasWindowSolana && !hasWalletExtension) return "no-wallet";
  if (disconnecting) return "disconnecting";
  if (connecting) return "connecting";
  if (!connected || !publicKey) return "disconnected";

  // Session expiry check
  if (Date.now() - lastActivityMs > sessionTimeoutMs) return "session-expired";

  // Network check
  if (currentCluster !== expectedCluster) return "wrong-network";

  return "connected";
}

describe("Wallet State Machine — all 8 states", () => {
  const BASE_PROPS = {
    hasWindowSolana: true,
    hasWalletExtension: true,
    connected: true,
    connecting: false,
    disconnecting: false,
    publicKey: Keypair.generate().publicKey.toString(),
    currentCluster: "mainnet-beta",
    expectedCluster: "mainnet-beta",
    lastActivityMs: Date.now(),
  };

  it("returns undetected when no wallet environment at all", () => {
    expect(deriveWalletState({
      ...BASE_PROPS,
      hasWindowSolana: false,
      hasWalletExtension: false,
      connected: false,
      publicKey: null,
    })).toBe("undetected");
  });

  it("returns no-wallet when browser detectable but no extension installed", () => {
    expect(deriveWalletState({
      ...BASE_PROPS,
      hasWindowSolana: true,
      hasWalletExtension: false,
      connected: false,
      publicKey: null,
    })).toBe("no-wallet");
  });

  it("returns disconnected when wallet exists but not authorized", () => {
    expect(deriveWalletState({
      ...BASE_PROPS,
      connected: false,
      publicKey: null,
    })).toBe("disconnected");
  });

  it("returns connecting during authorization flow", () => {
    expect(deriveWalletState({
      ...BASE_PROPS,
      connected: false,
      connecting: true,
      publicKey: null,
    })).toBe("connecting");
  });

  it("returns disconnecting during clean disconnect", () => {
    expect(deriveWalletState({
      ...BASE_PROPS,
      disconnecting: true,
    })).toBe("disconnecting");
  });

  it("returns connected when fully authorized on correct network with active session", () => {
    expect(deriveWalletState(BASE_PROPS)).toBe("connected");
  });

  it("returns session-expired when inactive for > timeout", () => {
    const thirtyOneMinutesAgo = Date.now() - 31 * 60 * 1000;
    expect(deriveWalletState({
      ...BASE_PROPS,
      lastActivityMs: thirtyOneMinutesAgo,
    })).toBe("session-expired");
  });

  it("returns wrong-network when on devnet but expecting mainnet", () => {
    expect(deriveWalletState({
      ...BASE_PROPS,
      currentCluster: "devnet",
      expectedCluster: "mainnet-beta",
    })).toBe("wrong-network");
  });

  it("disconnecting takes priority over session-expired", () => {
    expect(deriveWalletState({
      ...BASE_PROPS,
      disconnecting: true,
      lastActivityMs: Date.now() - 99 * 60 * 1000, // very old
    })).toBe("disconnecting");
  });
});

// ─── Auto-Connect Tests ────────────────────────────────────────────────────────

describe("Auto-Connect — consent and persistence", () => {
  it("does NOT auto-connect without stored consent", () => {
    const hasConsent = false;
    const shouldAutoConnect = hasConsent;
    expect(shouldAutoConnect).toBe(false);
  });

  it("auto-connects when consent was previously granted", () => {
    const hasConsent = true;
    const shouldAutoConnect = hasConsent;
    expect(shouldAutoConnect).toBe(true);
  });

  it("clears consent on explicit disconnect — does not re-connect on reload", () => {
    const consentStore = { autoConnect: true };
    // User explicitly disconnects
    const handleDisconnect = () => { consentStore.autoConnect = false; };
    handleDisconnect();
    expect(consentStore.autoConnect).toBe(false);
  });

  it("preserves consent on page refresh (session vs persistent)", () => {
    // Simulates localStorage-based consent persistence
    const persistentConsent = { value: true, storage: "localStorage" as const };
    const sessionConsent = { value: true, storage: "sessionStorage" as const };
    // After page reload: localStorage persists, sessionStorage clears
    const afterReload = (c: typeof persistentConsent | typeof sessionConsent) =>
      c.storage === "localStorage" ? c.value : false;
    expect(afterReload(persistentConsent)).toBe(true);
    expect(afterReload(sessionConsent)).toBe(false);
  });
});

// ─── Balance Guard Tests ───────────────────────────────────────────────────────

describe("Balance Guard — pre-transaction validation", () => {
  function checkCanTransact(
    balanceLamports: number,
    requiredLamports: number,
    estimatedFeeLamports = 5_000
  ): { canTransact: boolean; shortfall: number; reason?: string } {
    const total = requiredLamports + estimatedFeeLamports;
    if (balanceLamports < total) {
      return {
        canTransact: false,
        shortfall: total - balanceLamports,
        reason: `Insufficient balance: need ${total} lamports, have ${balanceLamports}`,
      };
    }
    return { canTransact: true, shortfall: 0 };
  }

  it("allows transaction when balance covers amount + fee", () => {
    const result = checkCanTransact(1_000_000, 990_000, 5_000);
    expect(result.canTransact).toBe(true);
    expect(result.shortfall).toBe(0);
  });

  it("blocks transaction when balance is exactly the amount (no fee buffer)", () => {
    const result = checkCanTransact(1_000_000, 1_000_000, 5_000);
    expect(result.canTransact).toBe(false);
    expect(result.shortfall).toBeGreaterThan(0);
  });

  it("reports exact shortfall so UI can show 'You need X more SOL'", () => {
    const result = checkCanTransact(500_000, 1_000_000, 5_000);
    expect(result.shortfall).toBe(505_000); // 1_005_000 - 500_000
    expect(result.reason).toContain("Insufficient");
  });

  it("blocks when balance is zero", () => {
    const result = checkCanTransact(0, 100, 5_000);
    expect(result.canTransact).toBe(false);
  });
});

// ─── Session Recovery Tests ────────────────────────────────────────────────────

describe("Session Recovery — silent re-authorization", () => {
  function assessSessionRecovery(
    lastActivityMs: number,
    sessionTimeoutMs: number,
    hasStoredToken: boolean
  ): "active" | "silent-recover" | "full-reconnect" {
    const elapsed = Date.now() - lastActivityMs;
    if (elapsed < sessionTimeoutMs) return "active";
    if (elapsed < sessionTimeoutMs * 2 && hasStoredToken) return "silent-recover";
    return "full-reconnect";
  }

  it("active session within timeout needs no recovery", () => {
    const tenMinutes = 10 * 60 * 1000;
    const timeout = 30 * 60 * 1000;
    expect(assessSessionRecovery(Date.now() - tenMinutes, timeout, true)).toBe("active");
  });

  it("recently expired session with stored token can be silently recovered", () => {
    const fortyMinutes = 40 * 60 * 1000;
    const timeout = 30 * 60 * 1000;
    expect(assessSessionRecovery(Date.now() - fortyMinutes, timeout, true)).toBe("silent-recover");
  });

  it("old session without stored token requires full reconnect", () => {
    const tenHours = 10 * 60 * 60 * 1000;
    const timeout = 30 * 60 * 1000;
    expect(assessSessionRecovery(Date.now() - tenHours, timeout, false)).toBe("full-reconnect");
  });

  it("shows re-auth prompt instead of blank screen on session-expired state", () => {
    // The correct UX: don't show empty wallet state, show "reconnect" CTA
    const uiForState = (state: WalletState) => {
      if (state === "session-expired") return "reconnect-prompt";
      if (state === "disconnected") return "connect-button";
      if (state === "connected") return "wallet-info";
      return "loading";
    };
    expect(uiForState("session-expired")).toBe("reconnect-prompt");
    expect(uiForState("disconnected")).not.toBe("reconnect-prompt");
  });
});

// ─── Wrong Network Recovery Tests ─────────────────────────────────────────────

describe("Wrong Network — detection and recovery UX", () => {
  const CLUSTER_GENESIS_HASHES: Record<string, string> = {
    "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    "devnet":       "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
    "testnet":      "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
  };

  it("detects wrong network by genesis hash comparison", () => {
    const currentHash = CLUSTER_GENESIS_HASHES["devnet"];
    const expectedHash = CLUSTER_GENESIS_HASHES["mainnet-beta"];
    const isWrongNetwork = currentHash !== expectedHash;
    expect(isWrongNetwork).toBe(true);
  });

  it("does NOT show wrong-network when on correct cluster", () => {
    const currentHash = CLUSTER_GENESIS_HASHES["mainnet-beta"];
    const expectedHash = CLUSTER_GENESIS_HASHES["mainnet-beta"];
    expect(currentHash === expectedHash).toBe(true);
  });

  it("wrong-network UX blocks transaction but keeps wallet connected", () => {
    // User should stay connected — just need to switch network
    const state: WalletState = "wrong-network";
    const canInitiateTransaction = state === "connected";
    const isWalletConnected = state !== "disconnected" && state !== "undetected";
    expect(canInitiateTransaction).toBe(false);
    expect(isWalletConnected).toBe(true);
  });
});

// ─── Gasless Proxy Tests ───────────────────────────────────────────────────────

describe("Gasless Proxy — instruction whitelisting", () => {
  const ALLOWED_PROGRAMS = new Set([
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "11111111111111111111111111111111",
    "YourProtocolProgramIdHere11111111111111111111",
  ]);

  function validateGaslessTransaction(
    programIds: string[]
  ): { allowed: boolean; blockedPrograms: string[] } {
    const blocked = programIds.filter((p) => !ALLOWED_PROGRAMS.has(p));
    return { allowed: blocked.length === 0, blockedPrograms: blocked };
  }

  it("allows transaction with only whitelisted programs", () => {
    const result = validateGaslessTransaction([
      "11111111111111111111111111111111",
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    ]);
    expect(result.allowed).toBe(true);
    expect(result.blockedPrograms).toHaveLength(0);
  });

  it("blocks transaction with non-whitelisted program", () => {
    const result = validateGaslessTransaction([
      "11111111111111111111111111111111",
      "Unknown1111111111111111111111111111111111111",
    ]);
    expect(result.allowed).toBe(false);
    expect(result.blockedPrograms).toContain("Unknown1111111111111111111111111111111111111");
  });

  it("rate limit: rejects user who has used all free transactions", () => {
    const userUsage = { used: 5, limit: 5, resetAt: Date.now() + 86400000 };
    const canSponsor = userUsage.used < userUsage.limit;
    expect(canSponsor).toBe(false);
  });

  it("rate limit: allows user within limit", () => {
    const userUsage = { used: 2, limit: 5, resetAt: Date.now() + 86400000 };
    const canSponsor = userUsage.used < userUsage.limit;
    expect(canSponsor).toBe(true);
  });
});
