export const TASK_PRESETS: Record<string, string[]> = {
  "text.summarize": [
    "Summarize the AIP protocol whitepaper",
    "Summarize latest Solana governance proposals",
    "Summarize x402 payment protocol specification",
  ],
  "text.classify": [
    "Classify: 'Execute DAO vote on treasury proposal'",
    "Classify: 'Swap 100 USDC to SOL on Jupiter'",
    "Classify: 'Deploy escrow contract to devnet'",
  ],
  "data.retrieve": [
    "Get latest Solana validator stats",
    "Retrieve current USDC/SOL liquidity pool data",
    "Fetch epoch 612 staking rewards summary",
  ],
  "code.audit": [
    "Audit escrow smart contract for re-entrancy vulnerabilities",
    "Security review of token vesting contract",
    "Analyze AIP payment module for edge cases",
  ],
  "defi.analyze": [
    "Analyze risk profile of Marinade Finance staking protocol",
    "Compare yield rates across Solana lending protocols",
    "Evaluate liquidity depth of Jupiter DEX aggregator",
  ],
  "trade.execute": [
    "Swap 50 USDC to SOL at best rate via Jupiter",
    "Execute limit order: buy 10 SOL at $140",
    "Rebalance portfolio to 60% SOL / 40% USDC",
  ],
};
