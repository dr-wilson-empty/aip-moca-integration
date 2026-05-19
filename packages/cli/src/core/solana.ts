import { Connection, PublicKey } from "@solana/web3.js";

export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export const USDC_MINT: Record<"devnet" | "mainnet-beta", string> = {
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

export const DEFAULT_RPC: Record<"devnet" | "mainnet-beta", string> = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

export function rpcEndpointFor(
  cluster: "devnet" | "mainnet-beta",
  override?: string,
): string {
  return override ?? DEFAULT_RPC[cluster];
}

export interface Balances {
  solLamports: bigint;
  sol: number;
  usdc: number;
}

export async function getBalances(
  connection: Connection,
  owner: PublicKey,
  cluster: "devnet" | "mainnet-beta",
): Promise<Balances> {
  const [solLamports, tokens] = await Promise.all([
    connection.getBalance(owner),
    connection.getParsedTokenAccountsByOwner(owner, {
      mint: new PublicKey(USDC_MINT[cluster]),
    }),
  ]);

  let usdc = 0;
  for (const { account } of tokens.value) {
    const parsed = account.data as {
      parsed?: { info?: { tokenAmount?: { uiAmount?: number } } };
    };
    usdc += parsed.parsed?.info?.tokenAmount?.uiAmount ?? 0;
  }

  return {
    solLamports: BigInt(solLamports),
    sol: solLamports / 1e9,
    usdc,
  };
}
