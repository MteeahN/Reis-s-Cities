# Reis's Cities — Oyun Tasarımı

Tarayıcıda çalışan, tek oyunculu, özgün bir 3D şehir kurma ve yönetme simülasyonu. Tür fikirleri şehir kurma
oyunlarından gelir; isim, görsel, model ve kod tamamen özgündür.

## Temel döngü

0. **Şehir girişi** — her yeni şehir, haritanın bir kenarından karşı kenarına uzanan dört şeritli bir
   şehirlerarası yolla başlar. Yol araziye göre en yumuşak rotayı izler, geniş kavislerle döner, nehirleri
   köprüyle geçer ve şehrin arazisine girmeden yanından geçer. Şehre tek yol girer: üzerindeki bir kavşaktan
   ayrılan bağlantı yolu; ilk sokaklar oradan başlar.
   Göçmenler yalnızca bu yollara bağlı evlere taşınır, yeni binalar yalnızca bağlı sokaklarda yapılır; ithal
   mallar ve ziyaretçiler yolun iki ucundan girer, ihracat iki uçtan çıkar. Şehirlerarası yol ve bağlantı yolu
   yıkılamaz ve dönüştürülemez.

1. **Yol çiz** — sokak, tek yön sokak ve cadde, ana cadde, bulvar ve otoyol; düz veya kavisli, kavşaklar ve köprüler kendiliğinden oluşur.
   Yollar 3 m adımlarla 24 m'ye kadar yükseltilir (PageUp / PageDown): yükseltilmiş yol ayaklar üzerinde durur, en
   az 6 m alçaktaki yolun üzerinden kavşak kurmadan geçer (üst geçit), köprü fiyatına yapılır ve kenarına bina
   yapılmaz. Trafik aracında 3–6 yollu bir kavşak döner kavşağa çevrilir: kollar halkaya kadar kısalır, araçlar tek
   yönlü halkada ortası sollarında kalacak şekilde döner.
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
| Geri al | Binalar, yollar (yapım, yenileme, yıkım, tek yön, kavşak kontrolü, döner kavşak), bölgeleme, hatlar | `systems/UndoHistory.ts`, `City.ts` |
| Kent Sesi | Vatandaş gönderileri; yalnızca şehrin gerçek verisinden (sorunlar, talep, kapsama, trafik, vergi, mutluluk) | `systems/CitizenFeed.ts` |

## İlerleme

- **Nüfus kilitleri:** binalar, yol türleri ve bölgeler nüfus eşiğinde açılır (yaratıcı modda hepsi açık).
- **Görevler:** ilk yol, ilk bölge, elektrik, su, nüfus eşikleri, 5 km yol, karma şehir, tüm hizmetler,
  3. seviye bina, kesintisiz altyapı, mutluluk, tam istihdam, akıcı trafik, kârlı gün, hazine, borçsuzluk, süre.
  Her görevin ödülü bütçeye gerçek para olarak yatar; XP şehir seviyesini (1–11) belirler.
- **Arazi genişletme:** başlangıçta merkezdeki 2×2 karo şehre aittir; diğer karolar satın alınır.
- **Öğretici:** ilk altı görevi sırayla gösterir; adımlar şehrin gerçek durumuyla tamamlanır.

## Mimari stiller

Modern, Avrupa, Asya, Akdeniz, Osmanlı, İskandinav, Arap, Slav, Amerikan, Orta Çağ. Stil bölgeye
boyanır; büyüyen binaların çatısı, cephe süsleri, renkleri ve gövdesi değişir: Asya kat kat ve saçaklı, Akdeniz
basamaklı küpler, Osmanlı ve Orta Çağ çıkmalı üst katlar, İskandinav yan yana iki dar ev, Arap yüksek blok ve alçak
teras kanadı, Slav köşe kulesi, Amerikan kademeli kule, Modern L planlı ya da yan kanatlı.
Stil değiştirmek şehir verisini silmez. (Fütüristik stil kaldırıldı; eski kayıtlarda o stildeki binalar Modern açılır.)

Ticaret bölgesinin 3. seviyesinde yüksek katlı oteller (butik otel, otel, lüks otel kulesi) ve kumarhaneler
(kumarhane, kumarhane oteli) büyür: kaideli kule, saçaklı giriş, çatı havuzu ya da helikopter pisti; kumarhanede
yaldızlı bantlar, kubbeli giriş, ışıklı tabela ve fıskiye. Diğer ticaret binaları gibi iş ve vergi verirler; kat
sınırı olan semtlerde büyümezler.

## Görsel stil

Modeller resimli bir maket gibi görünür: binaların, araçların, yayaların ve ağaçların sert kenarları
mürekkep çizgisiyle çizilir. Çizgiler modelin kendi malzemesindedir, ekran filtresi değildir; yakında belirgin,
uzakta solar. Katalog kartları her binanın gerçek 3B modelinden çizilen küçük resimleri gösterir; yol kartları
yolun genişliğini, şeritlerini, yönünü ve refüjünü çizer.

## Tasarım kuralları

- Sahte mekanik yok: her sayı simülasyondan gelir.
- İşlevsiz düğme yok: henüz yapılmamış özellik devre dışı ve nedeni yazılı gösterilir.
- Zaman atlaması sınırlı: sekme arka plandayken simülasyon sınırsız ilerlemez.
