import { describe, it, expect } from "vitest";
import { classifyIdentityInput } from "../src/core/resolver.js";
import { AgentCardSchema } from "../src/core/agent-card.js";

describe("classifyIdentityInput", () => {
  it("recognises a did:aip identifier", () => {
    const r = classifyIdentityInput(
      "did:aip:7imsPo1owz6arqjqHpHvEfNgTepXnm9vtjmHQoVWmABX:translator",
    );
    expect(r.kind).toBe("aip-did");
  });

  it("flags other DID methods as unsupported", () => {
    const r = classifyIdentityInput("did:web:example.com");
    expect(r.kind).toBe("other-did");
    if (r.kind === "other-did") expect(r.method).toBe("web");
  });

  it("treats https URLs as URL probes", () => {
    const r = classifyIdentityInput("https://my-agent.example.com");
    expect(r.kind).toBe("url");
  });

  it("treats http URLs as URL probes", () => {
    const r = classifyIdentityInput("http://localhost:4001");
    expect(r.kind).toBe("url");
  });

  it("rejects ambiguous inputs", () => {
    const r = classifyIdentityInput("just-a-name");
    expect(r.kind).toBe("unknown");
  });

  it("is case-insensitive on the scheme", () => {
    const r = classifyIdentityInput("DID:AIP:OWNER:agent");
    expect(r.kind).toBe("aip-did");
  });

  it("trims whitespace", () => {
    const r = classifyIdentityInput("  did:aip:owner:agent  ");
    expect(r.kind).toBe("aip-did");
  });
});

describe("AgentCardSchema", () => {
  const valid = {
    did: "did:aip:7imsPo1owz6arqjqHpHvEfNgTepXnm9vtjmHQoVWmABX:translator",
    name: "Translator",
    version: "1.0.0",
    endpoint: "https://my-agent.example.com",
    type: "Task",
    capabilities: [
      {
        id: "text.translate",
        description: "Translate text between languages",
        pricing: { amount: "0.05", token: "USDC", network: "solana" },
      },
    ],
  };

  it("accepts a valid AgentCard", () => {
    expect(AgentCardSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a card with no capabilities", () => {
    const bad = { ...valid, capabilities: [] };
    expect(AgentCardSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-USDC pricing token", () => {
    const bad = {
      ...valid,
      capabilities: [
        {
          ...valid.capabilities[0]!,
          pricing: { amount: "0.05", token: "SOL", network: "solana" },
        },
      ],
    };
    expect(AgentCardSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-http endpoint", () => {
    const bad = { ...valid, endpoint: "ftp://my-agent.example.com" };
    expect(AgentCardSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative pricing", () => {
    const bad = {
      ...valid,
      capabilities: [
        {
          ...valid.capabilities[0]!,
          pricing: { amount: "-0.01", token: "USDC", network: "solana" },
        },
      ],
    };
    expect(AgentCardSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing DID prefix", () => {
    const bad = { ...valid, did: "just-an-id" };
    expect(AgentCardSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts an optional walletAddress", () => {
    const okay = { ...valid, walletAddress: "7imsPo1owz6arqjqHpHvEfNgTepXnm9vtjmHQoVWmABX" };
    expect(AgentCardSchema.safeParse(okay).success).toBe(true);
  });

  it("accepts an optional description", () => {
    const okay = { ...valid, description: "A translation agent" };
    expect(AgentCardSchema.safeParse(okay).success).toBe(true);
  });
});
