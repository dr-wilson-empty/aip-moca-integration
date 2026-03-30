import {
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { getConnection } from "@/lib/solana/connection";
import { getEscrowAddress } from "./escrow";

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
    payTo: string;
    maxTimeoutSeconds: number;
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
  description: string
): X402PaymentRequirements {
  const escrowAddress = getEscrowAddress();
  const usdcMint = getUsdcMint();
  const lamports = Math.round(parseFloat(amountUsdc) * Math.pow(10, USDC_DECIMALS));

  return {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG", // Devnet genesis hash (CAIP-2)
        asset: usdcMint.toBase58(),
        amount: lamports.toString(),
        payTo: escrowAddress,
        maxTimeoutSeconds: 300,
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
    payTo: string;
  };
}

/* ------------------------------------------------------------------ */
/*  x402 Verify — transaction dogrulama                                */
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
    // 1. Version kontrolu
    if (paymentPayload.x402Version !== 2) {
      return { isValid: false, error: `Unsupported x402 version: ${paymentPayload.x402Version}` };
    }

    // 2. Scheme kontrolu
    if (paymentPayload.scheme !== "exact") {
      return { isValid: false, error: `Unsupported scheme: ${paymentPayload.scheme}` };
    }

    // 3. serializedTransaction kontrolu
    if (!paymentPayload.payload?.serializedTransaction) {
      return { isValid: false, error: "Missing serializedTransaction" };
    }

    // 4. Transaction'i deserialize et
    const txBuffer = Buffer.from(paymentPayload.payload.serializedTransaction, "base64");
    const tx = Transaction.from(txBuffer);

    // 5. Transaction en az 1 imzaya sahip olmali
    if (!tx.signatures.length || !tx.signatures[0].signature) {
      return { isValid: false, error: "Transaction is not signed" };
    }

    // 6. Kabul edilen requirement'i bul
    const accepted = requirements.accepts[0];
    if (!accepted) {
      return { isValid: false, error: "No accepted payment requirement" };
    }

    const expectedAmount = BigInt(accepted.amount);
    const expectedPayTo = new PublicKey(accepted.payTo);
    const usdcMint = new PublicKey(accepted.asset);

    // 7. SPL Token TransferChecked instruction'i bul ve dogrula
    let foundValidTransfer = false;
    let payerAddress: string | undefined;

    for (const ix of tx.instructions) {
      // SPL Token program instruction
      if (ix.programId.equals(TOKEN_PROGRAM_ID) && ix.data.length >= 9) {
        const discriminator = ix.data[0];

        // TransferChecked = 12
        if (discriminator === 12) {
          const amount = ix.data.readBigUInt64LE(1);
          const decimals = ix.data[9];

          // keys: [source, mint, destination, authority]
          const destinationAta = ix.keys[2]?.pubkey;
          const authority = ix.keys[3]?.pubkey;

          if (!destinationAta || !authority) continue;

          // Hedef ATA'yi dogrula — escrow wallet'in ATA'si olmali
          const expectedAta = getAssociatedTokenAddressSync(usdcMint, expectedPayTo);

          if (
            amount >= expectedAmount &&
            decimals === USDC_DECIMALS &&
            destinationAta.equals(expectedAta)
          ) {
            foundValidTransfer = true;
            payerAddress = authority.toBase58();
            break;
          }
        }
      }
    }

    if (!foundValidTransfer) {
      return { isValid: false, error: "No valid USDC transfer instruction found" };
    }

    return {
      isValid: true,
      payerAddress,
      amount: accepted.amount,
    };
  } catch (err) {
    return { isValid: false, error: `Verification failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// Senkron ATA hesaplama (verify icin — async getAssociatedTokenAddress yerine)
function getAssociatedTokenAddressSync(mint: PublicKey, owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL") // Associated Token Program
  );
  return address;
}

/* ------------------------------------------------------------------ */
/*  x402 Settle — transaction'i blockchain'e gonder                    */
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

    // Simulate first
    const tx = Transaction.from(txBuffer);
    const sim = await connection.simulateTransaction(tx);
    if (sim.value.err) {
      return {
        transaction: "",
        status: "failed",
        error: `Simulation failed: ${JSON.stringify(sim.value.err)}`,
      };
    }

    // Send raw transaction
    const signature = await connection.sendRawTransaction(txBuffer, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    // Confirm
    const confirmation = await connection.confirmTransaction(signature, "confirmed");
    if (confirmation.value.err) {
      return {
        transaction: signature,
        status: "failed",
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
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
