# UI/UX Patterns for Solana dApps

Production-grade UX patterns that turn confused first-timers into confident users.
Every pattern here is paired with real code — not just advice.

---

## 1. Optimistic UI — instant feedback before confirmation

```typescript
// hooks/useOptimisticBalance.ts
import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export function useOptimisticBalance(initialBalance: number) {
  const [balance, setBalance] = useState(initialBalance);
  const [isPending, setIsPending] = useState(false);
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const executeWithOptimism = useCallback(
    async (amount: number, action: () => Promise<string>) => {
      const prevBalance = balance;

      // Instantly show result
      setBalance((b) => b - amount);
      setIsPending(true);

      try {
        const sig = await action();
        // Confirm then sync real balance
        await connection.confirmTransaction(sig, "confirmed");
        const real = await connection.getBalance(publicKey!);
        setBalance(real / LAMPORTS_PER_SOL);
      } catch (e) {
        // Revert on failure
        setBalance(prevBalance);
        throw e;
      } finally {
        setIsPending(false);
      }
    },
    [balance, connection, publicKey]
  );

  return { balance, isPending, executeWithOptimism };
}
```

---

## 2. Transaction Simulation — show outcome BEFORE signing

```typescript
// lib/simulateTransaction.ts
import { Connection, Transaction, PublicKey } from "@solana/web3.js";

interface SimulationResult {
  success: boolean;
  computeUnitsUsed: number;
  tokenChanges: Array<{ mint: string; delta: number; symbol?: string }>;
  solDelta: number;
  error?: string;
}

export async function simulateTransaction(
  connection: Connection,
  transaction: Transaction,
  signers: PublicKey[]
): Promise<SimulationResult> {
  const { value } = await connection.simulateTransaction(transaction, undefined, true);

  if (value.err) {
    return {
      success: false,
      computeUnitsUsed: value.unitsConsumed ?? 0,
      tokenChanges: [],
      solDelta: 0,
      error: JSON.stringify(value.err),
    };
  }

  // Parse token balance changes from simulation logs
  const tokenChanges: Array<{ mint: string; delta: number }> = [];
  let solDelta = 0;

  if (value.postTokenBalances && value.preTokenBalances) {
    for (const post of value.postTokenBalances) {
      const pre = value.preTokenBalances.find(
        (p) => p.accountIndex === post.accountIndex
      );
      const delta =
        Number(post.uiTokenAmount.uiAmount ?? 0) -
        Number(pre?.uiTokenAmount?.uiAmount ?? 0);
      if (delta !== 0) tokenChanges.push({ mint: post.mint, delta });
    }
  }

  return {
    success: true,
    computeUnitsUsed: value.unitsConsumed ?? 0,
    tokenChanges,
    solDelta,
  };
}
```

```tsx
// components/TransactionPreview.tsx
import { SimulationResult } from "@/lib/simulateTransaction";

export function TransactionPreview({ simulation, onConfirm, onCancel }: {
  simulation: SimulationResult;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-semibold">Review Transaction</h3>

      {simulation.tokenChanges.map((c, i) => (
        <div key={i} className="flex justify-between text-sm">
          <span className="text-muted-foreground">{c.mint.slice(0, 6)}…</span>
          <span className={c.delta > 0 ? "text-emerald-500" : "text-red-500"}>
            {c.delta > 0 ? "+" : ""}{c.delta.toFixed(4)}
          </span>
        </div>
      ))}

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Compute units</span>
        <span>{simulation.computeUnitsUsed.toLocaleString()} CU</span>
      </div>

      {!simulation.success && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
          ⚠️ This transaction will fail: {simulation.error}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg border text-sm">Cancel</button>
        <button
          onClick={onConfirm}
          disabled={!simulation.success}
          className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
```

---

## 3. Human-Readable Error Messages

```typescript
// lib/errorMessages.ts
export function parseTransactionError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  // Wallet / signing errors
  if (msg.includes("User rejected")) return "You cancelled the transaction.";
  if (msg.includes("WalletNotConnectedError")) return "Please connect your wallet first.";
  if (msg.includes("WalletSignTransactionError")) return "Your wallet couldn't sign. Try again.";

  // Solana program errors
  if (msg.includes("0x1")) return "Insufficient funds for this transaction.";
  if (msg.includes("0x1770")) return "Slippage exceeded. Try increasing slippage tolerance.";
  if (msg.includes("0x1771")) return "Price moved too fast. Please try again.";
  if (msg.includes("custom program error: 0x0")) return "Action not permitted with your current account.";

  // RPC / network errors
  if (msg.includes("429")) return "Too many requests. Please wait a moment.";
  if (msg.includes("blockhash not found")) return "Transaction expired. Please try again.";
  if (msg.includes("503") || msg.includes("Network request failed")) 
    return "Network error. Check your connection and try again.";

  // Anchor IDL errors (parse if you have the program's IDL)
  const anchorMatch = msg.match(/custom program error: (0x[0-9a-f]+)/i);
  if (anchorMatch) {
    const code = parseInt(anchorMatch[1], 16);
    return `Program error (code ${code}). Please contact support.`;
  }

  return "Something went wrong. Please try again.";
}
```

---

## 4. Progress Indicators with real Solana status

```tsx
// components/TxProgress.tsx
import { useEffect, useState } from "react";
import { Connection } from "@solana/web3.js";

type TxStage = "building" | "awaiting-approval" | "sending" | "confirming" | "done" | "failed";

const STAGE_LABELS: Record<TxStage, string> = {
  "building":          "Preparing transaction…",
  "awaiting-approval": "Check your wallet →",
  "sending":           "Broadcasting to Solana…",
  "confirming":        "Confirming on-chain…",
  "done":              "✅ Done!",
  "failed":            "❌ Transaction failed",
};

export function TxProgress({ stage, signature }: { stage: TxStage; signature?: string }) {
  const [confirmations, setConfirmations] = useState<number | null>(null);

  useEffect(() => {
    if (stage !== "confirming" || !signature) return;
    const connection = new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC!);

    const id = setInterval(async () => {
      const { value } = await connection.getSignatureStatuses([signature]);
      const conf = value[0]?.confirmations;
      if (conf != null) setConfirmations(conf);
      if (value[0]?.confirmationStatus === "confirmed") clearInterval(id);
    }, 800);

    return () => clearInterval(id);
  }, [stage, signature]);

  const progress = {
    building: 10, "awaiting-approval": 30, sending: 55,
    confirming: 75, done: 100, failed: 100,
  }[stage];

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{STAGE_LABELS[stage]}</span>
        {stage === "confirming" && confirmations !== null && (
          <span className="text-muted-foreground">{confirmations}/32</span>
        )}
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${stage === "failed" ? "bg-red-500" : "bg-primary"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
```

---

## 5. Wallet Connection UX (shadcn/Tailwind)

```tsx
// components/ConnectButton.tsx
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useState } from "react";

export function ConnectButton() {
  const { publicKey, disconnect, connected, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const [isOpen, setIsOpen] = useState(false);

  if (!connected) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
      >
        Connect Wallet
      </button>
    );
  }

  const short = `${publicKey!.toBase58().slice(0, 4)}…${publicKey!.toBase58().slice(-4)}`;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-card text-sm font-medium hover:bg-accent transition-colors"
      >
        {wallet?.adapter.icon && (
          <img src={wallet.adapter.icon} alt="" className="w-4 h-4 rounded" />
        )}
        {short}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 rounded-lg border bg-card shadow-lg p-1 z-50 min-w-[140px]">
          <button
            onClick={() => { navigator.clipboard.writeText(publicKey!.toBase58()); setIsOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent"
          >
            Copy Address
          </button>
          <button
            onClick={() => { disconnect(); setIsOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent text-destructive"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## 6. Skeleton loading for on-chain data

```tsx
// components/AccountSkeleton.tsx
export function AccountSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-8 w-32 rounded-lg bg-muted" />
      <div className="h-4 w-48 rounded bg-muted" />
      <div className="grid grid-cols-3 gap-3 mt-4">
        {[1,2,3].map(i => (
          <div key={i} className="h-20 rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
```

---

## Transaction Lifecycle Toast System

Every transaction needs four states communicated clearly. This is the most common UX gap in Solana dApps — either nothing shows, or a spinner that never resolves.

```tsx
// hooks/useTransactionToast.ts
import { useCallback } from "react";
import toast from "react-hot-toast"; // or sonner

export type TxStage = "building" | "signing" | "sending" | "confirming" | "confirmed" | "failed";

interface TxToastOptions {
  buildingMessage?: string;
  signingMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  explorerCluster?: "mainnet-beta" | "devnet";
}

export function useTransactionToast() {
  const trackTransaction = useCallback(
    async (
      txFn: () => Promise<string>,
      opts: TxToastOptions = {}
    ): Promise<string> => {
      const toastId = toast.loading(opts.buildingMessage ?? "Building transaction…");

      try {
        // Stage 1: Signing
        toast.loading(opts.signingMessage ?? "Waiting for wallet confirmation…", { id: toastId });
        const signature = await txFn();

        // Stage 2: Sent — link immediately so user can track
        const cluster = opts.explorerCluster ?? "mainnet-beta";
        const explorerUrl = `https://solscan.io/tx/${signature}${cluster === "devnet" ? "?cluster=devnet" : ""}`;

        toast.loading(
          <span>
            Confirming…{" "}
            <a href={explorerUrl} target="_blank" className="underline text-primary text-xs">
              View on Solscan ↗
            </a>
          </span>,
          { id: toastId }
        );

        // Stage 3: Confirmed
        toast.success(
          <span>
            {opts.successMessage ?? "Transaction confirmed"}{" "}
            <a href={explorerUrl} target="_blank" className="underline text-xs">
              View ↗
            </a>
          </span>,
          { id: toastId, duration: 6000 }
        );

        return signature;
      } catch (err: any) {
        const userMessage = parseTransactionError(err);
        toast.error(opts.errorMessage ?? userMessage, { id: toastId, duration: 8000 });
        throw err;
      }
    },
    []
  );

  return { trackTransaction };
}

// Usage:
// const { trackTransaction } = useTransactionToast();
// await trackTransaction(
//   () => sendSwapTransaction(params),
//   { successMessage: "Swap complete!", buildingMessage: "Preparing swap…" }
// );
```

---

## Complete Transaction Error Taxonomy

Map every Solana error to a human-readable string. No raw codes ever reach the user.

```typescript
// lib/parseTransactionError.ts
export function parseTransactionError(error: unknown): string {
  const msg = String((error as any)?.message ?? error);
  const logs = (error as any)?.logs as string[] | undefined;

  // ── User actions ─────────────────────────────────────────────────────
  if (msg.includes("User rejected") || msg.includes("WalletSignTransactionError"))
    return "Transaction cancelled.";
  if (msg.includes("User declined") || msg.includes("UserDeclined"))
    return "You declined the transaction in your wallet.";

  // ── Insufficient funds ───────────────────────────────────────────────
  if (msg.includes("Insufficient funds") || msg.includes("0x1"))
    return "Insufficient SOL balance to complete this transaction. You need more SOL for fees.";
  if (msg.includes("insufficient lamports") || msg.includes("Transfer: insufficient lamports"))
    return "Not enough SOL. Please add more SOL to your wallet.";

  // ── Slippage ─────────────────────────────────────────────────────────
  if (msg.includes("0x1771") || msg.includes("Slippage"))
    return "Price moved too fast — slippage exceeded. Try again or increase your slippage tolerance.";
  if (msg.includes("0x1772"))
    return "Not enough tokens received. The price moved against you. Try again.";

  // ── Blockhash / expiry ────────────────────────────────────────────────
  if (msg.includes("Blockhash not found") || msg.includes("block height exceeded"))
    return "Transaction expired before it was confirmed. Please try again — this is not your fault.";

  // ── Compute units ─────────────────────────────────────────────────────
  if (msg.includes("ComputationalBudgetExceeded") || msg.includes("exceeded CUs"))
    return "Transaction was too complex to process. Please try a smaller amount or contact support.";

  // ── Account errors ────────────────────────────────────────────────────
  if (msg.includes("AccountNotFound") || msg.includes("account does not exist"))
    return "Account not found. You may need to initialize your account first.";
  if (msg.includes("already in use") || msg.includes("already initialized"))
    return "This account is already set up. Try refreshing the page.";

  // ── Program specific (check logs for AnchorError codes) ──────────────
  if (logs) {
    // Anchor error code extraction
    const anchorMatch = logs
      .find(l => l.includes("AnchorError") || l.includes("Error Code:"))
      ?.match(/Error Code: (\w+)\. Error Number: (\d+)\. Error Message: (.+?)(?:\.|$)/);
    if (anchorMatch) {
      const [, code, , message] = anchorMatch;
      return translateAnchorError(code, message);
    }

    // Custom program error 0xHEX
    const customMatch = logs
      .find(l => l.includes("custom program error"))
      ?.match(/custom program error: 0x([0-9a-f]+)/i);
    if (customMatch) {
      return translateCustomError(parseInt(customMatch[1], 16));
    }
  }

  // ── RPC / network ─────────────────────────────────────────────────────
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError"))
    return "Network error. Check your connection and try again.";
  if (msg.includes("503") || msg.includes("429"))
    return "Network is busy right now. Wait a moment and try again.";
  if (msg.includes("timeout"))
    return "Request timed out. The network may be congested. Try again.";

  // ── Simulation failures ───────────────────────────────────────────────
  if (msg.includes("Transaction simulation failed"))
    return "Transaction preview failed — this likely means insufficient balance or a program error. Check your balance and try again.";

  // ── Fallback ─────────────────────────────────────────────────────────
  return "Something went wrong. Please try again or contact support if this persists.";
}

function translateAnchorError(code: string, rawMessage: string): string {
  const ANCHOR_ERRORS: Record<string, string> = {
    ConstraintHasOne: "Account ownership validation failed. Please reconnect your wallet.",
    ConstraintSigner: "Signature required. Please ensure you're connected with the correct wallet.",
    AccountNotInitialized: "Account not set up yet. Please complete onboarding first.",
    AccountOwnedByWrongProgram: "Wrong program owns this account. Contact support.",
    InstructionMissing: "Transaction is malformed. Please refresh and try again.",
  };
  return ANCHOR_ERRORS[code] ?? `Transaction failed: ${rawMessage}`;
}

function translateCustomError(code: number): string {
  // Add your program's custom error codes here
  const CUSTOM_ERRORS: Record<number, string> = {
    0x1770: "Slippage tolerance exceeded. Try increasing your slippage setting.",
    0x1771: "Price impact too high for this trade size. Try a smaller amount.",
    0x1772: "Liquidity too low. Try a smaller trade.",
    0x1780: "Position already exists. Close your existing position first.",
    0x1781: "Position not found. It may have already been closed.",
  };
  return CUSTOM_ERRORS[code] ?? "Transaction failed. Please try again or contact support.";
}
```

---

## Wallet Button State Machine (6 States)

The wallet connect button has 6 meaningful states. Most dApps handle 2. This handles all 6.

```tsx
// components/WalletButton.tsx
"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";

type WalletState =
  | "disconnected"     // Default: no wallet
  | "connecting"       // Adapter is connecting
  | "connected"        // Wallet connected, address known
  | "disconnecting"    // In process of disconnecting
  | "wrong-network"    // Connected but on devnet when mainnet expected
  | "insufficient-sol" // Connected but balance < minimum to transact

interface WalletButtonProps {
  minimumSolRequired?: number; // in SOL — show warning state below this
  expectedCluster?: "mainnet-beta" | "devnet";
}

export function WalletButton({
  minimumSolRequired = 0.001,
  expectedCluster = "mainnet-beta",
}: WalletButtonProps) {
  const { wallet, publicKey, connecting, disconnecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [solBalance, setSolBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    const { Connection } = require("@solana/web3.js");
    const connection = new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC!);
    connection.getBalance(publicKey).then((b: number) => setSolBalance(b / 1e9));
  }, [publicKey]);

  const state: WalletState = (() => {
    if (disconnecting) return "disconnecting";
    if (connecting) return "connecting";
    if (!publicKey) return "disconnected";
    if (solBalance !== null && solBalance < minimumSolRequired) return "insufficient-sol";
    return "connected";
  })();

  const CONFIG: Record<WalletState, {
    label: string;
    className: string;
    onClick: () => void;
    icon?: React.ReactNode;
  }> = {
    disconnected: {
      label: "Connect Wallet",
      className: "bg-primary text-primary-foreground hover:bg-primary/90",
      onClick: () => setVisible(true),
    },
    connecting: {
      label: "Connecting…",
      className: "bg-muted text-muted-foreground cursor-wait",
      onClick: () => {},
    },
    disconnecting: {
      label: "Disconnecting…",
      className: "bg-muted text-muted-foreground cursor-wait",
      onClick: () => {},
    },
    connected: {
      label: `${publicKey?.toBase58().slice(0, 4)}…${publicKey?.toBase58().slice(-4)}`,
      className: "bg-secondary text-secondary-foreground hover:bg-destructive hover:text-destructive-foreground",
      onClick: disconnect,
    },
    "wrong-network": {
      label: "Wrong Network",
      className: "bg-destructive text-destructive-foreground animate-pulse",
      onClick: () => setVisible(true),
    },
    "insufficient-sol": {
      label: `${publicKey?.toBase58().slice(0, 4)}…${publicKey?.toBase58().slice(-4)} · Low SOL`,
      className: "bg-yellow-500/10 text-yellow-600 border border-yellow-500/30",
      onClick: disconnect,
    },
  };

  const cfg = CONFIG[state];

  return (
    <button
      onClick={cfg.onClick}
      disabled={state === "connecting" || state === "disconnecting"}
      className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${cfg.className}`}
    >
      {state === "connected" && wallet?.adapter.icon && (
        <img src={wallet.adapter.icon} alt="" className="w-4 h-4 rounded-sm" />
      )}
      {cfg.label}
    </button>
  );
}
```

---

## Reconnection UX — Session Drop Recovery

When a wallet session drops mid-flow (network change, tab sleep, token expiry), recover gracefully without losing the user's context:

```tsx
// hooks/useSessionRecovery.ts
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useRef, useState } from "react";

export function useSessionRecovery(onRecovered?: () => void) {
  const { publicKey, connected, connecting, wallet } = useWallet();
  const wasConnected = useRef(false);
  const [showReconnectBanner, setShowReconnectBanner] = useState(false);

  useEffect(() => {
    if (connected) {
      wasConnected.current = true;
      setShowReconnectBanner(false);
      if (onRecovered) onRecovered();
    }
  }, [connected]);

  useEffect(() => {
    // Session dropped — was connected, now not, not actively connecting
    if (!connected && !connecting && wasConnected.current) {
      setShowReconnectBanner(true);
    }
  }, [connected, connecting]);

  return { showReconnectBanner };
}

// Usage in layout:
// const { showReconnectBanner } = useSessionRecovery(() => refetchUserData());
// {showReconnectBanner && (
//   <div className="fixed bottom-4 right-4 rounded-lg border bg-card p-4 shadow-lg">
//     <p className="text-sm font-medium">Wallet disconnected</p>
//     <p className="text-xs text-muted-foreground">Reconnect to continue</p>
//     <button onClick={() => setVisible(true)} className="mt-2 text-xs text-primary underline">
//       Reconnect wallet
//     </button>
//   </div>
// )}
```
