# /analyze-ux

Audit an existing Solana dApp for conversion-blocking UX problems.

Use this command when the user asks to audit a codebase, route, screen, or flow before launch.

The output is a scored audit with concrete recommendations per category.

Do not produce generic advice.

Inspect real source files when available.

If source is not available, run the audit from screenshots, product description, and flow notes.

## Intake

Ask at most these three questions before auditing:

1. What is the dApp and what action should users complete?
2. Who are the primary users: first-time crypto users, active Solana traders, creators, gamers, or developers?
3. What are the key flows to audit: connect wallet, mint, swap, stake, claim, pay, create account, or Blink action?

If the user gives a source path, start inspection immediately and infer the rest.

If the user gives no path, ask for the app URL, repository path, or a description of the primary flow.

## Required Context To Gather

- Framework: Next.js App Router, Vite, Remix, Expo, React Native, or other.
- Wallet layer: wallet-adapter, Wallet Standard, Privy embedded wallets, MWA, custom wallet access.
- Chain target: mainnet-beta, devnet, testnet, localnet.
- Primary transaction type: transfer, swap, mint, stake, claim, create account, custom program call.
- User type: cold-start user, token holder, trader, mobile user, Blink user, admin.
- Current conversion symptom: connect dropoff, signing rejection, failed txs, mobile failures, low retries.

## Source Inspection Checklist

Look for these files first:

```text
app/
pages/
src/
components/
hooks/
lib/
providers/
public/actions.json
app/api/actions/**/route.ts
```

Search for these imports and APIs:

```text
@solana/wallet-adapter-react
@solana/wallet-adapter-react-ui
@solana/actions
@solana/web3.js
@solana/kit
@solana-mobile/mobile-wallet-adapter-protocol-web3js
@privy-io/react-auth
useWallet
WalletProvider
ConnectionProvider
WalletMultiButton
signTransaction
sendTransaction
sendRawTransaction
confirmTransaction
getSignatureStatuses
simulateTransaction
createPostResponse
ACTIONS_CORS_HEADERS
transact
AsyncStorage
```

Search for anti-patterns:

```text
window.solana
error.message
JSON.stringify(error)
alert(
console.error(
blockhash not found
custom program error
0x1
spinner
Loading...
disabled={!connected}
skipPreflight: true
maxRetries: 0
```

## Scoring Model

Score each category from 0 to 10.

Use this scale:

- 0: missing or actively harmful.
- 3: partial implementation with major conversion risk.
- 5: works for happy path only.
- 7: production acceptable with gaps.
- 9: strong implementation with edge cases handled.
- 10: best-in-class and verified.

Weight categories:

- Wallet connection UX: 15%.
- Transaction feedback: 20%.
- Error message quality: 15%.
- Mobile compatibility: 15%.
- Blinks/Actions: 10%.
- Onboarding friction: 10%.
- Loading state design: 10%.
- Accessibility and trust: 5%.

Calculate final score:

```typescript
type AuditScore = {
  wallet: number;
  transactionFeedback: number;
  errors: number;
  mobile: number;
  blinks: number;
  onboarding: number;
  loading: number;
  accessibility: number;
};

export function calculateSolanaUxScore(score: AuditScore) {
  return Math.round(
    score.wallet * 0.15 +
    score.transactionFeedback * 0.2 +
    score.errors * 0.15 +
    score.mobile * 0.15 +
    score.blinks * 0.1 +
    score.onboarding * 0.1 +
    score.loading * 0.1 +
    score.accessibility * 0.05
  );
}
```

## Category 1: Wallet Connection UX

Evaluate whether wallet connection is a complete state machine, not a binary button.

Check for:

- Wallet Standard through `@solana/wallet-adapter-react`.
- `ConnectionProvider`, `WalletProvider`, and modal provider are correctly scoped.
- Auto-connect is intentional, not forced before user intent.
- Connect button handles connecting, connected, disconnecting, reconnecting, and failed states.
- Wallet icon and shortened address are shown after connect.
- Disconnect does not erase pending flow state.
- Session drop recovery is visible and recoverable.
- Direct `window.solana` access is absent.
- The app supports multiple wallets instead of Phantom-only assumptions.
- Wrong cluster or RPC mismatch is detected before transaction signing.

Score guidance:

- 0-2: direct `window.solana`, Phantom-only, no disconnect handling.
- 3-5: wallet-adapter exists but button only handles connected/disconnected.
- 6-8: multi-state wallet UI with recovery and no-wallet education.
- 9-10: progressive connect, embedded wallet option, mobile-aware fallback, analytics on dropoff.

Recommendation examples:

```tsx
const walletLabel = {
  disconnected: "Connect wallet",
  connecting: "Opening wallet...",
  connected: shortAddress,
  disconnecting: "Disconnecting...",
  "session-expired": "Reconnect wallet",
  "wrong-network": "Switch network",
}[walletState];
```

```tsx
if (state === "session-expired") {
  return (
    <ReconnectBanner
      title="Wallet session expired"
      body="Reconnect to continue. Your progress is saved."
      onReconnect={() => setWalletModalVisible(true)}
    />
  );
}
```

## Category 2: Transaction Feedback

Evaluate every user-visible stage from click to confirmation.

Required stages:

- Preparing transaction.
- Waiting for wallet approval.
- Sending to Solana.
- Confirming.
- Confirmed.
- Failed.
- Expired or timed out.

Check for:

- `simulateTransaction` before signing when the transaction has meaningful failure risk.
- A visible pending state immediately after CTA click.
- A wallet approval state before the wallet popup appears.
- Signature link as soon as the transaction is sent.
- Confirmation by blockhash and `lastValidBlockHeight`, not signature string alone.
- Confirmation target uses `confirmed` for UX completion unless finality is required.
- Timeout copy explains expiration after the blockhash window.
- Retry returns the user to the exact same action with fresh blockhash.

Score guidance:

- 0-2: click button, wallet opens, then nothing.
- 3-5: spinner exists but no Solana-specific stages.
- 6-8: state machine with signature link and failure state.
- 9-10: simulation, optimistic updates, retry, timeout, priority fee handling.

Code pattern to recommend:

```typescript
type TxState =
  | "idle"
  | "building"
  | "signing"
  | "sending"
  | "confirming"
  | "done"
  | "failed"
  | "expired";

type TxView = {
  state: TxState;
  label: string;
  description: string;
  canRetry: boolean;
};
```

## Category 3: Error Message Quality

Raw blockchain errors are conversion leaks.

Check for:

- No raw `error.message` in UI.
- Program errors mapped to human copy.
- Anchor errors parsed from logs or IDL.
- Wallet rejection is not shown as a failure.
- Insufficient SOL has a recovery path.
- Slippage errors explain the next action.
- Account initialization errors tell the user how to proceed.
- RPC errors distinguish retryable network issues from user action issues.

Common translations:

```typescript
const ERROR_COPY: Record<string, string> = {
  "0x1": "You do not have enough SOL to pay for this transaction.",
  InsufficientFunds: "Your balance is too low. Add funds or lower the amount.",
  SlippageExceeded: "The price moved before your trade landed. Try again or increase slippage.",
  AccountNotFound: "This account is not set up yet. Complete onboarding first.",
  BlockhashNotFound: "This transaction expired. Try again so we can create a fresh one.",
  UserRejected: "Transaction cancelled.",
};
```

Score guidance:

- 0-2: raw codes or stack traces shown.
- 3-5: generic "Something went wrong" for every failure.
- 6-8: common Solana errors translated.
- 9-10: program-specific mapping, recovery CTA, telemetry by error class.

## Category 4: Mobile Compatibility

Evaluate the dApp as a mobile Solana product, not just a responsive website.

Check for:

- Mobile Wallet Adapter for React Native or mobile surfaces.
- Deep-link behavior for Phantom, Backpack, Solflare, and embedded wallets.
- Auth token persistence with AsyncStorage for MWA.
- Touch targets at least 44 px.
- Wallet modals do not overflow viewport.
- Transaction toasts are visible above mobile browser UI.
- Long addresses and token names do not break layout.
- QR-only flows have mobile alternatives.
- Blink preview works in mobile social clients.

Score guidance:

- 0-2: desktop-only wallet assumptions.
- 3-5: responsive CSS but broken wallet handoff.
- 6-8: mobile wallet flow tested and responsive UI stable.
- 9-10: MWA/native flow, persisted auth, deep-link recovery, mobile analytics.

## Category 5: Blinks And Actions

Audit this category only when the app has Action endpoints or should have them.

Check for:

- `GET`, `POST`, and `OPTIONS` handlers exist.
- `ACTIONS_CORS_HEADERS` is applied to success and error responses.
- `ActionGetResponse` has icon, title, description, label, and actions.
- Dynamic parameters include labels, names, and required flags.
- `body.account` is validated as a `PublicKey`.
- Transactions are unsigned by the server unless intentionally sponsored and whitelisted.
- `feePayer` is the user for normal Actions.
- `public/actions.json` maps route patterns correctly.
- Endpoint passes Dialect or Blinks validator.
- Images are absolute HTTPS URLs with stable dimensions.

Score guidance:

- 0-2: incomplete Action route or missing CORS.
- 3-5: renders locally but no validation, no OPTIONS, weak errors.
- 6-8: production route with validation and domain manifest.
- 9-10: tested unfurling, mobile render, chained flows, analytics.

## Category 6: Onboarding Friction

Evaluate the first five minutes for a new user.

Check for:

- User can understand the value before connecting wallet.
- First action can be completed without pre-existing SOL when appropriate.
- Devnet apps expose faucet guidance.
- Mainnet apps expose funding, embedded wallet, or gasless path.
- Wallet install education is contextual.
- Required token accounts are created transparently.
- First transaction has a simulation preview.
- Empty states explain what to do next.
- CTA copy names the user outcome, not the protocol method.

Score guidance:

- 0-2: first user is blocked by SOL or jargon.
- 3-5: instructions exist but the user must leave the app.
- 6-8: first action is guided with recovery paths.
- 9-10: gasless or embedded wallet path, faucet on devnet, no dead ends.

## Category 7: Loading State Design

Evaluate loading as information architecture, not decoration.

Check for:

- Skeletons for data that has stable shape.
- Spinners only for short indeterminate waits.
- Empty states are distinct from loading states.
- RPC refetches do not blank the whole page.
- Buttons have local pending states.
- Disabled controls explain why they are disabled.
- Slow indexer states show last updated time.
- Optimistic UI is used where rollback is safe.

Score guidance:

- 0-2: blank screens.
- 3-5: global spinner only.
- 6-8: skeletons and scoped pending states.
- 9-10: optimistic updates, stale-while-revalidate, retry and last updated metadata.

## Category 8: Accessibility And Trust

Check for:

- Keyboard-accessible wallet and transaction flows.
- Dialog focus trap and focus return.
- Toasts have accessible status semantics.
- Color is not the only failure/success indicator.
- Explorer links are clearly external.
- Transaction summaries show amount, asset, destination, and fee.
- Security-sensitive text avoids panic language.
- The app never asks users to paste seed phrases or private keys.

## Audit Output Format

Return this structure:

```markdown
# Solana UX Audit

App: <name or path>
Primary users: <audience>
Key flows audited: <flows>
Overall score: <n>/10

## Executive Summary

- Biggest conversion blocker: <specific issue>
- Fastest win: <specific fix>
- Highest-risk edge case: <specific edge case>

## Scores

| Category | Score | Risk | Evidence |
|---|---:|---|---|
| Wallet connection UX | 0-10 | Low/Medium/High | file:line or observed behavior |
| Transaction feedback | 0-10 | Low/Medium/High | file:line or observed behavior |
| Error messages | 0-10 | Low/Medium/High | file:line or observed behavior |
| Mobile compatibility | 0-10 | Low/Medium/High | file:line or observed behavior |
| Blinks/Actions | 0-10 or N/A | Low/Medium/High | file:line or observed behavior |
| Onboarding friction | 0-10 | Low/Medium/High | file:line or observed behavior |
| Loading states | 0-10 | Low/Medium/High | file:line or observed behavior |
| Accessibility/trust | 0-10 | Low/Medium/High | file:line or observed behavior |

## Findings

### P0: <must fix before launch>

Evidence:
Impact:
Recommendation:
Code pattern:

### P1: <high conversion impact>

Evidence:
Impact:
Recommendation:

### P2: <polish or resilience>

Evidence:
Impact:
Recommendation:

## Recommended Implementation Order

1. <fix with highest conversion impact>
2. <fix with highest safety impact>
3. <fix with fastest implementation>
4. <mobile or Blink validation>

## Verification Checklist

- [ ] Wallet connect and disconnect tested.
- [ ] User rejection tested.
- [ ] Insufficient SOL tested.
- [ ] Blockhash expiration tested.
- [ ] Mobile wallet handoff tested.
- [ ] Devnet faucet or gasless path tested.
- [ ] Action endpoint validated if applicable.
```

## Evidence Rules

Every finding must include evidence.

Good evidence:

- `components/WalletButton.tsx` only checks `connected`.
- `app/api/actions/mint/route.ts` returns errors without `ACTIONS_CORS_HEADERS`.
- The checkout CTA disables when disconnected but does not explain why.
- The flow waits for `finalized`, causing a 15 second perceived delay.

Weak evidence:

- "Wallet UX could be better."
- "Add loading states."
- "Consider mobile support."

## Recommendation Rules

Each recommendation must include:

- What to change.
- Where to change it.
- Why it affects conversion.
- One edge case it handles.
- A TypeScript or TSX pattern when applicable.

## Red Flags That Require P0 Findings

- Server signs arbitrary user-provided transactions.
- Gasless endpoint has no instruction whitelist.
- Gasless endpoint has no rate limit.
- Blink route has no `OPTIONS`.
- Blink error responses omit `ACTIONS_CORS_HEADERS`.
- UI surfaces raw program errors to end users.
- Transaction CTA resets to idle while confirmation is still pending.
- User can double-submit the same transaction unintentionally.
- Mainnet transaction sends with `skipPreflight: true` without a documented reason.

## Final Response Style

Be direct.

Lead with the highest-impact problems.

Avoid generic UX advice.

Use Solana terms precisely.

Prefer code snippets over paragraphs when recommending implementation.
