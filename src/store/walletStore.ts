import { create } from "zustand";
import { setAuthSession } from "@/lib/auth/signed-fetch";

interface WalletState {
  address: string | null;
  did: string | null;
  usdcBalance: string;
  balanceLoading: boolean;
  authReady: boolean;
  setWallet: (address: string, did: string) => void;
  setAuth: (signature: string, timestamp: number) => void;
  clearWallet: () => void;
  fetchBalance: (address: string) => Promise<void>;
}

export const useWalletStore = create<WalletState>()((set, get) => ({
  address: null,
  did: null,
  usdcBalance: "0.00",
  balanceLoading: false,
  authReady: false,
  setWallet: (address, did) => set({ address, did }),
  setAuth: (signature, timestamp) => {
    const address = get().address;
    if (address) {
      setAuthSession({ address, signature, timestamp });
      set({ authReady: true });
    }
  },
  clearWallet: () => {
    setAuthSession(null);
    set({ address: null, did: null, usdcBalance: "0.00", authReady: false });
  },
  fetchBalance: async (address) => {
    set({ balanceLoading: true });
    try {
      const res = await fetch(`/api/wallet/balance?address=${address}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ usdcBalance: data.balance });
    } catch (err) {
      console.error("[fetchBalance]", err);
    } finally {
      set({ balanceLoading: false });
    }
  },
}));
