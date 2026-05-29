/**
 * AIP Escrow — Moca Chain (native MOCA) client.
 *
 * Functional port of src/lib/solana/escrow-program.ts. Same operations
 * (initialize / release / refund / cancel + reads) against the Solidity
 * AipEscrow contract, but value is native MOCA so there is no token account
 * or approve step. Writes take a private key (server / CLI use), mirroring
 * the Solana authority-keypair flow.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodeAbiParameters,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mocaTestnet, MOCA_TESTNET_RPC } from "./registry-client";
import { AIP_ESCROW_ABI } from "./escrow-abi";

/* ------------------------------------------------------------------ */
/*  Status (matches the contract enum)                                 */
/* ------------------------------------------------------------------ */

export const ESCROW_STATUS = {
  None: 0,
  Locked: 1,
  Released: 2,
  Refunded: 3,
  Cancelled: 4,
} as const;
export type EscrowStatusName = keyof typeof ESCROW_STATUS;
const STATUS_REVERSE: Record<number, EscrowStatusName> = {
  0: "None",
  1: "Locked",
  2: "Released",
  3: "Refunded",
  4: "Cancelled",
};

export function escrowStatusName(status: number): EscrowStatusName {
  return STATUS_REVERSE[status] ?? "None";
}

export interface OnChainEscrow {
  taskId: string;
  payer: Address;
  payee: Address;
  authority: Address;
  amount: bigint; // native MOCA, in wei
  deadline: bigint; // unix seconds
  createdAt: bigint; // unix seconds
  status: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Mapping key for a task: must match the contract's keccak256(abi.encode(taskId)). */
export function escrowKey(taskId: string): Hash {
  return keccak256(encodeAbiParameters([{ type: "string" }], [taskId]));
}

function normalizeEscrow(raw: {
  taskId: string;
  payer: Address;
  payee: Address;
  authority: Address;
  amount: bigint;
  deadline: bigint;
  createdAt: bigint;
  status: number;
}): OnChainEscrow {
  return {
    taskId: raw.taskId,
    payer: raw.payer,
    payee: raw.payee,
    authority: raw.authority,
    amount: raw.amount,
    deadline: raw.deadline,
    createdAt: raw.createdAt,
    status: raw.status,
  };
}

/* ------------------------------------------------------------------ */
/*  Client                                                             */
/* ------------------------------------------------------------------ */

export class AipEscrowClient {
  private readonly publicClient;
  private readonly address: Address;
  private readonly rpcUrl: string;

  constructor(escrowAddress: Address, rpcUrl: string = MOCA_TESTNET_RPC) {
    this.address = escrowAddress;
    this.rpcUrl = rpcUrl;
    this.publicClient = createPublicClient({ chain: mocaTestnet, transport: http(rpcUrl) });
  }

  /* ---- reads ---- */

  async getEscrow(taskId: string): Promise<OnChainEscrow> {
    const raw = await this.publicClient.readContract({
      address: this.address,
      abi: AIP_ESCROW_ABI,
      functionName: "getEscrow",
      args: [taskId],
    });
    return normalizeEscrow(raw);
  }

  async status(taskId: string): Promise<number> {
    return this.publicClient.readContract({
      address: this.address,
      abi: AIP_ESCROW_ABI,
      functionName: "escrowStatus",
      args: [taskId],
    });
  }

  async totalEscrows(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.address,
      abi: AIP_ESCROW_ABI,
      functionName: "totalEscrows",
    });
  }

  /* ---- writes (server / CLI) ---- */

  private wallet(privateKey: Hex) {
    const account = privateKeyToAccount(privateKey);
    return createWalletClient({ account, chain: mocaTestnet, transport: http(this.rpcUrl) });
  }

  /** Lock `amountWei` of native MOCA for a task. Signer becomes the payer. */
  async initialize(
    privateKey: Hex,
    params: { taskId: string; payee: Address; authority: Address; deadline: bigint; amountWei: bigint },
  ): Promise<Hash> {
    return this.wallet(privateKey).writeContract({
      address: this.address,
      abi: AIP_ESCROW_ABI,
      functionName: "initializeEscrow",
      args: [params.taskId, params.payee, params.authority, params.deadline],
      value: params.amountWei,
    });
  }

  /** Authority releases the locked funds to the payee. */
  async release(privateKey: Hex, taskId: string): Promise<Hash> {
    return this.wallet(privateKey).writeContract({
      address: this.address,
      abi: AIP_ESCROW_ABI,
      functionName: "releaseEscrow",
      args: [taskId],
    });
  }

  /** Authority refunds the locked funds to the payer. */
  async refund(privateKey: Hex, taskId: string): Promise<Hash> {
    return this.wallet(privateKey).writeContract({
      address: this.address,
      abi: AIP_ESCROW_ABI,
      functionName: "refundEscrow",
      args: [taskId],
    });
  }

  /** Payer reclaims the locked funds after the deadline. */
  async cancel(privateKey: Hex, taskId: string): Promise<Hash> {
    return this.wallet(privateKey).writeContract({
      address: this.address,
      abi: AIP_ESCROW_ABI,
      functionName: "cancelEscrow",
      args: [taskId],
    });
  }
}
