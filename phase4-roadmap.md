# AIP Phase 4 Roadmap

Faz 3'te kullanilabilir urun haline getirildi: marketplace, profil, ajan yonetimi, artifact tipleri, agent SDK ve Digital Twin chat arayuzu. Faz 4, Digital Twin'i guclendirir ve platformu production-ready yapar.

---

## Faz 3'ten Miras

| Tamamlanan | Teknoloji |
|-----------|-----------|
| Agent Registration UI | On-chain kayit, multi-agent per wallet, edit/delete |
| UI Sayfalari | Marketplace, Agent Detail, Profile, My Agents, Task Detail |
| Artifact Tipleri | text/json/image/link/transaction/file + ArtifactRenderer |
| Agent SDK | @aip/agent-sdk, fluent API, haiku() handler |
| Digital Twin | Chat arayuzu, AI-powered ajan secimi, oto kapasite eslestirme |

---

## Faz 4 Adimlari

### Adim 1 — Coklu Ajan Orkestrasyon

**Amac:** Tek bir kullanici istegi icin birden fazla ajani sirayla veya paralel calistir.

**Yapilacaklar:**

1. Twin analyze endpoint'ini genislet:
   - Tek ajan degil, ajan zinciri donsun
   - Ornek: "Solana ekosistemini analiz et" → data.retrieve → text.summarize → defi.analyze
   - Her adimin ciktisi sonraki adimin girdisi olsun

2. Orkestrasyon motoru:
   - Sira (sequential): ajan A → sonuc → ajan B → sonuc
   - Paralel: ajan A + ajan B ayni anda → sonuclari birlestir
   - Her adim icin ayri escrow lock/release

3. Twin UI guncellemesi:
   - Coklu adim plan karti (pipeline gorunumu)
   - Her adimin durumu ayri gosterilsin
   - Toplam maliyet hesabi

**Cikti:** "Verileri getir, ozetle, risk analizi yap" tek komutla calissın.

---

### Adim 2 — Otonom Mod (Zamanlanmis Gorevler)

**Amac:** Twin belirli kurallara gore otomatik gorev baslatsın.

**Yapilacaklar:**

1. Kural tanimlama UI:
   - "Her gun saat 9'da DeFi risk raporu al"
   - "SOL fiyati 200$'i gecince beni bilgilendir"
   - Cron-benzeri zamanlama + tetikleyici kosullar

2. Otonom calistirma motoru:
   - Sunucu tarafinda zamanlanmis gorevler (cron)
   - Kullanici cuzdani olmadan calisamaz → pre-approved budget
   - Gorev sonuclarini bildirim olarak gonder

3. Budget limiti:
   - Gunluk/haftalik/aylik USDC harcama siniri
   - Sinir asildığında otonom mod dursun
   - Twin dashboard'da budget kullanim grafigi

**Cikti:** Twin uyurken bile calissın, kullanici sabah sonuclari gorsun.

---

### Adim 3 — Tercih Ogrenme + Kisisellestirilmis Twin

**Amac:** Twin kullanicinin aliskanliklarini ogrensin, zaman icinde daha iyi secimler yapsın.

**Yapilacaklar:**

1. Kullanici profil tercihleri:
   - Tercih edilen dil (Turkce/Ingilizce)
   - Favori ajanlar
   - Sik kullanilan capability'ler
   - Detay seviyesi tercihi (kisa/orta/detayli)

2. Twin system prompt kisisellestrme:
   - Tercihlerden otomatik system prompt olustur
   - Ornek: "Bu kullanici genelde DeFi ile ilgilenir, Turkce tercih eder, kisa cevaplar sever"

3. Oneri sistemi:
   - "Gecen hafta 3 kez DeFi analizi yaptin, otomatik haftalik rapor ister misin?"
   - Kullanim oruntulerine gore proaktif oneriler

**Cikti:** Twin kullanildikca daha akilli olsun.

---

### Adim 4 — Supabase + Kalicilik

**Amac:** In-memory store'lari Supabase PostgreSQL ile degistir.

**Yapilacaklar:**

1. Supabase proje olustur, schema tasarla:
   - `tasks` tablosu
   - `escrows` tablosu
   - `agent_cache` tablosu
   - `twin_messages` tablosu
   - `twin_preferences` tablosu

2. Store migration:
   - task-machine.ts → Supabase
   - escrow.ts → Supabase
   - agent-card-store.ts → Supabase + on-chain hibrit
   - twinStore → Supabase (mesaj gecmisi kalici)

3. Tek komut baslama:
   - `npm run dev:full` → agents + next.js birlikte

**Cikti:** Veri kaybolmasin, Twin gecmisi kalici olsun.

---

### Adim 5 — Production Hardening

**Amac:** Mainnet oncesi guvenlik ve altyapi.

**Yapilacaklar:**

1. Authentication + rate limiting (middleware.ts)
2. SSRF fix (URL whitelist)
3. Security headers (CSP, HSTS)
4. Input validation (Zod)
5. Error boundaries (error.tsx)
6. Mainnet hazirlik (RPC, USDC mint, program redeploy)
7. Smart contract audit

**Cikti:** Production-ready platform.

---

### Adim 6 — README + Dokumantasyon

**Amac:** README gercek proje yapisini yansitsin.

**Yapilacaklar:**

1. README.md: gercek repo yapisi, kurulum rehberi, mimari diyagramlar
2. CONTRIBUTING.md: ajan gelistirme rehberi, SDK kullanim ornekleri
3. Agent SDK dokumantasyonu

**Cikti:** Yeni gelistirici projeyi 10 dakikada anlasın.

---

## Bagimlilik Grafigi

```
Adim 1: Coklu Ajan Orkestrasyon
   |
   v
Adim 2: Otonom Mod ──> Adim 3: Tercih Ogrenme
   |                        |
   └────────┬────────────────┘
            v
      Adim 4: Supabase
            |
            v
      Adim 5: Production Hardening
            |
            v
      Adim 6: README
```
