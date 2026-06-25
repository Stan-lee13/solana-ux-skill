# Solana UX & Conversion Skill

The definitive skill for building Solana dApps that users actually complete — not just visit.

This skill fills the gap between "technically working" and "converts at 60%." It covers every layer of Solana-specific UX: the moment a user lands on your dApp, to the moment their first transaction confirms.

## When to load this skill

Load when:
- Building or auditing any user-facing Solana dApp
- Implementing wallet connection, transaction signing, or error handling
- Adding Solana Blinks and Actions to web or social surfaces
- Building mobile with React Native + Mobile Wallet Adapter
- Adding gasless onboarding to remove the SOL-first barrier
- Diagnosing low conversion rates or high error rates

## Sub-skill routing

Load only the file relevant to the current task. Do not load all files at once.

| Task | Load |
|------|------|
| Solana Actions API, Blinks, `actions.json`, chaining | `skill/blinks-actions.md` |
| Fee sponsorship, gasless proxy, Solana Pay, abuse prevention | `skill/gasless-onboarding.md` |
| React Native, MWA, Expo, auth persistence, mobile error handling | `skill/mwa-ux.md` |
| Optimistic UI, tx simulation preview, error messages, wallet button, skeletons | `skill/ui-patterns.md` |
| Wallet states, no-wallet education, progressive connect, wrong network | `skill/wallet-ux.md` |
| Geyser streaming, account decoder, PostgreSQL schema, query API for dApp read layer | `skill/indexing-pipeline.md` |
| Transaction state feedback, confirmation UX, retries, timeouts, priority fee copy | `skill/transaction-feedback-ux.md` |

## Always-on rules (do not wait to be asked)

These rules auto-load and apply to all code in this project:

- `rules/ux-standards.md` — Wallet Standard, simulation, error handling, loading states, accessibility
- `rules/conversion-rules.md` — Gasless, instruction whitelist, rate limiting, CTA copy, recovery paths

## Agent routing

| Task | Agent | Model |
|------|-------|-------|
| UX audits, user flow design, conversion analysis | `agents/ux-architect.md` | opus |
| Blink scaffolding, Action security review, CORS debugging | `agents/blink-engineer.md` | sonnet |

## Commands

| Command | When to use |
|---------|-------------|
| `commands/analyze-ux.md` | `/analyze-ux` scored audit for existing Solana dApp UX |
| `commands/generate-blink.md` | `/generate-blink` complete ready-to-implement Blink specification |

## What makes this skill different

Most Solana dev resources stop at "technically works." This skill covers:

1. **Conversion math** — Every extra step loses ~20% of users. This skill designs to minimize steps.
2. **Zero-SOL onboarding** — Real patterns for sponsoring user fees at the protocol level.
3. **Failure-first thinking** — What happens when the RPC times out? When the user has no SOL? When their wallet declines?
4. **Wallet state machine** — All 8 wallet states, no-wallet education, progressive connect, wrong-network recovery.
5. **Blinks done right** — The CORS failures, missing OPTIONS handlers, and `actions.json` gaps that silently kill Blinks on X/Twitter.
5. **Mobile parity** — MWA auth persistence, React Native confirmation UX, deep linking — the patterns most teams skip.

## Quick reference: Solana UX non-negotiables

```
✅ Wallet Standard via @solana/wallet-adapter-react
✅ Simulate transactions before signing
✅ Human-readable errors — zero raw error codes to users
✅ Loading state for every RPC call
✅ Gasless for first user action
✅ OPTIONS handler on every Blink route
✅ ACTIONS_CORS_HEADERS on every response including errors
✅ actions.json at /public/actions.json
✅ MWA auth_token persisted in AsyncStorage (mobile)
✅ Optimistic UI for expected-success operations
```
