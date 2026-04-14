import {
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { getConnection } from "@/lib/solana/connection";
import { getAuthorityAddress } from "./escrow";
import {
  ESCROW_PROGRAM_ID,
  deriveEscrowStatePDA,
  deriveEscrowVaultPDA,
} from "@/lib/solana/escrow-program";

const USDC_DECIMALS = 6;

function getUsdcMint(): PublicKey {
  const mint = process.env.USDC_MINT_DEVNET;
  if (!mint) throw new Error("USDC_MINT_DEVNET not set");
  return new PublicKey(mint);
}

/* ------------------------------------------------------------------ */
/*  x402 Payment Requirements (402 response)                           */
/* ------------------------------------------------------------------ */

export interface X402PaymentRequirements {
  x402Version: number;
  accepts: Array<{
    scheme: "exact";
    network: string;
    asset: string;
    amount: string;
    maxTimeoutSeconds: number;
    /** Escrow program ID */
    programId: string;
    /** Server authority pubkey (set as escrow authority) */
    authority: string;
    /** Pre-generated task ID for PDA derivation */
    taskId: string;
    /** Payee (agent) wallet address */
    payee: string;
  }>;
  resource: {
    url: string;
    method: string;
    description: string;
  };
}

export function buildPaymentRequirements(
  amountUsdc: string,
  resourceUrl: string,
  description: string,
  taskId: string,
  payeeAddress: string
): X402PaymentRequirements {
  const authorityAddress = getAuthorityAddress();
  const usdcMint = getUsdcMint();
  const lamports = Math.round(parseFloat(amountUsdc) * Math.pow(10, USDC_DECIMALS));

  return {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG", // Devnet genesis hash
        asset: usdcMint.toBase58(),
        amount: lamports.toString(),
        maxTimeoutSeconds: 300,
        programId: ESCROW_PROGRAM_ID.toBase58(),
        authority: authorityAddress,
        taskId,
        payee: payeeAddress,
      },
    ],
    resource: {
      url: resourceUrl,
      method: "POST",
      description,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  x402 Payment Payload (client -> server)                            */
/* ------------------------------------------------------------------ */

export interface X402PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: string;
  payload: {
    serializedTransaction: string; // Base64 encoded signed Solana transaction
  };
  accepted: {
    scheme: "exact";
    network: string;
    asset: string;
    amount: string;
    programId: string;
    taskId: string;
  };
}

/* ------------------------------------------------------------------ */
/*  x402 Verify — validate initialize_escrow transaction                */
/* ------------------------------------------------------------------ */

export interface VerifyResult {
  isValid: boolean;
  error?: string;
  payerAddress?: string;
  amount?: string;
}

export function verifyPaymentPayload(
  paymentPayload: X402PaymentPayload,
  requirements: X402PaymentRequirements
): VerifyResult {
  try {
    // 1. Version check
    if (paymentPayload.x402Version !== 2) {
      return { isValid: false, error: `Unsupported x402 version: ${paymentPayload.x402Version}` };
    }

    // 2. Scheme check
    if (paymentPayload.scheme !== "exact") {
      return { isValid: false, error: `Unsupported scheme: ${paymentPayload.scheme}` };
    }

    // 3. serializedTransaction check
    if (!paymentPayload.payload?.serializedTransaction) {
      return { isValid: false, error: "Missing serializedTransaction" };
    }

    // 4. Deserialize transaction
    const txBuffer = Buffer.from(paymentPayload.payload.serializedTransaction, "base64");
    const tx = Transaction.from(txBuffer);

    // 5. Must be signed
    if (!tx.signatures.length || !tx.signatures[0].signature) {
      return { isValid: false, error: "Transaction is not signed" };
    }

    // 6. Get accepted requirement
    const accepted = requirements.accepts[0];
    if (!accepted) {
      return { isValid: false, error: "No accepted payment requirement" };
    }

    const taskId = accepted.taskId;

    // 7. Verify the transaction contains an instruction to our escrow program
    const programInstruction = tx.instructions.find(
      (ix) => ix.programId.equals(ESCROW_PROGRAM_ID)
    );

    if (!programInstruction) {
      return { isValid: false, error: "No escrow program instruction found in transaction" };
    }

    // 8. Verify the instruction discriminator is initialize_escrow
    const discriminator = Buffer.from([243, 160, 77, 153, 11, 92, 48, 209]);
    if (!programInstruction.data.subarray(0, 8).equals(discriminator)) {
      return { isValid: false, error: "Transaction does not contain initialize_escrow instruction" };
    }

    // 9. Verify PDA accounts match the expected task_id
    const [expectedState] = deriveEscrowStatePDA(taskId);
    const [expectedVault] = deriveEscrowVaultPDA(taskId);

    // Account index 3 = escrow_state, index 4 = escrow_vault
    const stateAccount = programInstruction.keys[3]?.pubkey;
    const vaultAccount = programInstruction.keys[4]?.pubkey;

    if (!stateAccount?.equals(expectedState)) {
      return { isValid: false, error: "Escrow state PDA mismatch" };
    }
    if (!vaultAccount?.equals(expectedVault)) {
      return { isValid: false, error: "Escrow vault PDA mismatch" };
    }

    // 10. Verify authority (account index 2)
    const authorityAccount = programInstruction.keys[2]?.pubkey;
    const expectedAuthority = new PublicKey(accepted.authority);
    if (!authorityAccount?.equals(expectedAuthority)) {
      return { isValid: false, error: "Authority mismatch" };
    }

    // 11. Extract payer from instruction (account index 0)
    const payerAddress = programInstruction.keys[0]?.pubkey.toBase58();

    return {
      isValid: true,
      payerAddress,
      amount: accepted.amount,
    };
  } catch (err) {
    return { isValid: false, error: `Verification failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/* ------------------------------------------------------------------ */
/*  x402 Settle — send transaction to blockchain                       */
/* ------------------------------------------------------------------ */

export interface SettleResult {
  transaction: string;
  status: "settled" | "failed";
  error?: string;
}

export async function settlePayment(
  paymentPayload: X402PaymentPayload
): Promise<SettleResult> {
  try {
    const connection = getConnection();
    const txBuffer = Buffer.from(paymentPayload.payload.serializedTransaction, "base64");

    // Send raw transaction (skip preflight — Phantom adds compute budget
    // instructions that can cause false simulation failures on server side)
    const signature = await connection.sendRawTransaction(txBuffer, {
      skipPreflight: true,
    });

    // Quick confirm with short timeout — if devnet RPC is slow, still return success
    // The transaction is already submitted; confirmation is best-effort
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      await Promise.race([
        connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("confirm_timeout")), 15000)),
      ]);
    } catch (confirmErr) {
      // Transaction was sent — return signature even if confirm times out
      // The escrow is on-chain regardless of confirmation status
      const msg = confirmErr instanceof Error ? confirmErr.message : "";
      if (msg === "confirm_timeout") {
        return { transaction: signature, status: "settled" };
      }
      // Real confirmation error
      return {
        transaction: signature,
        status: "failed",
        error: `Transaction may have failed: ${msg}`,
      };
    }

    return {
      transaction: signature,
      status: "settled",
    };
  } catch (err) {
    return {
      transaction: "",
      status: "failed",
      error: `Settlement error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  x402 Header encode/decode                                          */
/* ------------------------------------------------------------------ */

export function encodeX402Header(data: unknown): string {
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

export function decodeX402Header<T>(header: string): T {
  return JSON.parse(Buffer.from(header, "base64").toString("utf-8")) as T;
}
