# CLI Roadmap — Operasyonel Takip

> Public roadmap & marketing doc: [`packages/cli/README.md`](packages/cli/README.md)
> Bu dosya tracker'dır — her faz tamamlandığında güncellenir.

---

## Şu an nerede?

| | |
|--|--|
| **Branch** | `feat/cli` |
| **PR** | [aip-beta#17](https://github.com/dr-wilson-empty/aip-beta/pull/17) (ready for review) |
| **Aktif faz** | Faz 7 — `register/budget/explorer` (sırada) |
| **Aktif iş** | — (Faz 6 `init` tamamlandı) |
| **Son commit** | `af80bb7` — feat(cli): Phase 5b |

---

## Faz Durumu

| Faz | Başlık | Durum |
|----:|--------|-------|
| 0 | Roadmap & branch | ✅ Tamam |
| 1 | Foundation (package, build, config, API client) | ✅ Tamam |
| 2 | `aip whois` | ✅ Tamam |
| 3 | `aip login` / `whoami` / `logout` | ✅ Tamam |
| 4 | `aip agents ls` / `show` | ✅ Tamam |
| 5a | `aip task submit` / `status` / `stream` (x402 + SSE) | ✅ Tamam |
| 5b | `aip chat` REPL | ✅ Tamam |
| 6 | `aip init` (3 template) | ✅ Tamam |
| 7 | `aip register` / `budget` / `explorer` / `listen` | 🟡 Sırada |
| 8 | `aip mcp` / `tui` / `try` | ⚪ Bekliyor |
| 9 | Polish, npm publish, launch | ⚪ Bekliyor |

---

## Faz 1 — Tamamlanan iş

- [x] `package.json` — `@aip/cli`, bin: `aip`, ESM, Node 18+, file-ref `@aip/did-resolver`
- [x] `tsconfig.json` — strict, NodeNext, `noUncheckedIndexedAccess`
- [x] `tsup.config.ts` — tek dosya ESM bundle, shebang
- [x] `src/core/{paths,theme,logger,errors,config,constants,api-client}.ts`
- [x] `src/commands/config.ts` — `aip config get|set|reset|path`
- [x] `src/ui/banner.ts` — bare `aip` welcome ekranı
- [x] Markalı yardım çıktısı (tüm subkomutlarda)
- [x] Atomic config yazımı + 0600 izinler
- [x] Smoke test: `--version`, `--help`, `config` CRUD

## Faz 2 — Tamamlanan iş

- [x] did-resolver build fix (`@types/node` + `lib.types` ekleme)
- [x] `@aip/did-resolver` workspace dep olarak CLI'a bağlandı
- [x] `src/core/agent-card.ts` — AgentCard zod şeması (siteyle uyumlu) + URL probe (well-known + fallback + size limit + timeout)
- [x] `src/core/resolver.ts` — `buildResolver(config)` factory + `classifyIdentityInput` (did:aip / did:other / url / unknown)
- [x] `src/core/format.ts` — adres kısaltma, lamports→SOL, timestamp, explorer URL üretici
- [x] `src/ui/card.ts` — 4 farklı kart rendering (on-chain / unregistered / decode-failed / url-probe success / url-probe non-compliant / unsupported-did)
- [x] `src/commands/whois.ts` — komut, `--network`, `--rpc`, `--json`
- [x] `test/whois.test.ts` — 15 unit test (input classifier + AgentCard schema validation)
- [x] `vitest.config.ts` — yerel test config (parent React config'i bypass)

## Faz 3 — Tamamlanan iş

- [x] `bs58` dep + `src/core/wallet.ts` — Keypair generate / base58 import / Solana CLI JSON import; AES-256-GCM + scrypt (N=2^17) keystore encrypt/decrypt; atomic 0600 disk yazımı
- [x] `src/core/solana.ts` — RPC defaults, TOKEN_PROGRAM_ID, USDC mint sabitleri (devnet+mainnet), `getBalances(SOL+USDC)`
- [x] `src/commands/login.ts` — interaktif (clack): generate / base58 paste / Solana CLI dosya import; passphrase iki kez (8+ char); overwrite koruması
- [x] `src/commands/whoami.ts` — pubkey + keystore path + ağ + SOL/USDC bakiye; `--no-balance`, `--rpc`, `--network`, `--json`
- [x] `src/commands/logout.ts` — varsayılan no-op + info; `--purge` "delete" type-confirmation ister; `--yes` ile bypass
- [x] `src/ui/wallet-report.ts` — markalı wallet kartı + login success ekranı
- [x] `test/wallet.test.ts` — 20 test: generate, import (base58 + JSON), encrypt/decrypt round-trip, wrong passphrase, tamper detection, unique salt/IV, disk I/O round-trip, 0600 perms, NotFound, idempotent delete

## Faz 4 — Tamamlanan iş

- [x] `src/core/api-client.ts` generic typing: `get<S extends ZodTypeAny>(path, schema) → Promise<z.infer<S>>`
- [x] `src/core/agent-list.ts` — zod şemaları (Listed, ListResponse, Detail, Status), `applyFilters`, `cheapestPrice`
- [x] `src/ui/agent-table.ts` — başlıksız ızgara tablo (cli-table3), `●/○/·` online indicator, on-chain/mcp tag chips
- [x] `src/ui/agent-detail.ts` — rich card (status, version, endpoint, wallet, description, capability list)
- [x] `src/commands/agents.ts` — `ls` (filter: type/max-price/online-only/limit/page/no-status/json) + `show <did>` (no-status/json)
- [x] Friendly 404 → `aip agents ls` boş çağırıldığında "marketplace not reachable" mesajı + `AIP_API_URL` ipucu
- [x] `test/agents.test.ts` — 13 test (şema, cheapestPrice, applyFilters: type, maxPrice, online, kombinasyon)
- [x] Canlı smoke test: 6 agent listelendi, filtre çalışıyor, show ve JSON çıktısı temiz (localhost:3000 üzerinden)

## Faz 5a — Tamamlanan iş

- [x] `@solana/spl-token` dep eklendi (`getAssociatedTokenAddress`, `getAccount`, `TOKEN_PROGRAM_ID`)
- [x] `src/core/task-types.ts` — Task / TaskState / LogEntry / Artifact / QuoteResponse / TaskCreated zod şemaları
- [x] `src/core/sse.ts` — Native fetch tabanlı async generator SSE consumer (event/data/id parse, comment skip, multi-line data, kısmi buffer)
- [x] `src/core/unlock.ts` — passphrase prompt (clack) + in-memory keypair cache (5 dakika TTL) + `lockKeypair()`
- [x] `src/core/x402.ts` — `useX402Payment` hook'unun Node portu: quote → balance check → init_escrow instruction (anchor discriminator + borsh) → 10-account tx → CLI keypair signs → X-PAYMENT header + POST /api/task
- [x] `src/commands/task.ts` — `submit <did>`, `status <id>`, `stream <id>` subkomutlar; `--capability`, `--input`/`--input-file` (stdin '-' dahil), `--amount`, `--wait`, `--json`, `--network`, `--rpc`
- [x] `src/ui/task-report.ts` — task özeti + canlı SSE event renderer (state-aware glyph'lerle)
- [x] `test/task.test.ts` — 10 test (TaskState, LogEntry, Task minimal + opsiyonel, QuoteResponse boş accepts reddi)
- [x] Smoke test: hata yolları (geçersiz task ID → 70, eksik input → 65, keystore yok → 70, SSE 404 → temiz error)
- [x] Bilinen: `bigint-buffer` native binding warning'i — spl-token transitive, pure JS fallback çalışıyor, sustur etmek için `npm rebuild` veya Faz 9 polish

## Faz 5b — Tamamlanan iş

- [x] `src/commands/chat.ts` — `aip chat [did]` (DID verilmezse clack `select` ile agent seç)
- [x] Multi-turn REPL (Node `readline`, history opt-out `--no-history`)
- [x] Slash: `/help`, `/cost`, `/clear`, `/save [path]`, `/exit` (Ctrl+D de kapatır)
- [x] Her turda otomatik x402 ödeme + SSE stream — Faz 5a `submitTaskWithPayment` re-use
- [x] In-line spinner ("thinking" → "Fetching quote" → "Building escrow" → ...) — yan etkili readline'la uyumlu
- [x] Otomatik transcript: `~/.aip/history/{agent}-{timestamp}.json` (0600), `--no-history` ile devre dışı
- [x] Slash `/save <path>` ile manuel export, `/cost` ile toplam USDC, `/clear` ekranı temizler ve header'ı yeniden yazar
- [x] Non-TTY çağrı reddediliyor (script kullanıcılarını `aip task submit`'e yönlendirir)

## Faz 6 — Tamamlanan iş

- [x] `src/commands/init.ts` — `aip init <name>` interaktif clack picker (echo / translator / summarizer) + non-interaktif flag (`--template`, `--port`, `--wallet`, `--force`)
- [x] Üç template (echo: AI-bağımsız, translator: Haiku, summarizer: Haiku) — hepsi `aip-agent-sdk` üzerinden konuşur
- [x] Tam proje iskeleti: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `README.md`, `src/index.ts`
- [x] Akıllı varsayılanlar: dir adı slug → human name + kebab package name; non-TTY mode'da güvenli defaults
- [x] Varolan dizin reddi + `--force` ile overwrite; sonraki adımları markalı bir başarı kartı ile yazar
- [x] AI-template'ler için `.env.example` `ANTHROPIC_API_KEY` ister, echo template istemez (next-steps de buna uyumlu)
- [x] `aip dev` (tunnel) Faz 9 polish'e ertelendi — yerel test için scaffold'ın README'si `cloudflared tunnel --url` ipucu veriyor

## Faz 7 — Sıradaki iş (sıralı)

- [ ] `src/core/registry.ts` — Anchor `register_agent` IDL'i + instruction builder (Phase 2 `did-resolver`'ın okuma tarafı zaten var, biz yazma tarafı ekliyoruz)
- [ ] `src/commands/register.ts` — local agent'ın AgentCard'ını okur (`./aip-agent.json` veya `--card-file`), wallet ile imzalar, on-chain `register_agent` instruction'ı atar
- [ ] `src/commands/budget.ts` — `deposit | withdraw | info` — POST `/api/budget` ile orchestrator budget yönetimi
- [ ] `src/commands/explorer.ts` — tx/address için Solana Explorer URL üretir (`--open` ile tarayıcıda aç)
- [ ] `src/commands/listen.ts` — Stripe-CLI tarzı: on-chain trigger + webhook'ları local URL'e forward eder
- [ ] Test: register payload validation, budget RPC stub, explorer URL formatting

---

## Karar Defteri

| Karar | Sebep |
|-------|-------|
| CLI parser: `commander` | Endüstri standardı. Olgun, type-safe, yardım çıktısı temiz. |
| Prompts: `@clack/prompts` | Görsel olarak modern, cancel handling temiz. |
| Build: `tsup` | Hızlı, sıfır config. |
| Validation: `zod` | API/probe sınırında runtime güvenlik. |
| Bin adı | `aip` (kısa, çakışma yok) |
| Paket adı | `@aip/cli` |
| Default API URL | `https://aipagents.xyz` (override: `AIP_API_URL`) |
| Default network | `devnet` — mainnet sadece açık opt-in ile |
| did-resolver bağı | `file:../did-resolver` (monorepo, npm workspace eklemedik) |
| Probe yolu | `/.well-known/agent.json` → `/agent.json` → URL'in kendisi (3 fallback) |
| Probe limit | 256 KB body, 8s timeout — DoS koruması |
| URL probe başarısız çıktı kodu | `0` — komut başarılı, sonuç negatif. Scripting için `--json` |
| Keystore KDF | scrypt N=2^17 r=8 p=1 (OWASP'a uygun, ~600ms/derive) |
| Keystore cipher | AES-256-GCM (auth tag ile tamper detection) |
| Keystore yolu | `~/.aip/keystore.json` (0600) |
| Logout default davranışı | Hiçbir şey silmez — `--purge` gerekli + interaktif onay |
| `aip login` passphrase | min 8 char, iki kez girilir, `--passphrase` flag yok (shell history güvenliği) |
| API client tiplemesi | `get<S extends ZodTypeAny>` — schema'dan tip türetir, raw response için ayrı `request()` |
| `agents ls` cache | Faz 9 polish — şu an her çağrı freshes, 60s cache uygulanabilir |
| Cheapest-price filter | Bir capability USDC eşiği ≤ ise dahil; tüm caps eşiği aşmalı dışlamak için değil |

---

## Açık Sorular

- [x] ~~Site `SITE_PASSWORD` ile korunuyor — CLI'ın token alma yolu var mı?~~ → Faz 4'te ele alacağız (marketplace listeleme oraya kadar gerekmedi).
- [ ] `aip try` için devnet USDC airdrop'u — platform cüzdanından mı, kullanıcının kendi faucet çağrısı ile mi?
- [ ] MCP server modu (Faz 8) için `@modelcontextprotocol/sdk` versiyonu — parent monorepo'da `^1.29.0` var.
- [ ] **Bilinen sınırlama**: Devnet'te 10 on-chain agent kaydı var ama mevcut did-resolver discriminator'ı uymuyor (eski program sürümü) → resolver decode-failed döndürüyor, CLI doğru handle ediyor ("Record exists but cannot be decoded"). Protokol tarafının re-register etmesi gerekiyor; CLI değişikliği gerekmez.

---

## Gerekirse Kullanıcıdan İstenecekler

- [ ] **Tunnel servisi tercihi** (Faz 6 `aip dev`): cloudflared vs localtunnel.
- [ ] **`npm publish` token** (Faz 9): `@aip` org'a erişim ya da kişisel token.
- [ ] **Domain için `/cli` alt sayfası** (Faz 9): aipagents.xyz/cli içeriği.

---

## Hızlı Linkler

- Çalışma branch'i: `dr-wilson-empty/aip-beta@feat/cli`
- PR: <https://github.com/dr-wilson-empty/aip-beta/pull/17>
- Public CLI README: [`packages/cli/README.md`](packages/cli/README.md)
- DID resolver: [`packages/did-resolver`](packages/did-resolver)
- Agent SDK: [`packages/agent-sdk`](packages/agent-sdk)
