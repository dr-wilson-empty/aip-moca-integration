"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWalletStore } from "@/store/walletStore";
import ArtifactRenderer, { parseArtifact } from "@/components/ui/ArtifactRenderer";
import BtnPrimary from "@/components/ui/BtnPrimary";
import MonoLabel from "@/components/ui/MonoLabel";

interface Automation {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  budget_limit: number;
  budget_period: string;
  enabled: boolean;
  last_run?: string;
  total_spent: number;
  run_count: number;
  trigger_type: "schedule" | "webhook" | "onchain";
  webhook_secret?: string;
  watch_address?: string;
}

interface AutoResult {
  id: string;
  agent_name: string;
  capability: string;
  input: string;
  artifact: string;
  estimated_cost: string;
  status: string;
  created_at: string;
}

export default function AutomationsPage() {
  const router = useRouter();
  const { address } = useWalletStore();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AutoResult[]>>({});
  const [runningId, setRunningId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState("daily");
  const [budgetLimit, setBudgetLimit] = useState("1.00");
  const [budgetPeriod, setBudgetPeriod] = useState("daily");
  const [triggerType, setTriggerType] = useState<"schedule" | "webhook" | "onchain">("schedule");
  const [watchAddress, setWatchAddress] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);

  const loadAutomations = useCallback(() => {
    if (!address) return;
    setLoading(true);
    fetch(`/api/automations?wallet=${address}`)
      .then((r) => r.json())
      .then((d) => setAutomations(d.automations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  useEffect(() => { loadAutomations(); }, [loadAutomations]);

  const loadResults = async (autoId: string) => {
    const res = await fetch(`/api/automations/results?automationId=${autoId}`);
    const data = await res.json();
    setResults((prev) => ({ ...prev, [autoId]: data.results ?? [] }));
  };

  const handleCreate = async () => {
    if (!address || !name.trim() || !prompt.trim()) return;
    await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress: address,
        name: name.trim(),
        prompt: prompt.trim(),
        schedule,
        budgetLimit: parseFloat(budgetLimit),
        budgetPeriod,
        triggerType,
        watchAddress: triggerType === "onchain" ? watchAddress.trim() : undefined,
      }),
    });
    setName(""); setPrompt(""); setTriggerType("schedule"); setWatchAddress(""); setShowForm(false);
    loadAutomations();
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await fetch("/api/automations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    loadAutomations();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/automations?id=${id}`, { method: "DELETE" });
    loadAutomations();
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      const res = await fetch("/api/automations/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Run failed");
      }
      loadAutomations();
      loadResults(id);
      setExpandedId(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Run failed");
    }
    setRunningId(null);
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!results[id]) loadResults(id);
    }
  };

  if (!address) {
    return (
      <div className="max-w-[1920px] mx-auto px-10 py-12 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <span className="font-mono text-sm text-muted">Connect your wallet to use automations.</span>
        <BtnPrimary onClick={() => router.push("/connect")}>Connect Wallet</BtnPrimary>
      </div>
    );
  }

  return (
    <div className="max-w-[1920px] mx-auto px-10 py-12">
      {/* Header */}
      <div className="mb-10 flex items-end justify-between">
        <div>
          <span className="font-mono text-xs text-muted uppercase tracking-wider">Scheduled Tasks</span>
          <h2 className="font-display text-3xl text-mint uppercase tracking-tight mt-1">Automations</h2>
          <p className="font-mono text-sm text-muted mt-2 max-w-lg">
            Create recurring tasks that your Twin executes automatically. Set budgets, schedules, and let AI work for you.
          </p>
        </div>
        <BtnPrimary onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New Automation"}
        </BtnPrimary>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="border border-mint/20 rounded-xl p-6 mb-8 max-w-2xl">
          <span className="font-mono text-xs text-mint uppercase block mb-4">New Automation</span>

          <div className="flex flex-col gap-4">
            <div>
              <MonoLabel className="mb-1">Name</MonoLabel>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Daily DeFi Report"
                className="w-full bg-forest-deep/30 border border-mint/20 rounded-lg px-4 py-2.5 font-mono text-sm text-mint placeholder:text-muted/40 focus:border-mint/40 focus:outline-none" />
            </div>

            <div>
              <MonoLabel className="mb-1">Prompt (what should Twin do?)</MonoLabel>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder="Get a DeFi risk analysis for the top Solana protocols"
                rows={2}
                className="w-full bg-forest-deep/30 border border-mint/20 rounded-lg px-4 py-2.5 font-mono text-sm text-mint placeholder:text-muted/40 focus:border-mint/40 focus:outline-none resize-none" />
            </div>

            {/* Trigger Type */}
            <div>
              <MonoLabel className="mb-1">Trigger Type</MonoLabel>
              <div className="flex gap-2">
                <button onClick={() => setTriggerType("schedule")}
                  className={`flex-1 font-mono text-xs px-3 py-2.5 rounded-lg border transition-colors ${
                    triggerType === "schedule"
                      ? "border-mint/40 text-mint bg-mint/5"
                      : "border-forest-deep/40 text-muted hover:border-mint/20"
                  }`}>
                  Schedule (cron)
                </button>
                <button onClick={() => setTriggerType("webhook")}
                  className={`flex-1 font-mono text-xs px-3 py-2.5 rounded-lg border transition-colors ${
                    triggerType === "webhook"
                      ? "border-accent/40 text-accent bg-accent/5"
                      : "border-forest-deep/40 text-muted hover:border-accent/20"
                  }`}>
                  Webhook (external)
                </button>
                <button onClick={() => setTriggerType("onchain")}
                  className={`flex-1 font-mono text-xs px-3 py-2.5 rounded-lg border transition-colors ${
                    triggerType === "onchain"
                      ? "border-purple-400/40 text-purple-400 bg-purple-900/5"
                      : "border-forest-deep/40 text-muted hover:border-purple-400/20"
                  }`}>
                  On-chain (Solana)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {triggerType === "schedule" ? (
              <div>
                <MonoLabel className="mb-1">Schedule</MonoLabel>
                <select value={schedule} onChange={(e) => setSchedule(e.target.value)}
                  className="w-full bg-forest-deep/30 border border-mint/20 rounded-lg px-3 py-2.5 font-mono text-sm text-muted focus:border-mint/40 focus:outline-none cursor-pointer">
                  <option value="1min">Every 1 min (test)</option>
                  <option value="5min">Every 5 min</option>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              ) : triggerType === "onchain" ? (
              <div>
                <MonoLabel className="mb-1">Watch Address (Solana)</MonoLabel>
                <input type="text" value={watchAddress} onChange={(e) => setWatchAddress(e.target.value)}
                  placeholder="33qU3JFk..."
                  className="w-full bg-forest-deep/30 border border-purple-400/20 rounded-lg px-3 py-2.5 font-mono text-xs text-purple-400 placeholder:text-muted/40 focus:border-purple-400/40 focus:outline-none" />
              </div>
              ) : (
              <div>
                <MonoLabel className="mb-1">Trigger</MonoLabel>
                <div className="w-full bg-forest-deep/30 border border-accent/20 rounded-lg px-3 py-2.5 font-mono text-xs text-accent">
                  Webhook URL will be generated
                </div>
              </div>
              )}
              <div>
                <MonoLabel className="mb-1">Budget Limit (USDC)</MonoLabel>
                <input type="number" step="0.1" min="0.1" value={budgetLimit}
                  onChange={(e) => setBudgetLimit(e.target.value)}
                  className="w-full bg-forest-deep/30 border border-mint/20 rounded-lg px-3 py-2.5 font-mono text-sm text-accent focus:border-mint/40 focus:outline-none" />
              </div>
              <div>
                <MonoLabel className="mb-1">Budget Period</MonoLabel>
                <select value={budgetPeriod} onChange={(e) => setBudgetPeriod(e.target.value)}
                  className="w-full bg-forest-deep/30 border border-mint/20 rounded-lg px-3 py-2.5 font-mono text-sm text-muted focus:border-mint/40 focus:outline-none cursor-pointer">
                  <option value="daily">Per Day</option>
                  <option value="weekly">Per Week</option>
                  <option value="monthly">Per Month</option>
                </select>
              </div>
            </div>

            <BtnPrimary onClick={handleCreate} disabled={!name.trim() || !prompt.trim()}>
              Create Automation
            </BtnPrimary>
          </div>
        </div>
      )}

      {/* Automations List */}
      {loading ? (
        <span className="font-mono text-sm text-muted animate-pulse">Loading automations...</span>
      ) : automations.length === 0 && !showForm ? (
        <div className="border border-forest-deep/40 rounded-xl p-10 text-center">
          <p className="font-mono text-sm text-muted mb-4">No automations yet.</p>
          <BtnPrimary onClick={() => setShowForm(true)}>Create Your First Automation</BtnPrimary>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {automations.map((auto) => (
            <div key={auto.id} className="border border-mint/10 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="p-5 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpand(auto.id)}>
                  <div className="flex items-center gap-3 mb-1">
                    <span className={`w-2 h-2 rounded-full ${auto.enabled ? "bg-accent" : "bg-muted"}`} />
                    <h3 className="font-display text-lg text-off-white uppercase tracking-wider">{auto.name}</h3>
                    {auto.trigger_type === "webhook" ? (
                      <span className="font-mono text-[10px] text-accent uppercase px-2 py-0.5 border border-accent/30 rounded bg-accent/5">
                        webhook
                      </span>
                    ) : auto.trigger_type === "onchain" ? (
                      <span className="font-mono text-[10px] text-purple-400 uppercase px-2 py-0.5 border border-purple-800/30 rounded bg-purple-900/5">
                        on-chain
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-muted uppercase px-2 py-0.5 border border-forest-deep/40 rounded">
                        {auto.schedule}
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-sm text-muted truncate">{auto.prompt}</p>
                  {auto.trigger_type === "webhook" && (
                    <div className="mt-1.5 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted/60">URL:</span>
                        <code className="font-mono text-[10px] text-accent/80 bg-accent/5 px-1.5 py-0.5 rounded">
                          {typeof window !== "undefined" ? window.location.origin : ""}/api/trigger/{auto.id}
                        </code>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(`${window.location.origin}/api/trigger/${auto.id}`);
                            setCopiedId(auto.id + "_url");
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="font-mono text-[9px] text-muted hover:text-mint transition-colors"
                        >
                          {copiedId === auto.id + "_url" ? "copied!" : "copy"}
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setTestingWebhook(auto.id);
                            try {
                              const crypto = await import("crypto");
                              const payload = JSON.stringify({ test: true, timestamp: new Date().toISOString() });
                              const sig = crypto.createHmac("sha256", auto.webhook_secret || "").update(payload).digest("hex");
                              await fetch(`/api/trigger/${auto.id}`, {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  "X-Webhook-Signature": `sha256=${sig}`,
                                },
                                body: payload,
                              });
                              loadAutomations();
                            } catch { /* ignore */ }
                            setTestingWebhook(null);
                          }}
                          className="font-mono text-[9px] text-accent border border-accent/30 px-2 py-0.5 rounded hover:bg-accent/10 transition-colors"
                        >
                          {testingWebhook === auto.id ? "testing..." : "Test Webhook"}
                        </button>
                      </div>
                      {auto.webhook_secret && (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted/60">Secret:</span>
                          <code className="font-mono text-[10px] text-muted/50 bg-forest-deep/30 px-1.5 py-0.5 rounded">
                            {auto.webhook_secret.slice(0, 12)}...
                          </code>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(auto.webhook_secret!);
                              setCopiedId(auto.id + "_secret");
                              setTimeout(() => setCopiedId(null), 2000);
                            }}
                            className="font-mono text-[9px] text-muted hover:text-mint transition-colors"
                          >
                            {copiedId === auto.id + "_secret" ? "copied!" : "copy secret"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {auto.trigger_type === "onchain" && auto.watch_address && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted/60">Watching:</span>
                      <code className="font-mono text-[10px] text-purple-400/80 bg-purple-900/10 px-1.5 py-0.5 rounded">
                        {auto.watch_address.slice(0, 8)}...{auto.watch_address.slice(-6)}
                      </code>
                      <span className="font-mono text-[9px] text-muted/40">USDC transfers</span>
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-2">
                    <span className="font-mono text-xs text-muted">
                      Budget: <span className="text-accent">{auto.total_spent.toFixed(2)}</span> / {auto.budget_limit.toFixed(2)} USDC
                    </span>
                    <span className="font-mono text-xs text-muted">
                      Runs: <span className="text-mint">{auto.run_count}</span>
                    </span>
                    {auto.last_run && (
                      <span className="font-mono text-xs text-muted">
                        Last: {new Date(auto.last_run).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <BtnPrimary variant="secondary" onClick={() => handleRun(auto.id)}
                    disabled={runningId === auto.id || !auto.enabled}
                    className="text-[10px] px-3 py-1.5">
                    {runningId === auto.id ? "Running..." : "Run Now"}
                  </BtnPrimary>
                  <button onClick={() => handleToggle(auto.id, !auto.enabled)}
                    className={`font-mono text-[10px] px-3 py-1.5 border rounded-lg transition-colors ${
                      auto.enabled
                        ? "text-accent border-accent/30 hover:bg-accent/10"
                        : "text-muted border-forest-deep/40 hover:text-mint"
                    }`}>
                    {auto.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button onClick={() => handleDelete(auto.id)}
                    className="font-mono text-[10px] text-red-400 border border-red-800/30 px-3 py-1.5 rounded-lg hover:bg-red-900/10 transition-colors">
                    Delete
                  </button>
                </div>
              </div>

              {/* Expanded: Results */}
              {expandedId === auto.id && (
                <div className="border-t border-forest-deep/30 p-5 bg-forest-deep/10">
                  <span className="font-mono text-xs text-muted uppercase block mb-3">Recent Results</span>
                  {!results[auto.id] || results[auto.id].length === 0 ? (
                    <p className="font-mono text-xs text-muted">No results yet. Click "Run Now" to execute.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {results[auto.id].map((r) => (
                        <div key={r.id} className="border border-forest-deep/30 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full ${r.status === "completed" ? "bg-accent" : "bg-red-400"}`} />
                              <span className="font-mono text-sm text-mint">{r.agent_name} — {r.capability}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-sm text-accent">{r.estimated_cost} USDC</span>
                              <span className="font-mono text-xs text-muted">{new Date(r.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                          {r.artifact && (
                            <div className="mt-2 max-h-[300px] overflow-y-auto">
                              <ArtifactRenderer artifact={parseArtifact(r.artifact)} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
