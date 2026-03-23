import type { AgentCard } from "@/types/aip";

export const MY_AGENT_CARD: AgentCard = {
  did: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  name: "UserTwinAgent",
  version: "1.0.0",
  endpoint: "https://agent.aip-poc.dev/a2a",
  type: "LLM",
  capabilities: [
    {
      id: "text.summarize",
      description: "Summarizes input text to a specified length",
      pricing: { amount: "0.10", token: "USDC", network: "solana" },
    },
    {
      id: "data.retrieve",
      description: "Retrieves structured data from a given URL or query",
      pricing: { amount: "0.25", token: "USDC", network: "solana" },
    },
    {
      id: "trade.execute",
      description: "Executes a token swap on Solana via Jupiter aggregator",
      pricing: { amount: "0.50", token: "USDC", network: "solana" },
    },
  ],
};

export const COUNTERPART_AGENT_CARDS: Record<string, AgentCard> = {
  "https://alpha.agent-demo.dev/a2a": {
    did: "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuias8siQUmpwds8Q9",
    name: "SummaryAgent",
    version: "1.2.0",
    endpoint: "https://alpha.agent-demo.dev/a2a",
    type: "Task",
    capabilities: [
      {
        id: "text.summarize",
        description: "Summarizes input text to a specified length",
        pricing: { amount: "0.10", token: "USDC", network: "solana" },
      },
      {
        id: "text.classify",
        description: "Classifies text into predefined categories",
        pricing: { amount: "0.05", token: "USDC", network: "solana" },
      },
    ],
  },
  "https://beta.agent-demo.dev/a2a": {
    did: "did:key:z6Mkf5rGuvnarjzeLBttGYMsxnQkDBUHkNMWwGFbhEHfJLGi",
    name: "DataAgent",
    version: "2.0.1",
    endpoint: "https://beta.agent-demo.dev/a2a",
    type: "Task",
    capabilities: [
      {
        id: "data.retrieve",
        description: "Retrieves structured data from a given URL or query",
        pricing: { amount: "0.25", token: "USDC", network: "solana" },
      },
    ],
  },
  "https://gamma.agent-demo.dev/a2a": {
    did: "did:key:z6MkqR4Tve8gJzNAiHbG7FupLvTRExkNbcQVjg2QBFM3pKat",
    name: "AuditAgent",
    version: "1.0.3",
    endpoint: "https://gamma.agent-demo.dev/a2a",
    type: "Execution",
    capabilities: [
      {
        id: "code.audit",
        description: "Performs security audit on smart contract source code",
        pricing: { amount: "0.75", token: "USDC", network: "solana" },
      },
      {
        id: "defi.analyze",
        description: "Analyzes DeFi protocol risk metrics and TVL data",
        pricing: { amount: "0.40", token: "USDC", network: "solana" },
      },
    ],
  },
};
