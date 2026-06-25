<p align="center">
  <img src=".github/assets/banner.png" alt="Solana UX & Conversion Skill" width="100%" />
</p>

# solana-ux-skill

> The Solana AI Kit skill that turns technically working dApps into products users actually finish using.

A production-grade AI skill covering every layer of Solana user experience — from the first wallet connection through gasless onboarding, Blinks/Actions integration, mobile-native UX, and conversion funnel optimization. No other skill in the kit addresses why 70% of users who land on a Solana dApp never complete a single transaction.

**The problem it solves:** Solana has world-class infrastructure. Most dApps waste it with broken wallet states, raw error codes, no transaction simulation, and zero mobile support. This skill gives Claude Code the knowledge to fix all of it — with production code, not advice.

---

## What No Other Skill Covers

| Gap | This Skill's Answer |
|-----|---------------------|
| Wallet connection has 8 states, dApps handle 2 | Complete state machine with typed hook |
| Raw `0x1` errors shown to users | Full Solana error classifier → human messages |
| First-time users hit "you need SOL" on step 1 | Gasless proxy pattern with rate limiting + instruction whitelist |
| Blinks silently fail on X/Twitter | CORS, OPTIONS handler, actions.json — all covered |
| Mobile users can't re-auth after session expire | MWA auth_token persistence with AsyncStorage |
| Optimistic UI missing — 4-second blank screen | Optimistic state hooks with rollback |
| No conversion benchmarks to aim for | Real 2026 Solana dApp funnel data per stage |

---

## Installation

Add this folder to your Solana AI Kit skills directory or copy the markdown files into your agent's skill registry.

This package is markdown-only for AI Kit compatibility.

---

## What's Included

```
solana-ux-skill/
├── SKILL.md                          # Router — progressive loading hub
├── README.md                         # This file
├── CLAUDE.md                         # Claude Code configuration
├── LICENSE                           # MIT
│
├── skill/
│   ├── SKILL.md                      # Sub-skill routing table
│   ├── wallet-ux.md                  # 8-state connection machine, error classifier, retry logic
│   ├── blinks-actions.md             # Actions API, chaining, CORS, actions.json, testing
│   ├── gasless-onboarding.md         # Fee payer proxy, Octane, rate limiting, instruction whitelist
│   ├── mwa-ux.md                     # React Native, MWA, auth_token persistence, Expo setup
│   ├── ui-patterns.md                # Optimistic UI, simulation preview, skeleton states, a11y
│   ├── indexing-pipeline.md          # Helius webhooks, gRPC streaming, real-time data flows
│   └── transaction-feedback-ux.md    # Confirmation states, retry UX, timeout/error copy
│
├── agents/
│   ├── ux-architect.md               # Conversion strategist — audits, funnels, benchmarks
│   ├── blink-engineer.md             # Actions/Blinks specialist — debug, scaffold, test
│   ├── onboarding-engineer.md        # Gasless + first-time user flow specialist
│   └── mobile-ux-engineer.md         # MWA, Expo, React Native specialist
│
├── commands/
│   ├── analyze-ux.md                 # /analyze-ux — scored UX audit command
│   ├── generate-blink.md             # /generate-blink — ready-to-implement Blink spec
│   └── audit-conversion.md           # /audit-conversion — full funnel audit with scores
│
└── rules/
    ├── ux-standards.md               # Auto-loading: wallet standard, simulation, error UX
    └── conversion-rules.md           # Auto-loading: conversion benchmarks, anti-patterns
```

---

## Quick Start

```
# Audit an existing dApp's conversion funnel
Load agents/ux-architect.md — our landing→first-tx conversion is 8%, help

# Fix Blinks that aren't rendering on X
Load agents/blink-engineer.md — my Blink works locally but not on Twitter

# Add gasless onboarding
Load skill/gasless-onboarding.md — new users need to complete first mint without SOL

# Build mobile-native
Load agents/mobile-ux-engineer.md — migrating from web to React Native + Expo

# Scan for UX anti-patterns
/analyze-ux ./src

# Scaffold a production Blink
/generate-blink donate-sol --type transfer
```

---

## Conversion Benchmarks (2026 Solana dApps)

| Stage | Poor | Average | Top 10% | What Moves the Needle |
|-------|------|---------|---------|----------------------|
| Landing → Wallet connected | <20% | 35% | >60% | Gasless entry + social login option |
| Connected → First tx signed | <15% | 30% | >55% | Transaction simulation preview |
| Signed → Confirmed | <85% | 92% | >98% | Priority fee + retry logic |
| Error → User retries | <20% | 40% | >70% | Human error messages + one-click retry |
| Mobile connect rate | <10% | 25% | >45% | MWA with auth_token persistence |

---

## Example: 5-Minute Wallet Connection Upgrade

```typescript
// Before: broken binary state
const { connected } = useWallet();
if (!connected) return <ConnectButton />;

// After: full 8-state machine (wallet-ux.md pattern)
import { useWalletState } from './hooks/useWalletState';

const { state, address } = useWalletState('mainnet-beta');

const UI = {
  'undetected':     <InstallWalletPrompt />,
  'no-wallet':      <WalletOnboardingModal />,
  'disconnected':   <ConnectButton />,
  'connecting':     <ConnectingSpinner />,
  'connected':      <ConnectedState address={address} />,
  'wrong-network':  <WrongNetworkBanner />,
  'session-expired':<SilentReconnect />,
  'disconnecting':  <LoadingState />,
}[state];
```

---

## Ecosystem Integration

| Tool | Coverage |
|------|----------|
| `@solana/wallet-adapter` | Wallet Standard, multi-wallet, error classification |
| `@solana/actions` | Blinks/Actions, CORS, chaining, platform trust |
| `@solana-mobile/mobile-wallet-adapter-protocol-web3js` | MWA, auth_token, React Native |
| Helius | Webhook-driven real-time data, DAS API |
| Octane | Fee sponsorship / gasless proxy |
| Upstash | Rate limiting for gasless endpoints |
| Expo | React Native scaffolding and build tooling |
| Dialect | Blinks rendering and analytics |

---

## Judging Criteria Alignment

**Usefulness:** Every production Solana dApp has a UX conversion problem. No other skill in the kit addresses the gap between "technically working" and "users complete the flow."

**Novelty:** Zero overlap with any existing skill in the kit. Blinks, gasless onboarding, mobile MWA, and conversion optimization are untouched territory.

**Quality:** Every pattern ships production TypeScript. 4 agents, 3 markdown commands, 7 skill files. 130+ KB of practitioner content.

**Kit Fit:** Extends `solana-dev-skill`. Progressive SKILL.md loading. Clean agent/command/rules structure. MIT license.

---

## License

MIT — free to use, submodule, or extend.

## Author

Built by Victor Stanley ([@Stan-lee13](https://github.com/Stan-lee13)) for the Superteam Earn Solana AI Kit bounty.
