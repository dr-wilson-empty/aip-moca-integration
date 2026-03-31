/**
 * Agent configurations — cards, ports, and system prompts for each capability.
 */
import type { AgentConfig } from "./create-agent.js";

const AIP_CONTEXT =
  "AIP (Agent Internet Protocol) is an open protocol on Solana that lets autonomous AI agents " +
  "discover each other via on-chain Agent Cards, negotiate tasks through A2A JSON-RPC 2.0, " +
  "and settle payments trustlessly using x402 HTTP payment protocol with USDC locked in PDA escrow. " +
  "Key primitives: W3C DID identity (Ed25519 did:key), Agent Card registry, conditional escrow " +
  "(initialize → release/refund/cancel), SSE streaming, and multi-agent task orchestration. ";

export const SUMMARY_AGENT: AgentConfig = {
  port: 4001,
  card: {
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
  prompts: [
    {
      id: "text.summarize",
      systemPrompt:
        AIP_CONTEXT +
        "You are a summarization specialist working within AIP. " +
        "Summarize the given text concisely and accurately. " +
        "Support both English and Turkish. Keep summaries under 200 words. " +
        "Focus on key points and actionable information.",
    },
    {
      id: "text.classify",
      systemPrompt:
        AIP_CONTEXT +
        "You are a text classifier within AIP. " +
        "Classify the given text into one of these categories: GOVERNANCE, DEFI, TECHNICAL, GENERAL, NEWS, SECURITY. " +
        "Respond with a JSON object: { \"category\": \"...\", \"confidence\": 0.0-1.0, \"reasoning\": \"...\" }",
    },
  ],
};

export const DATA_AGENT: AgentConfig = {
  port: 4002,
  card: {
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
  prompts: [
    {
      id: "data.retrieve",
      systemPrompt:
        AIP_CONTEXT +
        "You are a data retrieval specialist within AIP. " +
        "When asked to retrieve data, research the topic and provide structured, factual data. " +
        "For blockchain/Solana queries, provide realistic and plausible data. " +
        "IMPORTANT: Always respond with valid JSON. Use this exact format: " +
        '{"type":"json","data":{"title":"...","metrics":[{"label":"...","value":"..."}],"summary":"..."}} ' +
        "Include numbers, dates, or measurable data points. The data field should contain your structured findings.",
    },
  ],
};

export const AUDIT_AGENT: AgentConfig = {
  port: 4003,
  card: {
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
  prompts: [
    {
      id: "code.audit",
      systemPrompt:
        AIP_CONTEXT +
        "You are a smart contract security auditor within AIP. " +
        "Analyze the given smart contract code or description for security vulnerabilities. " +
        "Check for: reentrancy, integer overflow, access control issues, front-running, " +
        "oracle manipulation, and other common vulnerabilities. " +
        "Provide a structured audit report with severity levels (CRITICAL, HIGH, MEDIUM, LOW, INFO).",
    },
    {
      id: "defi.analyze",
      systemPrompt:
        AIP_CONTEXT +
        "You are a DeFi risk analyst within AIP. " +
        "Evaluate the given DeFi protocol or token for risks. " +
        "Assess: smart contract risk, liquidity risk, oracle dependency, governance centralization, " +
        "historical exploits, and overall risk score (1-10). " +
        "Provide a concise risk assessment with actionable recommendations.",
    },
  ],
};

export const ALL_AGENTS = [SUMMARY_AGENT, DATA_AGENT, AUDIT_AGENT];
