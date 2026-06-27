# Indexing Pipeline — From Geyser to Query API

The hidden 3-month tax every Solana team pays. You need a read layer.
RPC doesn't scale. This skill gives you the production pipeline in days, not months.

**The confirmed gap**: Teams consistently spend 2-3 months building indexing infrastructure
that has nothing to do with their actual product. This skill removes that tax.

---

## Why Pure RPC Fails at Scale

```
getProgramAccounts() limitations:
  ❌ No filtering by nested account fields
  ❌ Returns all data (no column projection)  
  ❌ No pagination (returns everything at once — kills at 10K+ accounts)
  ❌ No historical queries ("what was the state at slot X?")
  ❌ High latency under load (500ms–3s)
  ❌ Rate limits at meaningful scale
  ❌ No cross-account aggregation

What dApps actually need:
  ✅ "Show me all positions for wallet X, sorted by value"
  ✅ "What's the 7d volume on pair Y?"
  ✅ "Alert me when TVL drops below $1M"
  ✅ "Show historical price chart for last 30 days"
```

The moment you need any of these, you need an indexer. Build it right the first time.

---

## Architecture: The Standard Pipeline

```
                    ┌─────────────────────────────────┐
                    │     Solana Mainnet Validator      │
                    │  (Agave or Firedancer, June 2026) │
                    └──────────────┬──────────────────┘
                                   │ Geyser Plugin
                                   │ (account updates, txs, blocks)
                                   ▼
                    ┌─────────────────────────────────┐
                    │      Yellowstone gRPC Stream      │
                    │   (Helius, QuickNode, Triton)     │
                    └──────────────┬──────────────────┘
                                   │ gRPC subscribe
                                   ▼
                    ┌─────────────────────────────────┐
                    │         Ingest Worker             │
                    │  (Bun/Node.js process)            │
                    │  • Deserialize accounts           │
                    │  • Decode instructions            │
                    │  • Validate + normalize            │
                    │  • Emit to queue                   │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────┴──────────────────┐
                    ▼                                   ▼
         ┌──────────────────┐             ┌──────────────────┐
         │   PostgreSQL      │             │   Redis Cache     │
         │  (canonical state │             │  (hot data, pub/  │
         │   + history)      │             │   sub for WS)     │
         └──────────────────┘             └──────────────────┘
                    │                                   │
                    └──────────────┬──────────────────┘
                                   ▼
                    ┌─────────────────────────────────┐
                    │         Query API                 │
                    │    (Hono, REST + WebSocket)       │
                    └─────────────────────────────────┘
```

---

## Step 1: Yellowstone gRPC Subscription (Helius)

```typescript
// src/ingest/geyser-client.ts
import Client, {
  CommitmentLevel,
  SubscribeRequest,
  SubscribeUpdate,
} from "@triton-one/yellowstone-grpc";

const YOUR_PROGRAM_ID = "YOUR_PROGRAM_ID_HERE";

export async function startGeyserStream(
  onAccountUpdate: (pubkey: string, data: Buffer, slot: bigint) => Promise<void>,
  onTransaction: (tx: SubscribeUpdate) => Promise<void>
) {
  const client = new Client(
    process.env.HELIUS_GRPC_URL!,   // wss://mainnet.helius-rpc.com
    process.env.HELIUS_API_KEY!,
    { "grpc.max_receive_message_length": 64 * 1024 * 1024 }
  );

  const stream = await client.subscribe();

  const subscribeRequest: SubscribeRequest = {
    accounts: {
      myProgram: {
        account: [],            // Empty = all accounts owned by this program
        owner: [YOUR_PROGRAM_ID],
        filters: [],
      },
    },
    transactions: {
      myProgramTxs: {
        vote: false,
        failed: false,          // Set true if you need to track failed txs
        signature: undefined,
        accountInclude: [YOUR_PROGRAM_ID],
        accountExclude: [],
        accountRequired: [],
      },
    },
    slots: {},
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    commitment: CommitmentLevel.CONFIRMED,
    accountsDataSlice: [],
    ping: undefined,
  };

  await new Promise<void>((resolve, reject) => {
    stream.write(subscribeRequest, (err: Error | null) => {
      err ? reject(err) : resolve();
    });
  });

  stream.on("data", async (data: SubscribeUpdate) => {
    if (data.account) {
      const pubkey = Buffer.from(data.account.account!.pubkey).toString("base58");
      const accountData = Buffer.from(data.account.account!.data);
      const slot = data.account.slot;
      await onAccountUpdate(pubkey, accountData, slot);
    }
    if (data.transaction) {
      await onTransaction(data);
    }
  });

  stream.on("error", (err: Error) => {
    console.error("Geyser stream error:", err);
    // Reconnect logic — implement exponential backoff
    setTimeout(() => startGeyserStream(onAccountUpdate, onTransaction), 5000);
  });

  return stream;
}
```

---

## Step 2: Account Decoder (Auto-generated from IDL)

```typescript
// src/decoder/account-decoder.ts
// Generated from your Anchor IDL — update whenever IDL changes

import { BorshCoder, Idl } from "@coral-xyz/anchor";
import idl from "../../target/idl/my_protocol.json";

const coder = new BorshCoder(idl as Idl);

export interface DecodedUserPosition {
  owner: string;
  amount: bigint;
  openedAt: number;
  leverage: number | null;
  riskTier: number;
}

export interface DecodedLiquidityPool {
  tokenA: string;
  tokenB: string;
  reserveA: bigint;
  reserveB: bigint;
  totalShares: bigint;
  feeBps: number;
}

export function decodeAccount(
  accountName: "UserPosition" | "LiquidityPool",
  data: Buffer
): DecodedUserPosition | DecodedLiquidityPool | null {
  try {
    // Strip the 8-byte Anchor discriminator
    const decoded = coder.accounts.decode(accountName, data.slice(8));
    return decoded;
  } catch (e) {
    // Account may be uninitialized or from a different program version
    return null;
  }
}

// Identify account type by discriminator (first 8 bytes)
export function identifyAccountType(data: Buffer): string | null {
  if (data.length < 8) return null;
  const discriminator = data.slice(0, 8).toString("hex");
  
  const DISCRIMINATORS: Record<string, string> = {
    // Generate these from: anchor build && cat target/idl/my_protocol.json | jq '.accounts[].discriminator'
    "a1b2c3d4e5f6a7b8": "UserPosition",
    "b2c3d4e5f6a7b8c9": "LiquidityPool",
  };
  
  return DISCRIMINATORS[discriminator] ?? null;
}
```

---

## Step 3: PostgreSQL Schema (Canonical State)

```sql
-- migrations/001_initial.sql

-- Track every account owned by your program
CREATE TABLE program_accounts (
    pubkey          TEXT PRIMARY KEY,
    account_type    TEXT NOT NULL,          -- 'UserPosition', 'LiquidityPool', etc.
    owner_wallet    TEXT,                   -- Extracted from account data for fast filtering
    lamports        BIGINT NOT NULL,
    slot_updated    BIGINT NOT NULL,
    data_raw        BYTEA,                  -- Raw account data (for re-decoding after IDL upgrade)
    data_decoded    JSONB,                  -- Decoded fields (fast queries)
    is_closed       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_program_accounts_type ON program_accounts(account_type);
CREATE INDEX idx_program_accounts_owner ON program_accounts(owner_wallet);
CREATE INDEX idx_program_accounts_slot ON program_accounts(slot_updated DESC);

-- Transaction history with decoded instruction data
CREATE TABLE transactions (
    signature       TEXT PRIMARY KEY,
    slot            BIGINT NOT NULL,
    block_time      TIMESTAMPTZ,
    instruction     TEXT,                   -- Instruction name from IDL
    accounts_json   JSONB,                  -- Participating account pubkeys
    args_json       JSONB,                  -- Decoded instruction arguments
    success         BOOLEAN NOT NULL,
    fee_lamports    BIGINT,
    compute_units   BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_slot ON transactions(slot DESC);
CREATE INDEX idx_transactions_instruction ON transactions(instruction);
CREATE INDEX idx_transactions_block_time ON transactions(block_time DESC);

-- For time-series analytics (TVL, volume, etc.)
CREATE TABLE protocol_metrics_hourly (
    hour            TIMESTAMPTZ NOT NULL,
    total_tvl_usd   NUMERIC(20, 4),
    volume_usd      NUMERIC(20, 4),
    active_users    INTEGER,
    new_positions   INTEGER,
    fees_collected  BIGINT,               -- In lamports
    PRIMARY KEY (hour)
);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER program_accounts_updated_at
  BEFORE UPDATE ON program_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## Step 4: Ingest Worker

```typescript
// src/ingest/worker.ts
import { Pool } from "pg";
import { startGeyserStream } from "./geyser-client";
import { decodeAccount, identifyAccountType } from "../decoder/account-decoder";

const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function handleAccountUpdate(
  pubkey: string,
  data: Buffer,
  slot: bigint
): Promise<void> {
  const accountType = identifyAccountType(data);
  if (!accountType) return; // Not one of our known accounts

  const decoded = decodeAccount(accountType as any, data);
  if (!decoded) return; // Deserialization failed (may be migrating)

  await db.query(
    `INSERT INTO program_accounts 
       (pubkey, account_type, owner_wallet, lamports, slot_updated, data_raw, data_decoded)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (pubkey) DO UPDATE SET
       account_type = EXCLUDED.account_type,
       lamports = EXCLUDED.lamports,
       slot_updated = EXCLUDED.slot_updated,
       data_raw = EXCLUDED.data_raw,
       data_decoded = EXCLUDED.data_decoded,
       updated_at = NOW()
     WHERE program_accounts.slot_updated < EXCLUDED.slot_updated`,
    [
      pubkey,
      accountType,
      (decoded as any).owner ?? null,
      0, // Lamports from account meta, not data
      slot,
      data,
      JSON.stringify(decoded),
    ]
  );
}

// Start the ingest
startGeyserStream(handleAccountUpdate, async (tx) => {
  // Handle transaction indexing here
});

console.log("Ingest worker started — streaming from Geyser...");
```

---

## Step 5: Query API

```typescript
// src/api/routes.ts — Hono API over indexed data
import { Hono } from "hono";
import { Pool } from "pg";

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const app = new Hono();

// Get all positions for a wallet
app.get("/positions/:wallet", async (c) => {
  const { wallet } = c.req.param();
  const { rows } = await db.query(
    `SELECT pubkey, data_decoded, slot_updated 
     FROM program_accounts 
     WHERE account_type = 'UserPosition' 
       AND owner_wallet = $1 
       AND is_closed = FALSE
     ORDER BY slot_updated DESC`,
    [wallet]
  );
  return c.json({ positions: rows });
});

// Protocol-wide TVL (aggregated)
app.get("/stats/tvl", async (c) => {
  const { rows } = await db.query(
    `SELECT 
       SUM((data_decoded->>'amount')::BIGINT) as total_amount,
       COUNT(*) as total_positions
     FROM program_accounts
     WHERE account_type = 'UserPosition' AND is_closed = FALSE`
  );
  return c.json(rows[0]);
});

// Historical volume (last 30 days)
app.get("/stats/volume", async (c) => {
  const { rows } = await db.query(
    `SELECT 
       date_trunc('day', block_time) as day,
       COUNT(*) as transactions,
       SUM((args_json->>'amount')::BIGINT) as volume
     FROM transactions
     WHERE instruction = 'swap' 
       AND block_time > NOW() - INTERVAL '30 days'
       AND success = TRUE
     GROUP BY 1
     ORDER BY 1 DESC`
  );
  return c.json({ volume: rows });
});

export default app;
```

---

## Backfill Strategy (Indexing Historical Data)

When you first deploy, you need to index all existing accounts.

```typescript
// scripts/backfill.ts — Run once to index all existing accounts
import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection(process.env.HELIUS_RPC_URL!);
const PROGRAM_ID = new PublicKey(YOUR_PROGRAM_ID);

async function backfillAllAccounts() {
  console.log("Starting backfill...");
  
  let before: string | undefined;
  let totalProcessed = 0;
  
  // Use getSignaturesForAddress for transaction history
  // Use getProgramAccounts for current state
  
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    commitment: "finalized",
    encoding: "base64",
    // Pagination via dataSlice + multiple calls if >100K accounts
    filters: [
      { dataSize: 200 }, // Filter to specific account type by size
    ],
  });
  
  console.log(`Found ${accounts.length} existing accounts to backfill`);
  
  // Process in batches to avoid DB connection exhaustion
  const BATCH_SIZE = 100;
  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(({ pubkey, account }) =>
      handleAccountUpdate(pubkey.toBase58(), Buffer.from(account.data[0], "base64"), BigInt(0))
    ));
    totalProcessed += batch.length;
    console.log(`Backfilled ${totalProcessed}/${accounts.length} accounts`);
  }
  
  console.log("Backfill complete");
}

backfillAllAccounts();
```

---

## Step 6: WebSocket Real-Time Updates

Push updates to clients in real-time via WebSocket when indexed data changes.

```typescript
// src/websocket/server.ts
import { WebSocketServer } from "ws";
import { Pool } from "pg";

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (data) => {
    const { type, wallet } = JSON.parse(data.toString());
    if (type === "subscribe_wallet") {
      db.query(`LISTEN wallet_update_${wallet}`);
    }
  });
});

db.on("notification", (msg) => {
  const payload = JSON.parse(msg.payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });
});
```

---

## Step 7: Database Triggers for Real-Time Events

```sql
-- triggers/002_realtime.sql

CREATE OR REPLACE FUNCTION notify_account_update()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'account_update',
    json_build_object(
      'pubkey', NEW.pubkey,
      'account_type', NEW.account_type,
      'slot_updated', NEW.slot_updated
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_account_update
  AFTER UPDATE ON program_accounts
  FOR EACH ROW
  EXECUTE FUNCTION notify_account_update();
```

---

## Step 8: Error Handling and Retry Logic

```typescript
// src/ingest/retry.ts
import { setTimeout } from "timers/promises";

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt === maxRetries) throw lastError;
      const delay = baseDelay * Math.pow(2, attempt);
      await setTimeout(delay);
    }
  }

  throw lastError;
}
```

---

## Step 9: Health Monitoring and Metrics

```typescript
// src/ingest/metrics.ts
export class IngestMetrics {
  private accountsProcessed = 0;
  private transactionsProcessed = 0;
  private errors = 0;
  private lastSlot = 0n;

  recordAccount() { this.accountsProcessed++; }
  recordTransaction() { this.transactionsProcessed++; }
  recordError() { this.errors++; }
  updateSlot(slot: bigint) { this.lastSlot = slot; }

  getStats() {
    return {
      accountsProcessed: this.accountsProcessed,
      transactionsProcessed: this.transactionsProcessed,
      errors: this.errors,
      lastSlot: this.lastSlot.toString(),
      errorRate: this.errors / (this.accountsProcessed + this.transactionsProcessed),
    };
  }
}
```

---

## Step 10: Data Validation and Sanitization

```typescript
// src/ingest/validation.ts
export function validateAccountUpdate(
  pubkey: string,
  data: Buffer,
  slot: bigint
): { valid: boolean; error?: string } {
  if (!pubkey || pubkey.length !== 44) {
    return { valid: false, error: "Invalid pubkey format" };
  }
  if (data.length === 0) {
    return { valid: false, error: "Empty account data" };
  }
  if (slot <= 0n) {
    return { valid: false, error: "Invalid slot number" };
  }
  return { valid: true };
}
```

---

## Update SKILL.md routing table

This file covers: `indexing-pipeline.md`

Load when:
- Building a read layer for Solana dApps beyond RPC
- Setting up Geyser streaming for real-time account updates
- Designing PostgreSQL schema for indexed data
- Implementing backfill for historical data
- Adding WebSocket real-time updates
- Building monitoring and metrics for indexing pipeline
- Handling errors and retries in ingest workers

