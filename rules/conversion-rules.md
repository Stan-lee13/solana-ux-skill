# Conversion Rules — Auto-Loaded Rules

These rules enforce conversion-optimized patterns for every user-facing flow. Apply proactively — don't wait to be asked.

---

## RULE 1: First Action Must Require Zero SOL

New users do not have SOL. Design for this reality.

```
First interaction:
  ✅ Read-only (browsing, viewing)
  ✅ Gasless (fee payer proxy, Octane)
  ✅ Credit card / fiat on-ramp before blockchain
  ❌ "You need 0.002 SOL to continue"
  ❌ Wallet connect as the very first screen
```

If the first meaningful action requires SOL, implement fee sponsorship first.

## RULE 2: Gasless Proxy Must Have Instruction Whitelist

```typescript
// REQUIRED in every fee payer proxy:
const ALLOWED_PROGRAMS = {
  "first_mint": ["YOUR_NFT_PROGRAM_ID", SystemProgram.programId.toBase58()],
  "onboarding": ["YOUR_PROGRAM_ID"],
};

// Validate BEFORE signing:
for (const ix of tx.instructions) {
  if (!ALLOWED_PROGRAMS[action].includes(ix.programId.toBase58())) {
    throw new Error("Unauthorized program in sponsored transaction");
  }
}
```

Never run a gasless proxy without this. It will be drained.

## RULE 3: Rate Limit All Gasless Endpoints

```typescript
// Minimum: sliding window per wallet address
const { success } = await ratelimit.limit(`gasless:${userWallet}`);
if (!success) throw new Error("Daily gasless limit reached. Try again tomorrow.");

// Recommended limits:
// Onboarding tx: 3/wallet/day
// Micro-actions: 10/wallet/day
// High-value sponsorship: 1/wallet/lifetime (check DB)
```

## RULE 4: Transaction Preview Before Signing

Show users what will happen BEFORE they see the wallet popup. Include:
- What tokens/SOL will leave their wallet
- What they'll receive
- Approximate fees (even if sponsored: "fees covered by [Protocol]")
- Simulation result (success/fail)

The wallet popup is the LAST step, not the explanation.

## RULE 5: Button Copy Drives Conversion

```
❌ "Submit"      → ✅ "Stake 1 SOL"
❌ "Confirm"     → ✅ "Mint your NFT"
❌ "Connect"     → ✅ "Connect wallet to start"
❌ "Sign"        → ✅ "Approve and swap"
❌ "Transaction" → ✅ "This swap will cost ~$0.001"
```

Every CTA should tell the user what will happen, not just that something will happen.

## RULE 6: Error States Must Have Recovery Paths

```typescript
// Every error must include at least one of:
// 1. A retry button
// 2. A link to docs/support
// 3. A specific instruction ("Add 0.1 SOL to continue")

// Example pattern:
{error && (
  <div>
    <p>{error}</p>
    {error.includes("funds") && (
      <a href="/buy-sol">Get SOL →</a>
    )}
    <button onClick={retry}>Try again</button>
  </div>
)}
```

A dead-end error loses the user permanently. A recovery path saves them.

## RULE 7: Wallet Connection Must Not Be a Wall

```
❌ "Connect wallet" takes up the whole screen on load
❌ No preview of what the dApp does before requiring wallet
❌ Immediate wallet popup on page load

✅ Show product value before asking for wallet
✅ Allow browsing/preview in read-only mode
✅ Trigger wallet connection only at the moment it's needed
✅ Explain WHY connection is needed: "Connect to see your positions"
```

## RULE 8: Confirmation States Must Be Explicit

After a transaction confirms:
- Show a clear success state (not just removed loading spinner)
- Display what changed (balance update, NFT appeared, position opened)
- Provide a link to the transaction on Solscan/SolanaFM
- Suggest the natural next action ("View your NFT →", "Start earning rewards →")
```

---

## RULE 9: Progressive Disclosure for Complex Flows

Don't show all complexity at once. Start simple, reveal advanced options.

```tsx
function StakeForm() {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div>
      <SimpleStakeInput />
      <button onClick={() => setShowAdvanced(!showAdvanced)}>
        {showAdvanced ? "Hide" : "Show"} advanced options
      </button>
      {showAdvanced && <AdvancedOptions />}
    </div>
  );
}
```

---

## RULE 10: Social Proof on Landing Pages

Build trust before asking for wallet connection.

```tsx
<div>
  <StatsDisplay>
    <Stat label="Total Value Locked" value="$12.5M" />
    <Stat label="Users" value="45,000+" />
    <Stat label="Transactions" value="1.2M" />
  </StatsDisplay>
  <Testimonials>
    <Testimonial user="@crypto_user" text="Best yield on Solana!" />
  </Testimonials>
  <TrustBadges>
    <Badge icon="shield" text="Audited by OtterSec" />
    <Badge icon="check" text="Backed by Solana Foundation" />
  </TrustBadges>
</div>
```

---

## RULE 11: Urgency and Scarcity for Time-Sensitive Actions

Use countdown timers and limited supply indicators to drive action.

```tsx
function MintCountdown({ endTime }: { endTime: Date }) {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft(endTime));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft(endTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  return (
    <div className="text-destructive font-medium">
      {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m remaining
    </div>
  );
}
```

---

## RULE 12: Session Persistence for Form State

Don't lose user progress on accidental refresh.

```typescript
function useFormPersistence<T>(key: string, initialState: T) {
  const [state, setState] = useState<T>(() => {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : initialState;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);

  const clear = () => localStorage.removeItem(key);

  return [state, setState, clear] as const;
}
```

---

## RULE 13: Dark Mode Support

Respect user's system preference and provide manual toggle.

```tsx
function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}
```

---

## RULE 14: A/B Test Critical CTAs

Never guess at button copy. Test variants and measure conversion.

```typescript
const CTA_VARIANTS = [
  "Stake 1 SOL",
  "Start earning 12% APY",
  "Stake now",
];

function RandomCTA() {
  const variant = CTA_VARIANTS[Math.floor(Math.random() * CTA_VARIANTS.length)];
  
  useEffect(() => {
    analytics.track("cta_variant_shown", { variant });
  }, [variant]);

  return <Button>{variant}</Button>;
}
```

---

## RULE 15: One-Click Retry for Failed Transactions

Every error must have an immediate retry path.

```tsx
function TransactionError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-destructive">{error}</p>
      <Button onClick={onRetry}>Try again</Button>
      {error.includes("funds") && (
        <a href="/buy-sol" className="text-primary underline">Get SOL →</a>
      )}
    </div>
  );
}
```

---

## RULE 16: Show Value Before Wallet Connect

Demonstrate product value in read-only mode before requiring wallet.

```tsx
function ReadOnlyDashboard() {
  const { connected } = useWallet();

  if (!connected) {
    return (
      <div>
        <ProtocolStats />
        <CTA>Connect wallet to see your positions</CTA>
      </div>
    );
  }

  return <UserDashboard />;
}
```

---

## RULE 17: Keyboard Navigation for All Interactions

All interactive elements must be keyboard-accessible.

```tsx
<button
  onClick={handleAction}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      handleAction();
    }
  }}
  tabIndex={0}
  role="button"
>
  Action
</button>
```

---

## RULE 18: Performance Budget for Conversion

Slow pages kill conversion. Enforce performance budgets.

```typescript
const PERFORMANCE_BUDGETS = {
  FCP: 1500,
  TTI: 3500,
  LCP: 2500,
  CLS: 0.1,
};

if (performance.getEntriesByName("first-contentful-paint")[0]?.startTime > PERFORMANCE_BUDGETS.FCP) {
  analytics.track("performance_violation", { metric: "FCP", value: FCP });
}
```
