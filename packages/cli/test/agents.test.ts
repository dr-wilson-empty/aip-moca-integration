import { describe, it, expect } from "vitest";
import {
  AgentListResponseSchema,
  ListedAgentSchema,
  applyFilters,
  cheapestPrice,
  type AgentStatus,
  type ListedAgent,
} from "../src/core/agent-list.js";

function cap(id: string, amount: string) {
  return {
    id,
    description: id,
    pricing: { amount, token: "USDC" as const, network: "solana" as const },
  };
}

function makeAgent(overrides: Partial<ListedAgent> = {}): ListedAgent {
  return ListedAgentSchema.parse({
    did: "did:aip:7imsPo1owz6arqjqHpHvEfNgTepXnm9vtjmHQoVWmABX:demo",
    name: "Demo Agent",
    version: "1.0.0",
    endpoint: "https://demo.example.com",
    type: "Task",
    capabilities: [cap("text.translate", "0.05")],
    ...overrides,
  });
}

describe("ListedAgentSchema", () => {
  it("accepts an AgentCard without extra fields", () => {
    expect(() => makeAgent()).not.toThrow();
  });

  it("accepts onChain and hasMcp", () => {
    expect(() => makeAgent({ onChain: true, hasMcp: true })).not.toThrow();
  });
});

describe("AgentListResponseSchema", () => {
  it("accepts an unpaginated payload", () => {
    const r = AgentListResponseSchema.safeParse({ agents: [] });
    expect(r.success).toBe(true);
  });

  it("accepts a paginated payload", () => {
    const r = AgentListResponseSchema.safeParse({
      agents: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });
    expect(r.success).toBe(true);
  });

  it("rejects payloads where agents is not an array", () => {
    expect(AgentListResponseSchema.safeParse({ agents: "nope" }).success).toBe(false);
  });
});

describe("cheapestPrice", () => {
  it("returns the lowest USDC price across capabilities", () => {
    const a = makeAgent({
      capabilities: [cap("a", "1.00"), cap("b", "0.05"), cap("c", "0.20")],
    });
    expect(cheapestPrice(a)).toBe(0.05);
  });

  it("handles a single-capability agent", () => {
    const a = makeAgent({ capabilities: [cap("only", "0.25")] });
    expect(cheapestPrice(a)).toBe(0.25);
  });
});

describe("applyFilters", () => {
  const agents: ListedAgent[] = [
    makeAgent({ did: "did:aip:owner:t1", name: "T1", type: "Task", capabilities: [cap("t", "0.05")] }),
    makeAgent({ did: "did:aip:owner:l1", name: "L1", type: "LLM", capabilities: [cap("l", "0.50")] }),
    makeAgent({ did: "did:aip:owner:t2", name: "T2", type: "Task", capabilities: [cap("t", "1.00")] }),
  ];

  it("returns all agents with no filters", () => {
    expect(applyFilters(agents, {}, undefined).length).toBe(3);
  });

  it("filters by type", () => {
    const r = applyFilters(agents, { type: "Task" }, undefined);
    expect(r.map((a) => a.name)).toEqual(["T1", "T2"]);
  });

  it("filters by max price", () => {
    const r = applyFilters(agents, { maxPrice: 0.5 }, undefined);
    expect(r.map((a) => a.name)).toEqual(["T1", "L1"]);
  });

  it("combines filters", () => {
    const r = applyFilters(agents, { type: "Task", maxPrice: 0.10 }, undefined);
    expect(r.map((a) => a.name)).toEqual(["T1"]);
  });

  it("filters by online status when statusByDid is provided", () => {
    const status = (did: string, online: boolean): AgentStatus => ({
      did,
      name: "x",
      endpoint: "x",
      online,
      latencyMs: 1,
    });
    const map = new Map([
      [agents[0]!.did, status(agents[0]!.did, true)],
      [agents[1]!.did, status(agents[1]!.did, false)],
    ]);
    const r = applyFilters(agents, { onlineOnly: true }, map);
    expect(r.map((a) => a.name)).toEqual(["T1"]);
  });

  it("excludes agents with no status when onlineOnly is on", () => {
    const r = applyFilters(agents, { onlineOnly: true }, new Map());
    expect(r.length).toBe(0);
  });
});
