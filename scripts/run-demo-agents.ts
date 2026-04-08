/**
 * Demo Agent Runner — starts Summary, Data, and Audit agents
 * on ports 4001, 4002, 4003 respectively.
 *
 * Usage: npx tsx scripts/run-demo-agents.ts
 */

import { createAgent, haiku } from "../packages/agent-sdk/src/index";

// ---- Summary Agent (port 4001) ----
const summary = createAgent({
  name: "Summary Agent",
  port: 4001,
  did: "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuias8siQUmpwds8Q9",
  walletAddress: "4LRAyGnJv2DwxiWVg6RDtYsfCjx2Ha3d3A19fsogCopG",
});

summary.capability("text.summarize", {
  description: "Summarize Text",
  price: "0.10",
  handler: haiku(
    "You are a summarization specialist. Summarize the given text concisely, keeping the most important points. " +
    "If the input includes web search results or live data, use that as your primary source. " +
    "Always respond in the same language as the input."
  ),
});

summary.capability("text.classify", {
  description: "Classify Text",
  price: "0.05",
  handler: haiku(
    "Classify the given text into one of these categories: GENERAL, DEFI, GOVERNANCE, TECHNICAL, NEWS, MARKET. " +
    "Respond with ONLY a JSON object: {\"category\": \"...\", \"confidence\": 0.95}"
  ),
});

summary.start();

// ---- Data Agent (port 4002) ----
const data = createAgent({
  name: "Data Agent",
  port: 4002,
  did: "did:key:z6Mkf5rGuvnarjzeLBttGYMsxnQkDBUHkNMWwGFbhEHfJLGi",
  walletAddress: "Auo6b8cQvuBJxcKUuhWuNSeE4Yzm4dPL93CjGES6NF1E",
});

data.capability("data.retrieve", {
  description: "Retrieve Data",
  price: "0.25",
  handler: haiku(
    "You are a data retrieval specialist for blockchain and DeFi protocols. " +
    "When asked about specific data points (prices, TVL, volumes, addresses), provide accurate information. " +
    "If the input includes live web data, prioritize that over your training data. " +
    "Format numbers clearly and include sources when available."
  ),
});

data.start();

// ---- Audit Agent (port 4003) ----
const audit = createAgent({
  name: "Audit Agent",
  port: 4003,
  did: "did:key:z6MkqR4Tve8gJzNAiHbG7FupLvTRExkNbcQVjg2QBFM3pKat",
  walletAddress: "J53oVBJG87JNYok3cVyscgAMxhx5D8yfvGZ7hpGMeNXA",
  type: "Execution",
});

audit.capability("code.audit", {
  description: "Smart Contract Audit",
  price: "0.75",
  handler: haiku(
    "You are a smart contract security auditor. Analyze the provided code for: " +
    "1. Reentrancy vulnerabilities 2. Integer overflow/underflow 3. Access control issues " +
    "4. Front-running risks 5. Improper validation. " +
    "Rate severity as CRITICAL, HIGH, MEDIUM, LOW, or INFORMATIONAL."
  ),
});

audit.capability("defi.analyze", {
  description: "DeFi Risk Analysis",
  price: "0.40",
  handler: haiku(
    "You are a DeFi risk analyst. Analyze the given protocol or strategy for: " +
    "1. Smart contract risk 2. Liquidity risk 3. Oracle risk 4. Governance risk " +
    "5. Market risk. Provide a risk score 1-10 and actionable recommendations."
  ),
});

audit.start();

console.log("\n--- All demo agents started ---");
console.log("Summary Agent: http://localhost:4001/a2a");
console.log("Data Agent:    http://localhost:4002/a2a");
console.log("Audit Agent:   http://localhost:4003/a2a");
