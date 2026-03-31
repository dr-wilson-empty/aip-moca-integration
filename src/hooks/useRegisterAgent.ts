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

const REGISTER_DISCRIMINATOR = Buffer.from([135, 157, 66, 195, 2, 113, 175, 30]);

/* ------------------------------------------------------------------ */
/*  Browser-compatible SHA-256                                         */
/* ------------------------------------------------------------------ */

async function sha256Browser(data: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(data);
  const ab = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(ab).set(encoded);
  const hash = await crypto.subtle.digest("SHA-256", ab);
  return new Uint8Array(hash).slice(0, 32);
}

/* ------------------------------------------------------------------ */
/*  Borsh helpers                                                      */
/* ------------------------------------------------------------------ */

function borshString(s: string): Buffer {
  const utf8 = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length, 0);
  return Buffer.concat([len, utf8]);
}

function borshU8(n: number): Buffer {
  return Buffer.from([n]);
}

function borshPubkey(pk: PublicKey): Buffer {
  return pk.toBuffer();
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RegisterAgentParams {
  name: string;
  endpoint: string;
  agentType: number; // 0=LLM, 1=Task, 2=Execution
  walletAddress: string;
  capabilities: Array<{
    id: string;
    description: string;
    pricing: { amount: string; token: string; network: string };
  }>;
  version: string;
}

/**
 * Hook for registering an agent on-chain via Phantom wallet.
 */
export function useRegisterAgent() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = useCallback(
    async (params: RegisterAgentParams): Promise<string | null> => {
      if (!publicKey || !signTransaction) {
        setError("Wallet not connected");
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        // Generate DID from wallet public key (did:key format)
        const did = `did:key:z${publicKey.toBase58()}`;

        // Compute did_seed = sha256(did)[0..32]
        const didSeed = await sha256Browser(did);
        const didSeedBuffer = Buffer.from(didSeed);

        // Derive PDA
        const [agentRecord] = PublicKey.findProgramAddressSync(
          [Buffer.from("agent"), didSeedBuffer],
          REGISTRY_PROGRAM_ID
        );

        const walletAddr = new PublicKey(params.walletAddress);
        const capabilitiesJson = JSON.stringify(params.capabilities);

        // Build instruction data
        const data = Buffer.concat([
          REGISTER_DISCRIMINATOR,
          didSeedBuffer, // [u8; 32]
          borshString(did),
          borshString(params.name),
          borshString(params.endpoint),
          borshPubkey(walletAddr),
          borshU8(params.agentType),
          borshString(capabilitiesJson),
          borshString(params.version),
        ]);

        const ix = new TransactionInstruction({
          programId: REGISTRY_PROGRAM_ID,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: agentRecord, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data,
        });

        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");

        const tx = new Transaction({
          feePayer: publicKey,
          blockhash,
          lastValidBlockHeight,
        });
        tx.add(ix);

        const signedTx = await signTransaction(tx);
        const serialized = signedTx.serialize();

        const signature = await connection.sendRawTransaction(serialized, {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });

        await connection.confirmTransaction(signature, "confirmed");

        setLoading(false);
        return signature;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setLoading(false);
        return null;
      }
    },
    [publicKey, signTransaction, connection]
  );

  return { register, loading, error };
}
