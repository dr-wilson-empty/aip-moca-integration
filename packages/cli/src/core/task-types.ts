import { z } from "zod";

export const TaskStateSchema = z.enum([
  "SUBMITTED",
  "WORKING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const LogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  eventType: z.string(),
  message: z.string(),
});

export const ArtifactSchema = z.object({
  type: z.enum(["text", "json", "image", "link", "transaction", "file"]),
  content: z.string().optional(),
  data: z.unknown().optional(),
  url: z.string().optional(),
  alt: z.string().optional(),
  txHash: z.string().optional(),
  label: z.string().optional(),
});

export const TaskSchema = z
  .object({
    id: z.string(),
    state: TaskStateSchema,
    counterpartAgent: z.string().default(""),
    capability: z.string().default(""),
    input: z.string().default(""),
    startedAt: z.string().default(""),
    duration: z.string().default(""),
    usdcSpent: z.string().default("0"),
    artifact: z.string().optional(),
    parsedArtifact: ArtifactSchema.optional(),
    escrowTxHash: z.string().optional(),
    settlementTxHash: z.string().optional(),
    log: z.array(LogEntrySchema).default([]),
    delegatedBy: z.string().optional(),
    isAgentTask: z.boolean().optional(),
    chainId: z.string().optional(),
  })
  .passthrough();

export const QuoteResponseSchema = z.object({
  requirements: z.object({
    x402Version: z.number(),
    accepts: z
      .array(
        z.object({
          scheme: z.literal("exact"),
          network: z.string(),
          asset: z.string(),
          amount: z.string(),
          maxTimeoutSeconds: z.number(),
          programId: z.string(),
          authority: z.string(),
          taskId: z.string(),
          payee: z.string(),
        }),
      )
      .min(1),
  }),
  taskId: z.string(),
});

export const TaskCreatedSchema = z.object({
  taskId: z.string(),
  state: TaskStateSchema.optional(),
  escrowTxHash: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;
export type TaskState = z.infer<typeof TaskStateSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;
