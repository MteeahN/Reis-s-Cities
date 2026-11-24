# Reis's Cities — Oyun Tasarımı

Tarayıcıda çalışan, tek oyunculu, özgün bir 3D şehir kurma ve yönetme simülasyonu. Tür fikirleri şehir kurma
oyunlarından gelir; isim, görsel, model ve kod tamamen özgündür.

## Temel döngü

1. **Yol çiz** — sokak, tek yön sokak ve cadde, ana cadde, bulvar ve otoyol; düz veya kavisli, kavşaklar ve köprüler kendiliğinden oluşur.
2. **Bölge çiz** — konut, ticaret, sanayi ve ofis. Bölgeye stil, refah ve kat sınırı verilir.
3. **Altyapı kur** — santral + elektrik hatları, su pompası + borular, atık su arıtma.
4. **Hizmet ver** — polis, itfaiye, sağlık, eğitim, çöp, parklar. Her birinin gerçek kapsama alanı vardır.
5. **Büyüme** — talep, arazi değeri, mutluluk ve hizmetler uygunsa binalar inşa edilir, sakinler taşınır,
   binalar seviye atlar. Sorunlar (elektrik yok, su yok, yola erişim yok) binayı terk ettirir.
6. **Ekonomi** — vergiler gelir, bakım ve kredi taksitleri gider. Açık bütçe uyarı ve ceza getirir.

## Sistemler

| Sistem | Ne yapar | Nerede |
| --- | --- | --- |
| Talep | Konut/ticaret/sanayi/ofis talebi nüfus, iş gücü, eğitimli iş gücü ve boş iş yerinden hesaplanır | `simulation/Demand.ts` |
| Nüfus | Toplu (agregat) simülasyon; bina başına sakin ve çalışan, eğitim düzeyi | `simulation/Population.ts`, `Workforce.ts` |
| Mutluluk | Hizmetler, kirlilik, trafik, işsizlik, vergi, parklar | `simulation/CitySimulation.ts` |
| Arazi değeri | Hizmetler, yollar, su kenarı, kirlilik ve simge binalar | `simulation/LandValue.ts` |
| Altyapı | Elektrik ve su şebekeleri bağlantı grafı | `simulation/Utilities.ts` |
| Trafik | Sefer üretimi, çekim modeli, rota ataması, BPR gecikmesi; araç ve yaya görselleri | `simulation/traffic/` |
| Ekonomi | Vergi oranları, günlük rapor, 14 günlük geçmiş, krediler | `systems/Economy.ts`, `Treasury.ts` |
| Görevler | 26 görev; ödül parası ve XP, şehir seviyesi | `systems/Achievements.ts` |
| Geri al | Elle konan binaların yerleştirme / yıkım / taşıma işlemleri | `systems/UndoHistory.ts`, `City.ts` |

## İlerleme

- **Nüfus kilitleri:** binalar, yol türleri ve bölgeler nüfus eşiğinde açılır (yaratıcı modda hepsi açık).
- **Görevler:** ilk yol, ilk bölge, elektrik, su, nüfus eşikleri, 5 km yol, karma şehir, tüm hizmetler,
  3. seviye bina, kesintisiz altyapı, mutluluk, tam istihdam, akıcı trafik, kârlı gün, hazine, borçsuzluk, süre.
  Her görevin ödülü bütçeye gerçek para olarak yatar; XP şehir seviyesini (1–11) belirler.
- **Arazi genişletme:** başlangıçta merkezdeki 2×2 karo şehre aittir; diğer karolar satın alınır.
- **Öğretici:** ilk altı görevi sırayla gösterir; adımlar şehrin gerçek durumuyla tamamlanır.

## Mimari stiller

Modern, Avrupa, Asya, Akdeniz, Osmanlı, İskandinav, Arap, Slav, Amerikan, Orta Çağ, Fütüristik. Stil bölgeye
boyanır; büyüyen binaların çatısı, cephe süsleri ve renkleri değişir. Stil değiştirmek şehir verisini silmez.

## Görsel stil

Modeller resimli bir maket gibi görünür: binaların, araçların, yayaların ve ağaçların sert kenarları
mürekkep çizgisiyle çizilir. Çizgiler modelin kendi malzemesindedir, ekran filtresi değildir; yakında belirgin,
uzakta solar. Katalog kartları her binanın gerçek 3B modelinden çizilen küçük resimleri gösterir; yol kartları
yolun genişliğini, şeritlerini, yönünü ve refüjünü çizer.

## Tasarım kuralları

- Sahte mekanik yok: her sayı simülasyondan gelir.
- İşlevsiz düğme yok: henüz yapılmamış özellik devre dışı ve nedeni yazılı gösterilir.
- Zaman atlaması sınırlı: sekme arka plandayken simülasyon sınırsız ilerlemez.
