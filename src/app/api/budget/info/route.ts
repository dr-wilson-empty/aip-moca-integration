import { NextResponse } from "next/server";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * GET /api/budget/info
 * Returns platform authority address and USDC mint for frontend deposits.
 */
export async function GET() {
  const key = process.env.ESCROW_PRIVATE_KEY;
  const mint = process.env.USDC_MINT_DEVNET;

  if (!key || !mint) {
    return NextResponse.json({ error: "Platform not configured" }, { status: 500 });
  }

  const kp = Keypair.fromSecretKey(bs58.decode(key));
  return NextResponse.json({
    authorityAddress: kp.publicKey.toBase58(),
    usdcMint: mint,
  });
}
