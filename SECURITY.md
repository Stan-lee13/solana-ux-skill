# Security Policy

## Scope

This repository is a skill (documentation + reference TypeScript modules covering Solana dApp UX patterns). Security concerns that apply:

- **Reference code** (`tests/*.ts` implementation modules — `wallet-state.ts`, `ui-patterns.ts`, `blinks-actions.ts`) containing exploitable patterns: unsafe transaction handling, missing simulation checks, error messages that leak sensitive state
- **Gasless / fee-payer proxy patterns** (`skill/gasless-onboarding.md`) that could allow arbitrary instruction signing if copied without the whitelist guard
- **Wallet architecture guidance** (`skill/wallet-building.md`, `skill/wallet-engineering.md`) with unsafe keypair derivation, missing HD gap-limit discovery, or weak password-derivation recommendations
- **Blinks/Actions patterns** (`skill/blinks-actions.md`) with missing CORS headers or unvalidated `POST` body handling that could enable phishing via malformed Action metadata

Out of scope: vulnerabilities in the live wallets, RPC providers, or protocols referenced (Phantom, Solflare, Helius, Realms, etc.) — report those to the respective project.

## Threat Model

This skill follows the shared A1–A8 wallet threat model used across the 5-skill Solana AI ecosystem (Observability, Incident Response, Token Launch, DePIN Builder, UX), covering adversaries such as RPC attackers, clipboard hijackers, address poisoners, and malicious dApp signing requests. See `wallet-framework.md` for the full model.

## Reporting

If you find a vulnerability in a reference implementation or architectural pattern:

1. **Do NOT open a public issue** — this could enable phishing/exploits on live dApps that copy the pattern.
2. Use GitHub's private vulnerability reporting feature on this repository.
3. Include: file path, line number, the vulnerability, proof-of-concept if applicable, and a suggested fix.

We will acknowledge within 72 hours and aim to resolve within 7 days.

## Critical Warning

Code in this skill is for educational/reference purposes. Before shipping any pattern from this skill to a production dApp handling real user funds:

1. Run the pattern through a full internal security review — especially gasless fee-payer proxies and wallet signing flows.
2. Test wallet connection, transaction simulation, and error-handling paths against the A1–A8 threat model.
3. Never ship a fee-payer proxy without an instruction whitelist and rate limiting.
4. Never surface raw RPC/program errors (e.g. `0x1`, custom program error codes) to end users — always translate via `classifySolanaError` or an equivalent mapping layer.
