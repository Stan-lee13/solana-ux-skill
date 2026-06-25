# /audit-conversion

Run a full conversion funnel audit on a Solana dApp. Returns a prioritized fix list with estimated impact per issue.

## Usage

```
Run /audit-conversion — my dApp is at [URL or describe it], primary action is [DESCRIBE]
```

Or pass source code:
```
Run /audit-conversion on ./src — primary action is staking, current conversion is 12%
```

## What This Command Produces

1. **Funnel breakdown** — where users are dropping off (layer by layer)
2. **Severity-rated finding list** — CRITICAL / HIGH / MEDIUM with specific code fixes
3. **Estimated conversion uplift** — what each fix is worth in percentage points
4. **Quick wins** — fixes you can ship in <2 hours
5. **Measurement setup** — how to track whether the fixes worked

---

## Intake Questionnaire

Answer as many as possible for a more precise audit:

```
1. PRIMARY ACTION
   What is the single most important action a user should complete?
   (Stake / swap / mint / claim / buy / deposit)

2. CURRENT CONVERSION
   What % of users who land on your dApp complete the primary action?
   If you don't know: UNKNOWN (this itself is flagged as Critical Issue #0)

3. TRAFFIC SOURCE
   Where do users come from? (Twitter/Blinks, direct, Discord, paid)
   → Determines onboarding assumptions (crypto-native vs Web2)

4. MOBILE %
   What % of your users are on mobile?
   If you don't know: UNKNOWN

5. TECH STACK
   React/Next.js? React Native/Expo? Vanilla? Other?
   Which wallet adapter are you using?

6. SHARE CODE (optional)
   Paste your wallet connection setup, transaction signing code, and error handling.
   Even 50 lines tells me more than a verbal description.
```

---

## Audit Execution

### Step 1: Map the funnel stages

```
[ ] Stage 0: Discovery → Landing
    Metric: Bounce rate on landing page
    
[ ] Stage 1: Landing → Wallet connected
    Metric: % of sessions that result in a wallet connection
    Target: >35% (average), >60% (top 10%)
    
[ ] Stage 2: Wallet connected → Transaction initiated
    Metric: % of connected users who click the primary CTA
    Target: >50%
    
[ ] Stage 3: Transaction initiated → Transaction signed
    Metric: % who complete the signing step (don't reject in wallet)
    Target: >70%
    
[ ] Stage 4: Signed → Confirmed
    Metric: % of signed txs that confirm successfully
    Target: >95%
    
[ ] Stage 5: Confirmed → Retained (return within 7 days)
    Metric: D7 retention
    Target: >25%
```

### Step 2: Check each funnel gate

#### Gate 1: Landing → Connected (most impactful)

```
CRITICAL if any:
□ Only window.solana used (not @solana/wallet-adapter) → ~30% user breakage
□ No "no wallet" path → entire non-crypto audience excluded
□ Mobile users get desktop-only UI → ~60% of audience blocked
□ No gasless entry for 0-SOL users → cold-start barrier

HIGH if any:
□ "Connect Wallet" is the primary CTA (not action-first)
□ Fewer than 8 wallet states handled (only connected/disconnected)
□ Wallet modal has no loading state
□ No wallet error recovery (user just sees blank/broken state)

MEDIUM if any:
□ No wallet connection persistence (requires re-connect on every visit)
□ No social login option (Privy/Magic) for Web2 users
□ Wallet detection takes >500ms (feels slow)
```

#### Gate 2: Connected → Tx Initiated

```
CRITICAL if any:
□ No transaction simulation before signing modal
□ Fees not shown before user initiates signing
□ CU limit not set (defaults to max, looks scary to users)

HIGH if any:
□ No optimistic UI (blank screen during RPC call)
□ Primary CTA requires understanding of DeFi concepts
□ No progress indicator during transaction building

MEDIUM if any:
□ No "what does this do" tooltip on CTA
□ Token amounts shown in lamports/raw units instead of human values
```

#### Gate 3: Tx Initiated → Signed

```
CRITICAL if any:
□ Transaction simulation fails silently (user sees signing modal even if tx will fail)
□ Wallet modal shows raw instruction data without decoding

HIGH if any:
□ No human-readable summary in signing modal
□ Pre-flight check not run (user doesn't know about slippage/errors until after sign)

MEDIUM if any:
□ Signing modal loading time >2 seconds
```

#### Gate 4: Signed → Confirmed

```
CRITICAL if any:
□ No confirmation feedback (user doesn't know if tx succeeded)
□ Blockhash expiry not handled (expired txs fail silently)
□ No retry path on failure

HIGH if any:
□ Error messages are raw error codes (0x1, etc.)
□ No explorer link after confirmation
□ Priority fee not set (tx lands slowly or not at all in congestion)

MEDIUM if any:
□ No celebration/feedback on success
□ Confirmation time not shown
```

---

## Output Format

```markdown
# Conversion Audit: [dApp Name]

## Current State
- Primary action: [ACTION]
- Estimated conversion: [X%] (measured / estimated)
- Biggest drop-off: Stage [N] — [DESCRIPTION]

---

## CRITICAL Issues — Fix in 24h (estimated +X% conversion each)

### [C1] [Issue title]
**Where:** [Stage N: Gate description]
**Impact:** Estimated +X% conversion at this stage
**The problem:** [Precise description]
**The fix:**
```[code]```
**How to verify:** [What to check after shipping]

---

## HIGH Priority — Fix this week (+X% each)
[Same format]

---

## MEDIUM Priority — Fix this sprint (+X% each)
[Same format]

---

## Quick Wins (ship in <2 hours)
1. [Specific change] → estimated +X%
2. [Specific change] → estimated +X%

---

## Measurement Setup
To know if these fixes worked, add these tracking calls:

```typescript
// Stage 1: Wallet connected
analytics.track("wallet_connected", { wallet: walletName, cluster });

// Stage 3: Transaction signed
analytics.track("tx_signed", { action, estimatedFee });

// Stage 4: Transaction confirmed
analytics.track("tx_confirmed", { action, signature, confirmTimeMs });

// Stage 4 fail: Transaction failed
analytics.track("tx_failed", { action, errorCategory, errorCode, canRetry });
```

Use Mixpanel, Amplitude, or PostHog — all free tier supports this.
```
