# CLI Roadmap — Operasyonel Takip

> Public roadmap & marketing doc: [`packages/cli/README.md`](packages/cli/README.md)
> Bu dosya tracker'dır — her faz tamamlandığında güncellenir.

---

## Şu an nerede?

| | |
|--|--|
| **Branch** | `feat/cli` |
| **PR** | [aip-beta#17](https://github.com/dr-wilson-empty/aip-beta/pull/17) (ready for review) |
| **Aktif faz** | Faz 4 — Marketplace listeleme (sırada) |
| **Aktif iş** | — (Faz 3 tamamlandı) |
| **Son commit** | `129d0d7` — feat(cli): Phase 2 |

---

## Faz Durumu

| Faz | Başlık | Durum |
|----:|--------|-------|
| 0 | Roadmap & branch | ✅ Tamam |
| 1 | Foundation (package, build, config, API client) | ✅ Tamam |
| 2 | `aip whois` | ✅ Tamam |
| 3 | `aip login` / `whoami` / `logout` | ✅ Tamam |
| 4 | `aip agents ls` / `show` | 🟡 Sırada |
| 5 | `aip chat` / `task submit` / `stream` | ⚪ Bekliyor |
| 6 | `aip init` / `dev` | ⚪ Bekliyor |
| 7 | `aip register` / `budget` / `explorer` / `listen` | ⚪ Bekliyor |
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

## Faz 4 — Sıradaki iş (sıralı)

- [ ] `src/core/api-client.ts`'a list/show metodları (typed)
- [ ] `src/core/agent-types.ts` — backend list response için zod şeması (canonicalAgentDid, hosted vs on-chain)
- [ ] `src/commands/agents.ts` — `aip agents ls` (table) + `aip agents show <did>` (rich card)
- [ ] Filtreler: `--type Task|LLM|Execution`, `--max-price`, `--online-only`, `--limit N`
- [ ] Cache: `~/.aip/cache/agents.json` TTL 60s (offline-friendly)
- [ ] Test: list response parsing, filtre fonksiyonu, JSON output

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
