# Wallet Engineering — Institutional-Grade Architecture

> This file is the engineering philosophy layer for wallet development.
> It covers what `wallet-building.md` does not: the system-level decisions,
> threat model, progressive security architecture, and cross-skill integration
> that separate a production wallet from a prototype.
>
> Load `wallet-building.md` for implementation code.
> Load this file when designing the wallet's architecture from first principles.

---

## Engineering Philosophy

**First principle:** A wallet is not a UI. It is a signing oracle that happens to have a UI.
Every design decision must start from this: *can the user be tricked into signing something they didn't intend?*

**Second principle:** Security and usability are not opposites. Complexity is the enemy of both.
The most dangerous wallet designs are the ones that ask users to make security decisions they don't understand.

**Third principle:** Defense in depth. No single layer stops a determined attacker.
The wallet must be secure even if: the browser is compromised, the RPC endpoint is malicious, the dApp frontend is injected, or the user's clipboard has been hijacked.

**Fourth principle:** Progressive security. A wallet that forces hardware wallets on new users loses them.
Design for the full security upgrade path: software key → hardware wallet → MPC → threshold multisig.

**Fifth principle:** Auditability without privacy loss. The wallet must let users verify what happened
without uploading key material, identity, or behavioral data to any third party.

---

## The Complete Wallet Threat Model

Every wallet feature must be evaluated against this threat model before shipping.

```
ATTACKER CLASSES:

A1 — NETWORK ATTACKER
  Capability: intercepts or modifies RPC responses
  Goal: return false account states to trick wallet into wrong decisions
  Mitigation: verify critical reads with multiple RPC endpoints
              never trust a single RPC response for balance > threshold
              use finalized commitment for display, confirmed for transactions

A2 — MALICIOUS dAPP
  Capability: arbitrary JS in dApp, controls transaction construction
  Goal: get user to approve transactions that drain their wallet
  Mitigation: decode and display ALL instructions before signing
              warn on program IDs not on known-safe list
              reject any tx that sets TokenAccount owner to non-user address
              simulation before signing — show exact token movements

A3 — MALICIOUS EXTENSION / SUPPLY CHAIN
  Capability: injected JS in the page, reads window.solana, intercepts messages
  Goal: replace legitimate transaction with drainer transaction at signing time
  Mitigation: sign the transaction the user approved, not the one received
              hash the transaction at display time; re-verify at signing time
              extension isolation: background script is the only key holder

A4 — CLIPBOARD HIJACKER
  Capability: monitors clipboard, replaces address on copy/paste
  Goal: user sends funds to attacker's address
  Mitigation: always show full address on confirm screen
              offer copy-to-clipboard with integrity check
              detect address substitution: re-read clipboard after paste, warn if different

A5 — ADDRESS POISONER
  Capability: floods transaction history with near-identical lookalike addresses
  Goal: user copy-pastes a recent address that's actually the attacker's
  Mitigation: flag addresses in history that are visually similar to user's own addresses
              highlight the middle characters (most users only check first/last 4)
              never auto-populate send address from transaction history without warning

A6 — PHYSICAL ATTACKER (shoulder surfing, device theft)
  Capability: physical access to device
  Goal: extract key material or approve transactions
  Mitigation: auto-lock with inactivity timeout
              require biometric/PIN for every signing operation
              zeroize key material from memory on lock
              screen blur when app backgrounded (mobile)

A7 — PHISHING
  Capability: replica website that mimics legitimate dApp
  Goal: get user to connect wallet and approve transactions
  Mitigation: show connected domain prominently in signing UI
              warn on domain changes between sessions
              never auto-approve connections from new domains

A8 — COMPROMISED DEPENDENCY (npm supply chain)
  Capability: malicious code in node_modules
  Goal: exfiltrate key material silently
  Mitigation: lock lockfile, audit with 'npm audit'
              key material never leaves background script
              CSP headers block exfiltration attempts
              Subresource Integrity on all loaded scripts
```

---

## Progressive Security Architecture

The most important architectural innovation in modern wallet design:
build every tier so users can upgrade without losing their account.

```
TIER 1 — SOFTWARE WALLET (zero hardware required)
  Key storage: AES-256-GCM encrypted, Argon2id key derivation
  Signing: in-memory key, cleared after session
  Use case: new users, small balances (<$500)
  Upgrade path: → export mnemonic → import to Tier 2

TIER 2 — HARDWARE WALLET BACKED
  Key storage: Ledger/Trezor, key never leaves device
  Signing: hardware device approves each transaction
  Use case: active users, medium balances ($500-$50K)
  Upgrade path: → add Squads co-signer → Tier 3

TIER 3 — MPC / THRESHOLD WALLET
  Key storage: 2-of-3 key shares (device + cloud + recovery)
  Signing: threshold computation, no single key exists
  Use case: power users, large balances (>$50K)
  Upgrade path: → add Squads v4 program authority → Tier 4

TIER 4 — PROGRAM-CONTROLLED (Squads / Smart Wallet)
  Key storage: on-chain multisig, time-locks, spending limits
  Signing: proposal + approval flow, programmable rules
  Use case: institutional / protocol treasuries (>$1M)
  No upgrade needed — this is the ceiling
```

### Upgrade Path Implementation

```typescript
// wallet/security-tier.ts

export type SecurityTier = "software" | "hardware" | "mpc" | "program";

export interface WalletSecurityProfile {
  currentTier: SecurityTier;
  publicKey: string;
  createdAt: number;
  lastUpgradedAt: number | null;
  upgradeRecommendation: string | null;
  balanceThresholdForUpgrade: number; // USD value that triggers upgrade prompt
}

export function evaluateSecurityTier(
  profile: WalletSecurityProfile,
  currentBalanceUsd: number
): {
  shouldUpgrade: boolean;
  recommendedTier: SecurityTier;
  reason: string;
} {
  // Rule: upgrade recommendation based on balance + time
  if (profile.currentTier === "software" && currentBalanceUsd > 500) {
    return {
      shouldUpgrade: true,
      recommendedTier: "hardware",
      reason: `Your balance ($${currentBalanceUsd.toFixed(0)}) exceeds $500. A hardware wallet eliminates the risk of malware stealing your keys.`,
    };
  }
  if (profile.currentTier === "hardware" && currentBalanceUsd > 50_000) {
    return {
      shouldUpgrade: true,
      recommendedTier: "mpc",
      reason: `Your balance ($${currentBalanceUsd.toFixed(0)}) exceeds $50K. MPC eliminates the single-hardware-device risk.`,
    };
  }
  if (profile.currentTier === "mpc" && currentBalanceUsd > 500_000) {
    return {
      shouldUpgrade: true,
      recommendedTier: "program",
      reason: `Your balance exceeds $500K. A Squads multisig with time-locks provides institutional-grade security.`,
    };
  }
  return {
    shouldUpgrade: false,
    recommendedTier: profile.currentTier,
    reason: "Current security tier is appropriate for your balance.",
  };
}
```

---

## Key Derivation — Argon2id vs PBKDF2

`wallet-building.md` uses PBKDF2 with 600K iterations. Here is why you might choose Argon2id instead, and when each is appropriate.

```
PBKDF2 (current wallet-building.md default):
  Strength: CPU-hard, widely supported (Web Crypto API native)
  Weakness: GPU/ASIC parallel attacks are cheap — not memory-hard
  Appropriate: Browser extension wallets (Web Crypto API only)
  Iteration count: 600,000 for SHA-256 (current best practice)

Argon2id (recommended for mobile and server wallets):
  Strength: memory-hard + CPU-hard — defeats GPU/ASIC brute force
  Weakness: not in Web Crypto API — requires WASM library
  Appropriate: React Native, Electron, server-side wallets
  Parameters: time=3, memory=65536 (64MB), parallelism=4

DECISION RULE:
  Browser extension → PBKDF2 (600K SHA-256) — Web Crypto API availability
  React Native → Argon2id (react-native-argon2) — native WASM support
  Electron app → Argon2id — full node.js available
  Server fee payer → Neither — use secrets manager (AWS KMS, HashiCorp Vault)
```

```typescript
// wallet/kdf.ts — Argon2id implementation for React Native / Electron
import argon2 from "argon2"; // Node.js / React Native native module

export const ARGON2ID_PARAMS = {
  type: argon2.argon2id,
  timeCost: 3,           // 3 iterations
  memoryCost: 65536,     // 64MB RAM — defeats GPU attacks
  parallelism: 4,        // 4 parallel threads
  hashLength: 32,        // 256-bit output for AES-256 key
} as const;

export async function deriveKeyArgon2id(
  password: string,
  salt: Buffer
): Promise<Buffer> {
  return await argon2.hash(password, {
    ...ARGON2ID_PARAMS,
    salt,
    raw: true,
  });
}

// Constant-time comparison (prevent timing attacks on password verify)
export function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}
```

---

## Versioned HD Account Architecture

`wallet-building.md` covers derivation paths. This section covers the multi-account model that users actually need.

### Account Discovery (BIP44 Gap Limit)

```typescript
// wallet/account-discovery.ts
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { keypairFromMnemonic } from "./wallet-building"; // from wallet-building.md

// BIP44 gap limit: stop scanning after N consecutive empty accounts
const GAP_LIMIT = 5;
const DUST_THRESHOLD = 0.001 * LAMPORTS_PER_SOL; // 0.001 SOL is "empty"

export interface DiscoveredAccount {
  index: number;
  publicKey: string;
  balanceLamports: number;
  hasHistory: boolean; // had txns but now empty
}

/**
 * Discover all accounts derived from a mnemonic.
 * Uses gap limit algorithm: stop when GAP_LIMIT consecutive accounts have
 * no balance AND no transaction history.
 *
 * This is critical for wallet recovery — without it, users who created
 * accounts at index >0 won't see them after restoring from seed phrase.
 */
export async function discoverAccounts(
  mnemonic: string,
  connection: Connection
): Promise<DiscoveredAccount[]> {
  const discovered: DiscoveredAccount[] = [];
  let consecutiveEmpty = 0;
  let index = 0;

  while (consecutiveEmpty < GAP_LIMIT) {
    const keypair = await keypairFromMnemonic(mnemonic, index);
    const pubkey = keypair.publicKey;

    const [balanceResult, signaturesResult] = await Promise.allSettled([
      connection.getBalance(pubkey, "confirmed"),
      connection.getSignaturesForAddress(pubkey, { limit: 1 }),
    ]);

    const balance = balanceResult.status === "fulfilled" ? balanceResult.value : 0;
    const hasSigs =
      signaturesResult.status === "fulfilled" &&
      signaturesResult.value.length > 0;

    const isEmpty = balance <= DUST_THRESHOLD && !hasSigs;

    if (!isEmpty) {
      discovered.push({
        index,
        publicKey: pubkey.toString(),
        balanceLamports: balance,
        hasHistory: hasSigs,
      });
      consecutiveEmpty = 0;
    } else {
      consecutiveEmpty++;
    }

    index++;
  }

  return discovered;
}
```

---

## Transaction Intent Verification (Anti-Drainer)

This is the most important security addition for a wallet. Before displaying "Approve", the wallet must parse every instruction and explain it in human language.

```typescript
// wallet/transaction-intent.ts
import {
  Transaction,
  VersionedTransaction,
  PublicKey,
  SystemInstruction,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

// Program IDs the wallet treats as known-safe
const KNOWN_SAFE_PROGRAMS = new Set([
  SystemProgram.programId.toString(),
  TOKEN_PROGRAM_ID.toString(),
  TOKEN_2022_PROGRAM_ID.toString(),
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",  // Jupiter v6
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",  // Orca Whirlpools
  "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",  // Serum DEX (legacy)
]);

export type IntentRisk = "safe" | "caution" | "danger" | "critical";

export interface InstructionIntent {
  programId: string;
  programName: string;
  humanReadable: string;
  risk: IntentRisk;
  detail: string;
  rawAccounts: string[];
}

export interface TransactionIntent {
  instructions: InstructionIntent[];
  overallRisk: IntentRisk;
  summary: string;
  warnings: string[];
  blockers: string[]; // Hard blocks — wallet MUST refuse
}

/**
 * Parse a transaction and return human-readable intent.
 * This runs BEFORE showing the approval UI.
 * Blockers should prevent the approval UI from ever rendering.
 */
export function analyzeTransactionIntent(
  tx: Transaction | VersionedTransaction,
  userPublicKey: PublicKey
): TransactionIntent {
  const instructions: InstructionIntent[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];

  // Get instructions from either transaction type
  const rawInstructions =
    tx instanceof Transaction
      ? tx.instructions
      : tx.message.compiledInstructions.map((ci) => ({
          programId: new PublicKey(
            tx.message.staticAccountKeys[ci.programIdIndex]
          ),
          keys: ci.accountKeyIndexes.map((i) => ({
            pubkey: new PublicKey(tx.message.staticAccountKeys[i]),
            isSigner: false,
            isWritable: false,
          })),
          data: Buffer.from(ci.data),
        }));

  for (const ix of rawInstructions) {
    const programId = ix.programId.toString();
    const isKnown = KNOWN_SAFE_PROGRAMS.has(programId);

    // ── System Program ────────────────────────────────────────────────────
    if (ix.programId.equals(SystemProgram.programId)) {
      const txType = SystemInstruction.decodeInstructionType(ix);
      if (txType === "Transfer") {
        const decoded = SystemInstruction.decodeTransfer(ix);
        const lamports = Number(decoded.lamports);
        const solAmount = (lamports / 1e9).toFixed(4);
        const toAddress = decoded.toPubkey.toString();
        instructions.push({
          programId,
          programName: "System Program",
          humanReadable: `Send ${solAmount} SOL to ${toAddress.slice(0, 6)}...${toAddress.slice(-4)}`,
          risk: "safe",
          detail: `Transfers ${lamports} lamports (${solAmount} SOL) from your wallet`,
          rawAccounts: [decoded.fromPubkey.toString(), toAddress],
        });
      } else if (txType === "Assign") {
        // Assigning account owner is high-risk
        blockers.push(
          "⛔ This transaction reassigns an account you own to a different program. This permanently transfers control of the account."
        );
      }
      continue;
    }

    // ── Token Program ────────────────────────────────────────────────────
    if (
      ix.programId.equals(TOKEN_PROGRAM_ID) ||
      ix.programId.equals(TOKEN_2022_PROGRAM_ID)
    ) {
      const discriminator = ix.data[0];

      // Instruction 7 = SetAuthority
      if (discriminator === 7) {
        const authorityType = ix.data[1];
        const newAuthority = ix.keys[1]?.pubkey.toString();
        const isUserOwner = ix.keys[0]?.pubkey.equals(userPublicKey);

        if (isUserOwner && authorityType === 1) {
          // AccountOwner authority type = drainer
          blockers.push(
            `⛔ DRAINER DETECTED: This transaction transfers ownership of your token account to ${newAuthority?.slice(0, 8)}... You will permanently lose access to all tokens in this account.`
          );
        } else {
          warnings.push(
            `⚠ SetAuthority instruction changes control of a token account. Verify the new authority is intended.`
          );
        }
        continue;
      }

      // Instruction 4 = Transfer
      if (discriminator === 4) {
        const amount = Number(
          new DataView(ix.data.buffer).getBigUint64(1, true)
        );
        instructions.push({
          programId,
          programName: "SPL Token Program",
          humanReadable: `Transfer ${amount} token units`,
          risk: "caution",
          detail: "Token transfer — verify amount and destination",
          rawAccounts: ix.keys.map((k) => k.pubkey.toString()),
        });
        continue;
      }

      // Instruction 3 = Approve (sets delegate — common drainer vector)
      if (discriminator === 3) {
        const delegate = ix.keys[1]?.pubkey.toString();
        warnings.push(
          `⚠ APPROVE instruction: grants ${delegate?.slice(0, 8)}... the ability to spend your tokens without further approval. Only approve contracts you trust completely.`
        );
      }
    }

    // ── Unknown program ───────────────────────────────────────────────────
    if (!isKnown) {
      warnings.push(
        `⚠ Unknown program: ${programId.slice(0, 8)}...${programId.slice(-4)} — this program is not on the known-safe list. Review carefully before approving.`
      );
    }
  }

  // Determine overall risk
  const overallRisk: IntentRisk =
    blockers.length > 0
      ? "critical"
      : warnings.some((w) => w.includes("DRAINER") || w.includes("⛔"))
      ? "danger"
      : warnings.length > 0
      ? "caution"
      : "safe";

  const summary =
    overallRisk === "critical"
      ? "🚫 Transaction blocked — contains malicious instructions"
      : overallRisk === "danger"
      ? "🔴 High risk — review warnings before approving"
      : overallRisk === "caution"
      ? "🟡 Review required — unusual instructions detected"
      : "🟢 Transaction appears safe";

  return { instructions, overallRisk, summary, warnings, blockers };
}
```

---

## Address Poisoning Defense

Address poisoning is one of the fastest-growing attack vectors on Solana.
An attacker sends tiny amounts from wallets with addresses that visually match
your address (same first/last 4 characters) to populate your transaction history.
When you copy-paste from history, you send to the attacker.

```typescript
// wallet/address-guard.ts
import { PublicKey } from "@solana/web3.js";

/**
 * Detect if a candidate address is visually similar to any known address.
 * Used to warn users in the send flow before confirming.
 */
export function detectAddressPoisoning(
  candidate: string,
  knownAddresses: string[]
): {
  isPoisoned: boolean;
  matchedAddress: string | null;
  similarity: number;
  warning: string | null;
} {
  for (const known of knownAddresses) {
    if (candidate === known) continue; // exact match is fine

    const firstN = 6; // first 6 chars
    const lastN = 6;  // last 6 chars

    const candidateFirst = candidate.slice(0, firstN);
    const candidateLast = candidate.slice(-lastN);
    const knownFirst = known.slice(0, firstN);
    const knownLast = known.slice(-lastN);

    const firstMatch = candidateFirst === knownFirst;
    const lastMatch = candidateLast === knownLast;

    if (firstMatch && lastMatch) {
      return {
        isPoisoned: true,
        matchedAddress: known,
        similarity: 0.95,
        warning: `⚠️ This address matches the first and last 6 characters of ${known.slice(0, 8)}...${known.slice(-6)} in your history. Address poisoning attacks use visually similar addresses. Verify the full address before sending.`,
      };
    }

    if (firstMatch || lastMatch) {
      return {
        isPoisoned: true,
        matchedAddress: known,
        similarity: 0.7,
        warning: `⚠️ This address is visually similar to a known address. Verify the full 44 characters before proceeding.`,
      };
    }
  }

  return { isPoisoned: false, matchedAddress: null, similarity: 0, warning: null };
}

/**
 * Clipboard integrity check — detect if clipboard was modified between copy and paste.
 * Call this immediately after paste, before using the pasted value.
 */
export async function verifyClipboardIntegrity(
  pastedValue: string
): Promise<{ isClean: boolean; warning: string | null }> {
  try {
    const clipboardContent = await navigator.clipboard.readText();
    if (clipboardContent !== pastedValue) {
      return {
        isClean: false,
        warning:
          "⚠️ Your clipboard contents changed between copy and paste. This may indicate a clipboard hijacking attack. Do not proceed without manually verifying the address.",
      };
    }
    return { isClean: true, warning: null };
  } catch {
    // Clipboard API not available — can't verify
    return { isClean: true, warning: null };
  }
}
```

---

## Wallet State Persistence Schema (Versioned)

Every wallet needs a migration path. Design the encrypted vault schema with version numbers from day one.

```typescript
// wallet/vault-schema.ts

/**
 * Versioned encrypted vault schema.
 *
 * IMPORTANT: Every schema change must increment the version and include
 * a migration function. Never break backwards compatibility.
 *
 * Version history:
 *   v1: Single account, mnemonic stored encrypted
 *   v2: Multi-account support, HD derivation index
 *   v3: (current) Named accounts, watch-only mode, security tier
 */
export interface VaultV3 {
  version: 3;
  createdAt: number;
  updatedAt: number;

  // The encrypted mnemonic (PBKDF2 + AES-256-GCM)
  encryptedMnemonic: {
    ciphertext: string;
    iv: string;
    salt: string;
    kdf: "pbkdf2" | "argon2id";
    kdfParams: Record<string, unknown>;
  };

  accounts: Array<{
    index: number;         // BIP44 account index (m/44'/501'/index'/0')
    label: string;         // User-given name
    publicKey: string;     // Cached for display (re-derived on unlock)
    isWatchOnly: boolean;  // True = imported public key only, no private key
    createdAt: number;
    lastUsedAt: number;
    securityTier: "software" | "hardware" | "mpc" | "program";
    hardwareDerivationPath?: string; // For hardware wallets
  }>;

  // Metadata — never contains key material
  walletId: string;   // Random UUID, used for analytics (no wallet identity)
  backupVerifiedAt: number | null;
  autoLockMs: number;
}

export async function migrateVault(
  raw: Record<string, unknown>
): Promise<VaultV3> {
  const version = raw.version as number;
  if (version === 3) return raw as VaultV3;
  if (version === 2) return migrateV2ToV3(raw);
  if (version === 1) return migrateV2ToV3(migrateV1ToV2(raw));
  throw new Error(`Unknown vault version: ${version}`);
}

function migrateV1ToV2(v1: Record<string, unknown>): Record<string, unknown> {
  return {
    ...v1,
    version: 2,
    accounts: [
      {
        index: 0,
        label: "Account 1",
        publicKey: v1.publicKey,
        isWatchOnly: false,
        createdAt: v1.createdAt,
        lastUsedAt: Date.now(),
      },
    ],
  };
}

function migrateV2ToV3(v2: Record<string, unknown>): VaultV3 {
  return {
    ...(v2 as any),
    version: 3,
    accounts: ((v2.accounts as any[]) ?? []).map((acc) => ({
      ...acc,
      securityTier: "software" as const,
      createdAt: acc.createdAt ?? Date.now(),
      lastUsedAt: acc.lastUsedAt ?? Date.now(),
    })),
    walletId: crypto.randomUUID(),
    backupVerifiedAt: null,
    autoLockMs: 15 * 60 * 1000,
  };
}
```

---

## Watch-Only / Read-Only Mode

A critical feature for institutional users and portfolio monitoring.

```typescript
// wallet/watch-only.ts
import { Connection, PublicKey, ParsedAccountData } from "@solana/web3.js";

export interface WatchedPortfolio {
  address: string;
  label: string;
  balanceSol: number;
  tokenBalances: Array<{
    mint: string;
    symbol: string;
    amount: number;
    usdValue: number | null;
  }>;
  lastRefreshedAt: number;
}

/**
 * Add a public key as a watch-only account.
 * Watch-only accounts can never sign — they are read-only portfolio views.
 */
export async function watchAddress(
  address: string,
  label: string,
  connection: Connection
): Promise<WatchedPortfolio> {
  const pubkey = new PublicKey(address); // Validates the address format

  const [balance, tokenAccounts] = await Promise.all([
    connection.getBalance(pubkey, "confirmed"),
    connection.getParsedTokenAccountsByOwner(pubkey, {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    }),
  ]);

  return {
    address,
    label,
    balanceSol: balance / 1e9,
    tokenBalances: tokenAccounts.value
      .filter((ta) => {
        const info = (ta.account.data as ParsedAccountData).parsed?.info;
        return info?.tokenAmount?.uiAmount > 0;
      })
      .map((ta) => {
        const info = (ta.account.data as ParsedAccountData).parsed?.info;
        return {
          mint: info.mint,
          symbol: "UNKNOWN", // Fetch from token registry
          amount: info.tokenAmount.uiAmount,
          usdValue: null, // Fetch from Jupiter price API
        };
      }),
    lastRefreshedAt: Date.now(),
  };
}
```

---

## Memory Safety — Zeroize Key Material

Most wallets do not properly clear key material from memory. On mobile, memory dumps are a real attack vector.

```typescript
// wallet/memory-safety.ts

/**
 * Overwrite a Uint8Array with zeros and unlink all references.
 * Call this immediately after using a private key or seed.
 *
 * Limitation: JavaScript GC means we can't guarantee immediate collection,
 * but zeroing the buffer eliminates the key material even if GC delays.
 */
export function zeroize(buf: Uint8Array): void {
  buf.fill(0);
}

/**
 * Execute a signing operation with automatic key cleanup.
 * The private key is available ONLY within the callback, then zeroed.
 */
export async function withKey<T>(
  getKey: () => Promise<Uint8Array>,
  operation: (key: Uint8Array) => Promise<T>
): Promise<T> {
  const key = await getKey();
  try {
    return await operation(key);
  } finally {
    zeroize(key); // Always clears, even on exception
  }
}

// Usage:
// const signature = await withKey(
//   () => decryptKey(encryptedKey, password),
//   (key) => signTransaction(tx, key)
// );
// After this call, key is zeroed. No reference to raw key material exists.
```

---

## Session Key Architecture (Delegated Signing)

For dApps that need frictionless UX without asking for wallet approval on every action.

```typescript
// wallet/session-keys.ts
import { Keypair, PublicKey, Transaction, Connection } from "@solana/web3.js";

/**
 * Session key pattern for Solana dApps.
 *
 * Instead of asking the hardware wallet for every micro-transaction,
 * the user approves ONE transaction that delegates signing authority
 * to a short-lived ephemeral keypair.
 *
 * The dApp then uses the session key for subsequent transactions.
 * When the session expires, the ephemeral key is deleted.
 *
 * Used by: gaming, trading bots, DePIN proof submissions
 *
 * SECURITY CONSTRAINTS (enforce in program):
 *   - Session key can only call specific program instructions
 *   - Session key has a spending limit
 *   - Session key expires after N slots or N hours
 *   - Session key cannot transfer SOL or delegate to others
 */

export interface SessionKeyConfig {
  programId: PublicKey;             // Which program the session key can call
  allowedInstructions: number[];    // Instruction discriminators allowed
  maxSolSpend: number;              // Max SOL spendable per session
  expiresAt: number;                // Unix timestamp
}

export interface SessionKey {
  keypair: Keypair;
  config: SessionKeyConfig;
  createdAt: number;
  usageCount: number;
}

export function createSessionKey(config: SessionKeyConfig): SessionKey {
  return {
    keypair: Keypair.generate(), // Ephemeral, never persisted
    config,
    createdAt: Date.now(),
    usageCount: 0,
  };
}

export function isSessionKeyValid(session: SessionKey): boolean {
  return (
    Date.now() < session.config.expiresAt &&
    session.usageCount < 1000 // Hard usage cap
  );
}

export function revokeSessionKey(session: SessionKey): void {
  // Zeroize the ephemeral key
  zeroize(session.keypair.secretKey);
}

function zeroize(buf: Uint8Array): void {
  buf.fill(0);
}
```

---

## Cross-Skill Integration Map (Wallet-Centric)

```
THIS FILE (wallet-engineering.md)
  └── Defines: threat model, security tiers, vault schema, intent verification

FEEDS INTO:
  ├── solana-ux-skill/skill/wallet-building.md
  │     ← Read for keypair generation, encryption code, hardware wallet code
  │
  ├── solana-ux-skill/skill/wallet-ux.md
  │     ← Read for connection state machine, seed phrase backup UI
  │
  ├── solana-incident-response-skill/skill/wallet-security.md
  │     ← When any threat in the threat model (A1-A8) is triggered
  │     ← When address poisoning, clipboard hijacking, or drainer detected
  │
  ├── Solana-observabilty-skill/skill/security-observability.md
  │     ← WALLET_ANOMALY_SIGNAL when:
  │       - Multiple failed signing attempts (brute force auto-lock)
  │       - SetAuthority instruction blocked
  │       - Address poisoning pattern detected in transaction history
  │
  └── solana-depin-builder-skill/skill/node-registry.md
        ← Two-keypair model references this architecture
        ← Device keypair = analogous to session key pattern

WALLET_KEY_COMPROMISED SIGNAL:
  Fired by: incident-response after key compromise confirmed
  Received by: ALL skills (triggers heightened monitoring across ecosystem)
  Action: load wallet-security.md → immediate rotation protocol
```

---

## Wallet Engineering Checklist

Use this before shipping any wallet to production. Every unchecked item is a potential incident.

**Key Management**
- [ ] AES-256-GCM encryption with Argon2id (mobile/Electron) or PBKDF2 600K (browser)
- [ ] Seed phrase verification step before completing wallet creation
- [ ] Auto-lock implemented with configurable timeout (default 15 min)
- [ ] Key material zeroed from memory after use (`withKey` pattern)
- [ ] Vault schema versioned — migration functions defined for all future versions
- [ ] Watch-only mode available — users can add read-only addresses

**Transaction Security**
- [ ] `analyzeTransactionIntent` runs before any approval UI renders
- [ ] SetAuthority instructions on user-owned token accounts → hard block
- [ ] Unknown program warnings shown for any non-whitelist program
- [ ] Transaction simulation (dry run) before requesting user signature
- [ ] Address poisoning check on every send target address
- [ ] Clipboard integrity verified on paste

**Multi-Account**
- [ ] BIP44 HD derivation implemented (`m/44'/501'/{index}'/0'`)
- [ ] Gap limit account discovery runs on seed phrase restore (not just index 0)
- [ ] Security tier displayed per account (software / hardware / MPC / program)
- [ ] Upgrade prompt fires when balance exceeds tier threshold

**Security Architecture**
- [ ] All four threat model layers addressed (A1-A8)
- [ ] No key material ever sent over network
- [ ] No key material in logs, console, or error messages
- [ ] CSP headers set on extension manifest / web app
- [ ] Session keys scoped to specific programs and instruction discriminators

**Cross-Skill**
- [ ] `WALLET_KEY_COMPROMISED` signal wired to incident-response-skill
- [ ] Signing latency tracked → feeds observability-skill wallet SLOs
- [ ] Fee payer compromise response wired to incident-response-skill
