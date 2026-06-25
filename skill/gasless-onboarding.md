# Gasless Onboarding for Solana dApps

Remove the #1 conversion killer: requiring new users to have SOL before they can do anything.
Fee sponsorship turns cold-start friction into a smooth first experience.

## Option 1: Helius DAS + Fee Payer Proxy (simplest)

Your backend acts as a fee payer — user signs, your server pays the fee.

```typescript
// lib/feePayerProxy.ts
import {
  Connection,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const connection = new Connection(process.env.HELIUS_RPC_URL!);

// Your protocol's fee payer wallet (fund this from treasury)
const feePayer = Keypair.fromSecretKey(
  Buffer.from(JSON.parse(process.env.FEE_PAYER_SECRET!))
);

// Rate limit: 5 free transactions per user per day
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "24 h"),
});

export async function sponsorTransaction(
  userSignedTx: string,   // base64 serialized, partially signed by user
  userWallet: string,     // for rate limiting
  action: string          // e.g. "first_mint", "onboarding"
): Promise<string> {
  // 1. Rate limit check
  const { success } = await ratelimit.limit(`gasless:${userWallet}`);
  if (!success) throw new Error("Daily gasless limit reached. Please try again tomorrow.");

  // 2. Validate the transaction is what we expect (don't sign arbitrary txs!)
  const tx = Transaction.from(Buffer.from(userSignedTx, "base64"));
  validateSponsoredTransaction(tx, action);

  // 3. Fee payer signs
  tx.partialSign(feePayer);

  // 4. Submit
  const sig = await sendAndConfirmTransaction(connection, tx, [feePayer], {
    commitment: "confirmed",
  });

  return sig;
}

function validateSponsoredTransaction(tx: Transaction, action: string) {
  // CRITICAL: Always whitelist what instructions are allowed in sponsored txs
  // Never sign a tx that calls arbitrary programs
  const ALLOWED_PROGRAMS: Record<string, string[]> = {
    first_mint: [process.env.NFT_PROGRAM_ID!, "11111111111111111111111111111111"],
    onboarding: [process.env.YOUR_PROGRAM_ID!],
  };

  const allowed = ALLOWED_PROGRAMS[action];
  if (!allowed) throw new Error("Unknown sponsored action type.");

  for (const ix of tx.instructions) {
    if (!allowed.includes(ix.programId.toBase58())) {
      throw new Error(`Disallowed program in sponsored transaction: ${ix.programId}`);
    }
  }
}
```

```typescript
// app/api/sponsor/route.ts — Next.js endpoint
import { NextRequest, NextResponse } from "next/server";
import { sponsorTransaction } from "@/lib/feePayerProxy";

export async function POST(req: NextRequest) {
  const { transaction, action } = await req.json();
  const userWallet = req.headers.get("x-wallet-address");

  if (!transaction || !action || !userWallet) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    const signature = await sponsorTransaction(transaction, userWallet, action);
    return NextResponse.json({ signature });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 429 });
  }
}
```

## Option 2: Solana Pay + Transaction Request (for commerce flows)

```typescript
// Merchant pays fees — user pays token amount only
import {
  createTransfer,
  encodeURL,
  parseURL,
  validateTransfer,
  FindReferenceError,
  ValidateTransferError,
} from "@solana/pay";
import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import BigNumber from "bignumber.js";

const reference = Keypair.generate().publicKey; // unique per order

// Create the payment URL (encode into QR code)
const url = encodeURL({
  recipient: new PublicKey(process.env.MERCHANT_WALLET!),
  amount: new BigNumber("9.99"),  // USDC
  splToken: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), // USDC mint
  reference,
  label: "Your Store",
  message: "Order #1234",
  memo: "order-1234",
});

// Backend: poll for payment confirmation
async function waitForPayment(connection: Connection) {
  const { recipient, amount, splToken, reference, memo } = parseURL(url);
  
  return new Promise<string>((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const signatureInfo = await findReference(connection, reference, {
          finality: "confirmed",
        });
        await validateTransfer(connection, signatureInfo.signature, {
          recipient: recipient!,
          amount: amount!,
          splToken,
          reference,
        });
        clearInterval(interval);
        resolve(signatureInfo.signature);
      } catch (e) {
        if (!(e instanceof FindReferenceError)) {
          clearInterval(interval);
          reject(e);
        }
      }
    }, 500);
  });
}
```

## Frontend: fee sponsorship UX pattern

```typescript
// hooks/useSponsoredTransaction.ts
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";

export function useSponsoredTransaction() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const executeSponsoredTx = async (
    buildTransaction: () => Promise<Transaction>,
    action: string
  ) => {
    if (!publicKey || !signTransaction) throw new Error("Wallet not connected");

    // 1. Build the transaction (no fee payer set yet)
    const tx = await buildTransaction();
    tx.feePayer = undefined; // server will set this

    // 2. User signs (no SOL needed — they only approve the action)
    const signed = await signTransaction(tx);
    const serialized = Buffer.from(signed.serialize({ requireAllSignatures: false }))
      .toString("base64");

    // 3. Server pays the fee
    const res = await fetch("/api/sponsor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wallet-address": publicKey.toBase58(),
      },
      body: JSON.stringify({ transaction: serialized, action }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Sponsorship failed");
    }

    const { signature } = await res.json();
    return signature;
  };

  return { executeSponsoredTx };
}
```

## Abuse prevention patterns

```typescript
// Layered defense: wallet age + rate limit + action whitelist
async function isEligibleForSponsorship(wallet: string): Promise<{ eligible: boolean; reason?: string }> {
  const connection = new Connection(process.env.HELIUS_RPC_URL!);
  
  // 1. Wallet must be older than 24 hours (prevents fresh burner wallets)
  const txHistory = await connection.getSignaturesForAddress(new PublicKey(wallet), { limit: 1 });
  if (txHistory.length === 0) {
    // Brand new wallet — still eligible for true first-time onboarding
    // But flag it for stricter limits
  }
  
  // 2. Check if already claimed onboarding (store in DB or on-chain)
  const alreadyClaimed = await db.gaslessClaims.findFirst({ where: { wallet } });
  if (alreadyClaimed) {
    return { eligible: false, reason: "Gasless onboarding already claimed for this wallet." };
  }
  
  // 3. Device fingerprint / email verification gate (optional for higher-value actions)
  
  return { eligible: true };
}
```

## Cost management

```typescript
// Monitor your fee payer balance and alert before it runs dry
async function checkFeePayerHealth() {
  const balance = await connection.getBalance(feePayer.publicKey);
  const balanceSOL = balance / LAMPORTS_PER_SOL;
  
  if (balanceSOL < 0.5) {
    await sendSlackAlert(`⚠️ Fee payer balance low: ${balanceSOL.toFixed(3)} SOL. Refill needed.`);
  }
  
  // Estimate daily burn rate
  // Average tx fee ~5000 lamports = 0.000005 SOL
  // 1000 sponsored txs/day = 0.005 SOL/day
  // Keep 30-day reserve: ~0.15 SOL minimum
  
  return { balanceSOL, healthy: balanceSOL > 0.5 };
}
```

---

## Privy Embedded Wallet — Social Login Without a Wallet (2026 Standard)

The biggest onboarding shift in 2026: users don't need a wallet at all. Privy creates one for them behind their Google/email login. The wallet is invisible until they're ready for it.

```bash
npm install @privy-io/react-auth @privy-io/server-auth
```

### Provider Setup

```tsx
// app/layout.tsx
"use client";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PrivyProvider
          appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
          config={{
            loginMethods: ["email", "google", "twitter", "wallet"],
            appearance: {
              theme: "dark",
              accentColor: "#7C3AED",
              logo: "https://yourdapp.com/logo.png",
            },
            // Embedded wallet: created automatically on first login
            embeddedWallets: {
              createOnLogin: "users-without-wallets", // Only for users with no external wallet
              requireUserPasswordOnCreate: false,      // Seamless — no extra step
              showWalletUIs: true,
            },
            // Also support native Solana wallets for power users
            externalWallets: {
              solana: {
                connectors: toSolanaWalletConnectors(),
              },
            },
          }}
        >
          {children}
        </PrivyProvider>
      </body>
    </html>
  );
}
```

### The Unified Wallet Hook (Privy + External Wallets)

```typescript
// hooks/useUnifiedWallet.ts
// Works whether user connected via Google/email (embedded) or Phantom/Backpack (external)
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { useCallback } from "react";
import { Connection, Transaction, VersionedTransaction } from "@solana/web3.js";

export function useUnifiedWallet() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets: allWallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();

  // Priority: external wallet (power user) → embedded wallet (new user)
  const activeWallet =
    solanaWallets.find((w) => w.walletClientType !== "privy") ??
    solanaWallets.find((w) => w.walletClientType === "privy");

  const address = activeWallet?.address;
  const isEmbedded = activeWallet?.walletClientType === "privy";

  const signAndSendTransaction = useCallback(
    async (
      tx: Transaction | VersionedTransaction,
      connection: Connection
    ): Promise<string> => {
      if (!activeWallet) throw new Error("No wallet connected");

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

      if (tx instanceof Transaction) {
        tx.recentBlockhash = blockhash;
        tx.feePayer = activeWallet.publicKey
          ? new (await import("@solana/web3.js")).PublicKey(activeWallet.address)
          : undefined;
      }

      // Privy handles signing transparently for both embedded + external wallets
      const signedTx = await activeWallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(
        signedTx.serialize(),
        { skipPreflight: false, maxRetries: 3 }
      );

      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      return sig;
    },
    [activeWallet]
  );

  return {
    ready,
    authenticated,
    address,
    isEmbedded,       // True = new user with auto-created wallet
    login,
    logout,
    activeWallet,
    signAndSendTransaction,
  };
}
```

### The Two-Phase User Journey

```tsx
// components/OnboardingGate.tsx
// Phase 1: User signs up with Google → gets embedded wallet (invisible)
// Phase 2: When they need to take custody, they "export" to a real wallet
"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useUnifiedWallet } from "@/hooks/useUnifiedWallet";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login } = usePrivy();
  const { isEmbedded, address } = useUnifiedWallet();

  if (!ready) return <LoadingSkeleton />;

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <h1 className="text-2xl font-bold text-foreground">Get started in seconds</h1>
        <p className="text-muted-foreground text-center max-w-sm">
          No wallet required. Sign in with Google and we'll handle the rest.
        </p>
        <button
          onClick={login}
          className="rounded-md bg-primary text-primary-foreground px-8 py-3 font-medium hover:bg-primary/90"
        >
          Sign in with Google
        </button>
        <p className="text-xs text-muted-foreground">
          Already have a wallet? You can connect Phantom or Backpack too.
        </p>
      </div>
    );
  }

  return (
    <>
      {isEmbedded && (
        // Subtle banner for embedded wallet users — not intrusive
        <div className="border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground flex justify-between items-center">
          <span>Your wallet: {address?.slice(0, 6)}...{address?.slice(-4)}</span>
          <button className="underline text-primary text-xs">
            Export to Phantom →
          </button>
        </div>
      )}
      {children}
    </>
  );
}
```

### Token-Gated Fee Sponsorship

Only sponsor fees for users who hold your token or NFT:

```typescript
// lib/tokenGatedSponsorship.ts
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const REQUIRED_TOKEN_MINT = process.env.REQUIRED_TOKEN_MINT!;
const REQUIRED_NFT_COLLECTION = process.env.REQUIRED_NFT_COLLECTION!;
const MIN_TOKEN_BALANCE = BigInt(1_000 * 1e9); // 1,000 tokens minimum

export async function isEligibleForTokenGatedSponsorship(
  walletAddress: string
): Promise<{ eligible: boolean; reason: string }> {
  const connection = new Connection(process.env.HELIUS_RPC_URL!);
  const wallet = new PublicKey(walletAddress);

  // Check: does the wallet hold enough of your protocol token?
  if (REQUIRED_TOKEN_MINT) {
    const ata = getAssociatedTokenAddressSync(
      new PublicKey(REQUIRED_TOKEN_MINT),
      wallet
    );
    const account = await connection.getTokenAccountBalance(ata).catch(() => null);
    if (account && BigInt(account.value.amount) >= MIN_TOKEN_BALANCE) {
      return { eligible: true, reason: "Token holder — fees sponsored" };
    }
  }

  // Check: does the wallet hold an NFT from your collection? (via Helius DAS)
  if (REQUIRED_NFT_COLLECTION) {
    const res = await fetch(
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "check-nft",
          method: "searchAssets",
          params: {
            ownerAddress: walletAddress,
            grouping: ["collection", REQUIRED_NFT_COLLECTION],
            limit: 1,
          },
        }),
      }
    );
    const data = await res.json();
    if (data.result?.total > 0) {
      return { eligible: true, reason: "NFT holder — fees sponsored" };
    }
  }

  return { eligible: false, reason: "Sponsorship requires holding protocol token or NFT" };
}
```

### Sponsored Transaction Batching

Combine multiple instructions into one sponsored transaction — reduces fees and latency:

```typescript
// lib/batchedSponsoredTx.ts
import { Transaction, TransactionInstruction, Connection, Keypair, PublicKey } from "@solana/web3.js";

export async function buildBatchedSponsoredTransaction(
  instructions: TransactionInstruction[],
  userPublicKey: PublicKey,
  feePayer: Keypair,
  connection: Connection
): Promise<Transaction> {
  if (instructions.length > 6) {
    throw new Error("Max 6 instructions per sponsored batch — CU limit");
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: feePayer.publicKey, // Protocol pays
    lastValidBlockHeight,
  });

  // Add compute budget instruction first (avoid unexpected CU failures)
  const { ComputeBudgetProgram } = await import("@solana/web3.js");
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 * instructions.length }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 })
  );

  tx.add(...instructions);

  // Fee payer signs — user will sign next (partial signing)
  tx.partialSign(feePayer);

  return tx;
}
```
