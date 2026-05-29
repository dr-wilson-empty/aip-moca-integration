import "dotenv/config";
import { defineConfig, configVariable } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    // Hardhat 3 has two built-in build profiles. compile/test use `default`, but
    // Ignition deploy uses `production` — so viaIR must be set on BOTH, otherwise the
    // 9-arg registerAgent (parity with the Solana instruction) overflows the legacy
    // stack-based codegen on deploy. evmVersion "london" matches Moca Chain's VM.
    profiles: {
      default: {
        version: "0.8.24",
        settings: {
          evmVersion: "london",
          viaIR: true,
          optimizer: { enabled: true, runs: 200 },
        },
      },
      production: {
        version: "0.8.24",
        settings: {
          evmVersion: "london",
          viaIR: true,
          optimizer: { enabled: true, runs: 200 },
        },
      },
    },
  },
  networks: {
    // Live network — only used by `deploy:testnet`. Local compile/test never touch it.
    mocaTestnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("MOCA_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      chainId: 222888,
    },
  },
});
