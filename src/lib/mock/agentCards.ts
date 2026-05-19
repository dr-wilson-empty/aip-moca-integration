import type { AgentCard } from "@/types/aip";
import { getAppUrl } from "@/lib/config/app-url";
import { getAuthorityAddress } from "@/lib/payment/escrow";
import { canonicalAgentDid } from "@/lib/identity/canonical-did";

let _authority: string | null = null;
function authorityWallet(): string {
  if (!_authority) {
    try { _authority = getAuthorityAddress(); } catch { _authority = ""; }
  }
  return _authority;
}

/** Compose a canonical did:aip DID for a hosted agent owned by the platform authority. */
function platformDid(agentId: string): string {
  const auth = authorityWallet();
  if (!auth) return `did:aip:platform:${agentId}`; // fallback only when authority is unavailable (e.g. tests)
  return canonicalAgentDid(auth, agentId);
}

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
export function getWebSearchAgent(): AgentCard {
  return {
    did: platformDid("web-search"),
    name: "Web Search Agent",
    version: "1.0.0",
    endpoint: `${getAppUrl()}/api/web/agent`,
    type: "Task",
    walletAddress: authorityWallet(),
    capabilities: [
      {
        id: "web.search",
        description: "Web Search",
        pricing: { amount: "0.02", token: "USDC", network: "solana" },
      },
    ],
  };
}

/** Legacy export for backward compat — use getWebSearchAgent() instead */
export const WEB_SEARCH_AGENT: AgentCard = {
  did: "did:aip:platform:web-search",
  name: "Web Search Agent",
  version: "1.0.0",
  endpoint: "/api/web/agent",
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

/** Platform demo agents — all hosted on the app, all use authority wallet */
export function getDemoAgentCards(): Record<string, AgentCard> {
  const base = getAppUrl();
  const wallet = authorityWallet();
  return {
    "summary-agent": {
      did: platformDid("summary-agent"),
      name: "Summary Agent",
      version: "1.2.0",
      endpoint: `${base}/api/hosted-agent?agentId=summary-agent`,
      type: "Task",
      walletAddress: wallet,
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
    "data-agent": {
      did: platformDid("data-agent"),
      name: "Data Agent",
      version: "2.0.1",
      endpoint: `${base}/api/hosted-agent?agentId=data-agent`,
      type: "Task",
      walletAddress: wallet,
      capabilities: [
        {
          id: "data.retrieve",
          description: "Retrieve Data",
          pricing: { amount: "0.25", token: "USDC", network: "solana" },
        },
      ],
    },
    "audit-agent": {
      did: platformDid("audit-agent"),
      name: "Audit Agent",
      version: "1.0.3",
      endpoint: `${base}/api/hosted-agent?agentId=audit-agent`,
      type: "Execution",
      walletAddress: wallet,
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
}

/** @deprecated Use getDemoAgentCards() */
export const COUNTERPART_AGENT_CARDS = {} as Record<string, AgentCard>;
