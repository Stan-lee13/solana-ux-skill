# Changelog

All notable changes to the Solana UX Skill are documented here.

## [Unreleased] — Deep audit & production hardening pass

### Fixed — Critical

- **Test suite was completely broken on a clean clone.** `@solana/web3.js` was imported in every test file but never declared in `package.json` dependencies — `npm install && npx vitest run` failed 100% of the time for a new user. This was the single biggest violation of the "works out of the box" requirement in the entire repo. Added the dependency, a `vitest.config.ts` with coverage thresholds (none existed before), and `@vitest/coverage-v8`.
- **`validateSlippage` had a dead, unreachable branch.** The function's control flow made the "reject slippage ≥ 10%" check impossible to reach — any slippage value was silently accepted. Fixed the branch ordering so the high-slippage rejection actually executes.
- **`classifySolanaError` misclassified slippage failures as insufficient-balance errors.** A naive substring match on `"0x1"` matched inside `"0x1770"` (the actual slippage-tolerance-exceeded error code), so users hitting a slippage failure were shown a wrong, misleading error message. Replaced with an exact/bounded match so `0x1770` and `0x1` are no longer confused.

### Fixed — Documentation / routing consistency

- **README.md and SKILL.md claimed 38 passing tests since the file was written — the real count has always been 67** (28 wallet-state + 22 ui-patterns + 17 blinks-actions). Corrected the badge, quick-start output, file-map annotations, and differentiators section throughout README.md and the coverage section of SKILL.md.
- **`skill/SKILL.md`'s own routing table was missing `skill/wallet-engineering.md`** — a 942-line file with zero discoverability from the nested router (the root `SKILL.md` referenced it, but an agent following `skill/SKILL.md` directly would never find it). Added it to the routing table.
- **`AGENTS.md` and `CLAUDE.md` were both missing 6 of the 14 skill docs, 2 of the 4 agents, and 1 of the 3 commands** from their own routing/agent/command tables — `wallet-building.md`, `wallet-engineering.md`, `governance-ux.md`, `nft-marketplace-ux.md`, `depin-dashboard-ux.md`, `performance-optimization.md`, the `onboarding-engineer` and `mobile-ux-engineer` agents, and the `/audit-conversion` command were all invisible to any coding agent using these files as its primary router. Rebuilt both tables and the repository-structure tree to match the actual file system 1:1.
- **README's MIT license badge linked to a `LICENSE` file that did not exist** (404 on GitHub). Added `LICENSE` (MIT, matching `package.json`).
- Added `SECURITY.md` (scope, threat model, private disclosure process) and this `CHANGELOG.md` for parity with the other 4 skills in the ecosystem.

### Added

- `tsconfig.json` + `typecheck` npm script — the skill previously had zero TypeScript type-checking as a CI gate. Running `tsc --noEmit` under `strict` surfaced and fixed real issues: unused imports across all 3 test files, a possibly-`undefined` access after a `.find()` call in `blinks-actions.test.ts`, and a `const`-literal-narrowing false-positive comparison in `wallet-state.test.ts`.
- Coverage thresholds (70% stmts/branch/lines, 60% funcs) enforced via `vitest.config.ts`. Actual coverage after fixes: 96.03% statements, 96.05% branches, 79.16% functions, 96.03% lines.

### Changed

- Split implementation code out of the three `*.test.ts` files into sibling `*.ts` modules (`wallet-state.ts`, `ui-patterns.ts`, `blinks-actions.ts`) so Vitest 3.x's AST-based coverage remapping can attribute coverage correctly (Vitest 3 excludes files matched by the test `include` glob from coverage reports even when they also export implementation code).
