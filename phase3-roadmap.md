# AIP Phase 3 Roadmap

Faz 2'de protokolun tum teknik bilesenleri tamamlandi: on-chain PDA escrow, gercek Claude Haiku ajanlari, dagitik A2A HTTP iletisimi, on-chain agent registry. Faz 3, bu altyapiyi kullanilabilir bir urun haline getirir: acik ekosistem, ucuncu taraf ajan desteği, cesitli artifact tipleri ve Digital Twin.

---

## Faz 2'den Miras

| Tamamlanan | Teknoloji |
|-----------|-----------|
| On-chain escrow | PDA vault, initialize/release/refund/cancel, authority + deadline |
| Gercek AI ajanlar | 3 agent servisi, Claude Haiku, 5 capability |
| A2A HTTP iletisimi | JSON-RPC 2.0, task/create + task/status polling |
| On-chain registry | register/update/deregister, getProgramAccounts discovery |
| E2E entegrasyon | Health check, error handling, performans logging |

---

## Faz 3 Adimlari

### Adim 1 — Agent Registration UI + Gercek Discovery

**Amac:** Herhangi bir kullanici kendi ajanini on-chain'e kaydetsin. Explorer sayfasi sadece hardcoded 3 ajani degil, on-chain'deki TUM ajanlari gostersin.

**Neden ilk bu?** Proje "acik protokol" vaat ediyor ama su an sadece bizim 3 ajanımız var. Ucuncu taraf kaydi olmadan ekosistem olusamaz.

**Yapilacaklar:**

1. Explorer sayfasina "Register Agent" formu ekle:
   - Agent name, endpoint URL, type (LLM/Task/Execution)
   - Capability ekleme (id, description, pricing)
   - Wallet address (odeme alacak cuzdan)
   - "Register On-Chain" butonu → Phantom ile imzala → on-chain register_agent
   - Form validation (Zod)

2. Discovery'yi on-chain'den besle:
   - Explorer acildiginda `fetchAllOnChainAgents()` cagir
   - Sadece seed agent'lari degil, TUM on-chain kayitli ajanlari listele
   - Arama/filtreleme: isim, capability, type
   - On-chain status badge (zaten var, genislet)

3. Agent Card detail sayfasi:
   - Secilen ajanin tam bilgileri
   - On-chain kayit tarihi, guncellenme tarihi
   - Solana Explorer'da PDA linki
   - "Select for Task" butonu → dashboard'a yonlendir

4. Seed agent'lari kaldir (opsiyonel):
   - Hardcoded mock agent'lar yerine tamamen on-chain'den oku
   - Ilk basta bos olacak — kendi 3 ajanımızı UI uzerinden kaydet

**Cikti:** Herkes kendi ajanini kaydetsin, herkes kesfetsin. Explorer gercek bir marketplace gibi calissin.

---

### Adim 2 — Agent SDK (npm paketi)

**Amac:** Ucuncu taraf gelistiriciler kolayca AIP-uyumlu ajan yazsin. `npx create-aip-agent` ile yeni ajan scaffold'u olusturulsun.

**Yapilacaklar:**

1. `packages/agent-sdk/` npm paketi olustur:
   - `createAgent(config)` — Express server + JSON-RPC handler otomatik
   - `defineCapability(id, handler)` — capability tanimla
   - `registerOnChain(keypair)` — on-chain kayit
   - TypeScript tipleri dahili

2. Mevcut agent'lari SDK ile yeniden yaz:
   - `packages/agents/` → SDK kullansin
   - Kod tekrarini ortadan kaldir

3. Dokumantasyon:
   - "How to create an AIP agent" rehberi
   - Ornek ajan template'leri
   - API referansi

**Cikti:** `npm install @aip/agent-sdk` ile herkes 5 dakikada ajan yazabilsin.

---

### Adim 3 — Cesitli Artifact Tipleri + UI Destegi

**Amac:** Ajanlar sadece metin degil, gorsel, JSON data, dosya, transaction hash gibi farkli tipte sonuclar dondursun. UI bunlari dogru render etsin.

**Yapilacaklar:**

1. Artifact type sistemi:
   - `text` — duz metin veya markdown (mevcut)
   - `json` — yapilandirilmis veri (tablo/tree gorunumu)
   - `image` — gorsel URL (inline render)
   - `link` — harici URL (tiklanabilir)
   - `transaction` — Solana tx hash (Explorer linki)
   - `file` — dosya URL (indirme linki)

2. Agent response formatini genislet:
   - `artifact: { type: "text", content: "..." }`
   - `artifact: { type: "image", url: "...", alt: "..." }`
   - `artifact: { type: "json", data: {...} }`

3. Frontend rendering:
   - TaskDetailModal'da artifact type'a gore farkli gorunum
   - Markdown renderer (text tipi icin)
   - JSON viewer (json tipi icin)
   - Image preview (image tipi icin)
   - Tx link (transaction tipi icin)

4. Demo agent'lara cesitlilik ekle:
   - Data Agent → JSON artifact donsun
   - Audit Agent → structured report (markdown)

**Cikti:** Ajanlar zengin icerik uresin, UI bunu guzel gostersin.

---

### Adim 4 — Digital Twin (Kisisel AI Ajan)

**Amac:** Her kullanici kendi AI Digital Twin'ine sahip olsun. Twin, kullanici adina diger ajanlarla etkilesime girsin.

**Yapilacaklar:**

1. Twin olusturma:
   - Cuzdan baglandiginda otomatik Twin agent card olustur
   - Twin'in DID'i = kullanicinin DID'i
   - Twin'in endpoint'i = AIP sunucusu uzerinden proxy

2. Twin yetenekleri:
   - Kullanicinin tercihlerini ogrenme (system prompt olarak)
   - Otomatik ajan secimi (capability matching)
   - Coklu ajan orkestrasyon (bir gorev icin birden fazla ajan kullan)

3. Twin dashboard:
   - Twin'in yaptigi islemlerin listesi
   - Harcanan toplam USDC
   - En cok kullanilan ajanlar
   - Twin'e talimat verme (dogal dil)

4. Otonom mod:
   - Twin belirli kurallara gore otomatik gorev baslatsın
   - Ornek: "Her gun saat 9'da DeFi risk raporu al"
   - Budget limiti (gunluk/haftalik USDC siniri)

**Cikti:** README'deki flagship use case gercek olsun.

---

### Adim 5 — Supabase + Kalicilik

**Amac:** In-memory store'lari Supabase PostgreSQL ile degistir. Server restart'ta veri kaybolmasin.

**Yapilacaklar:**

1. Supabase proje olustur, schema tasarla:
   - `tasks` tablosu (id, caller, agent, capability, input, state, artifact, escrow_tx, settlement_tx, timestamps)
   - `escrows` tablosu (task_id, amount, from, to, status, tx_hashes, timestamps)
   - `agent_cache` tablosu (did, name, endpoint, capabilities_json, on_chain, timestamps)

2. Store migration:
   - `task-machine.ts` → Supabase insert/update/select
   - `escrow.ts` → Supabase escrow records
   - `agent-card-store.ts` → Supabase + on-chain hibrit

3. History kaliciligi:
   - `/log` sayfasi Supabase'den oku
   - Server restart sonrasi tum gecmis gorunur

4. Tek komut baslama:
   - `npm run dev:full` → agents + next.js birlikte

**Cikti:** Veri kaybolmasin, kullanici deneyimi profesyonel olsun.

---

### Adim 6 — README + Dokumantasyon Guncellemesi

**Amac:** README gercek proje yapisini yansitsin. Kurulum rehberi, mimari diagram ve Faz 2+3 yetenekleri dokumante edilsin.

**Yapilacaklar:**

1. README.md guncelle:
   - Gercek repo yapisi (programs/, packages/agents/, src/)
   - Faz 2 yetenekleri (on-chain escrow, real agents, registry)
   - Faz 3 yetenekleri (agent registration, SDK, Digital Twin)
   - Kurulum ve calistirma rehberi
   - Mimari diyagramlar guncelle

2. CONTRIBUTING.md:
   - Ajan gelistirme rehberi
   - SDK kullanim ornekleri
   - On-chain registry nasil kullanilir

**Cikti:** Yeni bir gelistirici projeyi 10 dakikada anlasın ve calistirsin.

---

## Bagimlilik Grafigi

```
Adim 1: Registration UI + Discovery
   |
   v
Adim 2: Agent SDK ──────────────┐
   |                              |
   v                              v
Adim 3: Artifact Tipleri ──> Adim 4: Digital Twin
   |                              |
   └──────────┬───────────────────┘
              v
        Adim 5: Supabase
              |
              v
        Adim 6: README
```

- Adim 1 (Registration UI) bagimsiz baslar — diger her sey buna bagimli
- Adim 2 (SDK) Adim 1'den sonra (kayit sistemi olmadan SDK anlamsiz)
- Adim 3 (Artifact) ve Adim 4 (Digital Twin) paralel baslayabilir
- Adim 5 (Supabase) herhangi bir noktada yapilabilir ama ideal olarak diger adimlardan sonra
- Adim 6 (README) en son
