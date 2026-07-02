name: solana-ux
description: Production-grade UX engineering for Solana protocols — wallet integration, transaction feedback, gasless onboarding, Blinks/Actions, NFT marketplace patterns, DePIN dashboards, governance UX, performance optimization, and mobile wallet adapter. Ships with complete test suites and CLI audit tools.
user-invocable: true
cross-domain: true

# Solana UX Skill

> Progressive loader — route to the correct sub-skill based on your current task.
> Do not load all files at once — each is large and task-specific.

## Extends

- [solana-dev-skill](https://github.com/solana-foundation/solana-dev-skill) — Core Solana development

## Cross-Domain Integration Points

This skill bridges 9 domains: wallet architecture, transaction UX, DeFi interface patterns, governance participation, NFT commerce, DePIN dashboards, mobile UX, performance engineering, and Blinks/Actions embedded commerce. No other UX skill in the ecosystem covers this full surface area.

See `ecosystem-signals.md` for cross-skill event protocols (Observability UX dashboard feed, Incident Response user-facing status pages, Token Launch claim UX handoff, DePIN operator dashboard).

---

## Quick Start

```bash
git clone https://github.com/Stan-lee13/solana-ux-skill
cd solana-ux-skill
npm install
npx vitest run        # run all 3 test suites (wallet state, UI patterns, blinks)
```

---

## Routing Table

### Full UX architecture decision
→ Load `agents/ux-architect.md`

Use for: System-level UX design, choosing the right wallet integration strategy, transaction feedback system design, performance budget planning, accessibility framework.

---

### Wallet integration (keypair, hardware, MPC, multisig)
→ Load `skill/wallet-building.md`

Use for: Keypair derivation, hardware wallet integration (Ledger/Trezor), MPC wallet architecture, Squads v4 multisig UX, session keys, wallet detection.

---

### Wallet UX patterns
→ Load `skill/wallet-ux.md`

Use for: Connection flow design, account switching, balance display, transaction history UX, error state handling, wallet-not-found patterns.

---

### Wallet engineering (deep technical implementation)
→ Load `skill/wallet-engineering.md`

Use for: Adapter protocol implementation, custom wallet connectors, wallet state machines, signing flow engineering, message serialization.

---

### Transaction feedback system
→ Load `skill/transaction-feedback-ux.md`

Use for: Real-time confirmation UI, optimistic updates, failed transaction recovery, signature tracking, retry patterns.

---

### UI component patterns
→ Load `skill/ui-patterns.md`

Use for: Design system for Solana dApps (shadcn/Tailwind), accessibility, dark mode, component composition, responsive layout.

---

### Gasless onboarding
→ Load `skill/gasless-onboarding.md`

Use for: Fee subsidy patterns, gasless relay architecture, sponsored transactions (Octane), progressive KYC flows.

---

### Blinks and Actions
→ Load `skill/blinks-actions.md`

Use for: Solana Actions spec implementation, embedded commerce flows, multi-step chained actions, Twitter/Discord embeds, unfurl metadata.

---

### NFT marketplace UX
→ Load `skill/nft-marketplace-ux.md`

Use for: Listing/bidding flows, collection browsers, compressed NFT display, royalty enforcement UX, marketplace fee transparency.

---

### DePIN operator dashboard UX
→ Load `skill/depin-dashboard-ux.md`

Use for: Node operator interfaces, real-time sensor data visualization, coverage map UX, reward tracking, uptime display.

---

### Governance UX
→ Load `skill/governance-ux.md`

Use for: DAO voting interfaces, Realms integration, proposal lifecycle UX, delegation flows, vote-escrow locking UI.

---

### Mobile wallet adapter (MWA)
→ Load `skill/mwa-ux.md`

Use for: Mobile Wallet Adapter 2.0 integration, React Native wallet flows, deep link handling, iOS/Android signing UX.

---

### Indexing pipeline (real-time data feeds for UI)
→ Load `skill/indexing-pipeline.md`

Use for: Helius webhooks for live UI updates, event-driven state machines, optimistic UI with on-chain reconciliation.

---

### Performance optimization
→ Load `skill/performance-optimization.md`

Use for: RPC batching, bundle size analysis, lazy loading, Core Web Vitals for dApps, Lighthouse scoring.

---

### Analyze UX command (full audit)
→ Load `commands/analyze-ux.md`

Use for: Running a complete UX audit against the 12 Solana UX standards. Returns severity-ranked issues with exact fix instructions.

---

### Generate Blink command
→ Load `commands/generate-blink.md`

Use for: Generating production-ready Blink/Action JSON schema + server handler for any Solana action.

---

### Audit conversion command
→ Load `commands/audit-conversion.md`

Use for: Analyzing wallet connection → transaction completion drop-off. Returns step-by-step funnel with specific friction points.

---

### Blink engineer agent
→ Load `agents/blink-engineer.md`

Use for: Deep Blinks/Actions implementation, chained multi-step flows, metadata optimization, platform-specific embedding.

---

### Onboarding engineer agent
→ Load `agents/onboarding-engineer.md`

Use for: First-time user flows, wallet creation assistance, progressive disclosure, gasless transaction design.

---

### Mobile UX engineer agent
→ Load `agents/mobile-ux-engineer.md`

Use for: MWA 2.0 implementation, React Native specifics, deep link architecture, app store compliance for crypto apps.

---

### Cross-skill signals
→ Load `ecosystem-signals.md`

Use for: Receiving claim UX handoff from Token Launch (airdrop claim site), feeding UX errors to Observability, DePIN dashboard design handoff.

---

## Red Flags — Surface Immediately Regardless of Current Task

```
CRITICAL UX FAILURES — fix before launch:
  - Wallet connection success rate < 90% in user testing
  - Transaction confirmation latency > 30s shown to user without progress indicator
  - Error messages showing raw RPC errors (e.g., "0x1 custom program error")
  - No retry mechanism on failed transactions
  - Signing request shows wrong domain (phishing risk)

HIGH-IMPACT UX DEBT:
  - No skeleton loading states → users perceive app as broken
  - Balance displayed without decimal formatting (e.g., 1000000 USDC instead of 1.00)
  - No empty state when wallet has 0 tokens
  - Mobile: touch targets < 44px
  - No confirmation step before irreversible transactions (burn, close account)

CROSS-SKILL TRIGGERS:
  - Claim UI error rate > 5% → emit CLAIM_UI_FAILURE to token-launch ecosystem-signals
  - Wallet connection failure spike → emit WALLET_CONNECT_DEGRADED to observability
  - DePIN dashboard node count mismatch → validate against depin-builder ecosystem-signals
```

---

## Test Coverage

```bash
npx vitest run tests/wallet-state.test.ts     # 28 wallet state machine tests
npx vitest run tests/ui-patterns.test.ts      # 22 UI pattern tests
npx vitest run tests/blinks-actions.test.ts   # 17 Blinks/Actions tests
npx vitest run --coverage                     # full coverage report
```

---

## SLO Reference

| UX Signal | Target | Measurement |
|-----------|--------|-------------|
| Wallet connection rate | ≥ 90% | Per session |
| Transaction submission rate | ≥ 95% after connection | Per session |
| Error state coverage | 100% of RPC errors mapped | Per error code |
| Page First Contentful Paint | < 1.5 s | Lighthouse |
| Transaction feedback latency | < 500 ms to show pending | Per tx |
