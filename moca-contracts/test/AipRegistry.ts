import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { getAddress, keccak256, encodeAbiParameters } from "viem";

const { viem } = await network.create();

// AgentType enum tags — must match the Solana program (LLM=0, Task=1, Execution=2).
const TASK = 1;
const LLM = 0;

const SAMPLE_CAPS = [
  { name: "text.summarize", description: "Summarize a block of text" },
  { name: "text.translate", description: "Translate text between languages" },
];

async function deploy() {
  const registry = await viem.deployContract("AipRegistry");
  const [owner, other] = await viem.getWalletClients();
  return { registry, owner, other };
}

// Build the registerAgent argument tuple with sensible defaults; override per test.
function registerArgs(overrides: Partial<{
  agentId: string;
  did: string;
  name: string;
  endpoint: string;
  walletAddress: `0x${string}`;
  agentType: number;
  capabilities: { name: string; description: string }[];
  pricePerTask: bigint;
  version: string;
}> = {}) {
  const a = {
    agentId: "summary-agent",
    did: "did:aip:0x1111111111111111111111111111111111111111:summary-agent",
    name: "Summary Agent",
    endpoint: "https://agents.example.com/summary",
    walletAddress: "0x2222222222222222222222222222222222222222" as `0x${string}`,
    agentType: TASK,
    capabilities: SAMPLE_CAPS,
    pricePerTask: 100000n, // 0.10 USDC in micro-units
    version: "1.0.0",
    ...overrides,
  };
  return [
    a.agentId,
    a.did,
    a.name,
    a.endpoint,
    a.walletAddress,
    a.agentType,
    a.capabilities,
    a.pricePerTask,
    a.version,
  ] as const;
}

describe("AipRegistry", () => {
  describe("registerAgent + reads", () => {
    it("stores every field and reads it back", async () => {
      const { registry, owner } = await deploy();
      await registry.write.registerAgent(registerArgs());

      const rec = await registry.read.getAgent([owner.account.address, "summary-agent"]);
      assert.equal(getAddress(rec.owner), getAddress(owner.account.address));
      assert.equal(rec.agentId, "summary-agent");
      assert.equal(rec.did, "did:aip:0x1111111111111111111111111111111111111111:summary-agent");
      assert.equal(rec.name, "Summary Agent");
      assert.equal(rec.endpoint, "https://agents.example.com/summary");
      assert.equal(getAddress(rec.walletAddress), getAddress("0x2222222222222222222222222222222222222222"));
      assert.equal(rec.agentType, TASK);
      assert.equal(rec.capabilities.length, 2);
      assert.equal(rec.capabilities[0].name, "text.summarize");
      assert.equal(rec.capabilities[1].description, "Translate text between languages");
      assert.equal(rec.pricePerTask, 100000n);
      assert.equal(rec.version, "1.0.0");
      assert.ok(rec.registeredAt > 0n);
      assert.equal(rec.registeredAt, rec.updatedAt);
      assert.equal(rec.exists, true);
    });

    it("reports presence via isAgentOnChain", async () => {
      const { registry, owner } = await deploy();
      assert.equal(await registry.read.isAgentOnChain([owner.account.address, "summary-agent"]), false);
      await registry.write.registerAgent(registerArgs());
      assert.equal(await registry.read.isAgentOnChain([owner.account.address, "summary-agent"]), true);
    });

    it("tracks enumeration (total + by owner)", async () => {
      const { registry, owner } = await deploy();
      await registry.write.registerAgent(registerArgs({ agentId: "a1" }));
      await registry.write.registerAgent(registerArgs({ agentId: "a2" }));

      assert.equal(await registry.read.totalAgents(), 2n);
      const mine = await registry.read.getAgentsByOwner([owner.account.address]);
      assert.equal(mine.length, 2);
      const ids = mine.map((r) => r.agentId).sort();
      assert.deepEqual(ids, ["a1", "a2"]);
    });

    it("rejects a duplicate agentId for the same owner", async () => {
      const { registry } = await deploy();
      await registry.write.registerAgent(registerArgs());
      await assert.rejects(registry.write.registerAgent(registerArgs()));
    });

    it("lets two different owners use the same agentId (distinct keys)", async () => {
      const { registry, owner, other } = await deploy();
      await registry.write.registerAgent(registerArgs({ agentId: "shared" }));
      await registry.write.registerAgent(registerArgs({ agentId: "shared" }), { account: other.account });

      assert.equal(await registry.read.totalAgents(), 2n);
      assert.equal(await registry.read.isAgentOnChain([owner.account.address, "shared"]), true);
      assert.equal(await registry.read.isAgentOnChain([other.account.address, "shared"]), true);
    });
  });

  describe("updateAgent", () => {
    it("updates mutable fields and bumps updatedAt; agentId/did stay fixed", async () => {
      const { registry, owner } = await deploy();
      await registry.write.registerAgent(registerArgs());

      await registry.write.updateAgent([
        "summary-agent",
        "Summary Agent v2",
        "https://agents.example.com/summary-v2",
        "0x3333333333333333333333333333333333333333",
        LLM,
        [{ name: "text.summarize", description: "now an LLM agent" }],
        250000n,
        "2.0.0",
      ]);

      const rec = await registry.read.getAgent([owner.account.address, "summary-agent"]);
      assert.equal(rec.name, "Summary Agent v2");
      assert.equal(rec.endpoint, "https://agents.example.com/summary-v2");
      assert.equal(rec.agentType, LLM);
      assert.equal(rec.capabilities.length, 1);
      assert.equal(rec.pricePerTask, 250000n);
      assert.equal(rec.version, "2.0.0");
      // immutable
      assert.equal(rec.agentId, "summary-agent");
      assert.equal(rec.did, "did:aip:0x1111111111111111111111111111111111111111:summary-agent");
    });

    it("reverts updating a non-existent agent", async () => {
      const { registry } = await deploy();
      await assert.rejects(
        registry.write.updateAgent([
          "ghost",
          "n",
          "e",
          "0x3333333333333333333333333333333333333333",
          TASK,
          [],
          0n,
          "1",
        ]),
      );
    });
  });

  describe("deregisterAgent", () => {
    it("removes the record and updates enumeration", async () => {
      const { registry, owner } = await deploy();
      await registry.write.registerAgent(registerArgs({ agentId: "a1" }));
      await registry.write.registerAgent(registerArgs({ agentId: "a2" }));
      await registry.write.registerAgent(registerArgs({ agentId: "a3" }));

      await registry.write.deregisterAgent(["a2"]);

      assert.equal(await registry.read.totalAgents(), 2n);
      assert.equal(await registry.read.isAgentOnChain([owner.account.address, "a2"]), false);
      assert.equal(await registry.read.isAgentOnChain([owner.account.address, "a1"]), true);
      assert.equal(await registry.read.isAgentOnChain([owner.account.address, "a3"]), true);

      const mine = await registry.read.getAgentsByOwner([owner.account.address]);
      assert.equal(mine.length, 2);
      const ids = mine.map((r) => r.agentId).sort();
      assert.deepEqual(ids, ["a1", "a3"]);
    });

    it("reverts deregistering a non-existent agent", async () => {
      const { registry } = await deploy();
      await assert.rejects(registry.write.deregisterAgent(["nope"]));
    });
  });

  describe("validation", () => {
    it("rejects empty agentId", async () => {
      const { registry } = await deploy();
      await assert.rejects(registry.write.registerAgent(registerArgs({ agentId: "" })));
    });

    it("rejects agentId over 32 chars", async () => {
      const { registry } = await deploy();
      await assert.rejects(registry.write.registerAgent(registerArgs({ agentId: "x".repeat(33) })));
    });

    it("rejects did over 100 chars", async () => {
      const { registry } = await deploy();
      await assert.rejects(registry.write.registerAgent(registerArgs({ did: "d".repeat(101) })));
    });

    it("rejects name over 64 chars", async () => {
      const { registry } = await deploy();
      await assert.rejects(registry.write.registerAgent(registerArgs({ name: "n".repeat(65) })));
    });

    it("rejects more than 8 capabilities", async () => {
      const { registry } = await deploy();
      const caps = Array.from({ length: 9 }, (_, i) => ({ name: `cap${i}`, description: "x" }));
      await assert.rejects(registry.write.registerAgent(registerArgs({ capabilities: caps })));
    });

    it("rejects a capability with an empty name", async () => {
      const { registry } = await deploy();
      await assert.rejects(
        registry.write.registerAgent(registerArgs({ capabilities: [{ name: "", description: "x" }] })),
      );
    });

    it("rejects a capability description over 64 chars", async () => {
      const { registry } = await deploy();
      await assert.rejects(
        registry.write.registerAgent(
          registerArgs({ capabilities: [{ name: "ok", description: "d".repeat(65) }] }),
        ),
      );
    });

    it("accepts exactly 8 capabilities and boundary-length fields", async () => {
      const { registry, owner } = await deploy();
      const caps = Array.from({ length: 8 }, (_, i) => ({ name: `cap${i}`, description: "d".repeat(64) }));
      await registry.write.registerAgent(
        registerArgs({
          agentId: "x".repeat(32),
          name: "n".repeat(64),
          version: "v".repeat(16),
          capabilities: caps,
        }),
      );
      const rec = await registry.read.getAgent([owner.account.address, "x".repeat(32)]);
      assert.equal(rec.capabilities.length, 8);
    });
  });

  // Guards the registry-client: its agentKey() uses the exact same formula.
  describe("agentKey parity (client <-> contract)", () => {
    it("JS keccak256(abi.encode(owner, agentId)) matches the contract", async () => {
      const { registry, owner } = await deploy();
      const agentId = "summary-agent";
      const jsKey = keccak256(
        encodeAbiParameters([{ type: "address" }, { type: "string" }], [owner.account.address, agentId]),
      );
      const solKey = await registry.read.agentKey([owner.account.address, agentId]);
      assert.equal(jsKey, solKey);
    });
  });
});
