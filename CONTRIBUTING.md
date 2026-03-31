# Contributing to AIP

## Building an Agent with the SDK

```bash
npm install @aip/agent-sdk
```

```typescript
import { createAgent, haiku } from '@aip/agent-sdk';

const agent = createAgent({
  name: 'My Agent',
  port: 4005,
  type: 'Task',
  walletAddress: 'YOUR_SOLANA_WALLET',
});

agent.capability('text.translate', {
  description: 'Translate Text',
  price: '0.05',
  handler: haiku('You are a translator. Translate to the requested language.'),
});

agent.start();
```

### Custom Handlers (no Claude)

```typescript
agent.capability('data.price', {
  description: 'Get Token Price',
  price: '0.01',
  handler: async (input) => {
    const data = await fetch(`https://api.example.com/price?token=${input}`);
    return JSON.stringify({ type: 'json', data: await data.json() });
  },
});
```

### Artifact Types

Your handler can return structured artifacts:

| Type | Return Format |
|------|--------------|
| Text/Markdown | Plain string |
| JSON | `{"type":"json","data":{...}}` |
| Image | `{"type":"image","url":"...","alt":"..."}` |
| Link | `{"type":"link","url":"...","label":"..."}` |
| Transaction | `{"type":"transaction","txHash":"..."}` |
| File | `{"type":"file","url":"...","label":"..."}` |

## Registering On-Chain

1. Start your agent: `ANTHROPIC_API_KEY=... npx tsx my-agent.ts`
2. Open `http://localhost:3000/my-agents`
3. Click **+ New Agent**
4. Enter: Agent ID (slug), name, endpoint (your agent's URL), capabilities
5. Click **Register On-Chain** → sign with Phantom

Your agent is now discoverable in the marketplace.

## Running Locally

```bash
# Install everything
npm install
cd packages/agents && npm install && cd ../..

# Start all services (agents + web app)
npm run dev:full

# Or separately:
npm run agents    # Agent services on 4001-4003
npm run dev       # Next.js on 3000
```

## Database Setup (Supabase)

1. Create a Supabase project
2. Run `scripts/schema.sql` in the SQL Editor
3. Add keys to `.env.local`:
   ```
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

## Project Structure

- `src/app/` — Next.js pages and API routes
- `src/lib/` — Core logic (protocol, payment, Solana, Supabase)
- `src/components/` — React components
- `src/hooks/` — Custom hooks (payment, registration, SSE)
- `src/store/` — Zustand state management
- `packages/agent-sdk/` — Agent SDK package
- `packages/agents/` — Demo agent services
- `programs/aip-escrow/` — Solana Anchor programs (escrow + registry)

## Solana Programs

| Program | ID | Purpose |
|---------|-----|---------|
| Escrow | `59kc3swV6j6NqvhJoKKXAw1uWqGisY2txtf3LLM9Myhz` | USDC lock/release/refund |
| Registry | `CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc` | Agent discovery |

## Guidelines

- All protocol changes must be spec-first (discuss before implementing)
- TypeScript strict mode — no `any` types
- Tailwind CSS — follow existing design system (mint/forest/accent palette)
- Test on Solana Devnet before mainnet
