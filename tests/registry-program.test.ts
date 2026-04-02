// @vitest-environment node
import { describe, it, expect } from "vitest";
import { REGISTRY_PROGRAM_ID, generateDid } from "@/lib/solana/registry-program";

describe("Registry Program Client", () => {
  it("has correct program ID", () => {
    expect(REGISTRY_PROGRAM_ID.toBase58()).toBe("CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc");
  });

  it("generates deterministic DID", () => {
    const did1 = generateDid("33qU3JFk", "my-bot");
    const did2 = generateDid("33qU3JFk", "my-bot");
    expect(did1).toBe(did2);
    expect(did1).toBe("did:aip:33qU3JFk:my-bot");
  });

  it("generates different DIDs for different agents", () => {
    expect(generateDid("33qU3JFk", "bot-a")).not.toBe(generateDid("33qU3JFk", "bot-b"));
  });

  it("generates different DIDs for different owners", () => {
    expect(generateDid("wallet1", "bot")).not.toBe(generateDid("wallet2", "bot"));
  });

  it("exports all functions", async () => {
    const mod = await import("@/lib/solana/registry-program");
    expect(typeof mod.deriveAgentRecordPDA).toBe("function");
    expect(typeof mod.buildRegisterAgentIx).toBe("function");
    expect(typeof mod.buildUpdateAgentIx).toBe("function");
    expect(typeof mod.buildDeregisterAgentIx).toBe("function");
    expect(typeof mod.fetchAllOnChainAgents).toBe("function");
    expect(typeof mod.fetchAgentsByOwner).toBe("function");
    expect(typeof mod.registerAgentOnChain).toBe("function");
  });
});
