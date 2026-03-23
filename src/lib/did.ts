export function generateDID(pubkey: string): string {
  const seed = pubkey.slice(0, 16).toLowerCase().replace(/[^a-z0-9]/g, "x");
  return `did:key:z6Mk${seed}AzMoP5qV1iWXnDgE4rT6y9Z`;
}

export function shortenAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
