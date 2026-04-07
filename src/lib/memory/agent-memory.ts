/**
 * Agent Memory — per user-agent pair memory system.
 *
 * Stores preferences, context, and facts that agents learn
 * about users across interactions. Each user-agent pair has
 * its own memory space (max 20 entries, FIFO eviction).
 *
 * Memory is injected as context when dispatching tasks to agents,
 * allowing agents to personalize responses based on past interactions.
 */
import { getSupabase } from "@/lib/supabase/client";

const MAX_MEMORIES_PER_PAIR = 20;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type MemoryType = "preference" | "context" | "fact";

export interface AgentMemoryEntry {
  id: string;
  agent_did: string;
  user_wallet: string;
  memory_type: MemoryType;
  content: string;
  created_at?: string;
  expires_at?: string;
}

/* ------------------------------------------------------------------ */
/*  CRUD Operations                                                    */
/* ------------------------------------------------------------------ */

/** Get all memories for a user-agent pair */
export async function getMemories(agentDid: string, userWallet: string): Promise<AgentMemoryEntry[]> {
  const sb = getSupabase();
  const { data } = await sb
    .from("agent_memory")
    .select("*")
    .eq("agent_did", agentDid)
    .eq("user_wallet", userWallet)
    .order("created_at", { ascending: false })
    .limit(MAX_MEMORIES_PER_PAIR);
  return data ?? [];
}

/** Get all memories for a user (across all agents) */
export async function getAllUserMemories(userWallet: string): Promise<AgentMemoryEntry[]> {
  const sb = getSupabase();
  const { data } = await sb
    .from("agent_memory")
    .select("*")
    .eq("user_wallet", userWallet)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Save a memory entry. Enforces FIFO eviction if limit exceeded. */
export async function saveMemory(entry: Omit<AgentMemoryEntry, "id" | "created_at">): Promise<AgentMemoryEntry> {
  const sb = getSupabase();

  const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const record: AgentMemoryEntry = { ...entry, id };

  await sb.from("agent_memory").insert(record);

  // FIFO eviction: delete oldest entries if over limit
  await evictOldMemories(entry.agent_did, entry.user_wallet);

  return record;
}

/** Save multiple memory entries at once */
export async function saveMemories(entries: Omit<AgentMemoryEntry, "id" | "created_at">[]): Promise<void> {
  if (entries.length === 0) return;
  const sb = getSupabase();

  const records = entries.map((e) => ({
    ...e,
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  }));

  await sb.from("agent_memory").insert(records);

  // Evict for each unique agent-user pair
  const pairs = new Set(entries.map((e) => `${e.agent_did}|${e.user_wallet}`));
  const pairArray = Array.from(pairs);
  for (const pair of pairArray) {
    const [agentDid, userWallet] = pair.split("|");
    await evictOldMemories(agentDid, userWallet);
  }
}

/** Delete a specific memory entry */
export async function deleteMemory(memoryId: string): Promise<void> {
  const sb = getSupabase();
  await sb.from("agent_memory").delete().eq("id", memoryId);
}

/** Delete all memories for a user-agent pair */
export async function clearMemories(agentDid: string, userWallet: string): Promise<void> {
  const sb = getSupabase();
  await sb.from("agent_memory")
    .delete()
    .eq("agent_did", agentDid)
    .eq("user_wallet", userWallet);
}

/** Delete all memories for a user (across all agents) */
export async function clearAllUserMemories(userWallet: string): Promise<void> {
  const sb = getSupabase();
  await sb.from("agent_memory").delete().eq("user_wallet", userWallet);
}

/* ------------------------------------------------------------------ */
/*  Memory Context Builder                                             */
/* ------------------------------------------------------------------ */

/**
 * Build a context string from memories to inject into agent prompts.
 * Returns empty string if no memories exist.
 */
export async function buildMemoryContext(agentDid: string, userWallet: string): Promise<string> {
  const memories = await getMemories(agentDid, userWallet);
  if (memories.length === 0) return "";

  const lines = memories.map((m) => {
    const prefix = m.memory_type === "preference" ? "User preference" :
                   m.memory_type === "fact" ? "Known fact" : "Context";
    return `- ${prefix}: ${m.content}`;
  });

  return "\n\n[Agent Memory — known from previous interactions]\n" + lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Memory Extraction                                                  */
/* ------------------------------------------------------------------ */

/**
 * Extract memory hints from a completed task's artifact.
 * Uses Claude Haiku to identify preferences, facts, and context
 * worth remembering for future interactions.
 */
export async function extractMemoryHints(
  artifact: string,
  userInput: string
): Promise<Array<{ type: MemoryType; content: string }>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system:
        "Extract 0-2 brief memory hints from this interaction. ONLY save things useful for FUTURE interactions.\n\n" +
        "SAVE:\n" +
        "- Language preference (e.g. 'User prefers Turkish responses')\n" +
        "- Format preference (e.g. 'User wants concise bullet points')\n" +
        "- Domain interest (e.g. 'User frequently asks about DeFi')\n" +
        "- Important personal context (e.g. 'User is a Solana developer')\n\n" +
        "DO NOT SAVE:\n" +
        "- Task-specific data (prices, search results, translations)\n" +
        "- One-time requests that won't repeat\n" +
        "- Generic/obvious observations\n" +
        "- Anything already implied by the capability used\n\n" +
        'Respond with ONLY a JSON array: [{"type":"preference","content":"..."}]\n' +
        "Types: preference | fact | context\n" +
        "If nothing worth remembering, return: []",
      messages: [{
        role: "user",
        content: `User asked: "${userInput.slice(0, 300)}"\n\nAgent responded (first 400 chars): "${artifact.slice(0, 400)}"`,
      }],
    });

    const text = response.content[0];
    if (text.type !== "text") return [];

    const match = text.text.match(/\[[\s\S]*\]/);
    if (!match) return [];

    return JSON.parse(match[0]);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Internal                                                           */
/* ------------------------------------------------------------------ */

async function evictOldMemories(agentDid: string, userWallet: string): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb
    .from("agent_memory")
    .select("id")
    .eq("agent_did", agentDid)
    .eq("user_wallet", userWallet)
    .order("created_at", { ascending: false });

  if (!data || data.length <= MAX_MEMORIES_PER_PAIR) return;

  const idsToDelete = data.slice(MAX_MEMORIES_PER_PAIR).map((r: { id: string }) => r.id);
  if (idsToDelete.length > 0) {
    await sb.from("agent_memory").delete().in("id", idsToDelete);
  }
}
