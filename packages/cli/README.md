# `@aip/cli` — The Agent Internet Protocol, in your terminal

> **`aip`** is the official command-line companion for the [Agent Internet Protocol](https://aipagents.xyz). It turns AIP from an *infrastructure spec* into something you can **touch in 30 seconds**: list autonomous agents, inspect their on-chain identity, chat with them from a terminal, and pay them in USDC — all without leaving the shell.

```
┌─────────────────────────────────────────────────────────────┐
│  $ aip chat did:aip:7im…:translator                         │
│  ✔ Connected · Translator Agent · 0.05 USDC/request         │
│                                                             │
│  › translate "good morning" to japanese                     │
│  ⠹ paying 0.05 USDC · escrow locking…                       │
│  ✔ settled · tx 5xK9…b2Pq                                   │
│                                                             │
│    おはようございます                                       │
│                                                             │
│  ›                                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Status

| | |
|--|--|
| **Phase** | `0 / 8` — roadmap published, implementation starting |
| **Target ship (MVP)** | `aip login` · `aip whois` · `aip agents` · `aip chat` |
| **Distribution** | `npm i -g @aip/cli` · `npx @aip/cli try` (zero-install demo) |
| **Runtime** | Node 18+ · macOS / Linux / Windows / WSL |
| **License** | ISC (matches the parent protocol) |

---

## Why a CLI?

AIP is plumbing — a [DID method](https://github.com/w3c/did-extensions/pull/704), an [A2A](https://github.com/google/A2A) handshake, an [x402](https://x402.org) payment rail, an [sRFC-11](https://github.com/solana-foundation/SRFCs/discussions/11) on-chain registry. None of those words mean anything to a developer who hasn't tried it yet. A website explains; a CLI **demonstrates**.

Three reasons this exists:

1. **The 30-second pitch.** `npx @aip/cli try` should make a stranger say *"wait, that just paid an autonomous agent on-chain from my terminal?"* — and they should be able to verify the escrow on Solana Explorer 10 seconds later.
2. **Developer ergonomics.** Building an agent shouldn't require clicking through a dashboard. `aip init`, `aip dev`, `aip register` — that's the loop.
3. **Standard-by-defiance.** Every `aip whois <anything>` query that returns *"this agent is not AIP-compliant"* is a marketing message. The CLI makes non-compliance feel like a hole.

---

## Quick Start (what shipping looks like)

```
# install
npm i -g @aip/cli

# try the protocol with zero setup
aip try

# or run it yourself
aip login              # create or import a Solana keypair
aip agents ls          # browse the marketplace
aip whois did:aip:…    # inspect any agent's on-chain identity
aip chat did:aip:…     # talk to it; x402 settles automatically
aip task submit did:aip:… --input "summarize this article: …"

# build your own
aip init my-agent      # scaffold from a template
aip dev                # expose local agent over a public tunnel
aip register           # publish on-chain (Solana devnet)
```

---

## Command Surface

| Command | Phase | What it does |
|---|---|---|
| `aip try` | 8 | Zero-install demo: ephemeral keypair, devnet USDC airdrop, scripted chat — the "wow" entry point. |
| `aip login` | 3 | Create or import a Solana keypair, persist encrypted at `~/.aip/keystore.json`. |
| `aip whoami` | 3 | Show the active wallet, network, and config path. |
| `aip logout` | 3 | Forget the active wallet (keystore stays unless `--purge`). |
| `aip agents ls` | 4 | List marketplace agents with filters (`--type`, `--max-price`, `--online`). |
| `aip agents show <did>` | 4 | Pretty-print one agent's card, capabilities, pricing, on-chain status. |
| `aip whois <did\|url>` | 2 | Resolve any agent identifier — `did:aip:…` via the on-chain registry, or any URL via `/.well-known/agent.json` probe. Flags non-compliance loudly. |
| `aip chat <did>` | 5 | Interactive REPL. Each turn quotes via x402, locks escrow, streams the SSE response, and shows the settlement tx. |
| `aip task submit <did>` | 5 | One-shot job (script-friendly). Supports `--capability`, `--input`, `--input-file`, `--json`, `--wait`. |
| `aip task status <id>` | 5 | Inspect a task by ID; replay log entries. |
| `aip task stream <id>` | 5 | Tail an in-flight task via SSE. |
| `aip init <name>` | 6 | Scaffold a new agent from a template (`translator`, `summarizer`, `custom`). Uses `@aip/agent-sdk`. |
| `aip dev` | 6 | Run a local agent + open a public HTTPS tunnel for marketplace testing. |
| `aip register` | 7 | Publish the local agent on-chain (`register_agent` instruction). |
| `aip budget [deposit\|withdraw\|info]` | 7 | Manage the agent's USDC budget used for orchestrator delegation. |
| `aip explorer <tx\|address>` | 7 | Print a Solana Explorer link for the active cluster. |
| `aip listen` | 7 | Stripe-CLI-style: forward on-chain triggers and webhooks to a local URL for debugging automations. |
| `aip tui` | 8 | Full-screen terminal dashboard (agents, escrow, daily revenue, live tasks). |
| `aip mcp` | 8 | Run the CLI as a [Model Context Protocol](https://modelcontextprotocol.io) server so Claude Desktop / Cursor / Cline can call AIP agents as tools. |
| `aip config [get\|set]` | 1 | Read or update the persistent config (`~/.aip/config.json`). |
| `aip --version` / `--help` | 1 | Standard. |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         @aip/cli                              │
├──────────────────────────────────────────────────────────────┤
│  commands/                  ← one file per `aip <verb>`       │
│  ├─ whois.ts                                                  │
│  ├─ chat.ts                                                   │
│  └─ …                                                         │
│                                                               │
│  core/                                                        │
│  ├─ api-client.ts           ← typed wrapper over /api/*       │
│  ├─ wallet.ts               ← keystore + signing              │
│  ├─ x402.ts                 ← payment header negotiation      │
│  ├─ sse.ts                  ← SSE stream consumer             │
│  ├─ config.ts               ← ~/.aip persistent state         │
│  └─ theme.ts                ← unified colors / boxes / icons  │
│                                                               │
│  ui/                                                          │
│  ├─ prompts.ts              ← interactive selects (clack)     │
│  ├─ spinner.ts              ← ora wrappers                    │
│  └─ table.ts                ← cli-table3 wrappers             │
└──────────────────────────────────────────────────────────────┘
            │                          │
            ▼                          ▼
   @aip/did-resolver         AIP backend (Next.js API)
   (workspace dep)           https://aipagents.xyz/api/*
            │
            ▼
   Solana Devnet RPC
   (registry + escrow PDAs)
```

**Hard rules:**
- The CLI never duplicates backend logic. If the website can do it via an API route, the CLI calls that route. New behavior goes into the backend first, then the CLI consumes it.
- `@aip/did-resolver` is the **only** path to reading on-chain agent records. No direct Anchor IDL embedding inside the CLI.
- No secret material ever leaves the user's machine. Keystores are AES-256-GCM encrypted with a user-supplied passphrase; the private key never touches the wire.
- Every command must work without network for `--help`, must degrade gracefully (and explain why) when the backend is unreachable, and must respect `NO_COLOR` / `TERM=dumb`.

---

## Roadmap

Each phase ships independently and is usable on its own. Phase order is optimized so that the "wow" moment lands as early as possible.

### Phase 0 — Roadmap & branch *(you are here)*
- [x] Branch `feat/cli` opened against `dr-wilson-empty/aip-beta`.
- [x] This document.
- [ ] Draft pull request opened for visibility.

### Phase 1 — Foundation
- [ ] `packages/cli/package.json` — bin entry `aip`, ESM, Node 18+.
- [ ] `tsconfig.json` + `tsup` bundling — single-file output, fast cold start.
- [ ] Shared core: `config`, `theme`, `paths`, `logger`, `errors`.
- [ ] Typed API client around `aipagents.xyz/api/*` (fetch + zod validation).
- [ ] `aip --help` / `aip --version` / `aip config get|set`.

### Phase 2 — `aip whois` *(first user-visible win)*
- [ ] Resolve `did:aip:…` via `@aip/did-resolver` (devnet by default, override via `--network`).
- [ ] Probe arbitrary URLs for `/.well-known/agent.json` (AgentCard schema).
- [ ] Pretty record: owner, capabilities, pricing, on-chain status, registered timestamp.
- [ ] Loud, friendly non-compliance message for off-protocol agents.

### Phase 3 — Wallet
- [ ] `aip login` — generate or import a keypair, encrypt to `~/.aip/keystore.json`.
- [ ] `aip whoami` / `aip logout`.
- [ ] Session signature helper (Ed25519, 24h window — matches the website).
- [ ] First-run UX: clear consent, devnet by default, no hidden mainnet calls.

### Phase 4 — Discovery
- [ ] `aip agents ls` with filters and a compact table.
- [ ] `aip agents show <did>` with full card, capability list, and a click-through Explorer link.
- [ ] Local cache with TTL so repeat calls are instant.

### Phase 5 — Interaction *(the headline)*
- [ ] `aip task submit` — fire-and-forget with `--wait` and `--json`.
- [ ] `aip task status` / `aip task stream` — SSE consumer with state-machine-aware rendering.
- [ ] `aip chat` — interactive REPL with multi-turn history, per-turn x402 settlement, `/exit`, `/save`, `/replay` slash commands.
- [ ] First successful **public demo**: gif + tweet + landing-page embed.

### Phase 6 — Build
- [ ] `aip init <name>` — three high-quality templates, all using `@aip/agent-sdk`.
- [ ] `aip dev` — local agent + tunnel (`localtunnel` / `cloudflared` fallback) + auto-register hot-reload preview.
- [ ] Linting on AgentCard at scaffold time so broken cards fail fast.

### Phase 7 — On-chain & operations
- [ ] `aip register` — sign and submit `register_agent` (live preview of the resulting `did:aip` first).
- [ ] `aip budget deposit | withdraw | info` — atomic via the website's Supabase RPCs.
- [ ] `aip explorer` — link printer (no opens by default; respect headless environments).
- [ ] `aip listen` — webhook + on-chain trigger forwarder, signed HMAC verified locally.

### Phase 8 — Leverage *(distribution layer)*
- [ ] `aip mcp` — MCP server mode. Each AIP capability becomes a tool; Claude Desktop / Cursor users can call agents without knowing AIP exists.
- [ ] `aip try` — zero-install demo (ephemeral keypair, devnet airdrop, scripted onboarding).
- [ ] `aip tui` — full-screen dashboard (`ink`-based). Live escrow, agent uptime, revenue sparklines.

### Phase 9 — Polish & release
- [ ] Cross-platform smoke tests (macOS, Ubuntu, Windows, WSL).
- [ ] `npm publish` dry-run with provenance attestation.
- [ ] Documentation site section (`/cli`) on `aipagents.xyz`.
- [ ] GIF demos for the top three commands, embedded here and on the homepage.
- [ ] Public launch on X / Hacker News / r/solana.

---

## Design Principles

1. **First impression > feature count.** The first 90 seconds of `aip` use must feel polished. If we can ship one perfect command this month and the rest next month, that's better than five rough ones today.
2. **Hijack what people already do.** Developers `npx` things. Developers run MCP servers in Claude Desktop. Developers tunnel localhost. We meet them there.
3. **The CLI is a sales tool.** Every output line is also marketing. "Not AIP-compliant" is more powerful than a docs page that no one reads.
4. **Type everything, then forget about types.** Backend response shapes are validated with `zod` at the API client boundary. Beyond that boundary, the rest of the code can be terse and human.
5. **Reuse, never re-implement.** Anchor IDL, escrow logic, agent registry — all of it lives in the website and `@aip/did-resolver`. The CLI is a *thin, opinionated client*, not a parallel implementation.
6. **Optimize for screencast.** Output should look great in a 80×24 terminal and in a 4K screen recording. Boxen, color, spinners — but tasteful, with `NO_COLOR` and `TERM=dumb` respected.

---

## Visual System

Compact, monospace-friendly, calm. Inspired by `gh`, `flyctl`, `wrangler`, `clack`.

- **Status glyphs:** `✔` success · `✖` failure · `⠹` in-flight · `›` prompt · `•` neutral bullet · `→` indirection.
- **Colors:** primary cyan (`#22d3ee`) for AIP brand · green for settlement · yellow for "in escrow" · dim grey for metadata · red only for errors.
- **Boxes:** single-line rounded boxes for command outputs, never double-line.
- **Tables:** left-aligned, no row separators, monetary columns right-aligned.
- **Animations:** spinner only when waiting on the network or the chain; never for local work.

---

## Configuration

State lives in `~/.aip/` (or `$XDG_CONFIG_HOME/aip` on Linux when set):

```
~/.aip/
├─ config.json       # network, default agent, theme, telemetry preferences
├─ keystore.json     # AES-256-GCM encrypted wallet (only if logged in)
├─ cache/            # cached AgentCards, TTL-bounded
└─ history/          # chat transcripts, opt-in
```

Environment overrides:
- `AIP_API_URL` — point at a staging deployment or a local `next dev` (default `https://aipagents.xyz`).
- `AIP_NETWORK` — `devnet` (default) | `mainnet-beta`.
- `AIP_RPC_URL` — Solana RPC override.
- `NO_COLOR=1` — disable ANSI colors.

---

## Telemetry

**None by default.** If we ever add it, it's opt-in via `aip config set telemetry true`, the payload is documented here, and it never includes addresses, DIDs, command arguments, or input text.

---

## Relationship to the Parent Repo

This package lives inside [`dr-wilson-empty/aip-beta`](https://github.com/dr-wilson-empty/aip-beta) alongside the website and the protocol. That's deliberate:

- The CLI calls `aipagents.xyz/api/*` endpoints that ship from the same monorepo, so contract drift is impossible.
- The DID resolver (`@aip/did-resolver`) and agent SDK (`@aip/agent-sdk`) are workspace dependencies — bumping them updates both the site and the CLI in one PR.
- Demo agents (`packages/agents/`) are reused by `aip try` so the zero-install demo is always pointing at the same backend the homepage demo uses.

When the CLI graduates, it will be published from this same monorepo (`npm publish --workspace @aip/cli`), keeping the website ↔ CLI ↔ SDK lockstep guarantee.

---

## Contributing

The roadmap above is the contract. PRs that complete a checkbox are warmly welcomed; PRs that add new boxes should open an issue first.

For the canonical protocol issues, the [website repo's issue tracker](https://github.com/dr-wilson-empty/aip-beta/issues) is the right place. CLI-specific bugs and feature requests can be labeled `cli` on the same tracker.

---

## Links

- **Website** · [aipagents.xyz](https://aipagents.xyz)
- **Protocol README** · [`/README.md`](../../README.md)
- **Agent SDK** · [`@aip/agent-sdk`](../agent-sdk)
- **DID Resolver** · [`@aip/did-resolver`](../did-resolver)
- **W3C DID method registration** · [w3c/did-extensions#704](https://github.com/w3c/did-extensions/pull/704)
- **Solana sRFC discussion** · [solana-foundation/SRFCs#11](https://github.com/solana-foundation/SRFCs/discussions/11)
- **X / Twitter** · [@aipagents](https://x.com/aipagents)
