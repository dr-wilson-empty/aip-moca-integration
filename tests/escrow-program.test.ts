// @vitest-environment node
import { describe, it, expect } from "vitest";
import { ESCROW_PROGRAM_ID } from "@/lib/solana/escrow-program";

describe("Escrow Program Client", () => {
  it("has correct program ID", () => {
    expect(ESCROW_PROGRAM_ID.toBase58()).toBe("59kc3swV6j6NqvhJoKKXAw1uWqGisY2txtf3LLM9Myhz");
  });

  it("exports all instruction builders", async () => {
    const mod = await import("@/lib/solana/escrow-program");
    expect(typeof mod.deriveEscrowStatePDA).toBe("function");
    expect(typeof mod.deriveEscrowVaultPDA).toBe("function");
    expect(typeof mod.buildInitializeEscrowIx).toBe("function");
    expect(typeof mod.buildReleaseEscrowIx).toBe("function");
    expect(typeof mod.buildRefundEscrowIx).toBe("function");
    expect(typeof mod.programReleaseEscrow).toBe("function");
    expect(typeof mod.programRefundEscrow).toBe("function");
  });
});
