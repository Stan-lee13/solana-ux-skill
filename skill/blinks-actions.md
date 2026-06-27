# Solana Actions and Blinks

Solana Actions and Blinks let your dApp's functionality travel anywhere on the web — X posts, Discord, emails, QR codes. Users interact with Solana without ever opening your frontend.

## Key Concepts

- **Solana Actions**: Standard HTTP APIs that return transactions for users to sign
- **Solana Blinks**: The client-side renderer that turns an Action URL into an interactive UI
- **Dialect**: The reference implementation and hosting platform for Blinks
- **actions.json**: Domain registration file that platforms use to trust your Actions
- **Chaining**: Multi-step Action flows where one Action leads to another

## Why Blinks Matter for Conversion

Blinks remove the #1 conversion barrier: getting users to your dApp.

Traditional flow: Social post → Click link → Land on dApp → Connect wallet → Sign transaction
Blink flow: Social post → See interactive card → Sign transaction (wallet handles the rest)

Every step removed is ~20% conversion recovered. Blinks eliminate 2-3 steps.

## Building a Production Action API (Next.js App Router)

```typescript
// app/api/actions/transfer/route.ts
import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
} from "@solana/actions";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from "@solana/web3.js";

const connection = new Connection(
  process.env.HELIUS_RPC_URL ?? clusterApiUrl("mainnet-beta")
);

// GET — returns the Blink metadata (icon, title, buttons)
export async function GET(req: Request) {
  const payload: ActionGetResponse = {
    icon: "https://yourdapp.com/icon.png",
    label: "Send SOL",
    title: "Send SOL to a friend",
    description: "Instantly send SOL to any Solana wallet",
    links: {
      actions: [
        { label: "Send 0.1 SOL", href: "/api/actions/transfer?amount=0.1" },
        { label: "Send 1 SOL",   href: "/api/actions/transfer?amount=1"   },
        {
          label: "Send custom",
          href: "/api/actions/transfer?amount={amount}",
          parameters: [
            {
              name: "amount",
              label: "Amount (SOL)",
              required: true,
            },
          ],
        },
      ],
    },
  };
  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}

// OPTIONS — required for CORS preflight
export async function OPTIONS(req: Request) {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}

// POST — builds and returns the transaction
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const amount = parseFloat(searchParams.get("amount") ?? "0");

  if (!amount || amount <= 0 || amount > 100) {
    return Response.json(
      { message: "Invalid amount. Must be between 0 and 100 SOL." },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  const body: ActionPostRequest = await req.json();

  let sender: PublicKey;
  try {
    sender = new PublicKey(body.account);
  } catch {
    return Response.json(
      { message: "Invalid account address." },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  const recipient = new PublicKey(process.env.RECIPIENT_WALLET!);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  const tx = new Transaction({
    feePayer: sender,
    blockhash,
    lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: recipient,
      lamports: Math.round(amount * LAMPORTS_PER_SOL),
    })
  );

  const payload: ActionPostResponse = await createPostResponse({
    fields: {
      transaction: tx,
      message: `Sending ${amount} SOL — thank you!`,
    },
  });

  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}
```

## Chained Actions (multi-step flows)

```typescript
// Return a `next` link to chain actions together
const payload: ActionPostResponse = await createPostResponse({
  fields: {
    transaction: tx,
    message: "Step 1 complete — confirm your details",
    links: {
      next: {
        type: "post",
        href: "/api/actions/confirm?ref={signature}",
      },
    },
  },
});
```

## Blink rendering in your own frontend

```typescript
// components/BlinkEmbed.tsx
import { useAction, Blink } from "@dialectlabs/blinks";
import { useActionSolanaWalletAdapter } from "@dialectlabs/blinks/hooks/solana";

export function BlinkEmbed({ actionUrl }: { actionUrl: string }) {
  const { adapter } = useActionSolanaWalletAdapter(
    process.env.NEXT_PUBLIC_HELIUS_RPC!
  );
  const { action } = useAction({ url: actionUrl });

  if (!action) return <div>Loading...</div>;

  return (
    <Blink
      action={action}
      websiteText={new URL(actionUrl).hostname}
      adapter={adapter}
    />
  );
}
```

## actions.json — register your domain

Create `/public/actions.json` — required for platforms to trust your Actions:

```json
{
  "rules": [
    {
      "pathPattern": "/api/actions/**",
      "apiPath": "/api/actions/**"
    }
  ]
}
```

## Security checklist

- [ ] Validate ALL user inputs before building transactions — never trust `body.account`
- [ ] Set `feePayer` explicitly — never let the Action pay fees from protocol funds
- [ ] Use `ACTIONS_CORS_HEADERS` on every response including errors
- [ ] Rate limit POST endpoints (e.g., 10 req/min per IP via Upstash)
- [ ] Validate `amount` bounds — prevent 0 and >sane_max
- [ ] Don't sign anything server-side — always return unsigned tx for user to sign
- [ ] Test on Blinks.xyz devnet playground before mainnet
- [ ] Implement instruction whitelist for sponsored Actions
- [ ] Add analytics for monitoring abuse
- [ ] Use HTTPS for all endpoints
- [ ] Never expose private keys or secrets in responses

## Testing your Action

```bash
# Install the Solana Actions CLI
npm install -g @solana/actions

# Validate your action endpoint
solana-actions validate https://yourdapp.com/api/actions/transfer

# Preview how it renders as a Blink
# Open: https://blinks.xyz/?action=solana-action:https://yourdapp.com/api/actions/transfer
```

## Advanced Action Patterns

### Dynamic Metadata Based on User State

Actions can customize their GET response based on query params, headers, or external data.

```typescript
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userAddress = searchParams.get("account");
  
  // Fetch user-specific state
  const userState = userAddress 
    ? await getUserState(new PublicKey(userAddress))
    : null;

  const payload: ActionGetResponse = {
    icon: "https://yourdapp.com/icon.png",
    title: userState?.hasClaimed 
      ? "Rewards already claimed"
      : "Claim your rewards",
    description: userState?.hasClaimed
      ? "You've already claimed your rewards. Check back next week."
      : "Claim available rewards to your connected wallet.",
    label: userState?.hasClaimed ? "View details" : "Claim",
    disabled: userState?.hasClaimed,
    links: {
      actions: userState?.hasClaimed
        ? [{ label: "View on dApp", href: "https://yourdapp.com/rewards" }]
        : [{ label: "Claim all", href: "/api/actions/claim?mode=all" }],
    },
  };

  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}
```

### Time-Limited Actions

For time-sensitive offers, use dynamic metadata that expires.

```typescript
export async function GET(req: Request) {
  const offerEndsAt = new Date("2026-12-31T23:59:59Z");
  const now = new Date();
  const timeRemaining = offerEndsAt.getTime() - now.getTime();
  const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));

  const payload: ActionGetResponse = {
    icon: "https://yourdapp.com/limited-offer.png",
    title: "Limited-time mint",
    description: timeRemaining > 0
      ? `Mint ends in ${hoursRemaining} hours. Don't miss out.`
      : "This offer has ended.",
    label: timeRemaining > 0 ? "Mint now" : "Offer ended",
    disabled: timeRemaining <= 0,
    links: {
      actions: timeRemaining > 0
        ? [{ label: "Mint", href: "/api/actions/mint" }]
        : [],
    },
  };

  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}
```

### Multi-Parameter Actions

Actions can accept multiple user inputs with validation.

```typescript
export async function GET(req: Request) {
  const payload: ActionGetResponse = {
    icon: "https://yourdapp.com/swap.png",
    title: "Swap tokens",
    description: "Swap between any two tokens on Solana.",
    label: "Swap",
    links: {
      actions: [
        {
          label: "Custom swap",
          href: "/api/actions/swap?from={from}&to={to}&amount={amount}",
          parameters: [
            {
              name: "from",
              label: "From token",
              required: true,
            },
            {
              name: "to",
              label: "To token",
              required: true,
            },
            {
              name: "amount",
              label: "Amount",
              required: true,
            },
          ],
        },
      ],
    },
  };

  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(req: Request) {
  const body: ActionPostRequest = await req.json();
  const { searchParams } = new URL(req.url);
  
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const amount = searchParams.get("amount");

  if (!from || !to || !amount) {
    return Response.json(
      { message: "All parameters (from, to, amount) are required." },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return Response.json(
      { message: "Amount must be a positive number." },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  // Build swap transaction...
  const tx = await buildSwapTransaction(from, to, amountNum);

  const payload: ActionPostResponse = await createPostResponse({
    fields: {
      transaction: tx,
      message: `Swapping ${amount} ${from} to ${to}`,
    },
  });

  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}
```

### Conditional Actions Based on Chain State

Actions can check on-chain state before returning metadata.

```typescript
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const proposalId = searchParams.get("proposal");

  if (!proposalId) {
    return Response.json(
      { message: "Proposal ID required" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  // Fetch proposal state from chain
  const proposal = await getProposalState(proposalId);
  const hasVoted = proposal.voters.includes(searchParams.get("account") ?? "");

  const payload: ActionGetResponse = {
    icon: "https://yourdapp.com/governance.png",
    title: proposal.executed
      ? "Proposal already executed"
      : proposal.passed
      ? "Proposal passed - ready to execute"
      : "Vote on proposal",
    description: proposal.executed
      ? "This proposal has already been executed."
      : proposal.passed
      ? "This proposal has passed voting. Execute it to take effect."
      : `Vote ${proposal.forCount} for, ${proposal.againstCount} against. Ends at ${new Date(proposal.endsAt).toLocaleDateString()}.`,
    label: hasVoted ? "Already voted" : proposal.executed ? "View results" : proposal.passed ? "Execute" : "Vote",
    disabled: proposal.executed || hasVoted,
    links: {
      actions: [
        {
          label: "Vote for",
          href: "/api/actions/vote?proposal={proposal}&vote=for",
          parameters: [{ name: "proposal", label: "Proposal", required: true }],
        },
        {
          label: "Vote against",
          href: "/api/actions/vote?proposal={proposal}&vote=against",
          parameters: [{ name: "proposal", label: "Proposal", required: true }],
        },
      ],
    },
  };

  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}
```

## Action Error Handling Best Practices

Every error response must include CORS headers and user-friendly messages.

```typescript
// lib/actionErrors.ts
export class ActionError extends Error {
  constructor(
    message: string,
    public status: number = 400,
    public userMessage?: string
  ) {
    super(message);
    this.name = "ActionError";
  }
}

export function handleActionError(error: unknown): Response {
  console.error("Action error:", error);

  if (error instanceof ActionError) {
    return Response.json(
      { message: error.userMessage || error.message },
      { status: error.status, headers: ACTIONS_CORS_HEADERS }
    );
  }

  if (error instanceof Error) {
    // Map common errors to user-friendly messages
    const userMessage = getUserFriendlyErrorMessage(error.message);
    return Response.json(
      { message: userMessage },
      { status: 500, headers: ACTIONS_CORS_HEADERS }
    );
  }

  return Response.json(
    { message: "An unexpected error occurred. Please try again." },
    { status: 500, headers: ACTIONS_CORS_HEADERS }
  );
}

function getUserFriendlyErrorMessage(message: string): string {
  if (message.includes("insufficient funds")) {
    return "Your wallet doesn't have enough SOL for this transaction.";
  }
  if (message.includes("blockhash")) {
    return "Transaction expired. Please try again.";
  }
  if (message.includes("slippage")) {
    return "Price moved. Try again with adjusted settings.";
  }
  return "Something went wrong. Please try again.";
}
```

## Action Rate Limiting

Protect your Action endpoints from abuse.

```typescript
// lib/actionRateLimit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 m"), // 10 requests per minute
  analytics: true,
});

export async function checkRateLimit(identifier: string): Promise<boolean> {
  const { success } = await ratelimit.limit(identifier);
  return success;
}

// Usage in POST handler:
export async function POST(req: Request) {
  const body: ActionPostRequest = await req.json();
  const identifier = body.account || req.headers.get("x-forwarded-for") || "anonymous";

  const allowed = await checkRateLimit(identifier);
  if (!allowed) {
    return Response.json(
      { message: "Too many requests. Please wait a moment." },
      { status: 429, headers: ACTIONS_CORS_HEADERS }
    );
  }

  // Proceed with action...
}
```

## Action Analytics

Track Action usage to optimize conversion.

```typescript
// lib/actionAnalytics.ts
export async function trackActionEvent(event: {
  action: string;
  wallet?: string;
  step: "view" | "click" | "sign" | "success" | "error";
  metadata?: Record<string, unknown>;
}) {
  // Send to analytics (PostHog, Mixpanel, or custom)
  await fetch(process.env.ANALYTICS_WEBHOOK!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...event,
      timestamp: new Date().toISOString(),
    }),
  }).catch(console.error); // Don't block on analytics errors
}

// Usage in GET handler:
export async function GET(req: Request) {
  await trackActionEvent({
    action: "transfer",
    step: "view",
  });
  // ...
}

// Usage in POST handler:
export async function POST(req: Request) {
  const body: ActionPostRequest = await req.json();
  
  await trackActionEvent({
    action: "transfer",
    wallet: body.account,
    step: "sign",
  });

  try {
    const tx = await buildTransaction(body);
    await trackActionEvent({
      action: "transfer",
      wallet: body.account,
      step: "success",
    });
    return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
  } catch (error) {
    await trackActionEvent({
      action: "transfer",
      wallet: body.account,
      step: "error",
      metadata: { error: String(error) },
    });
    throw error;
  }
}
```

## Action Security Checklist

### Input Validation
- [ ] Validate `body.account` as a valid PublicKey before use
- [ ] Validate all query parameters (amount bounds, allowed values)
- [ ] Sanitize any user-provided strings before display
- [ ] Never trust client-provided data without validation

### Transaction Safety
- [ ] Always set `feePayer` to the user's account
- [ ] Never sign transactions server-side unless explicitly sponsored
- [ ] For sponsored flows, whitelist allowed programs and instructions
- [ ] Fetch fresh blockhash for every request (no caching)
- [ ] Use `lastValidBlockHeight` to detect expired transactions

### CORS and Headers
- [ ] Include `OPTIONS` handler for preflight requests
- [ ] Apply `ACTIONS_CORS_HEADERS` to ALL responses (including errors)
- [ ] Never expose sensitive data in GET responses
- [ ] Use HTTPS for all Action endpoints

### Rate Limiting and Abuse Prevention
- [ ] Rate limit POST endpoints per wallet/IP
- [ ] Implement abuse detection for suspicious patterns
- [ ] Add CAPTCHA for high-value actions if needed
- [ ] Monitor and alert on unusual activity

### Data Privacy
- [ ] Minimize data collection
- [ ] Don't log wallet addresses unless necessary
- [ ] Comply with privacy regulations
- [ ] Provide clear privacy policy

## Action Performance Optimization

```typescript
// Cache expensive GET responses (short TTL)
import { unstable_cache } from "next/cache";

const getCachedActionMetadata = unstable_cache(
  async (action: string) => {
    return await fetchExpensiveMetadata(action);
  },
  ["action-metadata"],
  { revalidate: 60 } // 60 seconds
);

export async function GET(req: Request) {
  const metadata = await getCachedActionMetadata("transfer");
  return Response.json(metadata, { headers: ACTIONS_CORS_HEADERS });
}

// Use CDN for static assets (icons, images)
const payload: ActionGetResponse = {
  icon: "https://cdn.yourdapp.com/icons/transfer.png", // CDN URL
  // ...
};

// Optimize transaction building
const { blockhash, lastValidBlockHeight } = await Promise.all([
  connection.getLatestBlockhash("confirmed"),
  // Other parallel fetches
]);
```

## Action Testing Strategy

### Unit Tests
```typescript
// __tests__/actions/transfer.test.ts
import { GET, POST } from "@/app/api/actions/transfer/route";
import { Request } from "@miragejs/miragejs";

describe("Transfer Action", () => {
  describe("GET", () => {
    it("returns valid Action metadata", async () => {
      const req = new Request("http://localhost/api/actions/transfer");
      const res = await GET(req);
      const data = await res.json();

      expect(data).toHaveProperty("icon");
      expect(data).toHaveProperty("title");
      expect(data).toHaveProperty("description");
      expect(data).toHaveProperty("label");
      expect(data).toHaveProperty("links.actions");
    });

    it("includes CORS headers", async () => {
      const req = new Request("http://localhost/api/actions/transfer");
      const res = await GET(req);

      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });
  });

  describe("POST", () => {
    it("rejects invalid account", async () => {
      const req = new Request("http://localhost/api/actions/transfer", {
        method: "POST",
        body: JSON.stringify({ account: "invalid-address" }),
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("rejects invalid amount", async () => {
      const req = new Request("http://localhost/api/actions/transfer?amount=-1", {
        method: "POST",
        body: JSON.stringify({ account: "validPublicKeyString" }),
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("returns transaction for valid input", async () => {
      const req = new Request("http://localhost/api/actions/transfer?amount=1", {
        method: "POST",
        body: JSON.stringify({ account: "validPublicKeyString" }),
      });
      const res = await POST(req);
      const data = await res.json();

      expect(data).toHaveProperty("transaction");
    });
  });
});
```

### Integration Tests
```typescript
// __tests__/e2e/blink-flow.test.ts
import { validateAction } from "@solana/actions/cli";

describe("Blink Integration", () => {
  it("validates against Action spec", async () => {
    const result = await validateAction(
      "https://yourdapp.com/api/actions/transfer"
    );
    expect(result.valid).toBe(true);
  });

  it("renders on blinks.xyz playground", async () => {
    // Test that the Blink renders correctly
    const playgroundUrl = `https://blinks.xyz/?action=solana-action:https://yourdapp.com/api/actions/transfer`;
    // Use Playwright or similar to verify rendering
  });
});
```

## Action Deployment Checklist

### Pre-Deployment
- [ ] All Action endpoints validated with `@solana/actions` CLI
- [ ] `actions.json` deployed and accessible at `/actions.json`
- [ ] CORS headers verified on all endpoints
- [ ] Rate limiting configured and tested
- [ ] Error handling tested with various failure modes
- [ ] Analytics tracking implemented
- [ ] Security audit completed

### Post-Deployment
- [ ] Test on devnet with real wallet
- [ ] Test on mainnet-beta with small amount
- [ ] Verify rendering on X/Twitter
- [ ] Verify rendering on Dialect
- [ ] Test on mobile wallet (Phantom mobile, Backpack mobile)
- [ ] Monitor analytics for first 24 hours
- [ ] Set up alerts for error spikes

## Action Monitoring and Debugging

```typescript
// lib/actionMonitoring.ts
export async function logActionMetric(metric: {
  action: string;
  duration: number;
  success: boolean;
  error?: string;
}) {
  // Send to monitoring service (Datadog, New Relic, or custom)
  await fetch(process.env.MONITORING_WEBHOOK!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...metric,
      timestamp: new Date().toISOString(),
    }),
  }).catch(console.error);
}

// Usage in POST handler:
export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    const result = await processAction(req);
    await logActionMetric({
      action: "transfer",
      duration: Date.now() - startTime,
      success: true,
    });
    return result;
  } catch (error) {
    await logActionMetric({
      action: "transfer",
      duration: Date.now() - startTime,
      success: false,
      error: String(error),
    });
    throw error;
  }
}
```

## Common Action Pitfalls and Solutions

### Pitfall 1: Missing OPTIONS Handler
**Problem**: CORS preflight fails silently, Blink doesn't render.
**Solution**: Always add OPTIONS handler.

```typescript
export async function OPTIONS(req: Request) {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}
```

### Pitfall 2: CORS Headers Missing on Errors
**Problem**: Error responses don't include CORS, causing browser to block.
**Solution**: Include headers on ALL responses.

```typescript
return Response.json(
  { message: "Error" },
  { status: 400, headers: ACTIONS_CORS_HEADERS } // ✅
);
```

### Pitfall 3: Stale Blockhash
**Problem**: Transaction expires before user signs.
**Solution**: Fetch fresh blockhash per request.

```typescript
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
```

### Pitfall 4: Missing actions.json
**Problem**: Platforms don't trust your domain, Blinks won't render.
**Solution**: Deploy actions.json at root.

```json
{
  "rules": [
    {
      "pathPattern": "/api/actions/**",
      "apiPath": "/api/actions/**"
    }
  ]
}
```

### Pitfall 5: No Input Validation
**Problem**: Malicious inputs can cause unexpected behavior.
**Solution**: Validate all inputs.

```typescript
if (!amount || amount <= 0 || amount > MAX_AMOUNT) {
  return Response.json(
    { message: "Invalid amount" },
    { status: 400, headers: ACTIONS_CORS_HEADERS }
  );
}
```
