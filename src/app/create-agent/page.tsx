"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWalletStore } from "@/store/walletStore";
import { useAgentBuilderStore, type BuilderStep } from "@/store/agentBuilderStore";
import { useAgentRegistry } from "@/hooks/useRegisterAgent";
import BtnPrimary from "@/components/ui/BtnPrimary";
import MonoLabel from "@/components/ui/MonoLabel";

/* ------------------------------------------------------------------ */
/*  Templates                                                          */
/* ------------------------------------------------------------------ */

const TEMPLATES = [
  {
    key: "translator",
    label: "Translator",
    icon: "🌍",
    prompt: "You are a professional translator. Translate the given text accurately while preserving tone and meaning. If no target language is specified, translate to English.",
    capId: "text.translate",
    capDesc: "Translate Text",
    price: "0.05",
  },
  {
    key: "summarizer",
    label: "Summarizer",
    icon: "📝",
    prompt: "You are a summarization expert. Provide clear, concise summaries that capture the key points. Keep summaries to 2-3 paragraphs unless asked otherwise.",
    capId: "text.summarize",
    capDesc: "Summarize Text",
    price: "0.05",
  },
  {
    key: "code-reviewer",
    label: "Code Reviewer",
    icon: "🔍",
    prompt: "You are a senior software engineer. Review the given code for bugs, performance issues, security vulnerabilities, and best practice violations. Provide actionable feedback.",
    capId: "code.review",
    capDesc: "Code Review",
    price: "0.15",
  },
  {
    key: "data-analyst",
    label: "Data Analyst",
    icon: "📊",
    prompt: "You are a data analyst. Analyze the given data or question, provide insights, identify patterns, and present findings clearly with actionable recommendations.",
    capId: "data.analyze",
    capDesc: "Analyze Data",
    price: "0.10",
  },
  {
    key: "writer",
    label: "Content Writer",
    icon: "✍️",
    prompt: "You are a skilled content writer. Create engaging, well-structured content based on the given topic or brief. Adapt your tone to match the requested style.",
    capId: "text.write",
    capDesc: "Write Content",
    price: "0.10",
  },
  {
    key: "custom",
    label: "Custom Agent",
    icon: "⚡",
    prompt: "",
    capId: "",
    capDesc: "",
    price: "0.10",
  },
];

/* ------------------------------------------------------------------ */
/*  Step indicators                                                    */
/* ------------------------------------------------------------------ */

function StepIndicator({ current }: { current: BuilderStep }) {
  const steps = [
    { num: 1, label: "Define" },
    { num: 2, label: "Behavior" },
    { num: 3, label: "Publish" },
  ];

  return (
    <div className="flex items-center gap-0 mb-10 justify-center">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div
            className={`flex items-center gap-2 px-5 py-2.5 border transition-colors ${
              s.num === current
                ? "border-mint/30 text-mint bg-mint/5"
                : s.num < current
                ? "border-accent/30 text-accent bg-accent/5"
                : "border-forest-deep/60 text-muted"
            } ${i === 0 ? "rounded-l-lg" : ""} ${i === steps.length - 1 ? "rounded-r-lg" : ""} ${i > 0 ? "border-l-0" : ""}`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-display ${
                s.num < current
                  ? "bg-accent/20 text-accent"
                  : s.num === current
                  ? "bg-mint/20 text-mint"
                  : "bg-forest-deep/40 text-muted"
              }`}
            >
              {s.num < current ? "✓" : s.num}
            </div>
            <span className="font-mono text-xs uppercase tracking-wider">{s.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Input components                                                   */
/* ------------------------------------------------------------------ */

function Input({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <div>
      <MonoLabel className="mb-1">{label}</MonoLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full bg-bg-base border border-mint/20 rounded px-3 py-2 font-mono text-sm text-mint placeholder:text-muted/40 focus:border-mint/40 focus:outline-none"
      />
      {hint && <p className="font-mono text-xs text-muted/50 mt-1">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function CreateAgentPage() {
  const router = useRouter();
  const { address } = useWalletStore();
  const store = useAgentBuilderStore();
  const { register: registerOnChain, loading: chainLoading } = useAgentRegistry();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  if (!address) {
    return (
      <div className="max-w-[1920px] mx-auto px-10 py-12 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <span className="font-mono text-sm text-muted">Connect your wallet to create an agent.</span>
        <BtnPrimary onClick={() => router.push("/connect")}>Connect Wallet</BtnPrimary>
      </div>
    );
  }

  // Success screen
  if (store.published && store.txHash) {
    return (
      <div className="max-w-[1920px] mx-auto px-10 py-12">
        <div className="max-w-xl mx-auto">
          <div className="border border-accent/30 rounded-xl p-8 bg-accent/5 text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h2 className="font-display text-xl text-mint uppercase tracking-wider mb-3">
              Agent Published!
            </h2>
            <p className="font-mono text-sm text-body mb-4">
              Your agent <span className="text-accent">{store.name}</span> is now live on the marketplace.
              People can start using it and you will earn USDC.
            </p>
            {store.txHash !== "hosted-only" && (
              <a
                href={`https://explorer.solana.com/tx/${store.txHash}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-mint underline break-all block mb-4"
              >
                {store.txHash}
              </a>
            )}
            <div className="flex gap-3 justify-center mt-6">
              <BtnPrimary onClick={() => router.push("/marketplace")}>
                View Marketplace
              </BtnPrimary>
              <BtnPrimary
                variant="secondary"
                onClick={() => { store.resetBuilder(); }}
              >
                Create Another
              </BtnPrimary>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const agentIdSlug = store.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);

  /* ---- Step validation ---- */
  const step1Valid = store.name.trim().length > 0 && store.template !== "";
  const step2Valid = store.systemPrompt.trim().length > 10;
  const step3Valid =
    store.capabilities.length > 0 &&
    store.capabilities.every(
      (c) => c.id.trim() && c.description.trim() && parseFloat(c.amount) > 0
    );

  /* ---- Template selection handler ---- */
  const selectTemplate = (key: string) => {
    store.setTemplate(key);
    const tpl = TEMPLATES.find((t) => t.key === key);
    if (tpl && key !== "custom") {
      store.setSystemPrompt(tpl.prompt);
      store.setCapabilities([
        { id: tpl.capId, description: tpl.capDesc, amount: tpl.price },
      ]);
    }
  };

  /* ---- Publish handler ---- */
  const handlePublish = async () => {
    if (!address || !step3Valid) return;
    store.setPublishing(true);

    try {
      // Step 1: Register hosted agent config on server
      const res = await fetch("/api/hosted-agent/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agentIdSlug,
          ownerAddress: address,
          name: store.name.trim(),
          description: store.description.trim(),
          systemPrompt: store.systemPrompt.trim(),
          tier: store.tier,
          provider: store.provider,
          customApiKey: store.tier === "custom" ? store.customApiKey : undefined,
          capabilities: store.capabilities.map((c) => ({
            id: c.id.trim(),
            description: c.description.trim(),
            pricing: { amount: c.amount, token: "USDC", network: "solana" },
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to register hosted agent");
      }

      const data = await res.json();

      // Step 2: Register on-chain
      const sig = await registerOnChain({
        agentId: agentIdSlug,
        name: store.name.trim(),
        endpoint: data.endpoint,
        agentType: 1, // Task
        walletAddress: address,
        version: "1.0.0",
        capabilities: store.capabilities.map((c) => ({
          id: c.id.trim(),
          description: c.description.trim(),
          pricing: { amount: c.amount, token: "USDC", network: "solana" },
        })),
      });

      store.setPublished(sig || "hosted-only");
    } catch (err) {
      store.setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="max-w-[1920px] mx-auto px-10 py-12">
      {/* Header */}
      <div className="mb-6 text-center">
        <span className="font-mono text-xs text-muted uppercase tracking-wider">No-Code Builder</span>
        <h2 className="font-display text-3xl text-mint uppercase tracking-tight mt-1">
          Create Your Agent
        </h2>
        <p className="font-mono text-sm text-muted mt-3 max-w-xl mx-auto">
          Build an AI agent in minutes. No coding, no deployment, no technical knowledge needed.
        </p>
      </div>

      <StepIndicator current={store.step} />

      <div className="max-w-2xl mx-auto">
        {/* =============== STEP 1: DEFINE =============== */}
        {store.step === 1 && (
          <div className="flex flex-col gap-6">
            <Input
              label="Agent Name"
              value={store.name}
              onChange={store.setName}
              placeholder="My Translator Agent"
              maxLength={64}
              hint={agentIdSlug ? `ID: ${agentIdSlug}` : undefined}
            />

            <Input
              label="Short Description (optional)"
              value={store.description}
              onChange={store.setDescription}
              placeholder="Translates text between languages accurately"
              maxLength={200}
            />

            <div>
              <MonoLabel className="mb-3">Choose a Template</MonoLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.key}
                    onClick={() => selectTemplate(tpl.key)}
                    className={`border rounded-lg p-4 text-left transition-all ${
                      store.template === tpl.key
                        ? "border-mint/40 bg-mint/5"
                        : "border-forest-deep/40 hover:border-mint/20"
                    }`}
                  >
                    <span className="text-2xl block mb-2">{tpl.icon}</span>
                    <span className="font-mono text-sm text-mint block">{tpl.label}</span>
                    {tpl.key !== "custom" && (
                      <span className="font-mono text-xs text-muted block mt-1">{tpl.capDesc}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <BtnPrimary onClick={() => store.setStep(2)} disabled={!step1Valid}>
                Next: Behavior
                <span className="ml-1">→</span>
              </BtnPrimary>
            </div>
          </div>
        )}

        {/* =============== STEP 2: BEHAVIOR =============== */}
        {store.step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <MonoLabel className="mb-1">System Prompt</MonoLabel>
              <p className="font-mono text-xs text-muted/60 mb-2">
                Tell your agent who it is and what it should do. This is the instruction your agent follows for every task.
              </p>
              <textarea
                value={store.systemPrompt}
                onChange={(e) => store.setSystemPrompt(e.target.value)}
                placeholder="You are a helpful assistant that..."
                rows={8}
                maxLength={2000}
                className="w-full bg-bg-base border border-mint/20 rounded px-3 py-2 font-mono text-sm text-mint placeholder:text-muted/40 focus:border-mint/40 focus:outline-none resize-y"
              />
              <p className="font-mono text-xs text-muted/50 mt-1 text-right">
                {store.systemPrompt.length}/2000
              </p>
            </div>

            {/* Prompt tips */}
            <div className="border border-mint/10 rounded-lg p-4 bg-forest-deep/10">
              <h4 className="font-display text-xs text-mint uppercase tracking-wider mb-2">
                Tips for a good prompt
              </h4>
              <ul className="font-mono text-xs text-body leading-relaxed flex flex-col gap-1.5">
                <li><span className="text-accent mr-2">-</span>Be specific about the role: &quot;You are a professional legal translator&quot;</li>
                <li><span className="text-accent mr-2">-</span>Define the output format: &quot;Always respond in JSON format&quot;</li>
                <li><span className="text-accent mr-2">-</span>Set boundaries: &quot;Only answer questions about cooking&quot;</li>
                <li><span className="text-accent mr-2">-</span>Add personality: &quot;Be concise and direct, no fluff&quot;</li>
              </ul>
            </div>

            <div className="flex justify-between mt-4">
              <BtnPrimary variant="ghost" onClick={() => store.setStep(1)}>
                <span className="mr-1">←</span> Back
              </BtnPrimary>
              <BtnPrimary onClick={() => store.setStep(3)} disabled={!step2Valid}>
                Next: Publish
                <span className="ml-1">→</span>
              </BtnPrimary>
            </div>
          </div>
        )}

        {/* =============== STEP 3: PRICE & PUBLISH =============== */}
        {store.step === 3 && (
          <div className="flex flex-col gap-6">
            {/* AI Tier Selection */}
            <div>
              <MonoLabel className="mb-3">AI Engine</MonoLabel>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { store.setTier("platform"); store.setProvider("anthropic"); }}
                  className={`border rounded-lg p-4 text-left transition-all ${
                    store.tier === "platform"
                      ? "border-mint/40 bg-mint/5"
                      : "border-forest-deep/40 hover:border-mint/20"
                  }`}
                >
                  <span className="font-display text-sm text-mint uppercase tracking-wider block mb-1">
                    Platform AI
                  </span>
                  <span className="font-mono text-xs text-muted block">
                    Uses Claude Haiku. No API key needed. Small commission per task.
                  </span>
                </button>
                <button
                  onClick={() => store.setTier("custom")}
                  className={`border rounded-lg p-4 text-left transition-all ${
                    store.tier === "custom"
                      ? "border-mint/40 bg-mint/5"
                      : "border-forest-deep/40 hover:border-mint/20"
                  }`}
                >
                  <span className="font-display text-sm text-mint uppercase tracking-wider block mb-1">
                    Your Own Key
                  </span>
                  <span className="font-mono text-xs text-muted block">
                    Bring your Anthropic or OpenAI key. No commission.
                  </span>
                </button>
              </div>
            </div>

            {/* Custom API Key */}
            {store.tier === "custom" && (
              <div className="border border-mint/10 rounded-lg p-4">
                <div className="mb-3">
                  <MonoLabel className="mb-2">Provider</MonoLabel>
                  <div className="flex gap-2">
                    {(["anthropic", "openai"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => store.setProvider(p)}
                        className={`font-mono text-xs uppercase px-3 py-1.5 rounded border transition-colors ${
                          store.provider === p
                            ? "border-mint/30 text-mint bg-mint/10"
                            : "border-forest-deep/40 text-muted hover:text-mint"
                        }`}
                      >
                        {p === "anthropic" ? "Anthropic" : "OpenAI"}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  label="API Key"
                  value={store.customApiKey}
                  onChange={store.setCustomApiKey}
                  placeholder={store.provider === "anthropic" ? "sk-ant-..." : "sk-..."}
                  hint="Your key is stored securely and only used when your agent is called."
                />
              </div>
            )}

            {/* Capabilities */}
            <div>
              <MonoLabel className="mb-2">Capabilities & Pricing</MonoLabel>
              <div className="flex flex-col gap-3">
                {store.capabilities.map((cap, idx) => (
                  <div key={idx} className="border border-forest-deep/40 rounded p-3 flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="font-mono text-xs text-muted/60 uppercase block mb-1">Capability ID</span>
                        <input
                          type="text"
                          value={cap.id}
                          onChange={(e) => store.updateCapability(idx, "id", e.target.value)}
                          placeholder="text.translate"
                          className="w-full bg-bg-base border border-mint/10 rounded px-2 py-1.5 font-mono text-xs text-mint placeholder:text-muted/40 focus:border-mint/30 focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="font-mono text-xs text-muted/60 uppercase block mb-1">Display Name</span>
                        <input
                          type="text"
                          value={cap.description}
                          onChange={(e) => store.updateCapability(idx, "description", e.target.value)}
                          placeholder="Translate Text"
                          className="w-full bg-bg-base border border-mint/10 rounded px-2 py-1.5 font-mono text-xs text-mint placeholder:text-muted/40 focus:border-mint/30 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div>
                        <span className="font-mono text-xs text-muted/60 uppercase block mb-1">Price per task</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={cap.amount}
                            onChange={(e) => store.updateCapability(idx, "amount", e.target.value)}
                            className="w-24 bg-bg-base border border-mint/10 rounded px-2 py-1.5 font-mono text-xs text-accent focus:border-mint/30 focus:outline-none"
                          />
                          <span className="font-mono text-xs text-muted">USDC</span>
                        </div>
                      </div>
                      {store.capabilities.length > 1 && (
                        <button
                          onClick={() => store.removeCapability(idx)}
                          className="ml-auto mt-4 font-mono text-xs text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={store.addCapability}
                className="mt-2 font-mono text-xs text-mint hover:text-accent transition-colors"
              >
                + Add Capability
              </button>
            </div>

            {/* Commission info */}
            {store.tier === "platform" && (
              <div className="border border-accent/20 rounded-lg p-4 bg-accent/5">
                <p className="font-mono text-xs text-body">
                  <span className="text-accent font-display uppercase">Platform AI Commission:</span>{" "}
                  20% of each task payment covers AI costs. You earn 80%.
                  {store.capabilities[0]?.amount && (
                    <span className="text-muted block mt-1">
                      Example: {store.capabilities[0].amount} USDC per task → you earn{" "}
                      <span className="text-accent">
                        {(parseFloat(store.capabilities[0].amount) * 0.8).toFixed(2)}
                      </span>{" "}
                      USDC
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Error */}
            {store.error && (
              <p className="font-mono text-xs text-red-400 bg-red-900/10 border border-red-800/30 rounded p-2">
                {store.error}
              </p>
            )}

            {/* Actions */}
            <div className="flex justify-between mt-4">
              <BtnPrimary variant="ghost" onClick={() => store.setStep(2)}>
                <span className="mr-1">←</span> Back
              </BtnPrimary>
              <BtnPrimary
                onClick={handlePublish}
                disabled={!step3Valid || store.publishing || chainLoading}
              >
                {store.publishing || chainLoading ? "Publishing..." : "Publish Agent"}
              </BtnPrimary>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
