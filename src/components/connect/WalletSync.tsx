"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletStore } from "@/store/walletStore";
import { useAgentStore } from "@/store/agentStore";
import { useTaskStore } from "@/store/taskStore";
import { generateDID } from "@/lib/did";
import bs58 from "bs58";

/**
 * Wallet <-> Store senkronizasyonu.
 * Layout'ta renderlanir, tum sayfalarda calisir.
 * Cuzdan baglandiginda address, DID, bakiye ve agent card DID'ini gunceller.
 * Ayrica wallet auth session icin Ed25519 imza alir (session-based, 24 saat).
 */
export default function WalletSync() {
  const { publicKey, connected, signMessage } = useWallet();
  const { address, setWallet, setAuth, clearWallet, fetchBalance } = useWalletStore();
  const { updateMyDid } = useAgentStore();
  const { resetTask, isRunning } = useTaskStore();
  const signingRef = useRef(false);

  useEffect(() => {
    if (connected && publicKey) {
      const addr = publicKey.toBase58();
      if (addr === address) return;
      try {
        const did = generateDID(addr);
        setWallet(addr, did);
        updateMyDid(did);
        fetchBalance(addr).catch(() => {});
      } catch {
        setWallet(addr, "did:key:error");
      }

      // Session auth imzasi al (tek seferlik, wallet baglantisinda)
      if (signMessage && !signingRef.current) {
        signingRef.current = true;
        const timestamp = Date.now();
        const msg = new TextEncoder().encode(`AIP-AUTH:${addr}:${timestamp}`);
        signMessage(msg)
          .then((sig) => {
            setAuth(bs58.encode(sig), timestamp);
          })
          .catch((err) => {
            console.warn("[WalletSync] Auth signing declined or failed:", err?.message || err);
          })
          .finally(() => {
            signingRef.current = false;
          });
      }
    } else if (!connected && address) {
      clearWallet();
      if (isRunning) resetTask();
    }
  }, [connected, publicKey, address, setWallet, setAuth, clearWallet, fetchBalance, updateMyDid, resetTask, isRunning, signMessage]);

  return null;
}
