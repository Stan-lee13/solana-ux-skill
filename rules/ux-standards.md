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

---

## RULE 9: Error Boundaries for React Components

Every React component tree must have an error boundary to prevent white-screen crashes.

```typescript
// components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("React error:", error, errorInfo);
    // Log to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-center">
          <p className="text-destructive">Something went wrong. Please refresh the page.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
```

---

## RULE 10: Form Validation Before Transaction

Never submit a transaction without validating all form inputs first.

```typescript
// Required validation pattern:
function validateTransactionForm(data: FormData): {valid: boolean; error?: string} {
  if (!data.amount || parseFloat(data.amount) <= 0) {
    return { valid: false, error: "Amount must be greater than 0" };
  }
  if (parseFloat(data.amount) > 1000000) {
    return { valid: false, error: "Amount exceeds maximum allowed" };
  }
  if (!data.recipient || !isValidPublicKey(data.recipient)) {
    return { valid: false, error: "Invalid recipient address" };
  }
  return { valid: true };
}
```

---

## RULE 11: No Sensitive Data in URLs or Logs

Never include private keys, seed phrases, or sensitive user data in:
- URL parameters
- Console.log statements
- Error messages sent to tracking
- LocalStorage (use secure storage for secrets)

```typescript
// ❌ NEVER:
console.log("Private key:", privateKey);
localStorage.setItem("private_key", privateKey);

// ✅ ALWAYS:
console.log("Wallet connected");
await secureStorage.setItem("wallet_auth", authToken);
```

---

## RULE 12: Responsive Breakpoints Must Be Mobile-First

Design for mobile first (375px), then expand to desktop.

```css
/* Mobile-first approach */
.container {
  padding: 1rem;
}

@media (min-width: 768px) {
  .container {
    padding: 2rem;
  }
}

@media (min-width: 1024px) {
  .container {
    padding: 3rem;
  }
}
```

---

## RULE 13: All External Links Must Open in New Tab

Links to external sites (explorers, docs, social) must open in new tabs.

```tsx
// ❌ WRONG:
<a href="https://solscan.io/tx/{sig}">View transaction</a>

// ✅ RIGHT:
<a href="https://solscan.io/tx/{sig}" target="_blank" rel="noopener noreferrer">
  View transaction ↗
</a>
```

---

## RULE 14: Loading States Must Have Timeouts

All loading states must have a timeout to prevent infinite spinners.

```typescript
const [isLoading, setIsLoading] = useState(false);
const [timeout, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

function startLoading() {
  setIsLoading(true);
  const id = setTimeout(() => {
    setIsLoading(false);
    setError("Request timed out. Please try again.");
  }, 30000); // 30 second timeout
  setTimeoutId(id);
}

function stopLoading() {
  if (timeout) clearTimeout(timeout);
  setIsLoading(false);
}
```

---

## RULE 15: Copy to Clipboard Must Provide Feedback

When copying addresses or signatures, show confirmation feedback.

```tsx
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
```

