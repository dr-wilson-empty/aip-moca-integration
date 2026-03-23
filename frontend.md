Frontend'de Ne Yapılmalı?
Bu proje teknik bir protokol PoC'u. Frontend'in amacı şu değil: "güzel bir ürün çıkar." Amacı şu: protokolün çalıştığını gözlemlenebilir biçimde göster. Bu ayrım frontend kararlarını belirliyor.

Kullanıcı Senaryosu
1. Kullanıcı siteye girer
   └── Cüzdanını bağlar (Phantom / Solana)
   └── DID otomatik üretilir ve gösterilir

2. Agent Card görüntülenir
   └── Kullanıcının kendi ajanının kapasiteleri, fiyatlandırma, endpoint

3. Kullanıcı bir görev başlatır
   └── Karşı ajandan Agent Card çekilir
   └── DID doğrulama gerçekleşir (görsel olarak gösterilir)
   └── USDC escrow'a kilitlenir (tx hash görünür)

4. Görev durumu canlı izlenir
   └── SUBMITTED → WORKING → COMPLETED / FAILED akışı
   └── SSE ile gerçek zamanlı state güncellemesi

5. Görev tamamlandığında
   └── Artifact (sonuç) gösterilir
   └── Ödeme serbest bırakılır (tx hash görünür)
   └── Escrow → Agent B wallet geçişi görsel olarak gösterilir

Frontend Yapısı — Sayfa/Ekran Bazında
4 ana ekran yeterli:
Ekran 1 — Identity & Connect

Phantom cüzdan bağlama butonu
Bağlandıktan sonra: DID göster, public key göster, USDC bakiyesi göster
"Bu senin agent kimliğin" mesajı

Ekran 2 — Agent Card Explorer

Kendi Agent Card'ını JSON olarak göster (düzenlenebilir değil, sadece görüntü)
Karşı ajanın endpoint'ini gir → Agent Card çek → göster
İki Agent Card yan yana: "Sen" vs "Karşı Ajan"

Ekran 3 — Task Dashboard (Ana Ekran)

Görev başlat formu: hangi capability, hangi ajan, hangi input
Escrow kilitleme adımı: tx hash + Solana explorer linki
Görev state machine görsel olarak: SUBMITTED → WORKING → COMPLETED kutular halinde, aktif olan vurgulanır
SSE bağlantısıyla gerçek zamanlı güncelleme

Ekran 4 — Transaction Log

Geçmiş görevler listesi
Her görev için: state, artifact, ödeme tx hash'i
Basit tablo yeterli

Ekran 1 — Identity & Connect
Sayfanın tek amacı kullanıcıyı protokole dahil etmek. Cüzdan bağlanmadan hiçbir şey çalışmaz, bu yüzden bu ekran bir kapı görevi görür.
Görsel yapı: Ortada konumlandırılmış bir kart. Üstte AIP logosu ve kısa açıklama. Altında büyük Phantom bağlantı butonu. Bağlantı gerçekleştikten sonra kart genişler: sol tarafta cüzdan adresi ve USDC bakiyesi, sağ tarafta o anda üretilen DID string'i. DID'in yanında küçük bir bilgi ikonu olur, üzerine gelindiğinde "Bu senin ajanının kriptografik kimliği" yazar. Sayfanın altında "Devam Et" butonu belirir, kullanıcıyı Agent Card Explorer'a yönlendirir. Cüzdan bağlı değilse bu buton disabled kalır.

Ekran 2 — Agent Card Explorer
Kullanıcı burada hem kendi ajanını hem de karşı ajanı görür. Protokolün discovery mekanizmasını görselleştirir.
Görsel yapı: İki kolon yan yana. Sol kolon "Senin Ajanın" başlığıyla kendi Agent Card'ını gösterir: isim, DID, endpoint, capabilities listesi, her capability için USDC fiyatı. Sağ kolon başlangıçta boş gelir, üstünde bir input alanı vardır. Kullanıcı karşı ajanın endpoint URL'ini buraya yazar ve "Fetch" butonuna basar. Card başarıyla çekildiyse sağ kolon sol kolonla aynı formatta dolar. Her iki card'ın altında küçük bir "DID Verified ✓" veya "DID Unverified ✗" badge'i bulunur. Sağ altta "Görev Başlat" butonu belirir, sadece karşı ajan başarıyla yüklendiyse aktif olur.

Ekran 3 — Task Dashboard
Projenin kalbi. Kullanıcı görev başlatır, tüm protokol akışını canlı izler.
Görsel yapı: Üç dikey bölüme ayrılır.
Üst bölüm "Görev Konfigürasyonu": dropdown ile capability seçimi (karşı ajanın card'ından gelir), metin alanında task input'u, tahmini USDC maliyeti otomatik hesaplanır, "Görevi Başlat ve Escrow'a Kilitle" butonu.
Orta bölüm "Protokol Akışı": yatay bir zincir görünümü. Beş düğüm soldan sağa sıralanır: DID Verify → Escrow Lock → Task Sent → Executing → Settlement. Her düğüm başlangıçta gri, aktif olan mavi yanar, tamamlanan yeşil olur, hata varsa kırmızı olur. Aktif düğümün altında küçük bir spinner döner. Her düğümün altında tamamlandığında timestamp yazar.
Alt bölüm "Canlı Log": SSE üzerinden gelen mesajlar kronolojik sırayla burada listelenir. Her satırda timestamp, event tipi ve kısa açıklama bulunur. Log alanı otomatik scroll eder. Görev tamamlandığında log alanının üstünde artifact kutusu belirir ve task sonucu burada gösterilir. Escrow lock ve settlement tx hash'leri tıklanabilir link olarak Solana Explorer'a açılır.

Ekran 4 — Transaction Log
Geçmiş tüm görevlerin kaydını tutar. Protokolün audit trail'ini gösterir.
Görsel yapı: Üstte özet istatistikler: toplam görev sayısı, başarılı, başarısız, toplam harcanan USDC. Altında tablo görünümü. Her satır bir görev: görev ID'si, karşı ajan adı, capability, başlangıç zamanı, süre, final state (renkli badge: yeşil COMPLETED, kırmızı FAILED, sarı CANCELLED), harcanan USDC, sağ uçta "Detay" butonu. Detay butonuna tıklanınca o görevin tam log'u ve artifact'ı bir modal içinde açılır.

Kodlama Promptu
Aşağıdaki promptu kopyalayıp direkt kullanabilirsin:


Proje: Agent Internet Protocol (AIP) — Faz 1 Frontend PoC
Amaç: Otonom AI ajanlarının birbirini bulduğu, görev müzakeresi yaptığı ve Solana üzerinde USDC ile koşullu ödeme gerçekleştirdiği bir protokolün frontend'ini yaz. Bu bir ürün değil, protokolü gözlemlenebilir biçimde gösteren bir proof-of-concept arayüzüdür.
Stack: Next.js 14 App Router, TypeScript, Tailwind CSS, @solana/wallet-adapter-react, Zustand, EventSource API (SSE için)
4 ekran vardır, hiçbir ekleme yapma:
Ekran 1 — Identity & Connect:
Sayfanın merkezinde tek bir kart bulunur. Üstte AIP başlığı ve tek satır açıklama. Altında Phantom cüzdan bağlama butonu. Cüzdan bağlandıktan sonra kart genişler: sol tarafta cüzdan adresi (kısaltılmış) ve USDC bakiyesi, sağ tarafta üretilen DID string'i ve yanında hover'da açıklama gösteren bilgi ikonu. Sayfanın altında "Devam Et" butonu çıkar, cüzdan bağlı değilse disabled kalır, bağlıysa kullanıcıyı Ekran 2'ye yönlendirir.
Ekran 2 — Agent Card Explorer:
İki eşit kolon yan yana. Sol kolon "Senin Ajanın" başlığıyla kendi Agent Card'ını gösterir: ajan adı, DID, endpoint URL, capability listesi, her capability için USDC fiyatı. Sağ kolon başta boş gelir, üstünde bir URL input alanı ve "Fetch" butonu bulunur. Kullanıcı karşı ajanın endpoint'ini girer, Fetch'e basar, sağ kolon aynı formatta dolar. Her iki kolonun altında "DID Verified ✓" veya "DID Unverified ✗" badge'i bulunur. Sağ altta "Görev Başlat" butonu sadece karşı ajan başarıyla yüklendiyse aktif olur.
Ekran 3 — Task Dashboard:
Üç dikey bölüm. Üstte "Görev Konfigürasyonu": karşı ajanın capability'lerini listeleyen dropdown, task input metin alanı, tahmini USDC maliyeti otomatik hesaplanır, "Görevi Başlat ve Escrow'a Kilitle" butonu. Ortada "Protokol Akışı": beş düğüm yatay zincir olarak sıralanır — DID Verify, Escrow Lock, Task Sent, Executing, Settlement. Her düğüm başta gri, aktif olan mavi (spinner ile), tamamlanan yeşil, hatalı olan kırmızı olur. Her tamamlanan düğümün altında timestamp yazar. Altta "Canlı Log": SSE'den gelen eventler kronolojik sırayla listelenir, otomatik scroll yapar. Görev tamamlandığında log'un üstünde artifact kutusu belirir. Escrow lock ve settlement tx hash'leri Solana Explorer'a tıklanabilir link olarak gösterilir.
Ekran 4 — Transaction Log:
Üstte 4 istatistik kutusu: toplam görev, başarılı, başarısız, toplam harcanan USDC. Altında tablo: her satır bir görev, kolonlar şunlar — görev ID, karşı ajan adı, capability, başlangıç zamanı, süre, final state (renkli badge), harcanan USDC, Detay butonu. Detay butonuna tıklanınca modal açılır, o görevin tam log'u ve artifact'ı gösterilir.
Genel kurallar:
Backend henüz hazır değil. Tüm veriler mock/static olacak, gerçek API çağrısı yapma. Cüzdan bağlantısı gerçek olacak ama Solana işlemleri simüle edilecek. State yönetimi için Zustand kullan. Sayfa geçişleri Next.js App Router ile yapılacak. Renk paleti koyu tema (dark mode) olacak, mavi vurgu rengi kullanılacak. Hiçbir ekstra sayfa veya bileşen ekleme, sadece bu 4 ekran.