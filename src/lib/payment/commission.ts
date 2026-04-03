/**
 * Platform Commission Module
 *
 * Handles fee splitting for hosted agents using Platform AI (tier=platform).
 * After escrow release to platform wallet, sends agent owner their share.
 *
 * Commission: 20% platform, 80% agent owner
 * Only applies to hosted agents with tier=platform.
 * SDK agents and custom-key agents are NOT charged commission.
 */
import {
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import { getConnection } from "@/lib/solana/connection";
import { getHostedAgent } from "@/lib/hosted-agents";
import { logger } from "@/lib/logger";

/** Platform takes 20%, agent owner gets 80% */
export const PLATFORM_COMMISSION_RATE = 0.20;
export const AGENT_SHARE_RATE = 1 - PLATFORM_COMMISSION_RATE;

const USDC_DECIMALS = 6;

/**
 * Check if an agent endpoint is a hosted agent using platform AI.
 * Returns the agent owner's wallet address if commission applies, null otherwise.
 */
export function getCommissionTarget(agentEndpoint: string): string | null {
  // Extract agentId from hosted endpoint URL
  const match = agentEndpoint.match(/[?&]agentId=([^&]+)/);
  if (!match) return null;

  const agentId = match[1];
  const config = getHostedAgent(agentId);

  // Only charge commission for platform tier
  if (!config || config.tier !== "platform") return null;

  return config.ownerAddress;
}

/**
 * Calculate commission split.
 */
export function calculateSplit(amountUsdc: string): {
  totalLamports: bigint;
  agentLamports: bigint;
  platformLamports: bigint;
  agentUsdc: string;
  platformUsdc: string;
} {
  const total = parseFloat(amountUsdc);
  const agentShare = total * AGENT_SHARE_RATE;
  const platformShare = total * PLATFORM_COMMISSION_RATE;

  const totalLamports = BigInt(Math.round(total * Math.pow(10, USDC_DECIMALS)));
  const agentLamports = BigInt(Math.round(agentShare * Math.pow(10, USDC_DECIMALS)));
  const platformLamports = totalLamports - agentLamports; // avoid rounding issues

  return {
    totalLamports,
    agentLamports,
    platformLamports,
    agentUsdc: agentShare.toFixed(USDC_DECIMALS),
    platformUsdc: platformShare.toFixed(USDC_DECIMALS),
  };
}

/**
 * Send agent's share from platform wallet to agent owner wallet.
 * Called after escrow release when commission applies.
 *
 * Flow:
 * 1. Escrow releases full amount to platform authority wallet
 * 2. This function sends 80% from platform to agent owner
 * 3. Platform keeps 20%
 */
export async function sendAgentShare(
  authorityKeypair: Keypair,
  agentOwnerWallet: PublicKey,
  amountUsdc: string,
  mint: PublicKey,
  taskId: string,
): Promise<string | null> {
  try {
    const connection = getConnection();
    const split = calculateSplit(amountUsdc);

    if (split.agentLamports <= BigInt(0)) return null;

    // Platform's ATA (source)
    const platformAta = await getAssociatedTokenAddress(mint, authorityKeypair.publicKey);

    // Agent owner's ATA (destination) — create if needed
    const agentAta = await getAssociatedTokenAddress(mint, agentOwnerWallet);

    const tx = new Transaction();

    // Ensure agent owner's ATA exists
    try {
      await getAccount(connection, agentAta);
    } catch {
      tx.add(
        createAssociatedTokenAccountInstruction(
          authorityKeypair.publicKey,
          agentAta,
          agentOwnerWallet,
          mint,
        )
      );
    }

    // Transfer agent's share
    tx.add(
      createTransferInstruction(
        platformAta,
        agentAta,
        authorityKeypair.publicKey,
        split.agentLamports,
        [],
        TOKEN_PROGRAM_ID,
      )
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [authorityKeypair]);

    logger.info("commission", "agent_share_sent", {
      taskId,
      agentOwner: agentOwnerWallet.toBase58(),
      agentShare: split.agentUsdc,
      platformShare: split.platformUsdc,
      txHash: sig,
    });

    return sig;
  } catch (err) {
    logger.error("commission", "send_failed", {
      taskId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
