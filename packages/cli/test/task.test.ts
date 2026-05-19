import { describe, it, expect } from "vitest";
import {
  TaskSchema,
  TaskStateSchema,
  LogEntrySchema,
  QuoteResponseSchema,
} from "../src/core/task-types.js";

describe("TaskStateSchema", () => {
  it("accepts all canonical states", () => {
    for (const s of ["SUBMITTED", "WORKING", "COMPLETED", "FAILED", "CANCELLED"] as const) {
      expect(TaskStateSchema.safeParse(s).success).toBe(true);
    }
  });

  it("rejects unknown states", () => {
    expect(TaskStateSchema.safeParse("RUNNING").success).toBe(false);
  });
});

describe("LogEntrySchema", () => {
  it("requires all four fields", () => {
    const ok = LogEntrySchema.safeParse({
      id: "log-1",
      timestamp: "2026-05-19T18:00:00Z",
      eventType: "x402.settled",
      message: "Settled 0.05 USDC",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects entries missing timestamp", () => {
    expect(
      LogEntrySchema.safeParse({ id: "x", eventType: "y", message: "z" }).success,
    ).toBe(false);
  });
});

describe("TaskSchema", () => {
  const sample = {
    id: "task_xyz",
    counterpartAgent: "Summary Agent",
    capability: "text.summarize",
    input: "hello",
    startedAt: "2026-05-19T18:00:00Z",
    duration: "1.2s",
    state: "COMPLETED",
    usdcSpent: "0.10",
    log: [],
  };

  it("accepts a minimal completed task", () => {
    expect(TaskSchema.safeParse(sample).success).toBe(true);
  });

  it("accepts optional artifact + tx hashes", () => {
    expect(
      TaskSchema.safeParse({
        ...sample,
        artifact: "Result",
        escrowTxHash: "5xK9b2Pq",
        settlementTxHash: "9zXabc",
      }).success,
    ).toBe(true);
  });

  it("supplies an empty log when omitted", () => {
    const parsed = TaskSchema.parse({ ...sample });
    expect(parsed.log).toEqual([]);
  });

  it("rejects invalid state", () => {
    expect(TaskSchema.safeParse({ ...sample, state: "DONE" }).success).toBe(false);
  });
});

describe("QuoteResponseSchema", () => {
  it("accepts a valid quote", () => {
    const ok = QuoteResponseSchema.safeParse({
      requirements: {
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "solana:devnet",
            asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
            amount: "100000",
            maxTimeoutSeconds: 300,
            programId: "59kc3swV6j6NqvhJoKKXAw1uWqGisY2txtf3LLM9Myhz",
            authority: "7imsPo1owz6arqjqHpHvEfNgTepXnm9vtjmHQoVWmABX",
            taskId: "task_abc",
            payee: "9xY8zKuvw",
          },
        ],
      },
      taskId: "task_abc",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects quote with zero accepts entries", () => {
    expect(
      QuoteResponseSchema.safeParse({
        requirements: { x402Version: 2, accepts: [] },
        taskId: "task_abc",
      }).success,
    ).toBe(false);
  });
});
