import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { getConnection } from "@/lib/solana/connection";

const USDC_DECIMALS = 6;

function getUsdcMint(): PublicKey {
  const mint = process.env.USDC_MINT_DEVNET;
  if (!mint) {
    throw new Error("USDC_MINT_DEVNET environment variable is not set");
  }
  return new PublicKey(mint);
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json(
      { error: "address query parameter is required" },
      { status: 400 }
    );
  }

  let walletPubkey: PublicKey;
  try {
    walletPubkey = new PublicKey(address);
  } catch {
    return NextResponse.json(
      { error: "Invalid Solana address" },
      { status: 400 }
    );
  }

  try {
    const connection = getConnection();
    const usdcMint = getUsdcMint();

    // Associated Token Account adresini hesapla
    const ata = await getAssociatedTokenAddress(usdcMint, walletPubkey);

    // Token hesabini oku
    const account = await getAccount(connection, ata);
    const balance = (Number(account.amount) / Math.pow(10, USDC_DECIMALS)).toFixed(2);

    return NextResponse.json({
      address,
      balance,
      mint: usdcMint.toBase58(),
      ata: ata.toBase58(),
    });
  } catch (err: unknown) {
    // TokenAccountNotFoundError: cuzdan bu token icin hesaba sahip degil
    const errorName = err instanceof Error ? err.name : "";
    if (
      errorName === "TokenAccountNotFoundError" ||
      errorName === "TokenInvalidAccountOwnerError"
    ) {
      return NextResponse.json({
        address,
        balance: "0.00",
        mint: process.env.USDC_MINT_DEVNET ?? "",
        ata: null,
      });
    }

    console.error("[API /wallet/balance]", err);
    return NextResponse.json(
      { error: "Failed to fetch balance", detail: String(err) },
      { status: 500 }
    );
  }
}
