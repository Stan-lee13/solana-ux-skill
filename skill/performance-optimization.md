# Performance Optimization — Bundle Size, RPC Batching, and Render Performance

> Load this skill when optimizing a Solana dApp for speed, Core Web Vitals,
> or RPC credit efficiency. Covers client bundle reduction, lazy loading,
> RPC request batching, and React render optimization.

---

## The Solana dApp Performance Stack

```
WHERE YOUR USERS LOSE PATIENCE:

1. Initial page load: @solana/web3.js adds ~380KB to your bundle by default
2. Wallet modal load: all wallet adapters loaded eagerly = +200KB unnecessary
3. First RPC call: cold start, no batching, no caching = 300-800ms wasted
4. Re-renders: wallet state changes trigger full component trees = jank
5. Mobile: all of the above × 3 on a 4G connection
```

---

## Bundle Size Optimization

### Tree-Shaking @solana/web3.js

```typescript
// ❌ BAD — imports the entire web3.js bundle (~380KB)
import * as web3 from "@solana/web3.js";
const conn = new web3.Connection(web3.clusterApiUrl("mainnet-beta"));

// ✅ GOOD — named imports only (tree-shaken down to ~60KB)
import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

// ✅ BETTER — use @solana/kit (modern, ESM-first, smaller bundle)
import { createSolanaRpc, address } from "@solana/kit";
```

### Lazy-Loading Wallet Adapters

```typescript
// ❌ BAD — loads ALL wallet adapters at startup (~200KB wasted)
import {
  PhantomWalletAdapter,
  BackpackWalletAdapter,
  SolflareWalletAdapter,
  LedgerWalletAdapter,
  // + 20 more...
} from "@solana/wallet-adapter-wallets";

const wallets = [
  new PhantomWalletAdapter(),
  new BackpackWalletAdapter(),
  // etc.
];

// ✅ GOOD — lazy load each adapter only when the user selects it
// providers/WalletProvider.tsx
import { useMemo } from "react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  // Only load the adapters the user actually has installed
  // Standard Wallet detects installed wallets automatically
  const wallets = useMemo(() => {
    // In 2026: Wallet Standard means most wallets auto-register
    // You only need to explicitly list wallets that don't support the standard
    return []; // Let Wallet Standard handle detection
  }, []);

  return (
    <ConnectionProvider endpoint={process.env.NEXT_PUBLIC_HELIUS_RPC_URL!}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

### Next.js Dynamic Imports for Heavy Components

```typescript
// Heavy components: wallet modal, charts, Blink renderer, Grafana embeds
// Load them only when needed

// ❌ BAD — loads chart library on every page even if user never sees it
import { EarningsChart } from "@/components/EarningsChart";

// ✅ GOOD — lazy loaded only when component is rendered
import dynamic from "next/dynamic";

const EarningsChart = dynamic(
  () => import("@/components/EarningsChart"),
  {
    loading: () => <ChartSkeleton />,
    ssr: false, // chart uses browser APIs
  }
);

// Wallet modal: loads adapters only when user clicks "Connect"
const WalletModal = dynamic(
  () => import("@/components/WalletModal").then((m) => m.WalletModal),
  { loading: () => null, ssr: false }
);

// Blink renderer — only on pages that embed Blinks
const BlinkRenderer = dynamic(
  () => import("@dialectlabs/blinks").then((m) => m.Blink),
  { loading: () => <BlinkSkeleton />, ssr: false }
);
```

### Bundle Analysis CI Gate

```typescript
// scripts/check-bundle-size.ts
// Run in CI — fail build if bundle exceeds budget

const BUNDLE_BUDGETS: Record<string, number> = {
  "/_app":           120 * 1024,  // 120KB max for app shell
  "/":               80 * 1024,   // 80KB max for landing
  "/dashboard":      200 * 1024,  // 200KB max for dashboard
  "/wallet":         150 * 1024,  // 150KB max for wallet page
};

// package.json scripts:
// "analyze": "ANALYZE=true next build"
// "check-bundle": "ts-node scripts/check-bundle-size.ts"
```

---

## RPC Request Batching & Caching

### Request Deduplication

```typescript
// lib/rpc-batcher.ts
// Deduplicate concurrent identical RPC calls using a pending-request cache

import { Connection, PublicKey, AccountInfo } from "@solana/web3.js";

class DeduplicatingConnection {
  private connection: Connection;
  private pending: Map<string, Promise<unknown>> = new Map();
  private cache: Map<string, { value: unknown; expiresAt: number }> = new Map();

  constructor(endpoint: string) {
    this.connection = new Connection(endpoint, "confirmed");
  }

  async getBalance(address: string, cacheTtlMs = 5000): Promise<number> {
    const key = `balance:${address}`;
    
    // Cache hit
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value as number;
    }

    // Dedup in-flight
    const inflight = this.pending.get(key);
    if (inflight) return inflight as Promise<number>;

    const promise = this.connection
      .getBalance(new PublicKey(address), "confirmed")
      .then((balance) => {
        this.cache.set(key, { value: balance, expiresAt: Date.now() + cacheTtlMs });
        this.pending.delete(key);
        return balance;
      })
      .catch((err) => { this.pending.delete(key); throw err; });

    this.pending.set(key, promise);
    return promise;
  }

  // Batch multiple account reads into ONE getMultipleAccountsInfo call
  private accountBatchQueue: Array<{
    address: string;
    resolve: (v: AccountInfo<Buffer> | null) => void;
    reject: (e: Error) => void;
  }> = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  async getAccountInfo(address: string): Promise<AccountInfo<Buffer> | null> {
    return new Promise((resolve, reject) => {
      this.accountBatchQueue.push({ address, resolve, reject });

      // Flush batch after 10ms (collect concurrent calls)
      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.flushAccountBatch(), 10);
      }
    });
  }

  private async flushAccountBatch(): Promise<void> {
    this.batchTimer = null;
    const batch = this.accountBatchQueue.splice(0);
    if (batch.length === 0) return;

    // Deduplicate addresses
    const uniqueAddresses = [...new Set(batch.map((b) => b.address))];

    try {
      const results = await this.connection.getMultipleAccountsInfo(
        uniqueAddresses.map((a) => new PublicKey(a)),
        { commitment: "confirmed" }
      );

      const resultMap = Object.fromEntries(
        uniqueAddresses.map((addr, i) => [addr, results[i]])
      );

      for (const { address, resolve } of batch) {
        resolve(resultMap[address] ?? null);
      }
    } catch (err) {
      for (const { reject } of batch) reject(err as Error);
    }
  }
}

// Usage: replace direct connection with batching connection
export const rpcClient = new DeduplicatingConnection(
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL!
);
```

### TanStack Query Configuration for Optimal RPC Usage

```typescript
// lib/query-client.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reuse cached data for 30 seconds before refetching
      staleTime: 30_000,
      // Keep unused data for 5 minutes
      gcTime: 5 * 60_000,
      // Only retry on network errors, not program errors
      retry: (failureCount, error: any) => {
        if (error?.message?.includes("custom program error")) return false;
        if (error?.message?.includes("Invalid param")) return false;
        return failureCount < 3;
      },
      // Exponential backoff
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      // Don't refetch when window re-focuses for price-sensitive data
      refetchOnWindowFocus: false,
    },
  },
});

// RPC-aware query keys — include cluster in key to avoid stale data after network switch
export function solanaQueryKey(type: string, ...args: unknown[]) {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "mainnet-beta";
  return [cluster, type, ...args];
}

// Usage:
// useQuery({ queryKey: solanaQueryKey("balance", address), ... })
// → cache key: ["mainnet-beta", "balance", "ABC..."]
```

---

## React Render Optimization

### Memoize Wallet-Dependent Components

```typescript
// The wallet context updates on every slot change in some implementations
// Prevent cascade re-renders down the tree

import { memo, useMemo, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

// ❌ BAD — re-renders entire component tree when wallet changes
export function Dashboard() {
  const { publicKey, signTransaction } = useWallet();
  // ... renders UserProfile, NodeTable, EarningsChart all at once
}

// ✅ GOOD — each child subscribes only to what it needs
// Use context selectors to avoid unnecessary re-renders

// Minimal wallet context — only the values each component needs
export const useWalletAddress = () => {
  const { publicKey } = useWallet();
  return useMemo(() => publicKey?.toString() ?? null, [publicKey]);
};

export const useWalletSigner = () => {
  const { signTransaction, signAllTransactions } = useWallet();
  return useMemo(
    () => ({ signTransaction, signAllTransactions }),
    [signTransaction, signAllTransactions]
  );
};

// Memoize expensive components
export const NodeFleetTable = memo(function NodeFleetTable(props: NodeFleetTableProps) {
  // Only re-renders when props change — not on wallet state updates
  // ...
}, (prev, next) => prev.operatorAddress === next.operatorAddress);
```

### Virtual Scrolling for Large Node Tables

```typescript
// For operators with 1000+ nodes — don't render all rows
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

export function LargeNodeTable({ nodes }: { nodes: NodeRow[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // row height in px
    overscan: 10, // render 10 rows above/below viewport
  });

  return (
    <div
      ref={parentRef}
      style={{ height: "400px", overflow: "auto" }}
    >
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.index}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <NodeTableRow node={nodes[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Optimistic Updates for Low-Latency UX

```typescript
// Reward claims: show result immediately, sync on confirm
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useClaimRewards(operatorAddress: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (rewardAmount: number) =>
      submitClaimTransaction(operatorAddress, rewardAmount),

    onMutate: async (rewardAmount) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: solanaQueryKey("operator-stats", operatorAddress),
      });

      // Snapshot previous value
      const prevStats = queryClient.getQueryData<OperatorStats>(
        solanaQueryKey("operator-stats", operatorAddress)
      );

      // Optimistically update
      queryClient.setQueryData(
        solanaQueryKey("operator-stats", operatorAddress),
        (old: OperatorStats | undefined) =>
          old ? { ...old, pendingRewards: 0 } : old
      );

      return { prevStats };
    },

    onError: (_err, _amount, context) => {
      // Rollback
      if (context?.prevStats) {
        queryClient.setQueryData(
          solanaQueryKey("operator-stats", operatorAddress),
          context.prevStats
        );
      }
    },

    onSettled: () => {
      // Always refetch after mutation
      queryClient.invalidateQueries({
        queryKey: solanaQueryKey("operator-stats", operatorAddress),
      });
    },
  });
}
```

---

## Core Web Vitals Targets

```typescript
// Performance budgets for Solana dApps (2026 benchmarks)
export const WEB_VITALS_TARGETS = {
  LCP:  2500,  // Largest Contentful Paint: < 2.5s (Good)
  INP:  200,   // Interaction to Next Paint: < 200ms (Good) — replaced FID
  CLS:  0.1,   // Cumulative Layout Shift: < 0.1 (Good)
  FCP:  1800,  // First Contentful Paint: < 1.8s (internal target)
  TTFB: 800,   // Time to First Byte: < 800ms (internal target)
};

// Wallet-specific targets
export const WALLET_PERF_TARGETS = {
  walletModalOpen:    150,  // ms — wallet modal should appear in < 150ms
  transactionSimulate: 800,  // ms — simulate before sign should take < 800ms
  confirmationNotify: 500,   // ms — notification after confirmation < 500ms
  balanceRefresh:     300,   // ms — balance update after action < 300ms
};
```

---

## Lighthouse CI Configuration

```yaml
# .lighthouserc.yml — add to CI pipeline
ci:
  collect:
    url:
      - "http://localhost:3000"
      - "http://localhost:3000/dashboard"
  assert:
    assertions:
      first-contentful-paint:
        - error
        - maxNumericValue: 2000
      largest-contentful-paint:
        - error
        - maxNumericValue: 3000
      cumulative-layout-shift:
        - error
        - maxNumericValue: 0.1
      total-bundle-size:
        - warn
        - maxNumericValue: 300000  # 300KB max parsed JS
      unused-javascript:
        - warn
        - maxNumericValue: 50000
```

---

## Mobile Performance (Critical — 60%+ of Users)

```typescript
// React Native / Expo specific optimizations

// 1. Prevent re-renders on MWA state changes (auth tokens don't change often)
export const MobileWalletProvider = memo(function MobileWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // ...
});

// 2. Use MMKV instead of AsyncStorage for hot paths (15-20x faster)
import { MMKV } from "react-native-mmkv";
export const storage = new MMKV({ id: "solana-wallet-storage" });
// storage.set("auth_token", token);       // vs AsyncStorage.setItem
// storage.getString("auth_token") ?? "";  // synchronous — no await

// 3. Hermes engine — enabled by default in Expo SDK 52+
// No config needed. Verify in app.json: "jsEngine": "hermes"

// 4. FlashList for node tables instead of FlatList
// FlashList is 5-10x faster for long lists
import { FlashList } from "@shopify/flash-list";
// <FlashList data={nodes} renderItem={renderNode} estimatedItemSize={60} />

// 5. Use worklets for animations (runs on UI thread, not JS thread)
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
```
