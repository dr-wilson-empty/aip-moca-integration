import { Connection, clusterApiUrl } from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl("devnet");

let _connection: Connection | null = null;

/**
 * Singleton Solana RPC connection.
 * Sunucu tarafinda tek bir Connection nesnesi kullanilir — her istekte yeniden olusturulmaz.
 */
export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(RPC_URL, {
      commitment: "confirmed",
    });
  }
  return _connection;
}
