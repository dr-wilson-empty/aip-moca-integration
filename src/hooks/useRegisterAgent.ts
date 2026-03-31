"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";

const REGISTRY_PROGRAM_ID = new PublicKey(
  "CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc"
);

const DISCRIMINATORS = {
  register:   Buffer.from([135, 157, 66, 195, 2, 113, 175, 30]),
  update:     Buffer.from([85, 2, 178, 9, 119, 139, 102, 164]),
  deregister: Buffer.from([227, 208, 166, 164, 48, 69, 111, 1]),
};

/* ------------------------------------------------------------------ */
/*  Borsh helpers                                                      */
/* ------------------------------------------------------------------ */

function borshString(s: string): Buffer {
  const utf8 = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length, 0);
  return Buffer.concat([len, utf8]);
}

function borshU8(n: number): Buffer { return Buffer.from([n]); }
function borshPubkey(pk: PublicKey): Buffer { return pk.toBuffer(); }

/* ------------------------------------------------------------------ */
/*  PDA + DID                                                          */
/* ------------------------------------------------------------------ */

function derivePDA(owner: PublicKey, agentId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), owner.toBuffer(), Buffer.from(agentId)],
    REGISTRY_PROGRAM_ID
  );
  return pda;
}

function generateDid(ownerPubkey: string, agentId: string): string {
  return `did:aip:${ownerPubkey.slice(0, 8)}:${agentId}`;
}

/* ------------------------------------------------------------------ */
/*  Shared sign + send                                                 */
/* ------------------------------------------------------------------ */

async function signAndSend(
  tx: Transaction,
  connection: ReturnType<typeof useConnection>["connection"],
  signTransaction: NonNullable<ReturnType<typeof useWallet>["signTransaction"]>
): Promise<string> {
  const signedTx = await signTransaction(tx);
  const signature = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AgentParams {
  agentId: string; // unique slug, immutable
  name: string;
  endpoint: string;
  agentType: number;
  walletAddress: string;
  capabilities: Array<{
    id: string;
    description: string;
    pricing: { amount: string; token: string; network: string };
  }>;
  version: string;
}

/**
 * Hook for on-chain agent management.
 * One wallet can register multiple agents via unique agent_id slugs.
 */
export function useAgentRegistry() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Register a new agent */
  const register = useCallback(
    async (params: AgentParams): Promise<string | null> => {
      if (!publicKey || !signTransaction) { setError("Wallet not connected"); return null; }
      setLoading(true); setError(null);
      try {
        const did = generateDid(publicKey.toBase58(), params.agentId);
        const pda = derivePDA(publicKey, params.agentId);
        const capabilitiesJson = JSON.stringify(params.capabilities);

        const data = Buffer.concat([
          DISCRIMINATORS.register,
          borshString(params.agentId),
          borshString(did),
          borshString(params.name),
          borshString(params.endpoint),
          borshPubkey(new PublicKey(params.walletAddress)),
          borshU8(params.agentType),
          borshString(capabilitiesJson),
          borshString(params.version),
        ]);

        const ix = new TransactionInstruction({
          programId: REGISTRY_PROGRAM_ID,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: pda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data,
        });

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight });
        tx.add(ix);

        const sig = await signAndSend(tx, connection, signTransaction);
        setLoading(false);
        return sig;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
        return null;
      }
    },
    [publicKey, signTransaction, connection]
  );

  /** Update an existing agent (agent_id must match) */
  const update = useCallback(
    async (params: AgentParams): Promise<string | null> => {
      if (!publicKey || !signTransaction) { setError("Wallet not connected"); return null; }
      setLoading(true); setError(null);
      try {
        const pda = derivePDA(publicKey, params.agentId);
        const capabilitiesJson = JSON.stringify(params.capabilities);

        const data = Buffer.concat([
          DISCRIMINATORS.update,
          borshString(params.name),
          borshString(params.endpoint),
          borshPubkey(new PublicKey(params.walletAddress)),
          borshU8(params.agentType),
          borshString(capabilitiesJson),
          borshString(params.version),
        ]);

        const ix = new TransactionInstruction({
          programId: REGISTRY_PROGRAM_ID,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: pda, isSigner: false, isWritable: true },
          ],
          data,
        });

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight });
        tx.add(ix);

        const sig = await signAndSend(tx, connection, signTransaction);
        setLoading(false);
        return sig;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
        return null;
      }
    },
    [publicKey, signTransaction, connection]
  );

  /** Deregister an agent by agent_id */
  const deregister = useCallback(
    async (agentId: string): Promise<string | null> => {
      if (!publicKey || !signTransaction) { setError("Wallet not connected"); return null; }
      setLoading(true); setError(null);
      try {
        const pda = derivePDA(publicKey, agentId);

        const ix = new TransactionInstruction({
          programId: REGISTRY_PROGRAM_ID,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: pda, isSigner: false, isWritable: true },
          ],
          data: DISCRIMINATORS.deregister,
        });

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight });
        tx.add(ix);

        const sig = await signAndSend(tx, connection, signTransaction);
        setLoading(false);
        return sig;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
        return null;
      }
    },
    [publicKey, signTransaction, connection]
  );

  return { register, update, deregister, loading, error };
}
