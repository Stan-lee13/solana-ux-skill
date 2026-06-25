# Mobile Wallet Adapter (MWA) UX

Build Solana dApps that work natively on mobile — connecting to Phantom, Backpack, and Solflare without a browser extension.

## Setup: React Native + Expo

```bash
npx create-expo-app my-solana-app --template expo-template-blank-typescript
cd my-solana-app

npm install \
  @solana-mobile/mobile-wallet-adapter-protocol \
  @solana-mobile/mobile-wallet-adapter-protocol-web3js \
  @solana/web3.js \
  @solana-mobile/wallet-adapter-mobile \
  @solana/wallet-adapter-react \
  react-native-get-random-values \
  buffer
```

## Core MWA connection hook

```typescript
// hooks/useMobileWallet.ts
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback } from "react";
import {
  transact,
  Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import {
  Connection,
  Transaction,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import { useAuthorization } from "./useAuthorization";

const APP_IDENTITY = {
  name: "Your dApp Name",
  uri: "https://yourdapp.com",
  icon: "https://yourdapp.com/icon.png",
};

export function useMobileWallet() {
  const { authorizeSession, deauthorizeSession, selectedAccount } =
    useAuthorization();

  const connect = useCallback(async () => {
    return await transact(async (wallet: Web3MobileWallet) => {
      const authResult = await authorizeSession(wallet);
      return authResult.publicKey;
    });
  }, [authorizeSession]);

  const disconnect = useCallback(async () => {
    if (!selectedAccount) return;
    await transact(async (wallet: Web3MobileWallet) => {
      await deauthorizeSession(wallet);
    });
  }, [deauthorizeSession, selectedAccount]);

  const signAndSendTransaction = useCallback(
    async (transaction: Transaction): Promise<string> => {
      return await transact(async (wallet: Web3MobileWallet) => {
        // Re-authorize if session expired
        await authorizeSession(wallet);

        const connection = new Connection(
          process.env.EXPO_PUBLIC_HELIUS_RPC!,
          "confirmed"
        );

        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash();

        transaction.recentBlockhash = blockhash;
        transaction.feePayer = selectedAccount!.publicKey;

        const [signedTx] = await wallet.signTransactions({
          transactions: [transaction],
        });

        const sig = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });

        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
        return sig;
      });
    },
    [authorizeSession, selectedAccount]
  );

  return { connect, disconnect, signAndSendTransaction, selectedAccount };
}
```

## Authorization persistence (don't make users reconnect every session)

```typescript
// hooks/useAuthorization.ts
import { useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PublicKey } from "@solana/web3.js";
import {
  AuthorizationResult,
  Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";

const AUTH_STORAGE_KEY = "mwa_auth_token";

export function useAuthorization() {
  const [selectedAccount, setSelectedAccount] = useState<{
    publicKey: PublicKey;
    label?: string;
  } | null>(null);

  const authorizeSession = useCallback(
    async (wallet: Web3MobileWallet): Promise<AuthorizationResult> => {
      // Try existing auth token first
      const storedToken = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      
      const result = await wallet.authorize({
        identity: {
          name: "Your dApp",
          uri: "https://yourdapp.com",
          icon: "/icon.png",
        },
        ...(storedToken ? { auth_token: storedToken } : {}),
      });

      // Persist the new token for next time
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, result.auth_token);
      
      setSelectedAccount({
        publicKey: result.accounts[0].address,
        label: result.accounts[0].label,
      });

      return result;
    },
    []
  );

  const deauthorizeSession = useCallback(
    async (wallet: Web3MobileWallet) => {
      const token = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (token) {
        await wallet.deauthorize({ auth_token: token });
        await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
        setSelectedAccount(null);
      }
    },
    []
  );

  return { authorizeSession, deauthorizeSession, selectedAccount };
}
```

## Transaction confirmation UX (mobile-specific)

```typescript
// components/TransactionStatus.tsx
import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Connection } from "@solana/web3.js";

type Status = "pending" | "confirming" | "confirmed" | "failed";

interface Props {
  signature: string;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

export function TransactionStatus({ signature, onSuccess, onError }: Props) {
  const [status, setStatus] = useState<Status>("pending");
  const [confirmations, setConfirmations] = useState(0);

  useEffect(() => {
    if (!signature) return;
    const connection = new Connection(process.env.EXPO_PUBLIC_HELIUS_RPC!);

    setStatus("confirming");

    connection
      .confirmTransaction(signature, "confirmed")
      .then(() => {
        setStatus("confirmed");
        onSuccess?.();
      })
      .catch((e) => {
        setStatus("failed");
        onError?.(e);
      });

    // Poll for confirmation count
    const poll = setInterval(async () => {
      try {
        const { value } = await connection.getSignatureStatuses([signature]);
        if (value[0]?.confirmations) {
          setConfirmations(value[0].confirmations);
        }
        if (value[0]?.confirmationStatus === "confirmed") {
          clearInterval(poll);
        }
      } catch {}
    }, 1000);

    return () => clearInterval(poll);
  }, [signature]);

  return (
    <View style={styles.container}>
      {status === "confirming" && (
        <>
          <ActivityIndicator size="small" color="#9945FF" />
          <Text style={styles.text}>
            Confirming... {confirmations > 0 ? `(${confirmations}/32)` : ""}
          </Text>
        </>
      )}
      {status === "confirmed" && <Text style={styles.success}>✅ Confirmed</Text>}
      {status === "failed" && <Text style={styles.error}>❌ Transaction failed. Please try again.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  text: { color: "#aaa", fontSize: 14 },
  success: { color: "#00d4aa", fontSize: 14, fontWeight: "600" },
  error: { color: "#ff4d6d", fontSize: 14, fontWeight: "600" },
});
```

## Deep linking: open wallet directly from your app

```typescript
// utils/deepLink.ts
import { Linking } from "react-native";

// Open Phantom for a specific transaction
export function openPhantomSignURL(encodedTx: string, redirectUrl: string) {
  const url =
    `https://phantom.app/ul/v1/signTransaction` +
    `?transaction=${encodedTx}` +
    `&redirect_link=${encodeURIComponent(redirectUrl)}`;

  Linking.openURL(url);
}

// Universal: open ANY installed MWA wallet
// (MWA handles wallet selection automatically via Android intent)
```

## Error handling (MWA-specific errors)

```typescript
import {
  MWARequestFailReason,
} from "@solana-mobile/mobile-wallet-adapter-protocol";

function handleMWAError(error: any): string {
  switch (error.message) {
    case MWARequestFailReason.AuthorizationNotValid:
      return "Session expired. Please reconnect your wallet.";
    case MWARequestFailReason.InvalidSignatures:
      return "Transaction signature was invalid.";
    case MWARequestFailReason.NotSubmitted:
      return "Transaction was not submitted — please check your connection.";
    case MWARequestFailReason.TooManyPayloads:
      return "Too many transactions at once. Please try one at a time.";
    case MWARequestFailReason.UserDeclined:
      return "You declined the transaction in your wallet.";
    default:
      return "Wallet error. Please try again.";
  }
}
```

## Testing on device (required — don't skip)

```bash
# Start Metro bundler
npx expo start

# Run on Android device (MWA is Android-only in 2026)
npx expo run:android

# MWA requires a REAL device or Android emulator with Google Play Services
# Phantom, Backpack, and Solflare all support MWA on Android

# Test checklist:
# [ ] Connect wallet (cold start — no saved token)
# [ ] Connect wallet (warm start — saved auth token)
# [ ] Sign a transaction (user approves)
# [ ] User declines transaction (handle gracefully)
# [ ] Kill wallet mid-signing (handle gracefully)
# [ ] Network drop during confirmation (handle gracefully)
```

---

## Deep Linking: Web → Mobile Wallet

The pattern that lets a web page trigger a transaction in the user's mobile wallet without them switching apps manually.

```typescript
// lib/deepLink.ts
// Universal deep link handler — works with Phantom, Backpack, Solflare

import { Linking, Platform } from "react-native";
import { encode as base58Encode } from "bs58";
import nacl from "tweetnacl";

// Phantom Universal Link pattern (most widely supported)
export function buildPhantomDeepLink(params: {
  transaction: Uint8Array;
  redirectUrl: string;
  appUrl: string;
  cluster?: "mainnet-beta" | "devnet";
}): string {
  const dappKeyPair = nacl.box.keyPair(); // ephemeral encryption keypair

  const payload = {
    transaction: base58Encode(params.transaction),
    session: "your-dapp-session-token",
    redirect_link: params.redirectUrl,
  };

  const serialized = new TextEncoder().encode(JSON.stringify(payload));
  const nonce = nacl.randomBytes(24);

  // In production: encrypt with Phantom's public key (fetched from their docs)
  // const PHANTOM_PUBKEY = base58Decode("...");
  // const encrypted = nacl.box(serialized, nonce, PHANTOM_PUBKEY, dappKeyPair.secretKey);

  const searchParams = new URLSearchParams({
    dapp_encryption_public_key: base58Encode(dappKeyPair.publicKey),
    nonce: base58Encode(nonce),
    redirect_link: encodeURIComponent(params.redirectUrl),
    payload: base58Encode(serialized), // simplified — add encryption for production
    cluster: params.cluster ?? "mainnet-beta",
  });

  return `https://phantom.app/ul/v1/signAndSendTransaction?${searchParams}`;
}

// From a React Native app: open the wallet
export async function triggerMobileWalletSigning(deepLink: string) {
  const canOpen = await Linking.canOpenURL(deepLink);
  if (canOpen) {
    await Linking.openURL(deepLink);
  } else {
    // Wallet not installed — redirect to install
    const appStoreUrl = deepLink.startsWith("https://phantom")
      ? "https://phantom.app/download"
      : "https://backpack.app/download";
    await Linking.openURL(appStoreUrl);
  }
}
```

### Handle the Return Deep Link

```typescript
// App.tsx — register deep link handler
import { Linking } from "react-native";
import { useEffect } from "react";

export function useDeepLinkReturn() {
  useEffect(() => {
    // Handle app returning from wallet with signature
    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (!url.includes("solana-action-return")) return;
      const parsed = new URL(url);
      const signature = parsed.searchParams.get("signature");
      const errorCode = parsed.searchParams.get("errorCode");
      const errorMessage = parsed.searchParams.get("errorMessage");

      if (signature) {
        // Transaction signed and sent — show confirmation
        handleTransactionSuccess(signature);
      } else if (errorCode) {
        handleTransactionError(errorCode, errorMessage ?? "Unknown error");
      }
    });

    return () => subscription.remove();
  }, []);
}
```

---

## Auth Token Refresh — Silent Re-authorization

When the MWA auth token expires, re-auth silently instead of forcing a visible reconnect:

```typescript
// hooks/useAuthRefresh.ts
import { useCallback, useRef } from "react";
import { transact, Web3MobileWallet } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { useAuthorization } from "./useAuthorization";

export function useAuthRefresh() {
  const { authorizeSession, selectedAccount } = useAuthorization();
  const refreshInProgress = useRef(false);

  const withFreshAuth = useCallback(
    async <T>(fn: (wallet: Web3MobileWallet) => Promise<T>): Promise<T> => {
      return await transact(async (wallet: Web3MobileWallet) => {
        // Always re-authorize inside transact() to handle expired tokens
        // This is silent if the token is still valid — only prompts if expired
        await authorizeSession(wallet);
        return await fn(wallet);
      });
    },
    [authorizeSession]
  );

  return { withFreshAuth };
}

// Usage — replaces raw transact() calls:
// const { withFreshAuth } = useAuthRefresh();
// const sig = await withFreshAuth(async (wallet) => {
//   const [signed] = await wallet.signTransactions({ transactions: [tx] });
//   return connection.sendRawTransaction(signed.serialize());
// });
```

---

## Multi-Wallet Disambiguation (Phantom + Backpack on same device)

When a user has multiple MWA wallets installed, Android resolves the intent to one wallet — usually the system default. Give the user explicit control.

```tsx
// components/WalletSelector.tsx (React Native)
import React, { useState, useEffect } from "react";
import { View, TouchableOpacity, Text, Modal } from "react-native";
import { getWallets } from "@wallet-standard/app";

interface WalletInfo {
  name: string;
  icon: string;
  id: string;
}

export function WalletSelector({ onSelect }: { onSelect: (wallet: WalletInfo) => void }) {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Discover installed MWA-compatible wallets
    const { get } = getWallets();
    const installed = get().filter(w =>
      w.features["solana:signAndSendTransaction"] !== undefined
    );
    setWallets(
      installed.map(w => ({ name: w.name, icon: w.icon as string, id: w.name }))
    );
  }, []);

  if (wallets.length <= 1) {
    // Only one wallet — skip selector, connect directly
    return null;
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => setShowModal(true)}
        className="bg-primary rounded-lg p-4 items-center"
      >
        <Text className="text-primary-foreground font-medium">Connect Wallet</Text>
      </TouchableOpacity>

      <Modal visible={showModal} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-card rounded-t-2xl p-6 gap-3">
            <Text className="text-foreground font-semibold text-lg">Choose Wallet</Text>
            {wallets.map((w) => (
              <TouchableOpacity
                key={w.id}
                onPress={() => { setShowModal(false); onSelect(w); }}
                className="flex-row items-center gap-3 p-4 rounded-xl border border-border"
              >
                <Text className="text-foreground font-medium">{w.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}
```
