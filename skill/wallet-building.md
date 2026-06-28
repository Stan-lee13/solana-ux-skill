# Wallet Building — Keypair Management, Hardware Wallets, MPC, and Embedded Wallets

> Load this skill when building a Solana wallet application itself — not integrating
> with an existing wallet, but engineering the keypair lifecycle, signing architecture,
> and key storage for a new wallet product.

This is the most security-critical skill in the kit. Every decision here has financial consequences.

---

## Wallet Architecture Decision Tree

```
WHAT ARE YOU BUILDING?
├── Browser extension wallet (like Phantom)
│   → Keypair in extension background service worker
│   → Encrypted with user password via AES-256-GCM
│   → Section: Browser Extension Architecture
│
├── Mobile wallet (React Native, standalone)
│   → Keypair in OS Secure Enclave / Keychain
│   → MWA server implementation for dApp connections
│   → Section: Mobile Native Wallet
│
├── Embedded / custodial (Web2 onboarding, no seed phrase)
│   → Privy / Magic / Web3Auth — do NOT build keypair management yourself
│   → Section: Embedded Wallet Integration
│
├── Hardware wallet integration
│   → Ledger Transport API, derivation paths, blind signing prevention
│   → Section: Hardware Wallet Integration
│
├── MPC / threshold wallet (no single point of failure)
│   → Lit Protocol / Capsule / Web3Auth MPC
│   → Section: MPC Wallet Architecture
│
└── Server-side signing (fee payers, protocol treasuries)
    → Keypair loaded from secrets manager, NEVER hardcoded
    → Section: Server-Side Keypair Management
```

---

## Keypair Generation — The Correct Way

```typescript
// src/keypair/generate.ts
import { Keypair } from "@solana/web3.js";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";

// ─── Option 1: Random keypair (for servers, fee payers, testing)
export function generateRandomKeypair(): Keypair {
  return Keypair.generate();
  // Export: Buffer.from(keypair.secretKey).toString('base64')
  // Store in secrets manager — NEVER in code or .env committed to git
}

// ─── Option 2: BIP39 mnemonic → HD wallet (for user wallets)
// Derivation path: m/44'/501'/{account}'/0' (Solana standard)
export async function keypairFromMnemonic(
  mnemonic: string,
  accountIndex = 0
): Promise<Keypair> {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }

  const seed = await bip39.mnemonicToSeed(mnemonic);
  const path = `m/44'/501'/${accountIndex}'/0'`;
  const { key } = derivePath(path, seed.toString("hex"));
  return Keypair.fromSeed(key);
}

// ─── Option 3: Single private key (legacy, not recommended for new wallets)
export function keypairFromPrivateKey(privateKeyBytes: Uint8Array): Keypair {
  if (privateKeyBytes.length !== 64 && privateKeyBytes.length !== 32) {
    throw new Error(`Invalid private key length: ${privateKeyBytes.length}`);
  }
  // Solana expects 64-byte secret key (32 private + 32 public)
  if (privateKeyBytes.length === 32) {
    return Keypair.fromSeed(privateKeyBytes);
  }
  return Keypair.fromSecretKey(privateKeyBytes);
}

// ─── Entropy validation (use before storing any mnemonic)
export function validateEntropyStrength(mnemonic: string): {
  valid: boolean;
  wordCount: number;
  entropyBits: number;
  recommendation: string;
} {
  const words = mnemonic.trim().split(/\s+/);
  const wordCount = words.length;
  // 12 words = 128 bits, 24 words = 256 bits
  const entropyBits = wordCount === 12 ? 128 : wordCount === 24 ? 256 : 0;
  const valid = bip39.validateMnemonic(mnemonic) && (wordCount === 12 || wordCount === 24);

  return {
    valid,
    wordCount,
    entropyBits,
    recommendation: entropyBits >= 256
      ? "Excellent — 24-word phrase provides 256-bit security"
      : entropyBits >= 128
      ? "Acceptable — 12-word phrase provides 128-bit security"
      : "Invalid — use a proper BIP39 mnemonic",
  };
}
```

---

## Browser Extension Wallet Architecture

Key storage pattern for a Chromium extension wallet:

```typescript
// background/keyring.ts
import { Keypair } from "@solana/web3.js";

// AES-256-GCM encryption for keypair storage in chrome.storage.local
async function encryptKeypair(
  keypair: Keypair,
  password: string
): Promise<{ ciphertext: string; iv: string; salt: string }> {
  const enc = new TextEncoder();

  // Derive key from password using PBKDF2
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    keypair.secretKey
  );

  return {
    ciphertext: Buffer.from(ciphertext).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    salt: Buffer.from(salt).toString("base64"),
  };
}

async function decryptKeypair(
  encrypted: { ciphertext: string; iv: string; salt: string },
  password: string
): Promise<Keypair> {
  const enc = new TextEncoder();
  const salt = Buffer.from(encrypted.salt, "base64");
  const iv = Buffer.from(encrypted.iv, "base64");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");

  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const secretKey = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertext
  );
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

// In-memory keyring — keys only live in memory after unlock
// Never write unlocked keys to disk or storage
class Keyring {
  private keypairs: Map<string, Keypair> = new Map();
  private lockedAt: number | null = null;
  private readonly AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes

  async unlock(address: string, password: string): Promise<void> {
    const stored = await chrome.storage.local.get(`keypair:${address}`);
    const encrypted = stored[`keypair:${address}`];
    if (!encrypted) throw new Error("Keypair not found");
    const keypair = await decryptKeypair(encrypted, password);
    this.keypairs.set(address, keypair);
    this.lockedAt = Date.now() + this.AUTO_LOCK_MS;
  }

  sign(address: string, message: Uint8Array): Uint8Array {
    this.checkLock();
    const keypair = this.keypairs.get(address);
    if (!keypair) throw new Error("Wallet is locked — please unlock first");
    // nacl.sign.detached is used internally by Keypair
    const { sign } = require("tweetnacl");
    return sign.detached(message, keypair.secretKey);
  }

  lock(): void {
    this.keypairs.clear();
    this.lockedAt = null;
  }

  private checkLock(): void {
    if (!this.lockedAt || Date.now() > this.lockedAt) {
      this.lock();
      throw new Error("Session expired — wallet auto-locked after inactivity");
    }
  }
}
```

---

## Mobile Native Wallet — iOS Keychain / Android Keystore

```typescript
// Mobile: use expo-secure-store (backed by iOS Keychain / Android Keystore)
// Never use AsyncStorage for private keys — it is not encrypted

import * as SecureStore from "expo-secure-store";
import { Keypair } from "@solana/web3.js";
import * as bip39 from "bip39";

const MNEMONIC_KEY = "solana_wallet_mnemonic";
const BIOMETRIC_KEY = "solana_wallet_biometric_enabled";

export async function storeMnemonicSecurely(
  mnemonic: string,
  requireBiometrics = true
): Promise<void> {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic — not stored");
  }

  await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic, {
    // Require biometric authentication to read (iOS: Face ID / Touch ID)
    // Android: Fingerprint / BiometricPrompt
    requireAuthentication: requireBiometrics,
    authenticationPrompt: "Authenticate to access your wallet",
  });
}

export async function loadKeypairFromSecureStore(
  accountIndex = 0
): Promise<Keypair | null> {
  try {
    const mnemonic = await SecureStore.getItemAsync(MNEMONIC_KEY, {
      requireAuthentication: true,
      authenticationPrompt: "Authenticate to sign transaction",
    });
    if (!mnemonic) return null;

    const seed = await bip39.mnemonicToSeed(mnemonic);
    const { derivePath } = await import("ed25519-hd-key");
    const path = `m/44'/501'/${accountIndex}'/0'`;
    const { key } = derivePath(path, seed.toString("hex"));
    return Keypair.fromSeed(key);
  } catch (err) {
    // User cancelled biometric — do not throw, return null
    console.warn("[wallet] Biometric auth cancelled or failed");
    return null;
  }
}

// MWA SERVER — implement for dApp connections to your mobile wallet
// Your wallet app registers as an MWA provider so dApps can connect
// This is different from using MWA as a dApp — this makes your app THE wallet
import { SolanaMobileWalletAdapterWalletAssociation } from "@solana-mobile/mobile-wallet-adapter-protocol";

export const MWA_SERVER_CONFIG = {
  // Must match your app's deep link scheme
  walletUriBase: "yourwallet://",
  // Features your wallet supports
  features: {
    // Signing
    "solana:signTransaction": true,
    "solana:signAllTransactions": true,
    "solana:signMessage": true,
    // Sending
    "solana:sendTransaction": true,
  },
  // Clusters supported
  supportedTransactionVersions: ["legacy", 0] as const,
};
```

---

## Hardware Wallet Integration (Ledger)

```typescript
// src/hardware/ledger.ts
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import Solana from "@ledgerhq/hw-app-solana";
import { PublicKey } from "@solana/web3.js";

// Standard Solana derivation paths
const DERIVATION_PATHS = {
  default: "44'/501'/0'",           // Account 0 (most common)
  legacy: "44'/501'/0'/0'",          // Legacy Ledger Live path
  account: (n: number) => `44'/501'/${n}'`,
};

export async function connectLedger(): Promise<{
  transport: TransportWebHID;
  app: Solana;
}> {
  // requestDevice prompts the browser HID permission dialog
  const transport = await TransportWebHID.create();
  const app = new Solana(transport);
  return { transport, app };
}

export async function getLedgerPublicKey(
  app: Solana,
  accountIndex = 0
): Promise<PublicKey> {
  const path = DERIVATION_PATHS.account(accountIndex);
  const { address } = await app.getAddress(path);
  return new PublicKey(address);
}

export async function signTransactionWithLedger(
  app: Solana,
  serializedTransaction: Buffer,
  accountIndex = 0
): Promise<Buffer> {
  const path = DERIVATION_PATHS.account(accountIndex);

  // This opens the Ledger signing screen — user must physically confirm
  const { signature } = await app.signTransaction(
    path,
    serializedTransaction
  );
  return signature;
}

// Critical: check for blind signing
// Ledger can only parse transactions it understands
// Unknown programs = "blind signing" = security risk
export function checkBlindSigningRisk(
  transaction: Buffer,
  knownProgramIds: string[]
): { riskLevel: "safe" | "caution" | "blind"; unknownPrograms: string[] } {
  // Parse account keys from transaction (simplified)
  // In production: deserialize the full transaction and check programIdIndex
  const unknownPrograms: string[] = [];

  // If any program in the transaction is not in knownProgramIds,
  // the Ledger app cannot display what the user is signing
  const riskLevel =
    unknownPrograms.length === 0 ? "safe" :
    unknownPrograms.length <= 2 ? "caution" : "blind";

  return { riskLevel, unknownPrograms };
}

// Ledger connection error handling
export function classifyLedgerError(error: Error): {
  message: string;
  userAction: string;
} {
  const msg = error.message.toLowerCase();

  if (msg.includes("device not found") || msg.includes("no device")) {
    return {
      message: "Ledger not detected",
      userAction: "Connect your Ledger via USB and unlock it",
    };
  }
  if (msg.includes("locked") || msg.includes("0x6804")) {
    return {
      message: "Ledger is locked",
      userAction: "Enter your PIN on the Ledger device",
    };
  }
  if (msg.includes("solana") && msg.includes("open")) {
    return {
      message: "Solana app not open",
      userAction: "Open the Solana app on your Ledger",
    };
  }
  if (msg.includes("denied") || msg.includes("0x6985")) {
    return {
      message: "Transaction rejected on device",
      userAction: "You declined the transaction on your Ledger",
    };
  }
  if (msg.includes("blind signing")) {
    return {
      message: "Blind signing not enabled",
      userAction: "Enable 'Allow blind signing' in the Solana Ledger app settings",
    };
  }
  return {
    message: "Ledger error",
    userAction: "Reconnect your Ledger and try again",
  };
}
```

---

## MPC Wallet Architecture (No Single Point of Failure)

MPC splits the private key across multiple parties — no single party ever holds the full key.

```typescript
// Option 1: Lit Protocol (most production-ready for Solana in 2026)
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitAbility, LitActionResource } from "@lit-protocol/auth-helpers";

export async function createLitMPCWallet(
  userId: string, // e.g., user's email hash
  authMethod: "google" | "discord" | "email_otp"
): Promise<{ pkpPublicKey: string; ethAddress: string }> {
  const client = new LitNodeClient({ litNetwork: "datil" });
  await client.connect();

  // PKP = Programmable Key Pair — the MPC-backed keypair
  // The private key is split across Lit nodes; no single node can sign alone
  // This is production MPC for Solana

  // In production: use Lit's PKP mint + authentication flow
  // Docs: https://developer.litprotocol.com/sdk/wallets/intro
  throw new Error("Implement with Lit SDK — see https://developer.litprotocol.com");
}

// Option 2: Capsule (enterprise-grade MPC)
// Capsule splits keys 2-of-2 between user device and Capsule servers
// Works with Solana natively
// Docs: https://docs.usecapsule.com

// Option 3: Web3Auth MPC-TSS
// Threshold signature scheme — no reconstruction needed
// 2-of-3: user device share + Web3Auth servers + backup share
// Docs: https://web3auth.io/docs/sdk/core-kit/mpc-core-kit

// Comparison table for MPC providers
export const MPC_PROVIDERS = {
  "Lit Protocol": {
    model: "threshold-BLS",
    solanaSupport: "native",
    custodyModel: "decentralized (35+ nodes)",
    useCase: "DeFi protocols, NFT platforms",
    pricing: "per-session fee",
  },
  "Capsule": {
    model: "2-of-2 MPC",
    solanaSupport: "native",
    custodyModel: "semi-custodial (Capsule holds 1 share)",
    useCase: "consumer apps, embedded wallets",
    pricing: "usage-based",
  },
  "Web3Auth MPC": {
    model: "TSS (threshold signature scheme)",
    solanaSupport: "native",
    custodyModel: "distributed",
    useCase: "enterprise, wallet-as-a-service",
    pricing: "MAU-based",
  },
  "Privy": {
    model: "embedded custodial (not MPC)",
    solanaSupport: "native",
    custodyModel: "Privy-custodied",
    useCase: "Web2 onboarding, best DX",
    pricing: "MAU-based",
  },
};
```

---

## Server-Side Keypair Management (Fee Payers, Protocol Treasuries)

```typescript
// src/server/keypair-manager.ts
// For server-side signing: fee payers, protocol treasuries, automation wallets
// NEVER hardcode keys. NEVER use .env files committed to git.

import { Keypair } from "@solana/web3.js";

// ─── Option 1: AWS Secrets Manager (recommended for production)
async function loadKeypairFromAWS(secretName: string): Promise<Keypair> {
  const { SecretsManagerClient, GetSecretValueCommand } = await import(
    "@aws-sdk/client-secrets-manager"
  );
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  const result = await client.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  if (!result.SecretString) throw new Error(`Secret ${secretName} is empty`);
  const secretKey = Uint8Array.from(JSON.parse(result.SecretString));
  return Keypair.fromSecretKey(secretKey);
}

// ─── Option 2: Google Cloud Secret Manager
async function loadKeypairFromGCP(secretPath: string): Promise<Keypair> {
  const { SecretManagerServiceClient } = await import(
    "@google-cloud/secret-manager"
  );
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({ name: secretPath });
  const payload = version.payload?.data;
  if (!payload) throw new Error("Secret payload empty");
  const secretKey = Uint8Array.from(JSON.parse(payload.toString()));
  return Keypair.fromSecretKey(secretKey);
}

// ─── Option 3: HashiCorp Vault (self-hosted)
async function loadKeypairFromVault(
  vaultAddr: string,
  secretPath: string,
  token: string
): Promise<Keypair> {
  const response = await fetch(`${vaultAddr}/v1/${secretPath}`, {
    headers: { "X-Vault-Token": token },
  });
  const { data } = await response.json();
  const secretKey = Uint8Array.from(JSON.parse(data.secret_key));
  return Keypair.fromSecretKey(secretKey);
}

// ─── Key rotation pattern
// Rotate without downtime: fund new key → update config → drain old key
export async function rotateServerKeypair(
  currentKeypair: Keypair,
  newKeypair: Keypair,
  minBalanceSol = 0.1
): Promise<void> {
  const { Connection, LAMPORTS_PER_SOL, SystemProgram, Transaction,
    sendAndConfirmTransaction } = await import("@solana/web3.js");
  const connection = new Connection(process.env.HELIUS_RPC_URL!);

  // 1. Fund new keypair from current
  const currentBalance = await connection.getBalance(currentKeypair.publicKey);
  const transferAmount = currentBalance - 0.001 * LAMPORTS_PER_SOL; // keep dust

  if (transferAmount > minBalanceSol * LAMPORTS_PER_SOL) {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: currentKeypair.publicKey,
        toPubkey: newKeypair.publicKey,
        lamports: transferAmount,
      })
    );
    await sendAndConfirmTransaction(connection, tx, [currentKeypair]);
  }

  // 2. Update secrets manager with new keypair (manual step — document this)
  console.log(`
  KEY ROTATION REQUIRED:
  Old: ${currentKeypair.publicKey.toString()}
  New: ${newKeypair.publicKey.toString()}
  
  Update your secrets manager with the new keypair and redeploy.
  Verify the new keypair is funded before decommissioning the old one.
  `);
}
```

---

## Seed Phrase UX — The Backup Flow

```typescript
// src/components/SeedPhraseBackup.tsx
// Critical UX: users who lose their seed phrase lose their funds forever
// This component enforces verification before completing setup

import { useState } from "react";
import * as bip39 from "bip39";

interface SeedPhraseBackupProps {
  mnemonic: string;
  onVerified: () => void;
}

// Step 1: Show the words in order (numbered, easy to write down)
// Step 2: Ask user to confirm 3 random words from the phrase
// Step 3: ONLY proceed after verification passes

export function SeedPhraseBackup({ mnemonic, onVerified }: SeedPhraseBackupProps) {
  const words = mnemonic.split(" ");
  const [step, setStep] = useState<"display" | "verify">("display");

  // Pick 3 random positions to verify
  const verifyPositions = [
    Math.floor(Math.random() * 4),          // from first 4
    4 + Math.floor(Math.random() * 4),       // from middle
    8 + Math.floor(Math.random() * 4),       // from last 4
  ];

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  function verifyPhrase() {
    const allCorrect = verifyPositions.every(
      (pos) => answers[pos]?.toLowerCase().trim() === words[pos]
    );
    if (allCorrect) {
      onVerified();
    } else {
      setError("Some words are incorrect. Double-check your backup and try again.");
    }
  }

  if (step === "display") {
    return (
      <div className="space-y-4">
        <p className="text-destructive font-semibold">
          ⚠️ Write these 12 words down. Anyone with this phrase can access your funds.
          Never share it with anyone, including support staff.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {words.map((word, i) => (
            <div key={i} className="flex items-center gap-2 bg-muted rounded p-2">
              <span className="text-muted-foreground text-xs w-4">{i + 1}.</span>
              <span className="font-mono font-semibold">{word}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setStep("verify")}
          className="w-full bg-primary text-primary-foreground rounded px-4 py-2"
        >
          I've written it down — Verify
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="font-semibold">Verify your backup</p>
      <p className="text-muted-foreground text-sm">
        Enter the words at the following positions to confirm you saved your phrase:
      </p>
      {verifyPositions.map((pos) => (
        <div key={pos} className="flex items-center gap-3">
          <label className="text-sm w-24">Word #{pos + 1}:</label>
          <input
            type="text"
            className="border rounded px-3 py-1 bg-background flex-1"
            value={answers[pos] ?? ""}
            onChange={(e) => setAnswers((a) => ({ ...a, [pos]: e.target.value }))}
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
      ))}
      {error && <p className="text-destructive text-sm">{error}</p>}
      <button
        onClick={verifyPhrase}
        className="w-full bg-primary text-primary-foreground rounded px-4 py-2"
      >
        Verify Backup
      </button>
    </div>
  );
}
```

---

## Security Checklist for Wallet Builders

```text
NEVER:
[ ] Never store unencrypted private keys in localStorage, AsyncStorage, or any DB
[ ] Never log private keys or mnemonics — even in development
[ ] Never send keypair material over network (including to your own backend)
[ ] Never use Math.random() for cryptographic key generation
[ ] Never allow arbitrary instruction signing in fee payer proxies
[ ] Never auto-approve transactions — always require explicit user confirmation
[ ] Never skip biometric for key access on mobile

ALWAYS:
[ ] AES-256-GCM + PBKDF2(600K iterations) for browser key storage
[ ] expo-secure-store (Keychain/Keystore) for React Native
[ ] Verify seed phrase backup before completing wallet creation
[ ] Auto-lock after inactivity (15 min default)
[ ] Show human-readable transaction details before signing
[ ] Warn explicitly before blind signing (Ledger, unknown programs)
[ ] Rotate server keypairs on any suspected compromise — no questions asked
[ ] Separate keypairs by role: fee payer, treasury, upgrade authority (never shared)
```

---

## Cross-Skill Integration

### Feeds UX Skill (gasless-onboarding.md)
- Server keypairs managed here → used as fee payer in gasless proxy
- Embedded wallet (Privy/Magic) → integrated via `skill/gasless-onboarding.md` onboarding flow

### Feeds Incident Response
- Keypair compromise → immediately load `solana-incident-response-skill/skill/wallet-security.md`
- Server fee payer compromised → load `skill/active-exploit-response.md`

### Feeds DePIN
- Node operator wallet architecture → deterministic HD wallet from operator seed
- Hardware wallet required for node treasury keys
