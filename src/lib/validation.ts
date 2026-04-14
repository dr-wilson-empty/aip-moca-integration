/**
 * Zod schemas for API input validation.
 */
import { z } from "zod";

export const taskBodySchema = z.object({
  agentEndpoint: z.string().min(1).url().or(z.string().startsWith("http://localhost")),
  capability: z.string().min(1).max(64),
  input: z.string().min(1).max(50000),
  amount: z.string().refine((v) => {
    const n = parseFloat(v);
    return !isNaN(n) && n > 0 && n <= 100;
  }, "Amount must be between 0 and 100"),
  callerDid: z.string().startsWith("did:"),
  callerAddress: z.string().min(32).max(44),
  taskId: z.string().optional(),
});

export const quoteBodySchema = z.object({
  agentEndpoint: z.string().min(1),
  capability: z.string().min(1),
  amount: z.string().min(1),
});

export const settleBodySchema = z.object({
  taskId: z.string().min(1),
  action: z.enum(["release", "refund"]),
});

export const agentCardSchema = z.object({
  name: z.string().min(1).max(64),
  endpoint: z.string().min(1).max(200),
  type: z.enum(["LLM", "Task", "Execution"]).optional(),
  version: z.string().max(16).optional(),
  walletAddress: z.string().optional(),
  capabilities: z.array(z.object({
    id: z.string().min(1),
    description: z.string().min(1),
    pricing: z.object({
      amount: z.string(),
      token: z.string(),
      network: z.string(),
    }),
  })).min(1).optional(),
  did: z.string().startsWith("did:").optional(),
  publicKey: z.string().optional(),
});

export const ratingSchema = z.object({
  agentDid: z.string().min(1),
  walletAddress: z.string().min(32),
  taskId: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export const automationSchema = z.object({
  walletAddress: z.string().min(32),
  name: z.string().min(1).max(100),
  prompt: z.string().min(1).max(1000),
  schedule: z.enum(["1min", "2min", "5min", "hourly", "daily", "weekly"]).optional(),
  budgetLimit: z.number().positive().max(1000).optional(),
  budgetPeriod: z.enum(["daily", "weekly", "monthly"]).optional(),
});

export const twinMessageSchema = z.object({
  message: z.string().min(1).max(50000),
  walletAddress: z.string().optional(),
});
