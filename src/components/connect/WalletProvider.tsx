"use client";

import { useCallback, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { WalletError } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";

import "@solana/wallet-adapter-react-ui/styles.css";

const ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet");
const WALLETS: [] = [];

export default function WalletProvider({ children }: { children: ReactNode }) {
  const onError = useCallback((error: WalletError) => {
    console.error("[WalletAdapter]", error.name, error.message);
  }, []);

  return (
    <ConnectionProvider endpoint={ENDPOINT}>
      <SolanaWalletProvider wallets={WALLETS} autoConnect onError={onError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
