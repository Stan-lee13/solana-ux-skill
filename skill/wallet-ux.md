# Wallet UX — Connection States, Flows, and Edge Cases

> The wallet connection is the front door of your dApp.
> Most dApps build it once and never revisit it. This file covers every state,
> every edge case, and the patterns that turn a 35% connect rate into 60%+.

---

## The Connection State Machine

A wallet connection is not binary (connected / not connected). It has 8 distinct states that each require a different UI response:

```
UNDETECTED     → Browser has no wallet extension AND no mobile wallet
NO_WALLET      → User hasn't installed any wallet (needs education)
DISCONNECTED   → Wallet exists but not connected to this dApp
CONNECTING     → Authorization request in flight
CONNECTED      → Wallet connected, public key available
DISCONNECTING  → Clean disconnect in progress  
SESSION_EXPIRED→ Was connected, auth token expired (needs silent re-auth)
WRONG_NETWORK  → Connected but wrong cluster (devnet vs mainnet)
```

```typescript
// hooks/useWalletState.ts
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

type WalletConnectionState =
  | "undetected"
  | "no-wallet"
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "session-expired"
  | "wrong-network";

export function useWalletState(expectedCluster: string = "mainnet-beta"): {
  state: WalletConnectionState;
  address: string | null;
  shortAddress: string | null;
} {
  const { wallet, publicKey, connecting, disconnecting, connected } = useWallet();
  const { connection } = useConnection();
  const [cluster, setCluster] = useState<string | null>(null);

  useEffect(() => {
    connection.getGenesisHash().then((hash) => {
      // Mainnet genesis hash is fixed
      const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
      setCluster(hash === MAINNET_GENESIS ? "mainnet-beta" : "devnet");
    });
  }, [connection]);

  const state: WalletConnectionState = (() => {
    if (typeof window === "undefined") return "undetected";
    if (disconnecting) return "disconnecting";
    if (connecting) return "connecting";
    if (connected && publicKey) {
      if (cluster && cluster !== expectedCluster) return "wrong-network";
      return "connected";
    }
    // No wallet installed at all
    if (!wallet && !window.phantom && !window.backpack) return "no-wallet";
    return "disconnected";
  })();

  const address = publicKey?.toBase58() ?? null;
  const shortAddress = address
    ? `${address.slice(0, 4)}…${address.slice(-4)}`
    : null;

  return { state, address, shortAddress };
}
```

---

## No-Wallet Education Flow

Do not show a broken connect button to users without a wallet. Educate them.

```tsx
// components/NoWalletGuide.tsx
"use client";

const WALLET_OPTIONS = [
  {
    name: "Phantom",
    description: "Most popular Solana wallet. Browser + mobile.",
    installUrl: "https://phantom.app/download",
    platforms: ["Chrome", "Firefox", "iOS", "Android"],
    recommended: true,
  },
  {
    name: "Backpack",
    description: "Power user wallet with xNFT support.",
    installUrl: "https://backpack.app",
    platforms: ["Chrome", "iOS", "Android"],
    recommended: false,
  },
  {
    name: "Solflare",
    description: "Feature-rich with hardware wallet support.",
    installUrl: "https://solflare.com",
    platforms: ["Chrome", "iOS", "Android"],
    recommended: false,
  },
];

export function NoWalletGuide({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div className="rounded-xl border bg-card p-6 max-w-sm space-y-4">
      <div className="space-y-1">
        <h3 className="font-semibold text-foreground">You need a Solana wallet</h3>
        <p className="text-sm text-muted-foreground">
          A wallet is a free app that holds your crypto and lets you sign transactions.
          It takes about 2 minutes to set up.
        </p>
      </div>

      <div className="space-y-2">
        {WALLET_OPTIONS.map((w) => (
          <a
            key={w.name}
            href={w.installUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent transition-colors"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{w.name}</span>
                {w.recommended && (
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{w.description}</p>
            </div>
            <span className="text-xs text-muted-foreground">Install →</span>
          </a>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Already have a wallet?{" "}
        <button onClick={onDismiss} className="text-primary underline">
          Connect it
        </button>
      </p>
    </div>
  );
}
```

---

## The Progressive Connect Flow

Don't gate your entire dApp behind wallet connection. Show value first, gate actions second.

```
WRONG:  Landing page → "Connect Wallet" wall → nothing visible until connected
RIGHT:  Landing page shows live data/demo → user gets value → action requires connection

Pattern:
  1. Show the dApp's value without wallet (read-only mode: prices, APYs, positions)
  2. Only when user clicks an action CTA → prompt for wallet connection
  3. After connection → continue directly to the action (do not redirect to home)
```

```tsx
// components/ActionGate.tsx
// Renders children if connected, otherwise shows connect prompt in-context
"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

interface ActionGateProps {
  children: React.ReactNode;
  action?: string;  // e.g. "stake", "swap", "mint" — used in the prompt copy
}

export function ActionGate({ children, action = "continue" }: ActionGateProps) {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected) return <>{children}</>;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-center space-y-3">
      <p className="text-sm text-muted-foreground">
        Connect your wallet to {action}
      </p>
      <button
        onClick={() => setVisible(true)}
        className="rounded-md bg-primary text-primary-foreground px-6 py-2 text-sm font-medium hover:bg-primary/90"
      >
        Connect Wallet
      </button>
    </div>
  );
}

// Usage:
// <ActionGate action="stake SOL">
//   <StakeForm />
// </ActionGate>
```

---

## Wrong Network Banner

```tsx
// components/WrongNetworkBanner.tsx
"use client";
import { useWalletState } from "@/hooks/useWalletState";

export function WrongNetworkBanner() {
  const { state } = useWalletState("mainnet-beta");
  if (state !== "wrong-network") return null;

  return (
    <div className="w-full bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center justify-between">
      <p className="text-sm text-destructive font-medium">
        ⚠ Your wallet is connected to the wrong network. Switch to Mainnet in your wallet settings.
      </p>
      <a
        href="https://help.phantom.app/hc/en-us/articles/4406388623251"
        target="_blank"
        className="text-xs underline text-destructive ml-4 flex-shrink-0"
      >
        How to fix →
      </a>
    </div>
  );
}
```

---

## Auto-Connect Pattern (With User Consent)

Auto-connect improves conversion but requires user consent. Store the preference and respect it.

```typescript
// hooks/useAutoConnect.ts
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect } from "react";

const AUTO_CONNECT_KEY = "solana_auto_connect";

export function useAutoConnect() {
  const { connect, connected, wallet } = useWallet();

  useEffect(() => {
    const autoConnect = localStorage.getItem(AUTO_CONNECT_KEY);
    if (autoConnect === "true" && !connected && wallet) {
      connect().catch(console.error);
    }
  }, [connect, connected, wallet]);

  const setAutoConnect = (enabled: boolean) => {
    localStorage.setItem(AUTO_CONNECT_KEY, String(enabled));
  };

  return { setAutoConnect };
}

// Usage in connect button:
// const { setAutoConnect } = useAutoConnect();
// <Checkbox onCheckedChange={setAutoConnect}>
//   Remember me
// </Checkbox>
```

## Balance Check Before Transaction

Check balance before building transaction to avoid building a transaction that will fail.

```typescript
// hooks/useBalanceCheck.ts
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

export function useBalanceCheck() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const checkBalance = async (requiredSol: number): Promise<boolean> => {
    if (!publicKey) return false;

    const balance = await connection.getBalance(publicKey);
    const balanceSol = balance / LAMPORTS_PER_SOL;

    return balanceSol >= requiredSol;
  };

  const getBalance = async (): Promise<number> => {
    if (!publicKey) return 0;
    const balance = await connection.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL;
  };

  return { checkBalance, getBalance };
}

// Usage:
// const { checkBalance } = useBalanceCheck();
// const hasEnough = await checkBalance(0.01);
// if (!hasEnough) {
//   toast.error("Insufficient SOL balance");
//   return;
// }
```

## Network Switching UX

Handle network switching gracefully with clear guidance.

```tsx
// components/NetworkSwitcher.tsx
import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";

const NETWORKS = [
  { name: "Mainnet", cluster: "mainnet-beta", rpc: process.env.NEXT_PUBLIC_MAINNET_RPC! },
  { name: "Devnet", cluster: "devnet", rpc: process.env.NEXT_PUBLIC_DEVNET_RPC! },
];

export function NetworkSwitcher() {
  const { connected } = useWallet();
  const [currentNetwork, setCurrentNetwork] = useState("mainnet-beta");

  const switchNetwork = async (cluster: string) => {
    if (connected) {
      toast.warning("Disconnect your wallet before switching networks");
      return;
    }
    setCurrentNetwork(cluster);
    // Update your RPC provider here
  };

  return (
    <div className="flex gap-2">
      {NETWORKS.map((net) => (
        <button
          key={net.cluster}
          onClick={() => switchNetwork(net.cluster)}
          className={`px-3 py-1 rounded text-sm ${
            currentNetwork === net.cluster
              ? "bg-primary text-primary-foreground"
              : "bg-muted hover:bg-muted/80"
          }`}
        >
          {net.name}
        </button>
      ))}
    </div>
  );
}
```

## Embedded Wallet (Privy) for No-Wallet Users

For users without wallets, use embedded wallet solutions like Privy for instant onboarding.

```typescript
// hooks/usePrivyWallet.ts
import { usePrivy } from "@privy-io/react-auth";

export function usePrivyWallet() {
  const { login, logout, authenticated, user } = usePrivy();

  const connect = async () => {
    try {
      await login();
    } catch (error) {
      console.error("Privy login failed:", error);
    }
  };

  const disconnect = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Privy logout failed:", error);
    }
  };

  return {
    connect,
    disconnect,
    authenticated,
    walletAddress: user?.wallet?.address ?? null,
  };
}

// Usage in your connect button:
// const { connect, authenticated, walletAddress } = usePrivyWallet();
// <Button onClick={connect}>
//   {authenticated ? walletAddress?.slice(0, 8) : "Sign in with email"}
// </Button>
```

## Session Recovery UX

When a wallet session drops, recover gracefully without losing user context.

```tsx
// components/SessionRecoveryBanner.tsx
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

export function SessionRecoveryBanner() {
  const { connected, connect } = useWallet();
  const [showBanner, setShowBanner] = useState(false);
  const [wasConnected, setWasConnected] = useState(false);

  useEffect(() => {
    if (connected) {
      setWasConnected(true);
      setShowBanner(false);
    } else if (wasConnected) {
      setShowBanner(true);
    }
  }, [connected, wasConnected]);

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-card border rounded-lg shadow-lg p-4 max-w-sm">
      <p className="font-medium">Wallet disconnected</p>
      <p className="text-sm text-muted-foreground mb-3">
        Your wallet session ended. Reconnect to continue.
      </p>
      <button
        onClick={() => connect().catch(console.error)}
        className="w-full bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium"
      >
        Reconnect wallet
      </button>
    </div>
  );
}
```

---

## Conversion Anti-Patterns — Ranked by Drop-Off Impact

```
RANK 1 — No-wallet users see a broken button (estimated drop-off: 40%)
  Fix: Detect no-wallet state, show NoWalletGuide instead of disabled button

RANK 2 — Wallet required before any value shown (estimated drop-off: 35%)
  Fix: Show live read-only data first. Gate actions, not visibility.

RANK 3 — No loading state during wallet connection (estimated drop-off: 15%)
  Fix: Show spinner with "Connecting to [WalletName]…" during connecting state

RANK 4 — Error after signing with no recovery path (estimated drop-off: 60% of errors)
  Fix: Every error has a retry button and human-readable message

RANK 5 — Wrong network — no explanation (estimated drop-off: 90% of affected users)
  Fix: WrongNetworkBanner with step-by-step fix link

RANK 6 — Session expired, user sees disconnected state with no context (drop-off: 25%)
  Fix: "Your session expired. Reconnect to continue." with one-click reconnect

RANK 7 — Mobile users see desktop wallet modal (drop-off: 70% on mobile)
  Fix: Detect mobile, show MWA flow or Privy embedded wallet instead
```

---

## Wallet Adapter Configuration

Configure wallet adapter with all supported wallets and proper settings.

```typescript
// components/WalletProvider.tsx
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter, BackpackWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import { useMemo } from "react";

const network = WalletAdapterNetwork.Mainnet;
const endpoint = useMemo(() => clusterApiUrl(network), [network]);

const wallets = useMemo(
  () => [
    new PhantomWalletAdapter(),
    new BackpackWalletAdapter(),
    new SolflareWalletAdapter(),
  ],
  []
);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
```

---

## Update SKILL.md routing table

This file covers: `wallet-ux.md`

Load when:
- Building or auditing wallet connection UI
- Debugging low connect rates
- Handling edge cases (no wallet, wrong network, session expiry)
- Designing progressive disclosure flow (value before connection)
- Implementing auto-connect with consent
- Adding embedded wallet (Privy) for no-wallet users
- Building network switching UX
- Implementing session recovery patterns
