import { create } from "zustand";

interface WalletState {
  address: string | null;
  did: string | null;
  usdcBalance: string;
  setWallet: (address: string, did: string) => void;
  clearWallet: () => void;
  deductBalance: (amount: string) => void;
  refundBalance: (amount: string) => void;
}

export const useWalletStore = create<WalletState>()((set) => ({
  address: null,
  did: null,
  usdcBalance: "124.50",
  setWallet: (address, did) => set({ address, did }),
  clearWallet: () => set({ address: null, did: null }),
  deductBalance: (amount) =>
    set((s) => ({
      usdcBalance: (parseFloat(s.usdcBalance) - parseFloat(amount)).toFixed(2),
    })),
  refundBalance: (amount) =>
    set((s) => ({
      usdcBalance: (parseFloat(s.usdcBalance) + parseFloat(amount)).toFixed(2),
    })),
}));
