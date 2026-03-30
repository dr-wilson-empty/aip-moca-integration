import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { getConnection } from "@/lib/solana/connection";

const USDC_DECIMALS = 6;

function getUsdcMint(): PublicKey {
  const mint = process.env.USDC_MINT_DEVNET;
  if (!mint) throw new Error("USDC_MINT_DEVNET environment variable is not set");
  return new PublicKey(mint);
}

/**
 * USDC bakiyesini sorgular (string olarak, orn: "12.50")
 */
export async function getUsdcBalance(address: string): Promise<string> {
  const connection = getConnection();
  const wallet = new PublicKey(address);
  const mint = getUsdcMint();

  try {
    const ata = await getAssociatedTokenAddress(mint, wallet);
    const account = await getAccount(connection, ata);
    return (Number(account.amount) / Math.pow(10, USDC_DECIMALS)).toFixed(2);
  } catch {
    return "0.00";
  }
}

/**
 * USDC transfer talimati olusturur (TransactionInstruction).
 * Gonderenin ve alicinin Associated Token Account'larini hesaplar.
 */
export async function buildUsdcTransferInstruction(
  fromWallet: PublicKey,
  toWallet: PublicKey,
  amountUsdc: string
): Promise<{
  instruction: ReturnType<typeof createTransferInstruction>;
  fromAta: PublicKey;
  toAta: PublicKey;
}> {
  const mint = getUsdcMint();
  const lamports = Math.round(parseFloat(amountUsdc) * Math.pow(10, USDC_DECIMALS));

  const fromAta = await getAssociatedTokenAddress(mint, fromWallet);
  const toAta = await getAssociatedTokenAddress(mint, toWallet);

  const instruction = createTransferInstruction(
    fromAta,
    toAta,
    fromWallet,
    lamports,
    [],
    TOKEN_PROGRAM_ID
  );

  return { instruction, fromAta, toAta };
}

/**
 * USDC miktarini lamport'a cevirir (1 USDC = 1_000_000 lamports)
 */
export function usdcToLamports(amount: string): number {
  return Math.round(parseFloat(amount) * Math.pow(10, USDC_DECIMALS));
}

/**
 * Lamport'u USDC string'e cevirir
 */
export function lamportsToUsdc(lamports: number | bigint): string {
  return (Number(lamports) / Math.pow(10, USDC_DECIMALS)).toFixed(2);
}

export { getUsdcMint };
