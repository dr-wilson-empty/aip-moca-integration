/**
 * AIP Agent definitions — built with @aip/agent-sdk.
 */
import { createAgent, haiku } from "../../agent-sdk/src/index.js";

const AIP_CONTEXT =
  "AIP (Agent Internet Protocol) is an open protocol on Solana that lets autonomous AI agents " +
  "discover each other via on-chain Agent Cards, negotiate tasks through A2A JSON-RPC 2.0, " +
  "and settle payments trustlessly using x402 HTTP payment protocol with USDC locked in PDA escrow. " +
  "Key primitives: W3C DID identity (Ed25519 did:key), Agent Card registry, conditional escrow " +
  "(initialize → release/refund/cancel), SSE streaming, and multi-agent task orchestration. ";

const RESPONSE_RULES =
  "RESPONSE RULES (always follow): " +
  "1. LANGUAGE: Always respond in the same language as the user's input. If input is Turkish, respond in Turkish. If English, respond in English. " +
  "2. UNITS: Always use metric system (Celsius, km/h, kg, meters). Never use imperial (Fahrenheit, mph, pounds, feet). " +
  "3. FORMAT: Be consistent — use the same structure and format every time for the same type of request. " +
  "4. CONCISENESS: Be direct and actionable. No filler, no disclaimers about being an AI. ";

// ---- Summary Agent (:4001) ----
export const summaryAgent = createAgent({
  name: "Summary Agent",
  port: 4001,
  type: "Task",
  version: "1.2.0",
  walletAddress: "4LRAyGnJv2DwxiWVg6RDtYsfCjx2Ha3d3A19fsogCopG",
  did: "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuias8siQUmpwds8Q9",
});

summaryAgent.capability("text.summarize", {
  description: "Summarize Text",
  price: "0.10",
  handler: haiku(
    AIP_CONTEXT + RESPONSE_RULES +
    "You are a summarization specialist working within AIP. " +
    "Summarize the given text concisely and accurately. " +
    "Support both English and Turkish. Keep summaries under 200 words. " +
    "Focus on key points and actionable information."
  ),
});

summaryAgent.capability("text.classify", {
  description: "Classify Text",
  price: "0.05",
  handler: haiku(
    AIP_CONTEXT + RESPONSE_RULES +
    "You are a text classifier within AIP. " +
    "Classify the given text into one of these categories: GOVERNANCE, DEFI, TECHNICAL, GENERAL, NEWS, SECURITY. " +
    'Respond with a JSON object: { "category": "...", "confidence": 0.0-1.0, "reasoning": "..." }'
  ),
});

// ---- Data Agent (:4002) ----
export const dataAgent = createAgent({
  name: "Data Agent",
  port: 4002,
  type: "Task",
  version: "2.0.1",
  walletAddress: "Auo6b8cQvuBJxcKUuhWuNSeE4Yzm4dPL93CjGES6NF1E",
  did: "did:key:z6Mkf5rGuvnarjzeLBttGYMsxnQkDBUHkNMWwGFbhEHfJLGi",
});

dataAgent.capability("data.retrieve", {
  description: "Retrieve Data",
  price: "0.25",
  handler: haiku(
    AIP_CONTEXT + RESPONSE_RULES +
    "You are a data retrieval specialist within AIP. " +
    "When asked to retrieve data, research the topic and provide structured, factual data. " +
    "For blockchain/Solana queries, provide realistic and plausible data. " +
    "Respond in the format the user requests. If they ask for plain text, write plain text. " +
    "If no format is specified, use clear markdown with headings and bullet points. " +
    "Always include numbers, dates, or measurable data points where relevant."
  ),
});

// ---- Audit Agent (:4003) ----
export const auditAgent = createAgent({
  name: "Audit Agent",
  port: 4003,
  type: "Execution",
  version: "1.0.3",
  walletAddress: "J53oVBJG87JNYok3cVyscgAMxhx5D8yfvGZ7hpGMeNXA",
  did: "did:key:z6MkqR4Tve8gJzNAiHbG7FupLvTRExkNbcQVjg2QBFM3pKat",
});

auditAgent.capability("code.audit", {
  description: "Smart Contract Audit",
  price: "0.75",
  handler: haiku(
    AIP_CONTEXT + RESPONSE_RULES +
    "You are a smart contract security auditor within AIP. " +
    "Analyze the given smart contract code or description for security vulnerabilities. " +
    "Check for: reentrancy, integer overflow, access control issues, front-running, " +
    "oracle manipulation, and other common vulnerabilities. " +
    "Provide a structured audit report with severity levels (CRITICAL, HIGH, MEDIUM, LOW, INFO)."
  ),
});

auditAgent.capability("defi.analyze", {
  description: "DeFi Risk Analysis",
  price: "0.40",
  handler: haiku(
    AIP_CONTEXT + RESPONSE_RULES +
    "You are a DeFi risk analyst within AIP. " +
    "Evaluate the given DeFi protocol or token for risks. " +
    "Assess: smart contract risk, liquidity risk, oracle dependency, governance centralization, " +
    "historical exploits, and overall risk score (1-10). " +
    "Provide a concise risk assessment with actionable recommendations."
  ),
});

export const ALL_AGENTS = [summaryAgent, dataAgent, auditAgent];
