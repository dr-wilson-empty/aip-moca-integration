import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Deploys the AipEscrow contract (native MOCA escrow). No constructor args.
// Run against Moca testnet with:
//   npm run deploy:escrow
export default buildModule("AipEscrowModule", (m) => {
  const escrow = m.contract("AipEscrow");
  return { escrow };
});
