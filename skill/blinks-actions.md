# Solana Actions and Blinks

Solana Actions and Blinks let your dApp's functionality travel anywhere on the web — X posts, Discord, emails, QR codes. Users interact with Solana without ever opening your frontend.

## Key Concepts

- **Solana Actions**: Standard HTTP APIs that return transactions for users to sign
- **Solana Blinks**: The client-side renderer that turns an Action URL into an interactive UI
- **Dialect**: The reference implementation and hosting platform for Blinks

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

## Testing your Action

```bash
# Install the Solana Actions CLI
npm install -g @solana/actions

# Validate your action endpoint
solana-actions validate https://yourdapp.com/api/actions/transfer

# Preview how it renders as a Blink
# Open: https://blinks.xyz/?action=solana-action:https://yourdapp.com/api/actions/transfer
```
