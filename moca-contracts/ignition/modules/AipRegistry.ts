import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Deploys the AipRegistry contract. No constructor args.
// Run against Moca testnet with:
//   npm run deploy:testnet   (hardhat ignition deploy ... --network mocaTestnet)
export default buildModule("AipRegistryModule", (m) => {
  const registry = m.contract("AipRegistry");
  return { registry };
});
