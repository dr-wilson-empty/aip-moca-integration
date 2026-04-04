import type { AgentCard } from "@/types/aip";

export const MY_AGENT_CARD: AgentCard = {
  did: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  name: "User Twin",
  version: "1.0.0",
  endpoint: "https://agent.aip-poc.dev/a2a",
  type: "LLM",
  capabilities: [
    {
      id: "text.summarize",
      description: "Summarize Text",
      pricing: { amount: "0.10", token: "USDC", network: "solana" },
    },
    {
      id: "data.retrieve",
      description: "Retrieve Data",
      pricing: { amount: "0.25", token: "USDC", network: "solana" },
    },
    {
      id: "trade.execute",
      description: "Execute Trade",
      pricing: { amount: "0.50", token: "USDC", network: "solana" },
    },
  ],
};

/** Platform-hosted Web Search Agent — uses Tavily API */
export const WEB_SEARCH_AGENT: AgentCard = {
  did: "did:aip:platform:web-search",
  name: "Web Search Agent",
  version: "1.0.0",
  endpoint: "http://localhost:3000/api/web/agent",
  type: "Task",
  walletAddress: "",
  capabilities: [
    {
      id: "web.search",
      description: "Web Search",
      pricing: { amount: "0.02", token: "USDC", network: "solana" },
    },
  ],
};

export const COUNTERPART_AGENT_CARDS: Record<string, AgentCard> = {
  "http://localhost:4001/a2a": {
    did: "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuias8siQUmpwds8Q9",
    name: "Summary Agent",
    version: "1.2.0",
    endpoint: "http://localhost:4001/a2a",
    type: "Task",
    walletAddress: "4LRAyGnJv2DwxiWVg6RDtYsfCjx2Ha3d3A19fsogCopG",
    capabilities: [
      {
        id: "text.summarize",
        description: "Summarize Text",
        pricing: { amount: "0.10", token: "USDC", network: "solana" },
      },
      {
        id: "text.classify",
        description: "Classify Text",
        pricing: { amount: "0.05", token: "USDC", network: "solana" },
      },
    ],
  },
  "http://localhost:4002/a2a": {
    did: "did:key:z6Mkf5rGuvnarjzeLBttGYMsxnQkDBUHkNMWwGFbhEHfJLGi",
    name: "Data Agent",
    version: "2.0.1",
    endpoint: "http://localhost:4002/a2a",
    type: "Task",
    walletAddress: "Auo6b8cQvuBJxcKUuhWuNSeE4Yzm4dPL93CjGES6NF1E",
    capabilities: [
      {
        id: "data.retrieve",
        description: "Retrieve Data",
        pricing: { amount: "0.25", token: "USDC", network: "solana" },
      },
    ],
  },
  "http://localhost:4003/a2a": {
    did: "did:key:z6MkqR4Tve8gJzNAiHbG7FupLvTRExkNbcQVjg2QBFM3pKat",
    name: "Audit Agent",
    version: "1.0.3",
    endpoint: "http://localhost:4003/a2a",
    type: "Execution",
    walletAddress: "J53oVBJG87JNYok3cVyscgAMxhx5D8yfvGZ7hpGMeNXA",
    capabilities: [
      {
        id: "code.audit",
        description: "Smart Contract Audit",
        pricing: { amount: "0.75", token: "USDC", network: "solana" },
      },
      {
        id: "defi.analyze",
        description: "DeFi Risk Analysis",
        pricing: { amount: "0.40", token: "USDC", network: "solana" },
      },
    ],
  },
};
