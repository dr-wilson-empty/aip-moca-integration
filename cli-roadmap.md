# CLI Roadmap — Operasyonel Takip

> Bu dosya **çalışma defteridir**, public doküman değil.
> Public roadmap & marketing doc: [`packages/cli/README.md`](packages/cli/README.md)
> Bu dosya commit'lenmez — git takibinden çıkar (ya da `.gitignore`'a eklenir).

---

## Şu an nerede?

| | |
|--|--|
| **Branch** | `feat/cli` |
| **PR** | [aip-beta#17](https://github.com/dr-wilson-empty/aip-beta/pull/17) (draft) |
| **Aktif faz** | Faz 1 — Foundation |
| **Aktif iş** | CLI package iskeleti |
| **Son commit** | `33a4556` — docs(cli): introduce @aip/cli roadmap |

---

## Faz Durumu

| Faz | Başlık | Durum |
|----:|--------|-------|
| 0 | Roadmap & branch | ✅ Tamam |
| 1 | Foundation (package, build, config, API client) | 🟡 Sırada |
| 2 | `aip whois` | ⚪ Bekliyor |
| 3 | `aip login` / `whoami` / `logout` | ⚪ Bekliyor |
| 4 | `aip agents ls` / `show` | ⚪ Bekliyor |
| 5 | `aip chat` / `task submit` / `stream` | ⚪ Bekliyor |
| 6 | `aip init` / `dev` | ⚪ Bekliyor |
| 7 | `aip register` / `budget` / `explorer` / `listen` | ⚪ Bekliyor |
| 8 | `aip mcp` / `tui` / `try` | ⚪ Bekliyor |
| 9 | Polish, npm publish, launch | ⚪ Bekliyor |

---

## Faz 1 — Yapılacaklar (sıralı)

- [ ] **`package.json`** — `@aip/cli`, bin: `aip`, ESM, Node 18+, workspace dep'ler (`@aip/did-resolver`)
- [ ] **`tsconfig.json`** — strict mode, ES2022, NodeNext modülleri
- [ ] **`tsup.config.ts`** — tek dosya bundle, hızlı cold-start
- [ ] **`.gitignore`** — `dist/`, `node_modules/`
- [ ] **`src/index.ts`** — bin shebang + commander setup + ana router
- [ ] **`src/core/paths.ts`** — XDG uyumlu `~/.aip/` yol çözümleyici
- [ ] **`src/core/theme.ts`** — renkler, glyphs, NO_COLOR desteği
- [ ] **`src/core/logger.ts`** — debug / info / warn / error
- [ ] **`src/core/errors.ts`** — `AipError` taban sınıfı, exit code'lar
- [ ] **`src/core/config.ts`** — `~/.aip/config.json` oku/yaz
- [ ] **`src/core/api-client.ts`** — typed fetch + zod (AIP API'sine konuşan tek yer)
- [ ] **`src/commands/config.ts`** — `aip config get|set|path`
- [ ] **Smoke test** — `aip --version` ve `aip --help` macOS'ta çalışıyor

---

## Karar Defteri

| Karar | Sebep |
|-------|-------|
| CLI parser: `commander` | Endüstri standardı (Vercel CLI, gh-cli wrap). Olgun, type-safe, yardım çıktısı temiz. |
| Prompts: `@clack/prompts` | Görsel olarak `enquirer`'dan çok daha modern. Cancel handling temiz. |
| Build: `tsup` | Hızlı, sıfır config, ESM+CJS+dts tek komut. |
| Spinner: `ora` | Standart. |
| Tablolar: `cli-table3` | Tek seçenek gibi. |
| Boxlar: `boxen` | Tek seçenek gibi. |
| Validation: `zod` | API client sınırında runtime tip güvenliği. |
| Config persistence: `conf` | gh, npm, supabase-cli kullanıyor. Atomic write. |
| Bin adı | `aip` (kısa, çakışma yok kontrol edildi) |
| Paket adı | `@aip/cli` (monorepo scope'una uyuyor) |
| Default API URL | `https://aipagents.xyz` (override: `AIP_API_URL`) |
| Default network | `devnet` — mainnet sadece açık opt-in ile |

---

## Açık Sorular

- [ ] Site `SITE_PASSWORD` ile korunuyor (`/api/auth/login`). API route'ları middleware'den geçiyor mu? CLI'ın token alma yolu var mı, yoksa public agent endpoint'leri için bypass mümkün mü? **Faz 2 başlamadan netleştir.**
- [ ] `aip try` için devnet USDC airdrop'u — platform cüzdanından mı, kullanıcının kendi faucet çağrısı ile mi?
- [ ] MCP server modu (Faz 8) için Anthropic'in resmi `@modelcontextprotocol/sdk` versiyonu — parent monorepo'da `^1.29.0` var, aynısını kullanırız.

---

## Gerekirse Kullanıcıdan İstenecekler

Şu anda hiçbir şeye ihtiyaç yok. İleride ortaya çıkabilecekler (haber verilecek):

- [ ] **Tunnel servisi tercihi** (Faz 6 `aip dev`): cloudflared ücretsiz vs localtunnel — kullanıcı kararı.
- [ ] **`npm publish` token** (Faz 9): ya `npmjs.com/~aip` org'una erişim ya da kişisel token.
- [ ] **Domain için `/cli` alt sayfası** (Faz 9): aipagents.xyz/cli için içerik onayı.

---

## Hızlı Linkler

- Çalışma branch'i: `dr-wilson-empty/aip-beta@feat/cli`
- Draft PR: <https://github.com/dr-wilson-empty/aip-beta/pull/17>
- Ana protokol README: [`README.md`](README.md)
- Public CLI README (marketing/contract): [`packages/cli/README.md`](packages/cli/README.md)
- Agent SDK: [`packages/agent-sdk`](packages/agent-sdk)
- DID resolver: [`packages/did-resolver`](packages/did-resolver)
