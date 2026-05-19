# CLI Roadmap — Operasyonel Takip

> Public roadmap & marketing doc: [`packages/cli/README.md`](packages/cli/README.md)
> Bu dosya tracker'dır — her faz tamamlandığında güncellenir.

---

## Şu an nerede?

| | |
|--|--|
| **Branch** | `feat/cli` |
| **PR** | [aip-beta#17](https://github.com/dr-wilson-empty/aip-beta/pull/17) (ready for review) |
| **Aktif faz** | Faz 3 — Wallet (sırada) |
| **Aktif iş** | — (Faz 2 tamamlandı, commit bekleniyor) |
| **Son commit** | `f3b358d` — feat(cli): Phase 1 |

---

## Faz Durumu

| Faz | Başlık | Durum |
|----:|--------|-------|
| 0 | Roadmap & branch | ✅ Tamam |
| 1 | Foundation (package, build, config, API client) | ✅ Tamam |
| 2 | `aip whois` | ✅ Tamam (commit bekleniyor) |
| 3 | `aip login` / `whoami` / `logout` | 🟡 Sırada |
| 4 | `aip agents ls` / `show` | ⚪ Bekliyor |
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

## Faz 3 — Sıradaki iş (sıralı)

- [ ] `src/core/wallet.ts` — Ed25519 keypair generate/import, AES-256-GCM keystore yazımı
- [ ] `src/core/session.ts` — session imzalama (`auth-message-{nonce}` payload), 24h TTL
- [ ] `src/commands/login.ts` — yeni keypair oluştur **veya** mevcut base58 ile import et, passphrase ile şifrele
- [ ] `src/commands/whoami.ts` — aktif cüzdan + ağ + network'ten bakiye
- [ ] `src/commands/logout.ts` — session sil (`--purge` ile keystore da sil)
- [ ] API client'a `withWalletAuth(session)` helper
- [ ] Smoke + 5+ unit test

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
