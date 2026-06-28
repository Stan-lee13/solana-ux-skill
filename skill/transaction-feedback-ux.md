# Transaction Feedback UX for Solana dApps

Transaction feedback is the highest-leverage UX layer in a Solana product.

Users can tolerate a wallet popup.

They cannot tolerate clicking a primary CTA and then wondering whether money moved.

This sub-skill covers how to design, implement, and verify transaction state feedback for production Solana dApps.

Use it when building:

- Transaction buttons.
- Toast systems.
- Confirmation flows.
- Swap, mint, claim, stake, pay, lend, borrow, or vote flows.
- Multi-step approve and execute patterns.
- Error translators.
- Retry and timeout UX.

## Core Principle

Every transaction has two state machines:

1. The technical state machine: build, sign, send, confirm.
2. The user confidence state machine: understand, approve, wait, recover, trust.

Good Solana UX keeps both visible.

Bad Solana UX hides the technical state until an error appears.

## The UX States

Use these states in the product:

```typescript
export type TransactionUxState =
  | "idle"
  | "building"
  | "simulating"
  | "ready"
  | "signing"
  | "sending"
  | "processed"
  | "confirming"
  | "confirmed"
  | "finalized"
  | "done"
  | "failed"
  | "expired"
  | "cancelled";
```

Use these labels:

```typescript
export const TX_STATE_COPY: Record<TransactionUxState, string> = {
  idle: "Ready",
  building: "Preparing transaction",
  simulating: "Checking transaction",
  ready: "Ready to sign",
  signing: "Approve in your wallet",
  sending: "Sending to Solana",
  processed: "Transaction received",
  confirming: "Confirming transaction",
  confirmed: "Transaction confirmed",
  finalized: "Finalized on-chain",
  done: "Done",
  failed: "Transaction failed",
  expired: "Transaction expired",
  cancelled: "Transaction cancelled",
};
```

## Commitment Stages From A UX Perspective

Solana commitment is not just an RPC option.

It is a product decision.

The user needs different copy at each stage.

## Stage 1: Sent

This is not a formal commitment stage.

It happens after `sendRawTransaction` returns a signature.

What it means:

- The RPC accepted the transaction.
- The transaction may or may not land.
- The user now has a signature that can be linked.

What to show:

- Toast: "Transaction sent".
- Secondary text: "Waiting for Solana confirmation".
- Explorer link: visible immediately.
- CTA state: disabled for duplicate submission.

Do not show:

- "Success".
- Final balance change without pending badge.
- Confetti or permanent completion state.

Code:

```typescript
setState({
  status: "sending",
  signature,
  message: "Transaction sent. Waiting for confirmation.",
});
```

## Stage 2: Processed

`processed` means a node processed the transaction in a recent block.

What it means:

- The transaction likely landed on a fork.
- It is fast feedback.
- It can still be rolled back.

What to show:

- "Received by Solana".
- Pending badge stays visible.
- Optimistic UI can appear for low-risk actions.
- Explorer link remains visible.

Use for:

- Fast acknowledgement.
- Optimistic UI.
- Low-value mints.
- In-app points or non-custodial UI state.

Do not use for:

- High-value swaps.
- Withdrawals.
- Settlement-sensitive balances.
- Legal or commerce receipts.

Code:

```typescript
await connection.confirmTransaction(
  { signature, blockhash, lastValidBlockHeight },
  "processed"
);
```

## Stage 3: Confirmed

`confirmed` is the default UX completion stage for most dApps.

What it means:

- The transaction has been voted on by the cluster.
- Reorg risk is low enough for normal product UX.
- The user can usually move on.

What to show:

- Success toast.
- Update balances from chain or indexer.
- Enable next action.
- Keep explorer link available.

Use for:

- Swaps.
- Mints.
- Claims.
- Staking.
- Game actions.
- Profile updates.
- Token transfers under normal consumer risk.

Code:

```typescript
await connection.confirmTransaction(
  { signature, blockhash, lastValidBlockHeight },
  "confirmed"
);
```

## Stage 4: Finalized

`finalized` means maximum finality.

What it means:

- The transaction is rooted.
- It is slower than `confirmed`.
- Waiting for it can harm conversion if not necessary.

What to show:

- Usually not a blocking UI.
- Optional background badge: "Finalized".
- Receipt state for high-value operations.

Use for:

- Large withdrawals.
- Governance execution.
- Off-ramp settlement.
- Cross-chain operations.
- Compliance or accounting receipts.

Do not block casual actions on finalized.

Pattern:

```typescript
await connection.confirmTransaction(
  { signature, blockhash, lastValidBlockHeight },
  "confirmed"
);

setState({ status: "done", signature });

void waitForFinalized(signature).then(() => {
  markReceiptFinalized(signature);
});
```

## Commitment Copy Table

```typescript
export const COMMITMENT_COPY = {
  processed: {
    label: "Received",
    body: "Solana received your transaction. Waiting for confirmation.",
    userCanLeave: false,
  },
  confirmed: {
    label: "Confirmed",
    body: "Your transaction is confirmed.",
    userCanLeave: true,
  },
  finalized: {
    label: "Finalized",
    body: "Your transaction is finalized on-chain.",
    userCanLeave: true,
  },
};
```

## Optimistic UI

Optimistic UI means showing the expected result before the chain confirms it.

Use it when:

- Failure rate is low.
- The action is reversible in UI.
- The app can roll back cleanly.
- The user benefits from instant feedback.
- The chain state is not the legal source of a receipt yet.

Avoid it when:

- The action spends user funds in a way that must be exact.
- The next screen depends on confirmed ownership.
- Failure would make the user think assets disappeared.
- The product cannot roll back.

Good optimistic candidates:

- Marking an NFT as listed pending confirmation.
- Adding a "claim pending" row.
- Showing a pending balance delta.
- Updating a game move as pending.
- Disabling a claimed reward card.

Bad optimistic candidates:

- Showing settled USDC received before a swap confirms.
- Unlocking gated content before mint confirmation.
- Showing a withdrawal receipt as complete before confirmed.

## Optimistic UI Pattern

```typescript
type OptimisticPatch<T> = {
  apply: (current: T) => T;
  rollback: (current: T) => T;
};

export async function withOptimisticUpdate<T>({
  getState,
  setState,
  patch,
  execute,
}: {
  getState: () => T;
  setState: (value: T) => void;
  patch: OptimisticPatch<T>;
  execute: () => Promise<string>;
}) {
  const before = getState();
  setState(patch.apply(before));

  try {
    const signature = await execute();
    return signature;
  } catch (error) {
    setState(patch.rollback(before));
    throw error;
  }
}
```

## Pending Balance Pattern

Never silently replace the real balance with an optimistic balance.

Show a pending delta:

```tsx
export function BalanceWithPending({
  balance,
  pendingDelta,
  symbol,
}: {
  balance: number;
  pendingDelta?: number;
  symbol: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-2xl font-semibold">
        {balance.toLocaleString()} {symbol}
      </div>
      {pendingDelta ? (
        <div className="text-sm text-muted-foreground">
          Pending {pendingDelta > 0 ? "+" : ""}
          {pendingDelta.toLocaleString()} {symbol}
        </div>
      ) : null}
    </div>
  );
}
```

## Failed Transaction UX

A failed transaction needs three things:

1. A human reason.
2. Whether funds moved.
3. A next action.

Bad:

```text
Transaction simulation failed: Error processing Instruction 2: custom program error: 0x1771
```

Good:

```text
Price moved before your swap could complete. No funds moved. Try again or increase slippage.
```

## Error Parsing Inputs

Parse from all available sources:

- Wallet adapter error name.
- Error message.
- RPC simulation error.
- Transaction logs.
- Anchor error line.
- Custom program error hex code.
- HTTP status from backend.

Type:

```typescript
export type ParsedTransactionError = {
  code: string;
  title: string;
  body: string;
  retryable: boolean;
  fundsMoved: "no" | "unknown" | "possibly";
  actionLabel?: string;
};
```

## Anchor Error Code Lookup

Anchor errors often appear in logs:

```text
Program log: AnchorError occurred. Error Code: SlippageExceeded. Error Number: 6001. Error Message: Slippage tolerance exceeded.
```

Parse by name first, number second.

```typescript
type AnchorErrorMap = Record<
  string,
  {
    title: string;
    body: string;
    retryable: boolean;
  }
>;

export function parseAnchorError(logs: string[] | undefined, map: AnchorErrorMap) {
  if (!logs?.length) return null;

  const joined = logs.join("\n");
  const named = joined.match(
    /Error Code:\s*([A-Za-z0-9_]+)\.\s*Error Number:\s*(\d+)\.\s*Error Message:\s*([^\n.]+)/
  );

  if (named) {
    const [, code, number, rawMessage] = named;
    const mapped = map[code] ?? map[number];

    if (mapped) {
      return {
        code,
        title: mapped.title,
        body: mapped.body,
        retryable: mapped.retryable,
        fundsMoved: "no" as const,
      };
    }

    return {
      code,
      title: "Transaction failed",
      body: rawMessage,
      retryable: false,
      fundsMoved: "no" as const,
    };
  }

  return null;
}
```

Example program map:

```typescript
export const PROGRAM_ERRORS: AnchorErrorMap = {
  InsufficientFunds: {
    title: "Not enough funds",
    body: "Your wallet balance is too low for this transaction.",
    retryable: false,
  },
  SlippageExceeded: {
    title: "Price moved",
    body: "The price changed before your transaction landed. Try again or increase slippage.",
    retryable: true,
  },
  AccountNotFound: {
    title: "Account not set up",
    body: "This account needs to be created before you can continue.",
    retryable: false,
  },
  "6001": {
    title: "Price moved",
    body: "The price changed before your transaction landed. Try again or increase slippage.",
    retryable: true,
  },
};
```

## Common Error Patterns

## InsufficientFunds

Signals:

- `0x1`.
- `insufficient lamports`.
- `Transfer: insufficient lamports`.
- `Attempt to debit an account but found no record of a prior credit`.
- SPL token amount exceeds balance.

User copy:

```text
Your wallet does not have enough SOL for this transaction. Add SOL or lower the amount.
```

If the app supports gasless:

```text
Your wallet does not have enough SOL. We can sponsor this first transaction for eligible users.
```

CTA:

- Add SOL.
- Lower amount.
- Use sponsored transaction.
- Switch wallet.

## SlippageExceeded

Signals:

- `SlippageExceeded`.
- `0x1770`.
- `0x1771`.
- `minimum amount out`.
- `price moved`.
- DEX program-specific slippage code.

User copy:

```text
The price moved before your trade landed. No funds moved. Try again or increase slippage.
```

CTA:

- Try again.
- Increase slippage.
- Reduce trade size.

Do not say:

```text
Program error 6001.
```

## AccountNotFound

Signals:

- `AccountNotFound`.
- `AccountNotInitialized`.
- `account does not exist`.
- Missing associated token account.
- Missing PDA.

User copy:

```text
This account is not set up yet. Create it first, then try again.
```

If the app can create the account:

```text
We need to set up your token account first. This is a one-time setup.
```

CTA:

- Set up account.
- Retry after setup.

## User Rejected

Signals:

- `User rejected`.
- `User declined`.
- `WalletSignTransactionError` with rejection.
- Mobile wallet cancellation.

User copy:

```text
Transaction cancelled.
```

UX:

- Do not show red destructive error.
- Do not log as failed conversion unless analyzing rejection rate.
- Keep the original CTA available.

## Blockhash Expired

Signals:

- `Blockhash not found`.
- `block height exceeded`.
- `TransactionExpiredBlockheightExceededError`.
- Last valid block height passed.

User copy:

```text
This transaction expired before it confirmed. No funds moved. Try again.
```

CTA:

- Try again.

Implementation:

- Rebuild transaction with fresh blockhash.
- Do not resend the old serialized transaction.

## Transaction Timeout UX

Solana recent blockhashes expire after roughly 150 blocks.

At normal slot times, that is usually around 60 to 90 seconds, but do not hard-code the time.

Track `lastValidBlockHeight`.

Show timeout progress based on block height when possible.

```typescript
export async function isBlockhashExpired({
  connection,
  lastValidBlockHeight,
}: {
  connection: Connection;
  lastValidBlockHeight: number;
}) {
  const currentBlockHeight = await connection.getBlockHeight("confirmed");
  return currentBlockHeight > lastValidBlockHeight;
}
```

Timeout copy:

```text
Still confirming...
```

After expiry:

```text
This transaction expired before it confirmed. No funds moved. Try again with a fresh transaction.
```

If status is unknown:

```text
We could not confirm this transaction before it expired. Check the explorer before retrying.
```

## Timeout State Pattern

```typescript
async function confirmWithExpiry({
  connection,
  signature,
  blockhash,
  lastValidBlockHeight,
  onStatus,
}: {
  connection: Connection;
  signature: string;
  blockhash: string;
  lastValidBlockHeight: number;
  onStatus: (status: TransactionUxState) => void;
}) {
  onStatus("confirming");

  try {
    const result = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );

    if (result.value.err) {
      onStatus("failed");
      throw new Error(JSON.stringify(result.value.err));
    }

    onStatus("confirmed");
  } catch (error) {
    if (await isBlockhashExpired({ connection, lastValidBlockHeight })) {
      onStatus("expired");
      throw new TransactionExpiredError(signature);
    }

    onStatus("failed");
    throw error;
  }
}
```

## Retry UX

Retry decisions should be based on error type.

Auto-retry only when:

- The wallet has already signed a transaction that can be safely resent.
- The error is an RPC send failure before landing.
- The transaction is idempotent.
- You are not asking the wallet to sign again.
- The retry cannot duplicate an irreversible action.

Ask the user to retry when:

- Blockhash expired.
- Slippage exceeded.
- User rejected.
- Wallet session expired.
- Instruction data depends on current price, state, or recent blockhash.

Never auto-retry when:

- The transaction may have landed.
- The action is a purchase, withdrawal, or transfer.
- The program is not idempotent.
- The user needs to review changed terms.

Retry policy:

```typescript
export type RetryDecision =
  | { type: "auto"; reason: string; maxAttempts: number }
  | { type: "ask"; reason: string; label: string }
  | { type: "none"; reason: string };

export function getRetryDecision(error: ParsedTransactionError): RetryDecision {
  if (error.code === "RpcSendFailure") {
    return { type: "auto", reason: "RPC send failed before confirmation", maxAttempts: 2 };
  }

  if (error.code === "BlockhashExpired") {
    return { type: "ask", reason: "Transaction needs a fresh blockhash", label: "Try again" };
  }

  if (error.code === "SlippageExceeded") {
    return { type: "ask", reason: "Market price changed", label: "Review trade" };
  }

  if (error.code === "UserRejected") {
    return { type: "none", reason: "User cancelled signing" };
  }

  return error.retryable
    ? { type: "ask", reason: "Retryable program error", label: "Try again" }
    : { type: "none", reason: "Non-retryable error" };
}
```

## Multi-Step Transaction Flows

Some flows require more than one transaction:

- Approve delegation then execute.
- Create associated token account then transfer.
- Create profile then mint.
- Wrap SOL then swap.
- Sign terms then submit transaction.
- Claim then stake.

Use a visible stepper.

Do not collapse everything into one spinner.

## Multi-Step State Model

```typescript
export type FlowStepStatus =
  | "waiting"
  | "active"
  | "signing"
  | "confirming"
  | "done"
  | "failed";

export type TransactionFlowStep = {
  id: string;
  title: string;
  description: string;
  signature?: string;
  status: FlowStepStatus;
};
```

UI:

```tsx
export function TransactionStepper({ steps }: { steps: TransactionFlowStep[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={step.id} className="flex gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border text-xs">
            {step.status === "done" ? "✓" : index + 1}
          </div>
          <div className="min-w-0">
            <div className="font-medium">{step.title}</div>
            <div className="text-sm text-muted-foreground">{step.description}</div>
            {step.signature ? (
              <a
                href={`https://solscan.io/tx/${step.signature}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline"
              >
                View transaction
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
```

## Approve + Execute Pattern

For approval flows:

```text
Step 1: Approve spending limit
Step 2: Execute action
Step 3: Confirm result
```

Copy:

- Approval: "Approve access. This does not move funds yet."
- Execute: "Confirm transaction. This completes the action."
- Done: "Action complete."

Never use vague copy:

```text
Step 1
Step 2
Continue
```

## Toast Notification Design

Use toasts for transaction state, but do not rely on toasts alone for critical flows.

Toast durations:

- Building: persistent until next state.
- Signing: persistent until wallet responds.
- Sending: persistent until signature or error.
- Confirming: persistent with explorer link.
- Success: 5 to 8 seconds.
- Failure: 8 to 12 seconds or until dismissed.
- Expired: persistent until user retries or dismisses.

Toast copy:

```typescript
export const TOAST_COPY = {
  building: "Preparing transaction...",
  simulating: "Checking transaction...",
  signing: "Approve in your wallet",
  sending: "Sending to Solana...",
  confirming: "Confirming on-chain...",
  confirmed: "Transaction confirmed",
  failed: "Transaction failed",
  expired: "Transaction expired",
  cancelled: "Transaction cancelled",
};
```

Toast component:

```tsx
export function TransactionToast({
  state,
  signature,
  message,
  onRetry,
}: {
  state: TransactionUxState;
  signature?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const explorerUrl = signature
    ? `https://solscan.io/tx/${signature}`
    : undefined;

  return (
    <div className="space-y-2">
      <div className="font-medium">{message ?? TX_STATE_COPY[state]}</div>
      {explorerUrl ? (
        <a href={explorerUrl} target="_blank" rel="noreferrer" className="text-sm underline">
          View on Solscan
        </a>
      ) : null}
      {onRetry && (state === "failed" || state === "expired") ? (
        <button onClick={onRetry} className="text-sm font-medium underline">
          Try again
        </button>
      ) : null}
    </div>
  );
}
```

## Priority Fee UX

Priority fees are technical.

The UX should explain speed, not microLamports.

Bad:

```text
Set CU price to 20000 microLamports.
```

Good:

```text
Solana is busy. Add a small priority fee to confirm faster.
```

Show:

- Normal: "Standard speed".
- Fast: "Higher chance of quick confirmation".
- Urgent: "Best for congested periods".

Do not imply a guarantee.

Priority fee copy:

```typescript
export const PRIORITY_FEE_COPY = {
  none: {
    label: "Standard",
    body: "Lowest fee. May take longer when Solana is busy.",
  },
  medium: {
    label: "Fast",
    body: "Adds a small priority fee to improve confirmation speed.",
  },
  high: {
    label: "Urgent",
    body: "Best when transactions are failing during congestion.",
  },
};
```

Implementation:

```typescript
import { ComputeBudgetProgram, Transaction } from "@solana/web3.js";

export function addPriorityFee(
  transaction: Transaction,
  level: "none" | "medium" | "high"
) {
  if (level === "none") return transaction;

  const microLamports =
    level === "medium" ? 5_000 : 25_000;

  transaction.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports })
  );

  return transaction;
}
```

## Priority Fee Decision

Suggest a priority fee when:

- Recent transactions are timing out.
- RPC simulation reports compute pressure.
- User is doing a time-sensitive swap.
- The app sees elevated confirmation latency.

Do not force it for:

- Free onboarding actions.
- Low-value profile updates.
- Devnet actions.

## Complete Error Translator

```typescript
export function parseTransactionError(error: unknown): ParsedTransactionError {
  const message = String((error as { message?: unknown })?.message ?? error);
  const logs = (error as { logs?: string[] })?.logs;

  const anchor = parseAnchorError(logs, PROGRAM_ERRORS);
  if (anchor) return anchor;

  if (/User rejected|User declined|UserReject/i.test(message)) {
    return {
      code: "UserRejected",
      title: "Transaction cancelled",
      body: "You cancelled the transaction.",
      retryable: false,
      fundsMoved: "no",
    };
  }

  if (/0x1|insufficient funds|insufficient lamports/i.test(message)) {
    return {
      code: "InsufficientFunds",
      title: "Not enough SOL",
      body: "Your wallet does not have enough SOL for this transaction.",
      retryable: false,
      fundsMoved: "no",
      actionLabel: "Add SOL",
    };
  }

  if (/Slippage|0x1770|0x1771|minimum amount/i.test(message)) {
    return {
      code: "SlippageExceeded",
      title: "Price moved",
      body: "The price changed before your transaction landed. Try again or increase slippage.",
      retryable: true,
      fundsMoved: "no",
      actionLabel: "Review trade",
    };
  }

  if (/AccountNotFound|AccountNotInitialized|account does not exist/i.test(message)) {
    return {
      code: "AccountNotFound",
      title: "Account not set up",
      body: "This account needs to be created before you can continue.",
      retryable: false,
      fundsMoved: "no",
      actionLabel: "Set up account",
    };
  }

  if (/blockhash|block height exceeded|expired/i.test(message)) {
    return {
      code: "BlockhashExpired",
      title: "Transaction expired",
      body: "This transaction expired before it confirmed. No funds moved. Try again.",
      retryable: true,
      fundsMoved: "no",
      actionLabel: "Try again",
    };
  }

  if (/429|503|fetch failed|NetworkError|timeout/i.test(message)) {
    return {
      code: "NetworkBusy",
      title: "Network is busy",
      body: "The network is busy right now. Wait a moment and try again.",
      retryable: true,
      fundsMoved: "unknown",
      actionLabel: "Try again",
    };
  }

  return {
    code: "Unknown",
    title: "Transaction failed",
    body: "Something went wrong. Please try again or contact support if this keeps happening.",
    retryable: true,
    fundsMoved: "unknown",
    actionLabel: "Try again",
  };
}
```

## `useTransaction` Hook

This hook exposes the required states:

- `idle`.
- `building`.
- `signing`.
- `sending`.
- `confirming`.
- `done`.
- `failed`.

It also handles cancellation and expiry.

```typescript
import { useCallback, useMemo, useState } from "react";
import {
  Connection,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";

export type TransactionHookState =
  | "idle"
  | "building"
  | "signing"
  | "sending"
  | "confirming"
  | "done"
  | "failed";

type ExecuteTransactionInput = {
  build: () => Promise<{
    transaction: Transaction | VersionedTransaction;
    blockhash: string;
    lastValidBlockHeight: number;
  }>;
  onSuccess?: (signature: string) => void | Promise<void>;
  onError?: (error: ParsedTransactionError) => void;
};

export function useTransaction(connection: Connection) {
  const wallet = useWallet();
  const [state, setState] = useState<TransactionHookState>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<ParsedTransactionError | null>(null);

  const reset = useCallback(() => {
    setState("idle");
    setSignature(null);
    setError(null);
  }, []);

  const execute = useCallback(
    async ({ build, onSuccess, onError }: ExecuteTransactionInput) => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        const parsed: ParsedTransactionError = {
          code: "WalletNotConnected",
          title: "Wallet not connected",
          body: "Connect your wallet to continue.",
          retryable: true,
          fundsMoved: "no",
          actionLabel: "Connect wallet",
        };
        setError(parsed);
        setState("failed");
        onError?.(parsed);
        throw parsed;
      }

      setError(null);
      setSignature(null);

      try {
        setState("building");
        const { transaction, blockhash, lastValidBlockHeight } = await build();

        setState("signing");
        const signed = await wallet.signTransaction(transaction);

        setState("sending");
        const txSignature = await connection.sendRawTransaction(
          signed.serialize(),
          {
            skipPreflight: false,
            maxRetries: 3,
          }
        );

        setSignature(txSignature);
        setState("confirming");

        const confirmation = await connection.confirmTransaction(
          {
            signature: txSignature,
            blockhash,
            lastValidBlockHeight,
          },
          "confirmed"
        );

        if (confirmation.value.err) {
          throw new Error(JSON.stringify(confirmation.value.err));
        }

        setState("done");
        await onSuccess?.(txSignature);
        return txSignature;
      } catch (rawError) {
        const parsed = parseTransactionError(rawError);
        setError(parsed);
        setState("failed");
        onError?.(parsed);
        throw rawError;
      }
    },
    [connection, wallet.publicKey, wallet.signTransaction]
  );

  const canRetry = useMemo(() => {
    if (!error) return false;
    return getRetryDecision(error).type === "ask";
  }, [error]);

  return {
    state,
    signature,
    error,
    canRetry,
    execute,
    reset,
  };
}
```

## Versioned Transaction Variant

For v0 transactions, preserve the blockhash returned by the builder.

```typescript
import {
  TransactionMessage,
  VersionedTransaction,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";

export async function buildVersionedTransaction({
  connection,
  payer,
  instructions,
}: {
  connection: Connection;
  payer: PublicKey;
  instructions: TransactionInstruction[];
}) {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  return {
    transaction: new VersionedTransaction(message),
    blockhash,
    lastValidBlockHeight,
  };
}
```

## Component Pattern

```tsx
export function TransactionButton({
  label,
  connection,
  build,
}: {
  label: string;
  connection: Connection;
  build: ExecuteTransactionInput["build"];
}) {
  const tx = useTransaction(connection);

  const disabled =
    tx.state === "building" ||
    tx.state === "signing" ||
    tx.state === "sending" ||
    tx.state === "confirming";

  return (
    <div className="space-y-3">
      <button
        disabled={disabled}
        onClick={() => tx.execute({ build })}
        className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {disabled ? TX_STATE_COPY[tx.state] : label}
      </button>

      {tx.signature ? (
        <a
          href={`https://solscan.io/tx/${tx.signature}`}
          target="_blank"
          rel="noreferrer"
          className="block text-sm underline"
        >
          View transaction
        </a>
      ) : null}

      {tx.error ? (
        <div role="alert" className="rounded-md border border-destructive/30 p-3">
          <div className="font-medium">{tx.error.title}</div>
          <div className="text-sm text-muted-foreground">{tx.error.body}</div>
        </div>
      ) : null}
    </div>
  );
}
```

## Simulation Before Signing

Simulate when:

- The action can fail due to account state.
- The action can fail due to balance.
- The action uses custom program logic.
- The action has price or slippage constraints.
- The user needs preview of token deltas.

Pattern:

```typescript
export async function simulateBeforeSigning(
  connection: Connection,
  transaction: Transaction
) {
  const result = await connection.simulateTransaction(transaction, {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });

  if (result.value.err) {
    const parsed = parseTransactionError({
      message: JSON.stringify(result.value.err),
      logs: result.value.logs ?? undefined,
    });

    throw parsed;
  }

  return {
    unitsConsumed: result.value.unitsConsumed ?? 0,
    logs: result.value.logs ?? [],
    accounts: result.value.accounts,
  };
}
```

## Copy Standards

Use plain, action-oriented copy.

Say:

- "Approve in your wallet."
- "Transaction sent."
- "Confirming on Solana."
- "No funds moved."
- "Try again with a fresh transaction."
- "The price moved before your trade landed."

Do not say:

- "Awaiting wallet adapter promise."
- "Commitment reached."
- "Program returned 0x1."
- "Transaction simulation failed."
- "Fatal error."

## Verification Checklist

Before launch:

- [ ] User sees a state immediately after clicking the CTA.
- [ ] Wallet approval state is visible before the wallet appears.
- [ ] User cancellation is treated as cancelled, not failed.
- [ ] Signature link appears after send.
- [ ] Confirmation uses `{ signature, blockhash, lastValidBlockHeight }`.
- [ ] Success waits for `confirmed` unless there is a documented reason.
- [ ] `finalized` is not blocking casual actions.
- [ ] Blockhash expiry produces retry with a fresh transaction.
- [ ] Insufficient funds has recovery copy.
- [ ] Slippage errors tell user to retry or adjust slippage.
- [ ] Account missing errors offer setup path.
- [ ] Pending toasts do not disappear before resolution.
- [ ] Multi-step flows show the active step.
- [ ] Priority fee language explains speed, not compute units.
- [ ] Explorer link uses the right cluster.

## Audit Red Flags

Flag these as launch blockers:

- Transaction button returns to normal before confirmation.
- User can submit the same transaction twice.
- UI says success before signature exists.
- UI says success at `processed` for a high-value flow.
- Raw error codes are displayed.
- Expired blockhash triggers resend of old transaction.
- Wallet rejection appears as a scary failure.
- No explorer link after send.
- No timeout state.

## Production Defaults

Use:

- `confirmed` for completion.
- `processed` for fast pending acknowledgement.
- `finalized` for background receipt upgrades.
- `skipPreflight: false`.
- `maxRetries: 3`.
- Fresh blockhash per retry.
- Program-specific error maps.
- Pending deltas instead of fake settled balances.
- Persistent toasts during signing and confirming.

## When To Route Elsewhere

Load `skill/wallet-ux.md` for wallet connection state machines.

Load `skill/gasless-onboarding.md` for fee sponsorship and no-SOL onboarding.

Load `skill/blinks-actions.md` for Action endpoint transaction responses.

Load `skill/ui-patterns.md` for broader skeletons, previews, and wallet button UI.


