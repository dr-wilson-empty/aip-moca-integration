/**
 * AIP Agent Registry — Moca Chain (EVM) client.
 *
 * Functional port of src/lib/solana/registry-program.ts. Same operations
 * (register / update / deregister + discovery reads) against the Solidity
 * AipRegistry contract on Moca Chain instead of the Anchor program on Solana.
 *
 * Read paths use a viem public client; writes take a private key (server / CLI
 * use, mirroring the Solana `ownerKeypair` flow). Browser-wallet signing
 * (MetaMask / AIR Kit) is layered on later.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  keccak256,
  encodeAbiParameters,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AIP_REGISTRY_ABI } from "./registry-abi";

/* ------------------------------------------------------------------ */
/*  Network                                                            */
/* ------------------------------------------------------------------ */

export const MOCA_TESTNET_RPC = "https://rpc.testnet.mocachain.dev";

export const mocaTestnet = defineChain({
  id: 222888,
  name: "Moca Chain Testnet",
  nativeCurrency: { name: "Moca", symbol: "MOCA", decimals: 18 },
  rpcUrls: { default: { http: [MOCA_TESTNET_RPC] } },
  blockExplorers: {
    default: { name: "Moca Testnet Explorer", url: "https://testnet-scan.mocachain.org" },
  },
  testnet: true,
});

/* ------------------------------------------------------------------ */
/*  Domain types (mirror the contract + the Solana ParsedAgentRecord) */
/* ------------------------------------------------------------------ */

/** Tags match the contract enum: LLM=0, Task=1, Execution=2. */
export const AGENT_TYPE = { LLM: 0, Task: 1, Execution: 2 } as const;
export type AgentTypeName = keyof typeof AGENT_TYPE;
const AGENT_TYPE_REVERSE: Record<number, AgentTypeName> = { 0: "LLM", 1: "Task", 2: "Execution" };

export interface OnChainCapability {
  name: string; // ≤ 32 chars
  description: string; // ≤ 64 chars
}

export interface OnChainAgentRecord {
  owner: Address;
  agentId: string;
  did: string;
  name: string;
  endpoint: string;
  walletAddress: Address;
  agentType: number;
  capabilities: OnChainCapability[];
  pricePerTask: bigint; // micro-USDC (6 decimals)
  version: string;
  registeredAt: bigint; // unix seconds
  updatedAt: bigint; // unix seconds
  exists: boolean;
}

export interface RegisterAgentParams {
  agentId: string;
  did: string;
  name: string;
  endpoint: string;
  walletAddress: Address;
  agentType: number;
  capabilities: OnChainCapability[];
  pricePerTask: bigint;
  version: string;
}

export type UpdateAgentParams = Omit<RegisterAgentParams, "did">;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Mapping key for an agent — must match the contract's
 * keccak256(abi.encode(owner, agentId)). This is the Moca equivalent of the
 * Solana PDA derived from ["agent", owner, agent_id].
 */
export function agentKey(owner: Address, agentId: string): Hash {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "string" }], [owner, agentId]));
}

export function agentTypeName(tag: number): AgentTypeName {
  return AGENT_TYPE_REVERSE[tag] ?? "Task";
}

/** "0.10" (USDC) → 100000n (micro-units, 6 decimals). */
export function toMicroUsdc(usdc: string | number): bigint {
  const n = Number(usdc);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.round(n * 1_000_000));
}

/** 100000n → "0.10". */
export function fromMicroUsdc(micro: bigint): string {
  return (Number(micro) / 1_000_000).toFixed(2);
}

/** The contract returns records as structs; viem decodes them to this shape. */
function normalizeRecord(raw: {
  owner: Address;
  agentId: string;
  did: string;
  name: string;
  endpoint: string;
  walletAddress: Address;
  agentType: number;
  capabilities: readonly { name: string; description: string }[];
  pricePerTask: bigint;
  version: string;
  registeredAt: bigint;
  updatedAt: bigint;
  exists: boolean;
}): OnChainAgentRecord {
  return {
    owner: raw.owner,
    agentId: raw.agentId,
    did: raw.did,
    name: raw.name,
    endpoint: raw.endpoint,
    walletAddress: raw.walletAddress,
    agentType: raw.agentType,
    capabilities: raw.capabilities.map((c) => ({ name: c.name, description: c.description })),
    pricePerTask: raw.pricePerTask,
    version: raw.version,
    registeredAt: raw.registeredAt,
    updatedAt: raw.updatedAt,
    exists: raw.exists,
  };
}

/* ------------------------------------------------------------------ */
/*  Client                                                             */
/* ------------------------------------------------------------------ */

export class AipRegistryClient {
  private readonly publicClient;
  private readonly address: Address;
  private readonly rpcUrl: string;

  /**
   * @param registryAddress deployed AipRegistry address (from the Ignition deploy).
   * @param rpcUrl Moca RPC; defaults to testnet.
   */
  constructor(registryAddress: Address, rpcUrl: string = MOCA_TESTNET_RPC) {
    this.address = registryAddress;
    this.rpcUrl = rpcUrl;
    this.publicClient = createPublicClient({ chain: mocaTestnet, transport: http(rpcUrl) });
  }

  /* ---- reads ---- */

  async isAgentOnChain(owner: Address, agentId: string): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.address,
      abi: AIP_REGISTRY_ABI,
      functionName: "isAgentOnChain",
      args: [owner, agentId],
    });
  }

  async getAgent(owner: Address, agentId: string): Promise<OnChainAgentRecord> {
    const raw = await this.publicClient.readContract({
      address: this.address,
      abi: AIP_REGISTRY_ABI,
      functionName: "getAgent",
      args: [owner, agentId],
    });
    return normalizeRecord(raw);
  }

  async fetchAgentsByOwner(owner: Address): Promise<OnChainAgentRecord[]> {
    const raw = await this.publicClient.readContract({
      address: this.address,
      abi: AIP_REGISTRY_ABI,
      functionName: "getAgentsByOwner",
      args: [owner],
    });
    return raw.map(normalizeRecord);
  }

  async totalAgents(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.address,
      abi: AIP_REGISTRY_ABI,
      functionName: "totalAgents",
    });
  }

  /** Paginated global listing — Moca equivalent of getProgramAccounts. */
  async fetchAllAgents(offset = 0n, limit = 100n): Promise<OnChainAgentRecord[]> {
    const raw = await this.publicClient.readContract({
      address: this.address,
      abi: AIP_REGISTRY_ABI,
      functionName: "getAgentsPaged",
      args: [offset, limit],
    });
    return raw.map(normalizeRecord);
  }

  /* ---- writes (server / CLI: signs with a private key) ---- */

  private wallet(privateKey: Hex) {
    const account = privateKeyToAccount(privateKey);
    return createWalletClient({ account, chain: mocaTestnet, transport: http(this.rpcUrl) });
  }

  async registerAgent(privateKey: Hex, p: RegisterAgentParams): Promise<Hash> {
    return this.wallet(privateKey).writeContract({
      address: this.address,
      abi: AIP_REGISTRY_ABI,
      functionName: "registerAgent",
      args: [
        p.agentId,
        p.did,
        p.name,
        p.endpoint,
        p.walletAddress,
        p.agentType,
        p.capabilities,
        p.pricePerTask,
        p.version,
      ],
    });
  }

  async updateAgent(privateKey: Hex, p: UpdateAgentParams): Promise<Hash> {
    return this.wallet(privateKey).writeContract({
      address: this.address,
      abi: AIP_REGISTRY_ABI,
      functionName: "updateAgent",
      args: [
        p.agentId,
        p.name,
        p.endpoint,
        p.walletAddress,
        p.agentType,
        p.capabilities,
        p.pricePerTask,
        p.version,
      ],
    });
  }

  async deregisterAgent(privateKey: Hex, agentId: string): Promise<Hash> {
    return this.wallet(privateKey).writeContract({
      address: this.address,
      abi: AIP_REGISTRY_ABI,
      functionName: "deregisterAgent",
      args: [agentId],
    });
  }
}
