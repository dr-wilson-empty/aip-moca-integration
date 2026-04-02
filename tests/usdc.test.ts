// @vitest-environment node
import { describe, it, expect } from "vitest";
import { usdcToLamports, lamportsToUsdc } from "@/lib/payment/usdc";

describe("USDC Utilities", () => {
  it("converts USDC to lamports", () => {
    expect(usdcToLamports("1.00")).toBe(1000000);
    expect(usdcToLamports("0.10")).toBe(100000);
    expect(usdcToLamports("0.01")).toBe(10000);
    expect(usdcToLamports("99.99")).toBe(99990000);
  });

  it("converts lamports to USDC string", () => {
    expect(lamportsToUsdc(1000000)).toBe("1.00");
    expect(lamportsToUsdc(100000)).toBe("0.10");
    expect(lamportsToUsdc(10000)).toBe("0.01");
    expect(lamportsToUsdc(BigInt(5000000))).toBe("5.00");
  });

  it("handles zero", () => {
    expect(usdcToLamports("0")).toBe(0);
    expect(lamportsToUsdc(0)).toBe("0.00");
  });
});
