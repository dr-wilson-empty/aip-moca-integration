export function shortenAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function shortenDid(did: string): string {
  if (did.length <= 48) return did;
  const parts = did.split(":");
  if (parts.length >= 4) {
    const [scheme, method, owner, ...rest] = parts;
    return `${scheme}:${method}:${shortenAddress(owner!, 6, 4)}:${rest.join(":")}`;
  }
  return shortenAddress(did, 24, 8);
}

export function lamportsToSol(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const frac = lamports % 1_000_000_000n;
  const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
  return fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`;
}

export function formatTimestamp(input: string | Date | number): string {
  const d = typeof input === "string" || typeof input === "number" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return String(input);
  return d.toISOString().replace("T", " ").replace(/:\d\d\.\d{3}Z$/, " UTC");
}

export function networkToCluster(network: string): "devnet" | "mainnet-beta" | "testnet" {
  if (network.includes("mainnet")) return "mainnet-beta";
  if (network.includes("testnet")) return "testnet";
  return "devnet";
}

export function explorerAddressUrl(address: string, network: string): string {
  const cluster = networkToCluster(network);
  const base = `https://explorer.solana.com/address/${address}`;
  return cluster === "mainnet-beta" ? base : `${base}?cluster=${cluster}`;
}

export function explorerTxUrl(signature: string, network: string): string {
  const cluster = networkToCluster(network);
  const base = `https://explorer.solana.com/tx/${signature}`;
  return cluster === "mainnet-beta" ? base : `${base}?cluster=${cluster}`;
}
