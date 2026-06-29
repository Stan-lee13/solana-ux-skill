# Solana Wallet Engineering Framework

> This document is the single source of truth for how all five Solana AI skills
> coordinate to produce a complete, institutional-grade Solana wallet.
>
> Load this file when asked: "how do I build a complete Solana wallet?"
> It maps every wallet requirement to the exact skill files that address it.

---

## Framework Philosophy

A production Solana wallet is not a single problem. It is the intersection of five distinct engineering domains:

| Domain | Primary Skill | Key Files |
|--------|--------------|-----------|
| Key Management & Security Architecture | UX | `skill/wallet-engineering.md`, `skill/wallet-building.md` |
| Transaction Security & Threat Response | Incident Response | `skill/wallet-security.md`, `skill/threat-intelligence.md` |
| Reliability & Performance Monitoring | Observability | `skill/wallet-observability.md`, `skill/security-observability.md` |
| Physical World Integration (DePIN wallets) | DePIN | `skill/node-registry.md`, `skill/hardware-integration.md` |
| Token Economics & Claim Flows | Token Launch | `skill/airdrop-orchestration.md`, `skill/spl-token-setup.md` |

No single skill covers every wallet requirement. But together, with clear handoffs, they cover all of it.

---

## Wallet Development Lifecycle → Skill Routing

```
PHASE 1: ARCHITECTURE DESIGN
  Question: What type of wallet am I building?
  → Load: skill/wallet-engineering.md → Wallet Architecture Decision Tree

PHASE 2: KEY MANAGEMENT IMPLEMENTATION
  Question: How do I generate, encrypt, and store keys correctly?
  → Load: skill/wallet-building.md → Keypair Generation + Encryption
  → Load: skill/wallet-engineering.md → Argon2id vs PBKDF2, Vault Schema

PHASE 3: TRANSACTION UX IMPLEMENTATION
  Question: How do I build the signing flow, error states, and feedback?
  → Load: skill/wallet-ux.md → Connection State Machine
  → Load: skill/transaction-feedback-ux.md → 12-state transaction machine
  → Load: skill/wallet-engineering.md → Transaction Intent Verification

PHASE 4: MOBILE / EXTENSION SPECIFIC
  Question: How do I implement MWA on mobile or extension isolation?
  → Load: skill/mwa-ux.md → Mobile Wallet Adapter
  → Load: skill/wallet-building.md → Browser Extension Architecture

PHASE 5: SECURITY HARDENING
  Question: What attacks do I need to defend against?
  → Load: skill/wallet-engineering.md → Complete Wallet Threat Model (A1-A8)
  → Load: skill/wallet-security.md → Drainer patterns, supply chain defense
  → Load: skill/threat-intelligence.md → Pre-exploit signal detection

PHASE 6: GASLESS ONBOARDING
  Question: How do I sponsor first transactions?
  → Load: skill/gasless-onboarding.md → Fee Payer Proxy architecture
  → Load: skill/wallet-observability.md → Fee payer runway monitoring

PHASE 7: PRODUCTION MONITORING
  Question: How do I monitor wallet health in production?
  → Load: skill/wallet-observability.md → Wallet SLOs + Metrics
  → Load: skill/security-observability.md → Security signal detection

PHASE 8: INCIDENT RESPONSE WIRING
  Question: What happens when something goes wrong?
  → Load: skill/wallet-security.md → WALLET_KEY_COMPROMISED signal
  → Load: skill/active-exploit-response.md → Key compromise response
  → ecosystem-signals.md in ALL skills → cross-skill signal routing
```

---

## The Eight Wallet Security Requirements

Every production wallet must address all eight. These map directly to the threat model in `wallet-engineering.md`.

| Requirement | Skill | File |
|-------------|-------|------|
| RPC spoofing prevention | Observability | `skill/infrastructure-monitoring.md` |
| Malicious dApp / drainer blocking | UX + IR | `wallet-engineering.md` → intent verification |
| Extension isolation | UX | `skill/wallet-building.md` → Browser Extension section |
| Clipboard hijacking defense | UX | `wallet-engineering.md` → `verifyClipboardIntegrity` |
| Address poisoning defense | UX + IR | `wallet-engineering.md` → `detectAddressPoisoning` |
| Physical device theft | UX | `wallet-building.md` → auto-lock, biometric |
| Phishing domain detection | UX | `wallet-ux.md` → connected domain display |
| Supply chain defense | IR | `wallet-security.md` → Supply Chain Attack section |

---

## Shared Architectural Principles

These principles apply across all five skills when building wallet infrastructure:

**P1 — Defense in depth.** Never rely on a single control. Key encryption + auto-lock + intent verification + monitoring are all required, not optional.

**P2 — Zero trust.** Trust nothing from the dApp, the RPC, or the network. Verify everything independently before showing it to the user.

**P3 — Progressive disclosure.** Don't overwhelm users with security warnings. Surface warnings proportional to actual risk level (safe / caution / danger / critical).

**P4 — Privacy by design.** Never collect what you don't need. Aggregate metrics only. No wallet addresses in logs. No behavioral surveillance.

**P5 — Fail secure.** When in doubt, block and explain. A false positive that requires a user to retry is infinitely better than a false negative that costs them their funds.

**P6 — Recoverable.** Every wallet state must have a clear recovery path. No dead ends. No situations where a user loses funds because of UX decisions.

**P7 — Observable.** Operations teams must be able to see wallet health, fee payer runway, and security events in real time without accessing user data.

**P8 — Upgradeable.** The security tier must be upgradeable without losing the account. Software → hardware → MPC → Squads — every transition should preserve the wallet identity.

---

## Canonical Signal Definitions (Wallet-Specific)

These signals are used across all five skills. Any skill that detects one of these conditions MUST fire the corresponding signal.

```typescript
// CANONICAL WALLET SIGNALS — used by all 5 skills

// P0 — Immediate action required across all skills
export type WALLET_KEY_COMPROMISED = {
  signal: "WALLET_KEY_COMPROMISED";
  // Fire: IR skill
  // Receive: ALL skills
  // Response: load active-exploit-response.md immediately
};

// P1 — Security event, investigate within 15 minutes
export type WALLET_DRAINER_ACTIVE = {
  signal: "WALLET_DRAINER_ACTIVE";
  // Fire: UX skill (intent analyzer blocked drainer)
  // Receive: IR skill, Observability skill
  // Response: wallet-security.md → Drainer Contract Deep Analysis
};

// P1 — Fee-funded flows at risk
export type WALLET_FEE_PAYER_CRITICAL = {
  signal: "WALLET_FEE_PAYER_CRITICAL";
  // Fire: Observability skill
  // Receive: UX skill (degrade gasless gracefully), DePIN (pause proof submission)
  // Response: refill fee payer, activate degraded mode UX
};

// P2 — User-impacting but not emergency
export type WALLET_SIGNING_LATENCY_HIGH = {
  signal: "WALLET_SIGNING_LATENCY_HIGH";
  // Fire: Observability skill
  // Receive: UX skill
  // Response: skill/performance-optimization.md → RPC failover
};

// P2 — Potential attack vector, investigate
export type WALLET_ADDRESS_POISONING_DETECTED = {
  signal: "WALLET_ADDRESS_POISONING_DETECTED";
  // Fire: UX skill
  // Receive: IR skill, UX skill (add warning banner)
  // Response: wallet-security.md → Address Poisoning Response
};
```

---

## Complete Wallet Testing Checklist

Before launching any wallet to production, this checklist must pass. Every item references a specific skill file.

**Key Management (wallet-building.md + wallet-engineering.md)**
- [ ] BIP39 mnemonic test vectors validate correctly (test with known mnemonics)
- [ ] HD derivation produces expected addresses (compare with Phantom/Backpack for same mnemonic)
- [ ] AES-256-GCM encrypt/decrypt round-trip test passes
- [ ] PBKDF2 600K iterations (or Argon2id) timing test: > 200ms on target device
- [ ] Vault migration functions tested: v1→v3, v2→v3
- [ ] Gap limit account discovery finds accounts at index 0, 5, 11 (non-contiguous)
- [ ] Seed phrase backup verification rejects wrong words
- [ ] Seed phrase backup verification accepts correct words

**Transaction Security (wallet-engineering.md)**
- [ ] `analyzeTransactionIntent` blocks setAuthority(AccountOwner, attacker) transactions
- [ ] `analyzeTransactionIntent` warns on Approve with MAX_UINT64 delegate
- [ ] `analyzeTransactionIntent` warns on unknown program IDs
- [ ] Address poisoning test: first+last 6 char match detected and warned
- [ ] Clipboard integrity: modified clipboard triggers warning
- [ ] Versioned transaction ALT expansion: hidden accounts are shown
- [ ] Transaction simulation runs before signing UI renders

**UX States (wallet-ux.md + transaction-feedback-ux.md)**
- [ ] All 8 connection states render correctly (undetected → wrong-network)
- [ ] All 12 transaction states render correctly (idle → failed → recovery)
- [ ] Error messages are human-readable (not raw error codes)
- [ ] Retry logic tested: blockhash expiry → get new blockhash → retry works

**Mobile (mwa-ux.md)**
- [ ] MWA connection works on Android with Phantom wallet
- [ ] App backgrounding blurs sensitive content (key display, balance)
- [ ] Biometric required for signing on device with biometric support

**Performance (performance-optimization.md)**
- [ ] Initial bundle size < 150KB gzipped
- [ ] Wallet adapter loaded lazily (not at startup)
- [ ] Balance fetch batched (single `getMultipleAccountsInfo` call)
- [ ] Connection success rate SLO alert configured (target: 98.5%)

**Monitoring (wallet-observability.md)**
- [ ] Wallet connect success rate metric tracked
- [ ] Signing latency histogram tracked
- [ ] Fee payer runway alert fires at < 48h
- [ ] Drainer block counter tracked by pattern type
- [ ] No wallet addresses appear in any log, metric label, or analytics event

**Incident Response Wiring (wallet-security.md)**
- [ ] `WALLET_KEY_COMPROMISED` signal handler tested
- [ ] `WALLET_DRAINER_ACTIVE` signal fires when intent analyzer blocks drainer
- [ ] Fee payer compromise scenario: runbook is known, rotation tested on devnet

---

## The Wallet Engineering Stack (Complete)

```
APPLICATION LAYER (what users see)
├── Connection state machine         → skill/wallet-ux.md
├── Transaction feedback UX          → skill/transaction-feedback-ux.md
├── Mobile Wallet Adapter            → skill/mwa-ux.md
├── Blinks / Actions integration     → skill/blinks-actions.md
└── Gasless onboarding               → skill/gasless-onboarding.md

SECURITY LAYER (what protects users)
├── Transaction intent verification  → skill/wallet-engineering.md
├── Address poisoning defense        → skill/wallet-engineering.md
├── Drainer contract detection       → skill/wallet-security.md
├── Supply chain defense             → skill/wallet-security.md
└── Threat intelligence              → skill/threat-intelligence.md

KEY MANAGEMENT LAYER (the foundation)
├── Keypair generation (BIP39)       → skill/wallet-building.md
├── Key encryption (Argon2id/PBKDF2) → skill/wallet-engineering.md
├── HD account discovery             → skill/wallet-engineering.md
├── Hardware wallet integration      → skill/wallet-building.md
├── MPC wallet integration           → skill/wallet-building.md
└── Progressive security tiers       → skill/wallet-engineering.md

OBSERVABILITY LAYER (what keeps it running)
├── Wallet SLOs                      → skill/wallet-observability.md
├── Security signal detection        → skill/security-observability.md
├── Fee payer runway monitoring      → skill/wallet-observability.md
└── Incident response wiring         → ecosystem-signals.md

PHYSICAL LAYER (DePIN wallets)
├── Device keypair model             → depin/skill/node-registry.md
├── Session key signing              → skill/wallet-engineering.md
└── Hardware integration             → depin/skill/hardware-integration.md
```
