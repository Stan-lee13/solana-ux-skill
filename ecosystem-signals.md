# Ecosystem Signals — Solana UX Skill

This file defines how `solana-ux-skill` interacts with the other 4 skills in the Solana engineering ecosystem: `solana-depin-builder-skill`, `Solana-observability-skill`, `solana-incident-response-skill`, and `solana-token-launch-skill`.

---

## Signals Received FROM Other Skills

### From Solana-Observability-Skill

**Signal: `transaction_failure_spike`**
- Trigger: Observability detects >50% transaction failure rate for a specific instruction or program
- UX Action: Load `skill/ui-patterns.md` → audit error state UX for the failing flow
- Specific Query: "Transaction failure rate 67% on `swap_tokens` instruction. Audit error messages, simulation preview, and retry UX."
- Expected Output: Human-readable error translation, one-click retry paths, simulation before signing

**Signal: `latency_threshold_exceeded`**
- Trigger: RPC latency >3s for 95th percentile
- UX Action: Load `skill/ui-patterns.md` → implement optimistic UI patterns
- Specific Query: "RPC latency at 3.2s P95. Add optimistic state hooks, skeleton loaders, and pending indicators."
- Expected Output: Optimistic balance updates, skeleton components, progress indicators

**Signal: `mobile_conversion_drop`**
- Trigger: Mobile conversion rate <15% while desktop >40%
- UX Action: Load `skill/mwa-ux.md` → audit mobile wallet connection flow
- Specific Query: "Mobile conversion 12% vs desktop 45%. Audit MWA auth_token persistence, touch targets, and mobile-specific errors."
- Expected Output: MWA integration, AsyncStorage persistence, mobile-optimized error handling

---

### From Solana-Incident-Response-Skill

**Signal: `frontend_compromised`**
- Trigger: Malicious code injection detected in frontend bundle
- UX Action: Load `skill/wallet-ux.md` → implement wallet drain prevention UX
- Specific Query: "Frontend compromised. Add transaction simulation preview, show full transaction details before signing, and implement approval confirmation dialogs."
- Expected Output: Transaction preview with all instructions, confirmation dialogs, signature verification UI

**Signal: `drain_attack_detected`**
- Trigger: Pattern of unauthorized approvals or signature requests
- UX Action: Load `skill/wallet-ux.md` → add approval revocation UX
- Specific Query: "Drain attack pattern detected. Build approval management UI showing all active approvals with revoke buttons."
- Expected Output: Approval list dashboard, one-click revoke, approval history

**Signal: `post_incident_recovery`**
- Trigger: Incident resolved, user trust restoration needed
- UX Action: Load `skill/ui-patterns.md` → implement recovery communication UX
- Specific Query: "Post-incident recovery mode. Add incident notification banner, compensation claim flow, and trust restoration messaging."
- Expected Output: Incident banner, compensation claim UI, transparency dashboard

---

## Signals Provided TO Other Skills

### To Solana-DePIN-Builder-Skill

**Signal: `node_operator_onboarding_ux`**
- Trigger: DePIN skill needs node operator onboarding flow
- UX Action: Load `skill/wallet-ux.md` + `skill/gasless-onboarding.md` → design operator onboarding
- Specific Query: "Design node operator onboarding flow: wallet connect, stake deposit, node registration, dashboard access."
- Expected Output: Progressive onboarding flow, gasless first stake, operator dashboard UX

**Signal: `reward_claim_ux`**
- Trigger: DePIN skill needs reward withdrawal interface
- UX Action: Load `skill/transaction-feedback-ux.md` → design claim flow
- Specific Query: "Design reward claim UX: balance display, claim button, confirmation, success state with next action."
- Expected Output: Claim form, transaction preview, success celebration, history view

---

### To Solana-Token-Launch-Skill

**Signal: `airdrop_claim_ux`**
- Trigger: Token launch needs airdrop claim interface
- UX Action: Load `skill/gasless-onboarding.md` + `skill/transaction-feedback-ux.md` → design claim flow
- Specific Query: "Design airdrop claim UX: eligibility check, claim button, gasless sponsorship, confirmation, success state."
- Expected Output: Eligibility checker, gasless claim button, transaction preview, success celebration

**Signal: `token_swap_ux`**
- Trigger: Token launch needs DEX swap interface
- UX Action: Load `skill/ui-patterns.md` → design swap flow
- Specific Query: "Design token swap UX: amount input, slippage selector, price impact display, simulation preview, confirmation."
- Expected Output: Swap form, slippage UI, simulation preview, confirmation dialog, success state

**Signal: `vesting_dashboard_ux`**
- Trigger: Token launch needs vesting schedule display
- UX Action: Load `skill/ui-patterns.md` → design vesting dashboard
- Specific Query: "Design vesting dashboard: schedule timeline, claimable amount, claim button, history view, progress indicators."
- Expected Output: Timeline visualization, claimable amount card, claim flow, history table, progress bars

---

### To Solana-Observability-Skill

**Signal: `user_facing_status_page`**
- Trigger: Observability needs public status page
- UX Action: Load `skill/ui-patterns.md` → design status page
- Specific Query: "Design user-facing status page: service health indicators, incident banners, historical uptime, subscription to updates."
- Expected Output: Status indicators, incident timeline, uptime metrics, subscription form

**Signal: `error_reporting_ux`**
- Trigger: Observability needs user error reporting flow
- UX Action: Load `skill/ui-patterns.md` → design error reporting
- Specific Query: "Design error reporting UX: error context display, user feedback form, screenshot attachment, submission confirmation."
- Expected Output: Error context card, feedback form, attachment UI, success confirmation

---

## Shared Vocabulary

Terms used consistently across all ecosystem skills:

| Term | Definition | Used In |
|------|------------|---------|
| `transaction` | On-chain Solana transaction with signature | All skills |
| `instruction` | Individual operation within a transaction | UX, Observability, Incident Response |
| `account` | Solana account with pubkey and data | All skills |
| `slot` | Solana block height | DePIN, Observability, UX |
| `epoch` | Solana epoch (~2 days) | DePIN, Token Launch, UX |
| `commitment` | Transaction finality level (processed/confirmed/finalized) | UX, Observability |
| `simulation` | Transaction simulation before signing | UX, Token Launch |
| `priority_fee` | Jito tip for faster inclusion | UX, Observability |
| `gasless` | Fee-sponsored transaction | UX, Token Launch, DePIN |
| `approval` | Token spend approval | UX, Incident Response |
| `drain` | Unauthorized token transfer | UX, Incident Response |
| `vesting` | Time-locked token release | UX, Token Launch |
| `airdrop` | Token distribution to addresses | UX, Token Launch |
| `node` | DePIN infrastructure node | DePIN, UX |
| `operator` | Node operator account | DePIN, UX |
| `reward` | Token reward for participation | DePIN, Token Launch, UX |

---

## Handoff Conditions

### When to Hand Off TO Token-Launch-Skill

- Designing airdrop claim UI with eligibility verification
- Building token swap interface with slippage controls
- Creating vesting schedule dashboard with claim flows
- Designing token governance voting interface

### When to Hand Off TO DePIN-Builder-Skill

- Designing node operator onboarding flow
- Building reward claim and withdrawal UX
- Creating node status monitoring dashboard
- Designing staking UI for node operation

### When to Hand Off TO Observability-Skill

- Building user-facing status page
- Designing error reporting and feedback flow
- Creating performance metrics dashboard
- Building alert notification preferences UI

### When to Hand Off TO Incident-Response-Skill

- Detecting suspicious approval patterns in UX
- Frontend bundle integrity verification
- Wallet drain prevention UI implementation
- Post-incident user communication design

---

## Cross-Skill Query Examples

**Query from Token-Launch to UX:**
```
"We're launching a token with airdrop, vesting, and DEX listing. 
Design the complete user journey: airdrop claim → vesting dashboard → swap interface.
Include gasless sponsorship for first claim and simulation preview for swaps."
```

**Query from DePIN to UX:**
```
"Node operators need to: stake tokens → register node → monitor status → claim rewards.
Design the onboarding flow with progressive disclosure and gasless first stake."
```

**Query from Observability to UX:**
```
"Transaction failure rate spiked to 67% on `transfer_tokens`. 
Audit the error messages, add simulation preview, and implement one-click retry."
```

**Query from Incident-Response to UX:**
```
"Drain attack detected via approval spam. 
Build approval management dashboard showing all active approvals with revoke buttons."
```

---

## Wallet-Specific Signals (Added v2 — Wallet Engineering Framework)

These signals extend the base ecosystem signals for the full wallet development lifecycle.
All five skills must handle these signals. See `wallet-framework.md` for complete routing.

### WALLET_KEY_COMPROMISED (P0 — Highest Priority)

```typescript
// Fire: Incident Response skill (when key compromise confirmed or suspected)
// Receive: ALL skills
export interface WalletKeyCompromisedSignal {
  signal: "WALLET_KEY_COMPROMISED";
  severity: "P0";
  key_type: "user_wallet" | "fee_payer" | "upgrade_authority" | "mint_authority" | "treasury";
  compromised_address: string;
  confirmed: boolean;
  detected_at_utc: string;
}
// → Load: skill/active-exploit-response.md immediately
// → Load: skill/wallet-security.md → Emergency Key Rotation Checklist
// → Notify all team members within 2 minutes
```

### WALLET_DRAINER_ACTIVE (P1)

```typescript
// Fire: UX skill (intent analyzer blocked a drainer transaction)
// Receive: Incident Response, Observability
export interface WalletDrainerActiveSignal {
  signal: "WALLET_DRAINER_ACTIVE";
  severity: "P1";
  drainer_pattern: "set_authority" | "delegate_approve" | "versioned_alt" | "unknown";
  blocks_in_window: number;
  window_minutes: number;
}
// → Load: skill/wallet-security.md → Drainer Contract Deep Analysis
// → Consider frontend takedown if blocks_in_window > 50
```

### WALLET_FEE_PAYER_CRITICAL (P1)

```typescript
// Fire: Observability skill
// Receive: UX skill (degrade gasless), DePIN (pause proof submission)
export interface WalletFeePayerCriticalSignal {
  signal: "WALLET_FEE_PAYER_CRITICAL";
  severity: "P1";
  alias: string;
  current_balance_sol: number;
  runway_hours: number;
}
// → Load: runbooks/fee-payer-low.md
// → UX: activate graceful degradation (disable gasless, show "pay own gas" flow)
```

### WALLET_ADDRESS_POISONING_DETECTED (P2)

```typescript
// Fire: UX skill
// Receive: Incident Response (comms), Observability (tracking)
export interface WalletAddressPoisoningSignal {
  signal: "WALLET_ADDRESS_POISONING_DETECTED";
  severity: "P2";
  similar_to_address: string;  // The legitimate address being mimicked
  attack_count: number;        // Number of poisoning txs seen
}
// → Load: skill/wallet-security.md → Address Poisoning Response Protocol
// → Post user warning on all official channels
```

### WALLET_SIGNING_LATENCY_HIGH (P2)

```typescript
// Fire: Observability skill
// Receive: UX skill, Performance optimization
export interface WalletSigningLatencySignal {
  signal: "WALLET_SIGNING_LATENCY_HIGH";
  severity: "P2";
  p95_latency_ms: number;
  slo_target_ms: number;
}
// → Load: skill/performance-optimization.md → RPC endpoint failover
// → Check: is latency from RPC or from wallet popup rendering?
```
