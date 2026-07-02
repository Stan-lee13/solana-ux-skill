// Wallet UX decision logic — extracted from wallet-state.test.ts so it is a
// real importable module (see vitest.config.ts for why this split exists:
// vitest 3.x's v8 coverage provider excludes any file matched by
// `test.include` from ever being a coverage target, even if it's also self-
// tested in the same file).

export type WalletState =
  | "undetected"
  | "no-wallet"
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "session-expired"
  | "wrong-network";

export function deriveWalletState({
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

export function checkCanTransact(
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

export function assessSessionRecovery(
  lastActivityMs: number,
  sessionTimeoutMs: number,
  hasStoredToken: boolean
): "active" | "silent-recover" | "full-reconnect" {
  const elapsed = Date.now() - lastActivityMs;
  if (elapsed < sessionTimeoutMs) return "active";
  if (elapsed < sessionTimeoutMs * 2 && hasStoredToken) return "silent-recover";
  return "full-reconnect";
}

export function uiForState(state: WalletState): string {
  if (state === "session-expired") return "reconnect-prompt";
  if (state === "disconnected") return "connect-button";
  if (state === "connected") return "wallet-info";
  return "loading";
}

export const CLUSTER_GENESIS_HASHES: Record<string, string> = {
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  testnet: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
};

export const ALLOWED_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "11111111111111111111111111111111",
  "YourProtocolProgramIdHere11111111111111111111",
]);

export function validateGaslessTransaction(
  programIds: string[]
): { allowed: boolean; blockedPrograms: string[] } {
  const blocked = programIds.filter((p) => !ALLOWED_PROGRAMS.has(p));
  return { allowed: blocked.length === 0, blockedPrograms: blocked };
}
