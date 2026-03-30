"use client";

import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletStore } from "@/store/walletStore";
import { useAgentStore } from "@/store/agentStore";
import { generateDID } from "@/lib/did";

/**
 * Wallet <-> Store senkronizasyonu.
 * Layout'ta renderlanir, tum sayfalarda calisir.
 * Cuzdan baglandiginda address, DID, bakiye ve agent card DID'ini gunceller.
 */
export default function WalletSync() {
  const { publicKey, connected } = useWallet();
  const { address, setWallet, clearWallet, fetchBalance } = useWalletStore();
  const { updateMyDid } = useAgentStore();

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
    } else if (!connected && address) {
      clearWallet();
    }
  }, [connected, publicKey, address, setWallet, clearWallet, fetchBalance, updateMyDid]);

  return null;
}
