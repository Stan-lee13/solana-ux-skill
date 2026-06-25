# /generate-blink

Guide the user from idea to a complete Solana Blink specification.

Use this command when the user wants to build a new Blink, Action endpoint, or social transaction surface.

Do not emit a shell scaffold.

Produce a ready-to-implement markdown specification with TypeScript patterns.

## Intake

Ask at most these three questions:

1. What action does this Blink perform?
2. Who is the target user and where will they encounter it?
3. What chain, program, or protocol does it call?

If the user already describes the action, infer missing details and proceed.

If the program is unknown, generate a placeholder interface and mark the program-specific instruction builder as the only required integration point.

## Required Output

The final answer must include:

- Action summary.
- User and conversion goal.
- Route structure.
- `GET` metadata response.
- `POST` transaction response.
- `OPTIONS` CORS handler.
- Parameter definitions with type and validation rules.
- Transaction construction pattern for the action type.
- Error handling and user-facing messages.
- Security checklist.
- Testing checklist.
- Deployment guide for Vercel and Cloudflare Workers.

## Blink Design Decisions

Before writing the spec, choose:

- Action type: transfer, mint, swap, stake, claim, vote, pay, custom program call.
- Runtime: Next.js App Router or Cloudflare Worker.
- Transaction library: `@solana/web3.js` unless repo already uses `@solana/kit`.
- Confirmation target: client confirms after wallet submission; Action only returns unsigned transaction.
- Fee payer: user by default; sponsored only when explicitly requested.
- Cluster: devnet for demos, mainnet-beta for production.
- Parameter source: query params for button values, body account for signer.

## Standard File Layout

Use this layout for Next.js:

```text
app/api/actions/<slug>/route.ts
public/actions.json
lib/actions/<slug>/validation.ts
lib/actions/<slug>/build-transaction.ts
```

Use this layout for Cloudflare Workers:

```text
src/index.ts
src/actions/<slug>.ts
src/validation.ts
wrangler.toml
```

## Next.js Route Template

Generate a complete route like this, then adapt the transaction builder to the requested action.

```typescript
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
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";

const connection = new Connection(
  process.env.HELIUS_RPC_URL ?? clusterApiUrl("mainnet-beta"),
  "confirmed"
);

export async function GET(req: Request) {
  const payload: ActionGetResponse = {
    icon: "https://yourdomain.com/blink-icon.png",
    label: "Primary action",
    title: "Clear user outcome",
    description: "One sentence that explains what the user gets after signing.",
    links: {
      actions: [
        {
          label: "Do action",
          href: "/api/actions/example?amount=1",
        },
      ],
    },
  };

  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}

export async function OPTIONS(req: Request) {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ActionPostRequest;
    const account = parseAccount(body.account);
    const params = parseParams(new URL(req.url).searchParams);
    const transaction = await buildActionTransaction(account, params);

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: buildSuccessMessage(params),
      },
    });

    return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
  } catch (error) {
    return Response.json(
      { message: toActionErrorMessage(error) },
      { status: toStatusCode(error), headers: ACTIONS_CORS_HEADERS }
    );
  }
}
```

## Parameter Definition Format

For every parameter, define:

- Name.
- Source: query, path, or body.
- Type.
- Required.
- Bounds.
- Default.
- User-facing label.
- Validation error copy.
- Security reason.

Example:

```typescript
type BlinkParameterSpec = {
  name: "amount";
  source: "query";
  type: "number";
  required: true;
  min: 0.001;
  max: 10;
  decimals: 9;
  label: "Amount in SOL";
  invalidMessage: "Enter an amount between 0.001 and 10 SOL.";
};
```

## Validation Helpers

Always include account validation:

```typescript
function parseAccount(value: string | undefined): PublicKey {
  if (!value) {
    throw new ActionInputError("Connect a wallet to continue.");
  }

  try {
    return new PublicKey(value);
  } catch {
    throw new ActionInputError("The connected wallet address is invalid.");
  }
}
```

Always validate numeric params:

```typescript
function parseAmount(searchParams: URLSearchParams): number {
  const raw = searchParams.get("amount");
  const amount = Number(raw);

  if (!raw || !Number.isFinite(amount)) {
    throw new ActionInputError("Enter a valid amount.");
  }

  if (amount < 0.001 || amount > 10) {
    throw new ActionInputError("Amount must be between 0.001 and 10 SOL.");
  }

  return amount;
}
```

Always use typed errors:

```typescript
class ActionInputError extends Error {
  status = 400;
}

class ActionUnavailableError extends Error {
  status = 503;
}

function toStatusCode(error: unknown) {
  return typeof (error as { status?: unknown }).status === "number"
    ? ((error as { status: number }).status)
    : 500;
}

function toActionErrorMessage(error: unknown) {
  if (error instanceof ActionInputError) return error.message;
  if (error instanceof ActionUnavailableError) return error.message;

  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("429")) return "Network is busy. Try again in a moment.";
  if (message.includes("blockhash")) return "Transaction expired. Try again.";
  if (message.includes("0x1")) return "Your wallet needs more SOL for this action.";

  return "This action could not be prepared. Please try again.";
}
```

## Transaction Pattern: SOL Transfer

Use for donations, payments, tips, and simple transfers.

```typescript
import { LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";

async function buildTransferTransaction(sender: PublicKey, amountSol: number) {
  const recipient = new PublicKey(process.env.BLINK_RECIPIENT!);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  return new Transaction({
    feePayer: sender,
    blockhash,
    lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: recipient,
      lamports: Math.round(amountSol * LAMPORTS_PER_SOL),
    })
  );
}
```

## Transaction Pattern: SPL Token Transfer

Use for token payments and claims where the user sends an SPL token.

```typescript
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

async function buildTokenTransferTransaction(sender: PublicKey, amount: bigint) {
  const mint = new PublicKey(process.env.TOKEN_MINT!);
  const recipient = new PublicKey(process.env.TOKEN_RECIPIENT!);
  const senderAta = getAssociatedTokenAddressSync(mint, sender);
  const recipientAta = getAssociatedTokenAddressSync(mint, recipient);
  const decimals = Number(process.env.TOKEN_DECIMALS ?? "6");
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const recipientInfo = await connection.getAccountInfo(recipientAta);

  const tx = new Transaction({
    feePayer: sender,
    blockhash,
    lastValidBlockHeight,
  });

  if (!recipientInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        sender,
        recipientAta,
        recipient,
        mint
      )
    );
  }

  tx.add(
    createTransferCheckedInstruction(
      senderAta,
      mint,
      recipientAta,
      sender,
      amount,
      decimals
    )
  );

  return tx;
}
```

## Transaction Pattern: Custom Program Call

Use when the Blink calls an Anchor or native Solana program.

Require the spec to include:

- Program ID.
- Accounts.
- Instruction discriminator.
- User signer.
- PDA derivation.
- Input serialization.
- Required token accounts.
- Compute budget needs.

Template:

```typescript
import {
  ComputeBudgetProgram,
  TransactionInstruction,
} from "@solana/web3.js";

async function buildProgramTransaction(sender: PublicKey, params: ActionParams) {
  const programId = new PublicKey(process.env.PROGRAM_ID!);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: sender, isSigner: true, isWritable: true },
    ],
    data: encodeInstructionData(params),
  });

  return new Transaction({
    feePayer: sender,
    blockhash,
    lastValidBlockHeight,
  }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
    ix
  );
}
```

## GET Metadata Requirements

For the `GET` response, require:

- `icon`: absolute HTTPS URL.
- `title`: user outcome, not protocol method.
- `description`: one sentence, no jargon.
- `label`: short CTA.
- `links.actions`: one to five actions.
- Parameterized actions use `{name}` placeholders.
- Parameter labels are clear and short.

Example:

```typescript
const payload: ActionGetResponse = {
  icon: "https://example.com/images/claim.png",
  title: "Claim your rewards",
  description: "Claim available rewards to your connected wallet.",
  label: "Claim",
  links: {
    actions: [
      { label: "Claim all", href: "/api/actions/claim?mode=all" },
      {
        label: "Claim amount",
        href: "/api/actions/claim?amount={amount}",
        parameters: [
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
```

## Error Message Rules

Never show:

- `custom program error: 0x1`.
- `Transaction simulation failed`.
- `Blockhash not found`.
- Stack traces.
- RPC provider internals.

Show:

- What happened.
- Whether funds moved.
- What the user should do next.

Copy examples:

```typescript
const ACTION_ERROR_COPY = {
  insufficientFunds: "Your wallet needs more SOL for this transaction.",
  slippage: "The price changed before your trade could be prepared. Try again.",
  accountMissing: "Your token account is not set up yet. Open the app to initialize it.",
  rateLimited: "Too many attempts. Wait a minute and try again.",
  unavailable: "This action is temporarily unavailable. Try again shortly.",
};
```

## Security Checklist

- Validate `body.account` as a `PublicKey`.
- Validate every query parameter.
- Keep max amount bounded.
- Never use a user-provided recipient without allowlist or explicit display.
- Never sign arbitrary transactions server-side.
- For sponsored flows, whitelist programs and instructions.
- Include `ACTIONS_CORS_HEADERS` on every response.
- Include `OPTIONS` for preflight.
- Avoid secrets in client-visible metadata.
- Avoid mutable global state in serverless handlers.
- Use rate limiting for high-value POST endpoints.

## Testing Checklist

Require the user to test:

- `GET` returns valid Action metadata.
- `OPTIONS` returns CORS headers.
- `POST` rejects missing `account`.
- `POST` rejects invalid `account`.
- `POST` rejects invalid params.
- `POST` returns a transaction for valid params.
- Transaction simulates successfully on target cluster.
- Blink renders in Dialect or blinks.xyz validator.
- Mobile preview renders without clipped controls.
- Social unfurl shows correct title and icon.
- User rejection displays as cancellation.
- Insufficient funds displays recovery copy.
- Blockhash expiry can be retried.

Validator references to mention:

```text
Dialect Actions validator
blinks.xyz playground
Mobile wallet handoff test
X/Twitter or social unfurl preview
```

## Vercel Deployment Guide

Include:

```text
1. Add Helius or RPC URL as Helius_RPC_URL or HELIUS_RPC_URL.
2. Add program IDs, recipient wallets, and token mints as environment variables.
3. Deploy with the Action route under /api/actions/<slug>.
4. Confirm public/actions.json is reachable at https://domain.com/actions.json.
5. Validate https://domain.com/api/actions/<slug>.
6. Test the Blink URL: solana-action:https://domain.com/api/actions/<slug>.
```

Mention that serverless runtime must support Node APIs used by `@solana/web3.js`.

## Cloudflare Worker Deployment Guide

Use Workers when the Action is lightweight and has no Node-only dependencies.

Include:

```typescript
export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: ACTIONS_CORS_HEADERS });
    }

    if (url.pathname === "/api/actions/example" && req.method === "GET") {
      return handleGet(req, env);
    }

    if (url.pathname === "/api/actions/example" && req.method === "POST") {
      return handlePost(req, env);
    }

    return new Response("Not found", { status: 404 });
  },
};
```

Warn that some Solana libraries require polyfills in Workers.

If the generated transaction needs SPL Token helpers, prefer Vercel unless the project already has Worker-compatible bundling.

## Final Spec Format

Return:

```markdown
# Blink Specification: <name>

## Summary

## Target User

## Route

## Parameters

| Name | Source | Type | Required | Validation | User Copy |
|---|---|---|---|---|---|

## GET Response

## POST Flow

## Transaction Builder

## Error Handling

## Security Notes

## Testing Checklist

## Deployment

## Implementation Notes
```

## Quality Bar

The output must be specific enough that a TypeScript engineer can implement the Blink without asking what files, handlers, validation, CORS, or transaction construction are required.

Do not generate empty TODO-only scaffolds.

Use placeholders only for protocol-specific values like program ID, recipient wallet, icon URL, and IDL-derived instruction data.
