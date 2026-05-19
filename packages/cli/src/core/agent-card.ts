import { z } from "zod";
import { NetworkError, ValidationError } from "./errors.js";
import { USER_AGENT } from "./constants.js";

export const CapabilityPricingSchema = z.object({
  amount: z.string().refine((s) => Number.isFinite(parseFloat(s)) && parseFloat(s) >= 0, {
    message: "amount must be a non-negative numeric string",
  }),
  token: z.literal("USDC"),
  network: z.literal("solana"),
});

export const CapabilitySchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  pricing: CapabilityPricingSchema,
});

export const AgentTypeSchema = z.enum(["LLM", "Task", "Execution"]);

export const AgentCardSchema = z.object({
  did: z.string().regex(/^did:[a-z0-9]+:/, "must be a DID"),
  name: z.string().min(1),
  version: z.string().min(1),
  endpoint: z
    .string()
    .url()
    .refine((u) => /^https?:/i.test(u), { message: "endpoint must be http(s)" }),
  type: AgentTypeSchema,
  capabilities: z.array(CapabilitySchema).min(1),
  walletAddress: z.string().min(1).optional(),
  description: z.string().optional(),
});

export type AgentCard = z.infer<typeof AgentCardSchema>;
export type Capability = z.infer<typeof CapabilitySchema>;

const WELL_KNOWN_PATH = "/.well-known/agent.json";
const MAX_PROBE_BYTES = 256 * 1024;
const PROBE_TIMEOUT_MS = 8_000;

export interface ProbeResult {
  url: string;
  ok: boolean;
  status?: number;
  reason?: string;
  card?: AgentCard;
}

function probeUrlCandidates(input: string): string[] {
  const trimmed = input.replace(/\/+$/, "");
  if (trimmed.endsWith(".json")) return [trimmed];
  return [
    `${trimmed}${WELL_KNOWN_PATH}`,
    `${trimmed}/agent.json`,
    trimmed,
  ];
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchJsonWithLimit(
  url: string,
  signal: AbortSignal,
): Promise<{ status: number; data: unknown } | { status: number; data: null }> {
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal,
    redirect: "follow",
  });
  if (!res.ok || !res.body) return { status: res.status, data: null };

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_PROBE_BYTES) {
      try { await reader.cancel(); } catch { /* ignore */ }
      throw new ValidationError(
        `Response from ${url} exceeded ${MAX_PROBE_BYTES} bytes`,
      );
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const text = buffer.toString("utf8");
  try {
    return { status: res.status, data: JSON.parse(text) as unknown };
  } catch {
    return { status: res.status, data: null };
  }
}

export async function probeAgentCard(input: string): Promise<ProbeResult> {
  if (!isHttpUrl(input)) {
    throw new ValidationError(
      `Not a valid http(s) URL: '${input}'`,
      "Expected something like https://agent.example.com",
    );
  }

  const candidates = probeUrlCandidates(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  let lastStatus: number | undefined;
  let networkFailure: Error | undefined;

  try {
    for (const url of candidates) {
      try {
        const { status, data } = await fetchJsonWithLimit(url, controller.signal);
        lastStatus = status;
        if (!data) continue;
        const parsed = AgentCardSchema.safeParse(data);
        if (parsed.success) {
          return { url, ok: true, status, card: parsed.data };
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          throw new NetworkError(
            `Probe timed out after ${PROBE_TIMEOUT_MS}ms`,
            undefined,
            "Check the host or raise the timeout.",
          );
        }
        if (err instanceof ValidationError) throw err;
        networkFailure = err as Error;
      }
    }
  } finally {
    clearTimeout(timer);
  }

  if (networkFailure && lastStatus === undefined) {
    return {
      url: candidates[0]!,
      ok: false,
      reason: `Could not reach ${input}: ${networkFailure.message}`,
    };
  }

  return {
    url: candidates[0]!,
    ok: false,
    status: lastStatus,
    reason:
      lastStatus !== undefined
        ? `No valid AgentCard at ${WELL_KNOWN_PATH} (last status ${lastStatus})`
        : `No valid AgentCard at ${WELL_KNOWN_PATH}`,
  };
}
