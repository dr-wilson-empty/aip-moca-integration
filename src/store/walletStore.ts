import { create } from "zustand";

interface WalletState {
  address: string | null;
  did: string | null;
  usdcBalance: string;
  balanceLoading: boolean;
  setWallet: (address: string, did: string) => void;
  clearWallet: () => void;
  fetchBalance: (address: string) => Promise<void>;
  deductBalance: (amount: string) => void;
  refundBalance: (amount: string) => void;
}

export const useWalletStore = create<WalletState>()((set) => ({
  address: null,
  did: null,
  usdcBalance: "0.00",
  balanceLoading: false,
  setWallet: (address, did) => set({ address, did }),
  clearWallet: () => set({ address: null, did: null, usdcBalance: "0.00" }),
  fetchBalance: async (address) => {
    set({ balanceLoading: true });
    try {
      const res = await fetch(`/api/wallet/balance?address=${address}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ usdcBalance: data.balance });
    } catch (err) {
      console.error("[fetchBalance]", err);
      // Hata durumunda mevcut bakiyeyi koru
    } finally {
      set({ balanceLoading: false });
    }
  },
  deductBalance: (amount) =>
    set((s) => ({
      usdcBalance: (parseFloat(s.usdcBalance) - parseFloat(amount)).toFixed(2),
    })),
  refundBalance: (amount) =>
    set((s) => ({
      usdcBalance: (parseFloat(s.usdcBalance) + parseFloat(amount)).toFixed(2),
    })),
}));
