/**
 * Hosted Agent Executor — direct in-process execution.
 * Used by a2a-client to bypass HTTP self-call on serverless platforms.
 */
import { orchestrateTask } from "@/lib/protocol/agent-orchestrator";
import { canonicalAgentDid } from "@/lib/identity/canonical-did";
import { autoEnrichWithWebData, getCurrentDateString } from "@/lib/web/realtime-enrichment";
import { executeWithMcpTools } from "@/lib/mcp/tool-executor";
import type { HostedAgentConfig } from "@/lib/hosted-agents";

/**
 * Build a one-line preamble that tells the LLM which capability was
 * requested. Hosted agents are multi-capability (e.g. summarize +
 * classify) and were previously left to guess from natural language —
 * a paying caller could ask for `text.classify` and receive a summary.
 * Including the capability up front makes the contract explicit.
 *
 * If we know the capability's description from the config we include
 * it too, so the prompt carries the same information the marketplace
 * advertises (Summarize Text vs Classify Text).
 */
function buildCapabilityPreamble(
  config: HostedAgentConfig,
  capability: string | undefined,
): string {
  if (!capability) return "";
  const cap = config.capabilities.find((c) => c.id === capability);
  const desc = cap?.description ? ` (${cap.description})` : "";
  return `Requested capability: ${capability}${desc}\nOnly do work consistent with this capability. If the user's input does not match it, say so instead of switching modes.`;
}

/**
 * Execute a hosted agent task and return the result directly.
 * No HTTP, no task map — just run and return.
 */
export async function executeHostedAgentDirect(
  config: HostedAgentConfig,
  input: string,
  capability?: string,
): Promise<{ status: "COMPLETED" | "FAILED"; artifact?: string; error?: string }> {
  try {
    let result: string;

    if (config.canOrchestrate) {
      const agentDid = canonicalAgentDid(config.ownerAddress, config.agentId);
      const orchResult = await orchestrateTask(agentDid, config.name, config.systemPrompt, input, config.ownerAddress, undefined, config.mcpServers);
      const subTaskInfo = orchResult.subTasks
        .filter((s) => s.status === "completed")
        .map((s) => `${s.agentName} (${s.capabilityId}) — ${s.cost.toFixed(2)} USDC`)
        .join("\n");
      result = orchResult.answer +
        `\n\n---\n**${config.name}** orchestrated ${orchResult.stepsCompleted} agent(s), spent ${orchResult.totalSpent.toFixed(2)} USDC from budget` +
        (subTaskInfo ? `\n${subTaskInfo}` : "");
    } else if (config.mcpServers && config.mcpServers.length > 0) {
      const mcpResult = await executeWithMcpTools(config, input);
      result = mcpResult.text;
    } else if (config.provider === "openai") {
      result = await callOpenAI(config, input, capability);
    } else {
      result = await callAnthropic(config, input, capability);
    }

    return { status: "COMPLETED", artifact: result };
  } catch (err) {
    return { status: "FAILED", error: err instanceof Error ? err.message : String(err) };
  }
}

async function callAnthropic(config: HostedAgentConfig, input: string, capability?: string): Promise<string> {
  const apiKey = config.tier === "custom" && config.customApiKey
    ? config.customApiKey
    : process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No Anthropic API key available");

  const enrichment = await autoEnrichWithWebData(input);
  const enrichedInput = enrichment.enriched ? `${input}\n\n${enrichment.webContext}` : input;
  const preamble = buildCapabilityPreamble(config, capability);
  const systemWithDate = [getCurrentDateString(), preamble, config.systemPrompt].filter(Boolean).join("\n\n");

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: systemWithDate,
    messages: [{ role: "user", content: enrichedInput }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text ?? "No response";
}

async function callOpenAI(config: HostedAgentConfig, input: string, capability?: string): Promise<string> {
  const apiKey = config.customApiKey;
  if (!apiKey) throw new Error("OpenAI requires your own API key");

  const enrichment = await autoEnrichWithWebData(input);
  const enrichedInput = enrichment.enriched ? `${input}\n\n${enrichment.webContext}` : input;
  const preamble = buildCapabilityPreamble(config, capability);
  const systemWithDate = [getCurrentDateString(), preamble, config.systemPrompt].filter(Boolean).join("\n\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemWithDate },
        { role: "user", content: enrichedInput },
      ],
      max_tokens: 2048,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "No response";
}
