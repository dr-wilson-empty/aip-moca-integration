import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ApiClient } from "./api-client.js";
import {
  QuoteResponseSchema,
  TaskCreatedSchema,
  type QuoteResponse,
} from "./task-types.js";
import { NetworkError, ValidationError, WalletError } from "./errors.js";
import { USDC_MINT } from "./solana.js";

const USDC_DECIMALS = 6;
const ESCROW_PROGRAM_ID = new PublicKey("59kc3swV6j6NqvhJoKKXAw1uWqGisY2txtf3LLM9Myhz");
// SPL Memo v2 — attaches a human-readable label so wallet UIs (Phantom,
// Solflare, Backpack) show "AIP escrow · task X · N USDC" in the
// signature preview instead of just an unknown-program warning.
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const INIT_ESCROW_DISCRIMINATOR = Buffer.from([243, 160, 77, 153, 11, 92, 48, 209]);
const DEFAULT_DEADLINE_SECONDS = 300;

function borshString(s: string): Buffer {
  const utf8 = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length, 0);
  return Buffer.concat([len, utf8]);
}

function borshU64(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n, 0);
  return buf;
}

function borshI64(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(n, 0);
  return buf;
}

function deriveEscrowStatePda(taskId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(taskId)],
    ESCROW_PROGRAM_ID,
  );
  return pda;
}

function deriveEscrowVaultPda(taskId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(taskId)],
    ESCROW_PROGRAM_ID,
  );
  return pda;
}

export interface SubmitTaskBody {
  agentEndpoint: string;
  capability: string;
  input: string;
  amount: string;
  callerDid: string;
  callerAddress: string;
}

export interface SubmitTaskResult {
  taskId: string;
  escrowTxHash: string;
  agentName: string;
}

export interface SubmitTaskContext {
  api: ApiClient;
  connection: Connection;
  signer: Keypair;
  cluster: "devnet" | "mainnet-beta";
  onStep?: (step: string) => void;
}

export async function submitTaskWithPayment(
  body: SubmitTaskBody,
  ctx: SubmitTaskContext,
): Promise<SubmitTaskResult> {
  const { api, connection, signer, cluster, onStep } = ctx;
  const payer = signer.publicKey;

  onStep?.("Fetching payment quote");
  const quote = await api.post(
    "/api/task/quote",
    {
      agentEndpoint: body.agentEndpoint,
      capability: body.capability,
      amount: body.amount,
    },
    QuoteResponseSchema,
  );

  const accepted = quote.requirements.accepts[0];
  if (!accepted) {
    throw new NetworkError("Quote response had no payment requirements");
  }
  const taskId = quote.taskId;

  const usdcMint = new PublicKey(accepted.asset);
  const expectedMint = new PublicKey(USDC_MINT[cluster]);
  if (!usdcMint.equals(expectedMint)) {
    throw new ValidationError(
      `Server asked for asset ${accepted.asset} but configured USDC mint for ${cluster} is ${expectedMint.toBase58()}`,
    );
  }

  const authority = new PublicKey(accepted.authority);
  const payee = new PublicKey(accepted.payee);
  const amount = BigInt(accepted.amount);

  onStep?.("Checking USDC balance");
  const fromAta = await getAssociatedTokenAddress(usdcMint, payer);
  try {
    const tokenAccount = await getAccount(connection, fromAta);
    if (tokenAccount.amount < amount) {
      const have = (Number(tokenAccount.amount) / 10 ** USDC_DECIMALS).toFixed(USDC_DECIMALS);
      const need = (Number(amount) / 10 ** USDC_DECIMALS).toFixed(USDC_DECIMALS);
      throw new WalletError(
        `Insufficient USDC balance: have ${have}, need ${need}`,
        cluster === "devnet"
          ? "Mint devnet USDC: spl-token mint authority is the AIP team. Reach out for a top-up, or use a different wallet."
          : "Top up USDC on this wallet before submitting.",
      );
    }
  } catch (err) {
    if (err instanceof WalletError) throw err;
    throw new WalletError(
      `No USDC token account found for ${payer.toBase58()}`,
      "Receive at least 1 cent of devnet USDC at this wallet, then retry.",
    );
  }

  onStep?.("Building escrow transaction");
  const escrowState = deriveEscrowStatePda(taskId);
  const escrowVault = deriveEscrowVaultPda(taskId);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS);
  const data = Buffer.concat([
    INIT_ESCROW_DISCRIMINATOR,
    borshString(taskId),
    borshU64(amount),
    borshI64(deadline),
  ]);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer, blockhash, lastValidBlockHeight });

  // Memo instruction (rendered by wallet UIs in the sign preview).
  const memoText = `AIP escrow · task ${taskId} · ${(Number(amount) / 10 ** USDC_DECIMALS).toFixed(2)} USDC`;
  tx.add({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(memoText, "utf8"),
  });

  tx.add({
    programId: ESCROW_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: payee, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: false, isWritable: false },
      { pubkey: escrowState, isSigner: false, isWritable: true },
      { pubkey: escrowVault, isSigner: false, isWritable: true },
      { pubkey: fromAta, isSigner: false, isWritable: true },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });

  onStep?.("Signing transaction");
  tx.sign(signer);
  const serializedTx = tx.serialize({ requireAllSignatures: true, verifySignatures: true });

  onStep?.("Sending payment + task to backend");
  const paymentPayload = {
    x402Version: 2,
    scheme: "exact" as const,
    network: accepted.network,
    payload: { serializedTransaction: Buffer.from(serializedTx).toString("base64") },
    accepted: {
      scheme: accepted.scheme,
      network: accepted.network,
      asset: accepted.asset,
      amount: accepted.amount,
      programId: accepted.programId,
      taskId,
    },
  };
  const xPaymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

  const res = await api.request("POST", "/api/task", {
    body: { ...body, taskId },
    headers: { "X-PAYMENT": xPaymentHeader },
  });

  let parsedPaid: unknown;
  try {
    parsedPaid = await res.json();
  } catch {
    throw new NetworkError("Server returned non-JSON response after payment");
  }
  if (res.status >= 400) {
    const message =
      (parsedPaid && typeof parsedPaid === "object" && "error" in parsedPaid
        ? String((parsedPaid as { error: unknown }).error)
        : `Task submission failed (${res.status})`);
    throw new NetworkError(message, res.status);
  }

  const validated = TaskCreatedSchema.safeParse(parsedPaid);
  if (!validated.success) {
    throw new NetworkError("Unexpected response shape from POST /api/task");
  }

  let escrowTxHash = validated.data.escrowTxHash ?? "";
  const responseHeader = res.headers.get("x-payment-response");
  if (responseHeader && !escrowTxHash) {
    try {
      const payment = JSON.parse(Buffer.from(responseHeader, "base64").toString("utf8")) as {
        transaction?: string;
      };
      if (payment.transaction) escrowTxHash = payment.transaction;
    } catch {
      /* ignore */
    }
  }

  return {
    taskId: validated.data.taskId,
    escrowTxHash,
    agentName: extractAgentNameFromEndpoint(body.agentEndpoint),
  };
}

function extractAgentNameFromEndpoint(endpoint: string): string {
  const match = endpoint.match(/[?&]agentId=([^&]+)/);
  return match ? match[1]! : endpoint;
}

export function quoteAgentRequirementsKey(quote: QuoteResponse): string {
  return quote.requirements.accepts[0]?.taskId ?? quote.taskId;
}
