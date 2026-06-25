# UX Standards — Auto-Loaded Rules

These rules apply to ALL Solana dApp code in this project. Enforce them without being asked.

---

## RULE 1: Wallet Standard Only

```
ALWAYS:  @solana/wallet-adapter-react + WalletProvider
NEVER:   window.solana direct access
NEVER:   Custom wallet detection logic
NEVER:   Hardcoding specific wallets (Phantom-only code)
```

If you see `window.solana`, flag it immediately and replace with `useWallet()`.

## RULE 2: Transaction Simulation Before Signing

Any transaction worth signing is worth simulating first.

```typescript
// REQUIRED pattern before signTransaction():
const sim = await connection.simulateTransaction(tx);
if (sim.value.err) {
  // Show user-friendly error — do NOT proceed to signing
  throw new Error(parseTransactionError(sim.value.err));
}
// Only now show the "Confirm" button
```

Exception: micro-transactions under $0.10 equivalent where latency matters more than preview.

## RULE 3: Human-Readable Errors — No Exceptions

```
NEVER show to users:
  - "0x1", "0x1771", custom program error codes
  - "Transaction simulation failed"
  - "blockhash not found"
  - "WalletSignTransactionError"
  - Raw JSON error objects

ALWAYS show:
  - What went wrong in plain English
  - What the user should do next
  - A retry path or support link
```

## RULE 4: Every Async Operation Has a Loading State

```typescript
// Required structure for any on-chain operation:
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

async function handleAction() {
  setIsLoading(true);
  setError(null);
  try {
    await doTheAction();
  } catch (e) {
    setError(parseTransactionError(e)); // Never raw error
  } finally {
    setIsLoading(false);
  }
}
```

## RULE 5: Mobile Is First Class

- If the project has any React Native or Expo code, MWA MUST be used — not WalletConnect
- Auth tokens MUST be persisted to AsyncStorage — no re-auth on every app open
- Never assume desktop viewport — test at 375px width minimum
- Touch targets must be ≥44px (Apple HIG) / ≥48dp (Material Design)

## RULE 6: Blinks/Actions CORS — Non-Negotiable

Every Action route MUST have:
```typescript
export async function OPTIONS() {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}
```
And every response (including errors) MUST include `{ headers: ACTIONS_CORS_HEADERS }`.

Failure to do this causes Blinks to silently not render with no diagnostic error.

## RULE 7: Optimistic UI for Fast Operations

For operations expected to succeed (low-risk, signed by user):
- Update UI immediately before confirmation
- Show a "pending" indicator
- Correct the UI if transaction fails
- Do NOT make users wait 400–800ms for RPC round-trip before showing any feedback

## RULE 8: Accessibility Baseline

```
Required:
  - All interactive elements keyboard-navigable
  - All images have alt text (or alt="" if decorative)
  - Color is never the ONLY indicator of state (use icon + color)
  - Focus rings visible (do not suppress outline globally)
  - Form inputs have associated labels

Target: WCAG 2.1 AA
```
