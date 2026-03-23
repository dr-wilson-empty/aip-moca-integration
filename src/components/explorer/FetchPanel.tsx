"use client";

import { useState } from "react";
import { useAgentStore } from "@/store/agentStore";
import { COUNTERPART_AGENT_CARDS } from "@/lib/mock/agentCards";
import MonoLabel from "@/components/ui/MonoLabel";
import BtnPrimary from "@/components/ui/BtnPrimary";

const DEMO_ENDPOINTS = Object.keys(COUNTERPART_AGENT_CARDS);

export default function FetchPanel() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const { setCounterpart } = useAgentStore();

  const doFetch = async (endpoint: string) => {
    if (!endpoint.trim()) return;
    setUrl(endpoint);
    setStatus("loading");
    await new Promise((r) => setTimeout(r, 800));
    const card = COUNTERPART_AGENT_CARDS[endpoint.trim()];
    if (card) {
      setCounterpart(card);
      setStatus("success");
    } else {
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <MonoLabel>Counterpart Agent Endpoint</MonoLabel>
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setStatus("idle"); }}
          placeholder="https://agent.example.com/a2a"
          className="flex-1 bg-forest-deep/30 border border-forest-deep/60 px-4 py-3 font-mono text-xs text-off-white placeholder-muted/50 outline-none focus:border-accent/60 transition-colors"
        />
        <BtnPrimary onClick={() => doFetch(url)} disabled={status === "loading" || !url.trim()}>
          {status === "loading" ? (
            <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin-slow" />
          ) : (
            "Fetch"
          )}
        </BtnPrimary>
      </div>

      {status === "error" && (
        <p className="font-mono text-[10px] text-red-400 uppercase">
          Agent card not found at this endpoint
        </p>
      )}

      {status === "success" && (
        <p className="font-mono text-[10px] text-accent uppercase">
          Agent Card fetched and DID verified
        </p>
      )}

      <div className="mt-2">
        <MonoLabel className="mb-2">Available Agents — Click to Fetch</MonoLabel>
        <div className="flex flex-col gap-1">
          {DEMO_ENDPOINTS.map((ep) => (
            <button
              key={ep}
              onClick={() => doFetch(ep)}
              disabled={status === "loading"}
              className="text-left font-mono text-[10px] text-muted hover:text-accent transition-colors py-1.5 px-2 border border-transparent hover:border-forest-deep/60 disabled:opacity-50"
            >
              → {ep}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
