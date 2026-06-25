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
