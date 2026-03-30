"use client";

import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletStore } from "@/store/walletStore";
import { generateDID } from "@/lib/did";

/**
 * Wallet <-> Store senkronizasyonu.
 * Layout'ta renderlanir, tum sayfalarda calisir.
 * Cuzdan baglandiginda address, DID ve bakiyeyi store'a yazar.
 */
export default function WalletSync() {
  const { publicKey, connected } = useWallet();
  const { address, setWallet, clearWallet, fetchBalance } = useWalletStore();

  useEffect(() => {
    if (connected && publicKey) {
      const addr = publicKey.toBase58();
      // Zaten ayni adresle set edildiyse tekrar yapma
      if (addr === address) return;
      try {
        const did = generateDID(addr);
        setWallet(addr, did);
        fetchBalance(addr).catch(() => {});
      } catch {
        setWallet(addr, "did:key:error");
      }
    } else if (!connected && address) {
      clearWallet();
    }
  }, [connected, publicKey, address, setWallet, clearWallet, fetchBalance]);

  return null; // UI yok, sadece side-effect
}
