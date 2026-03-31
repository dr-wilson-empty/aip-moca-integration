# AIP Phase 3 Roadmap

Faz 2'de protokolun tum teknik bilesenleri tamamlandi: on-chain PDA escrow, gercek Claude Haiku ajanlari, dagitik A2A HTTP iletisimi, on-chain agent registry. Faz 3, bu altyapiyi kullanilabilir bir urun haline getirir: acik ekosistem, ucuncu taraf ajan destegi, zengin UI ve Digital Twin.

---

## Faz 2'den Miras

| Tamamlanan | Teknoloji |
|-----------|-----------|
| On-chain escrow | PDA vault, initialize/release/refund/cancel, authority + deadline |
| Gercek AI ajanlar | 3 agent servisi, Claude Haiku, 5 capability |
| A2A HTTP iletisimi | JSON-RPC 2.0, task/create + task/status polling |
| On-chain registry | register/update/deregister, multi-agent per wallet |
| Agent Registration UI | On-chain kayit formu, My Agents yonetimi, dedup |
| E2E entegrasyon | Health check, error handling, performans logging |

---

## Faz 3 Adimlari

### Adim 1 — Agent Registration UI + Gercek Discovery ✅ TAMAMLANDI

- Explorer sayfasina Register Agent formu eklendi
- Multi-agent per wallet (agent_id bazli PDA)
- My Agents listesi, edit, deregister
- On-chain discovery, arama/filtreleme
- Endpoint bazli dedup

---

### Adim 2 — UI Sayfalari + Kullanici Deneyimi

**Amac:** Projeyi demo'dan urune tasiyacak sayfalari ekle. Kullanici akisi profesyonel ve anlasilir olsun.

**Neden SDK'dan once bu?** Kullanici deneyimi eksik — kesfetme sig, profil yok, ajan detayi yok. Disaridan bakan biri projeyi anlamiyor.

**Yapilacaklar:**

1. Agent Marketplace sayfasi (`/marketplace`):
   - On-chain'deki TUM ajanlari grid/kart gorunumunde listele
   - Kategori filtreleme (LLM, Task, Execution)
   - Capability bazli arama
   - Siralama: fiyat, yeni eklenen, isim
   - Her kart: ajan adi, tip, capability sayisi, fiyat araligibi, on-chain badge
   - Karta tikla → ajan detay sayfasina git

2. Agent Detay sayfasi (`/agent/[did]`):
   - Ajanin tam profili: isim, DID, endpoint, type, version
   - Tum capability'ler fiyatlariyla
   - On-chain kayit tarihi, son guncelleme
   - Solana Explorer'da PDA linki
   - Owner wallet adresi
   - "Start Task with this Agent" butonu → dashboard'a yonlendir (ajan secili)

3. Profil / Cuzdan sayfasi (`/profile`):
   - USDC bakiyesi (buyuk gorunum)
   - SOL bakiyesi
   - Kullanicinin DID'i (kopyalanabilir)
   - Cuzdan adresi
   - "My Agents" paneli — sahip oldugu ajanlar listesi + yonetim (edit/delete)
   - Toplam harcama ozeti
   - Son islemler (escrow tx'ler)

4. My Agents sayfasi (`/my-agents`):
   - Explorer'daki Register Agent tab'ini buraya tasi
   - Tam sayfa ajan yonetim paneli
   - Yeni ajan olustur
   - Mevcut ajanlari duzenle / sil
   - Her ajanin on-chain durumu, PDA adresi
   - Agent Card JSON onizleme

5. Gorev Detay sayfasi (`/task/[taskId]`):
   - Modal yerine tam sayfa
   - Paylasılabilir URL
   - Ajan bilgileri, capability, input
   - Artifact goruntuleme (tam ekran)
   - Escrow TX + Settlement TX linkleri
   - Event log timeline
   - Gorev suresi, maliyet

6. Navbar guncellemesi:
   - Mevcut: Identity, Discovery, Dashboard, History
   - Yeni: Marketplace, Dashboard, My Agents, History, Profile
   - Aktif sayfa vurgulama
   - Mobil responsive menu

**Cikti:** Kullanici projede rahatca gezinsin, her sey bir tik uzakta olsun.

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
   - TaskDetailModal ve /task/[taskId] sayfasinda artifact type'a gore farkli gorunum
   - Markdown renderer (text tipi icin)
   - JSON viewer (json tipi icin)
   - Image preview (image tipi icin)
   - Tx link (transaction tipi icin)

4. Demo agent'lara cesitlilik ekle:
   - Data Agent → JSON artifact donsun
   - Audit Agent → structured report (markdown)

**Cikti:** Ajanlar zengin icerik uresin, UI bunu guzel gostersin.

---

### Adim 4 — Agent SDK (npm paketi)

**Amac:** Ucuncu taraf gelistiriciler kolayca AIP-uyumlu ajan yazsin.

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

### Adim 5 — Digital Twin (Kisisel AI Ajan)

**Amac:** Her kullanici kendi AI Digital Twin'ine sahip olsun. Twin, kullanici adina diger ajanlarla etkilesime girsin.

**Not:** Su an UI'da Digital Twin ile ilgili hicbir sey yok — eski explorer sayfasindaki "Your Agent / User Twin" karti silindi. Bu adimda Twin UI'i sifirdan olusturulacak.

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

### Adim 6 — Supabase + Kalicilik

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

### Adim 7 — README + Dokumantasyon Guncellemesi

**Amac:** README gercek proje yapisini yansitsin. Kurulum rehberi, mimari diagram ve Faz 2+3 yetenekleri dokumante edilsin.

**Yapilacaklar:**

1. README.md guncelle:
   - Gercek repo yapisi (programs/, packages/agents/, src/)
   - Faz 2 yetenekleri (on-chain escrow, real agents, registry)
   - Faz 3 yetenekleri (marketplace, profil, SDK, Digital Twin)
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
Adim 1: Registration UI ✅
   |
   v
Adim 2: UI Sayfalari (Marketplace, Profil, Detay, My Agents)
   |
   v
Adim 3: Artifact Tipleri ──> Adim 4: Agent SDK
   |                              |
   v                              v
Adim 5: Digital Twin         Adim 6: Supabase
   |                              |
   └──────────┬───────────────────┘
              v
        Adim 7: README
```

- Adim 1 ✅ tamamlandi
- Adim 2 (UI Sayfalari) siradaki — kullanici deneyimini tamamlar
- Adim 3 (Artifact) Adim 2'ye bagimli (yeni sayfalar artifact rendering kullanir)
- Adim 4 (SDK) Adim 2'den sonra (marketplace olmadan SDK anlamsiz)
- Adim 5 (Digital Twin) ve Adim 6 (Supabase) paralel baslayabilir
- Adim 7 (README) en son
