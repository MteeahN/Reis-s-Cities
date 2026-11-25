# Reis's Cities

Tarayıcıda çalışan, stilize gerçekçi 3D şehir kurma ve yönetme simülasyonu.
**Mevcut durum: Aşama 8 — Kayıt, başarımlar, yayın (v0.8.0)** — 8 aşamalık planın tamamı bitti.

### Son eklemeler: oynanış araçları
- **Geri al / yinele (Ctrl+Z / Ctrl+Y, son 50 işlem):** elle konan binalar (yerleştirme, yıkım, taşıma), yollar
  (yapım, yenileme, yıkım, tek yön, trafik lambası / dur levhası, döner kavşak), bölgeleme ve elektrik hattı / su
  borusu (yapım, yıkım). Para da geri döner: yapımı geri almak ödenen bedeli iade eder, yıkımı geri almak alınan
  iadeyi geri öder. Geri gelen yolun yerinde artık bir bina varsa ya da para yetmiyorsa işlem yapılmaz ve nedeni
  yazılır. Bölgelemeyi geri almak, o bölgeleme yüzünden yıkılan büyüyen binaları geri getirmez.
- **Kent Sesi (sohbet simgesi):** vatandaşların gönderi akışı. Gönderiler şehrin gerçek verisinden yazılır:
  elektriksiz / susuz / kanalizasyonsuz binalar, çöp, yangın, işsizlik, eleman açığı, konut ve dükkân talebi,
  trafik yoğunluğu, uzun yol süresi, polis / itfaiye / sağlık / okul kapsaması, suç, sağlık, gürültü, terk edilmiş
  binalar, yüksek vergi, mutluluk, borç ve nüfus eşikleri. Her gönderide gerçek sayı yazar ("4 bina elektriksiz");
  sorun sürdükçe birkaç günde bir tekrar yazılır, çözülünce teşekkür gelir. "Göster" kamerayı sorunun yerine
  götürür. Okunmamış gönderi sayısı simgede görünür. Akış kayda yazılmaz; yüklenen şehirde şehrin o anki
  durumundan yeniden başlar.
- **Hemen yükselt (yeşil ok):** seviye atlama gereksinimlerini karşılayan büyüyen binaların üstünde yeşil ok çıkar.
  Bina panelindeki "Şimdi yükselt" düğmesi, bir sonraki seviyenin elle yapım bedelinin yarısını ödeyerek binayı hemen
  büyütür (beklemezseniz bina zamanla kendiliğinden de büyür). Geri alınır.
- **Yerleşim unvanı:** şehir adının altında gerçek nüfusa göre Köy (0), Belde (500), Kasaba (2.000), Şehir (10.000),
  Büyükşehir (50.000), Metropol (200.000).
- **Yeni hizmet, park ve otoparklar:** Anaokulu ve Sağlık Ocağı (300 nüfus; okul ve hastaneden küçük, ucuz), Üniversite
  (3.000 nüfus, 4×4, geniş ileri eğitim), Kubbeli Kütüphane ve Açık Yüzme Havuzu (500 nüfus, arazi değeri); Düzenli
  Bahçe, Atlıkarıncalı Park, Oyun Parkı, Hobi Bahçeleri, Spor Sahası (arazi değeri). Binalar sekmesinde Açık Otopark ve
  Katlı Otopark: oyun park yeri arayan sürücüleri hesaplamaz, bu yüzden otoparklar görünüm içindir; yalnızca görevli
  işleri gerçektir (açıklamalarında yazıyor).
- **Bölge renkleri:** konut / ticaret / sanayi / ofis renkleri artık yalnızca bölgeleme aracı açıkken görünür.
- **Vatandaş dilekçeleri:** 100 nüfustan sonra birkaç günde bir, gerçekten eksiği olan bir evin sakinleri başkandan
  bir şey ister: polis, itfaiye ya da sağlık kapsaması, okul ya da yürüme mesafesinde çalışan bir otobüs hattı. Kart
  bir gün içinde yanıt bekler. "Söz ver" denirse 7 gün içinde yapılmalıdır; söz, simülasyonun kullandığı aynı kapsama
  ile denetlenir. Tutulan söz güveni artırır (+8), tutulmayan çok düşürür (−12), ret (−3) ve yanıtsızlık (−2) biraz
  düşürür. **Belediyeye güven** (−30…+30, günde %3 sönümlenir) her hanenin mutluluğuna 0,3 katıyla eklenir.
  Danışmanlar panelinde süren sözler, kalan gün ve son sonuçlar görünür; "Nerede" kamerayı eve götürür. Kayda yazılır.
- **Komşu kasabalara satış (Bütçe sekmesi):** şehrin kullanmadığı elektrik, temiz su ve atık su arıtma kapasitesi
  satılır (₺8 / 1.000 kW, ₺20 / 1.000 m³ su, ₺15 / 1.000 m³ arıtma, günlük). Oyuncu ne kadar sunacağını seçer;
  satılan, gerçek fazlayı aşmaz: talep artınca önce satış azalır, şehir hizmetsiz kalmaz. Komşular günde en çok
  20.000 kW ve 3.000 m³ alır. Hatların komşulara şehirlerarası yol boyunca döşeli olduğu varsayılır. Gelir bütçede
  ayrı satırdır, kayda yazılır.
- **Danışmanlar (üst çubuk):** şehrin o an en çok neye ihtiyacı olduğunu altyapı, güvenlik, sağlık, eğitim, ekonomi,
  imar, ulaşım, bütçe ve halkla ilişkiler danışmanları söyler. Her madde simülasyonun ölçtüğü rakamı yazar
  ("6 bina elektriksiz", "talep %100, boş ev 0") ve sorunu çözen aracı tek tıkla açar. Acil olanlar önce gelir ve
  simgede sayılır; mutsuzlukta en çok aşağı çeken etkenler adıyla yazılır.
- **Otobüs (O):** "Durak" modunda yola tıklayınca durak (₺500) ve bekleme kulübesi kurulur, durağa tıklayınca kaldırılır.
  "Hat çiz" modunda duraklar sırayla seçilir; ilk durağa tıklamak ya da Enter hattı açar (ilk otobüs ₺1.200). Otobüsler
  hattı durak sırasıyla, sonra ilk durağa dönerek yol ağında dolaşır (tek yönlü yollara uyar, sağ şeritten gider).
  Panelde her hattın durak sayısı, uzunluğu, günlük yolcusu / kapasitesi; otobüs alma (+) ve satma (−, yarı fiyat)
  ve hattı kapatma var. Yolcu hesabı gerçek şehirden yapılır: bir durağa 260 m yürüme mesafesindeki evler, hattın
  ulaştığı işyeri ve dükkân payına ve sefer sıklığına (km başına otobüs) göre iş ve alışveriş yolculuklarının bir
  kısmını (en çok %45) otobüsle yapar; bu yolculuklar yollardaki araç trafiğinden düşülür. Otobüs başına günde 600
  yolcu kapasitesi; dolu hat yolcuyu geri çevirir (onlar arabayla gider). Bilet ₺2 gelir, otobüs başına günde ₺60
  işletme gideri bütçede ayrı satırlardır. Otobüsler her durakta 8 saniye bekler. Geri alınır, kayda yazılır.
  Otobüsler **Otobüs Garajı**nda (Hizmetler ya da paneldeki "Garaj", ₺5.000, 3×2) durur: garaj olmadan otobüs
  alınamaz, her garaj 30 otobüs alır; garaj yıkılınca sığmayan otobüsler çalışmaz (panel ve danışman söyler).
  Durakları 40 m'den yakın hatlar arasında **aktarma** yapılır: bir hattın yolcusu, bağlı hatların ulaştığı işlerin
  ve dükkânların da %70'ini hesaba katar. Panelde "Düzenle" ile durağa tıklayıp hatta eklenir (en az sapma yapan
  yere) ya da çıkarılır; ada çift tıklayıp değiştirilir, renk kutusu rengi değiştirir. Araç açıkken **Toplu
  taşıma** katmanı durakların yürüme alanlarını ve otobüse binen evleri gösterir. Duraklarda bekleyen insanlar o
  durağın günlük binen yolcusuna göre çizilir (40 yolcuda bir kişi, en çok 8).
- **Zemin kaplama (Q):** parke taşı, karo, tuğla, çakıl, kum, biçilmiş çim, ahşap döşeme, asfalt ve silgi; 2 / 4 / 8 m
  fırça, basılı tutup boyanır. Meydan, avlu, patika için; yalnızca şehre ait kuru arazi. m² fiyatı ₺1–5, silmek
  ücretsiz. Her basış tek Ctrl+Z ile geri alınır; kayda yazılır. Görünüm içindir (arazi değeri, mutluluk değişmez).
- **Süsler (N):** 20 süs eşyası, 5 grupta: banklar, piknik masası, kafe masası, şezlong; çardak, pergola, çiçek tarhı,
  çit, saksıda ağaç, bahçe kulübesi; süs havuzu, heykel, müzik köşkü; kaydırak, salıncak, kum havuzu; gazete
  köşkü, çiçekçi tezgâhı, bisiklet parkı, çöp kutusu. Yeşil / kırmızı önizleme, R ile 45° döndürme; yol, bina, su
  ve başka süsün üzerine konmaz. Yıkım aracı (yeni "Süsler" süzgeci) yarı fiyatını iade eder; üzerine yol ya da bina
  yapılınca kalkar. Geri alınır, kayda yazılır. Görünüm içindir.
- **Yeni yol çizimleri:** Serbest (basılı tutup çizin; titrek çizgi geniş kavislere dönüşür) ve Yay (başlangıç →
  bitiş → büküm, dairesel yay). Parçalar tek işlem olarak kurulur ve tek Ctrl+Z ile geri alınır; bir parça
  kurulamıyorsa hiçbiri kurulmaz, para ödenmez.
- **Yol kaplaması:** asfalt, parke taşı, tuğla, beton. Yeni yollar seçili kaplamayla kurulur; Yenile modunda aynı
  türdeki yola tıklamak onu yeniden kaplar (yeni yapım bedelinin %30'u). Kaplama kayda yazılır. Kavşak yüzeyleri
  asfalt kalır.
- **Yaya Yolu:** baştan başa taş döşeli, araç girmeyen yol (trafik ağına girmez; binalar araç için yakındaki başka
  bir yola bağlanır). **Rampa:** otoyola tek şeritli tek yön bağlantı (5.000 nüfus).
- **Arazi aracı (E):** yükselt, alçalt, düzle (basmaya başlanan yüksekliğe), yumuşat, gölet (su seviyesinin altına
  kazar, çukur suyla dolar). Fırça S/M/L (12/24/40 m, [ / ]), güç ayarı. Yol, bina, satın alınmamış arazi ve
  harita kenarı değişmez. Taşınan toprak m³ başına ₺0,5; her basış tek Ctrl+Z ile geri alınır. Düzenlenen zemindeki
  ağaçlar kalkar, su altında kalan boş bölgeler silinir. Düzenlenmiş arazi kayda yazılır. Mini harita
  düzenlemeleri göstermez.
- **Cadde kenarı yolları (yeni sekme):** Otoparklı Sokak, Ağaçlı Sokak, Geniş Kaldırımlı Sokak, Çarşı Caddesi
  (park şeridi + ağaç + geniş kaldırım, 300 nüfus), Otoparklı Cadde (800) ve Ağaçlı Bulvar (1.500). Park şeritleri
  her 6 m'de çizgili ceplerle çizilir ve ceplerin yaklaşık üçte ikisinde park etmiş araç durur; trafik şeritleri park
  şeridi kadar daralır. Ağaçlı yollarda iki kaldırım boyunca ağaç dizisi var. Katalog kartları park eden araçları ve
  ağaçları da çizer.
- **Sokak lambaları kavşakta değil:** lambalar ve ağaçlar kavşak yüzeyinin bittiği yerden sonra başlar ve hiçbir
  yolun araç yüzeyine (kesişen ya da kıvrılan yol dahil) konmaz.
- **Eğimli arazide binalar:** dört kata kadar binalar %12'ye kadar eğimde araziyle birlikte eğilir (parsel zemine
  oturur, kaide görünmez). Daha yüksek binalar ve dik eğimler dik durur, en alçak köşeye kadar yamaca gömülür
  (yukarı tarafta en fazla 2,5 m; fazlasını kaide tamamlar). Görüntüdür; hücreler ve oyun kuralları değişmez.
- **Yola mıknatıs (elle yerleştirme):** bina aracında imleç kıvrık ya da çapraz bir yola (binanın derinliği + 2 hücre)
  yaklaşınca bina yola çekilir: yolun o noktadaki yönüne her açıda döner (90°'lik adımlarla değil), ön yüzü kaldırıma
  paralel yaslanır ve imleçle yol boyunca kayar. Başka bir binaya çarpacaksa yana kayar; 2,5 m'den yakın komşusuna
  yanaşır. Bina ızgaraya bağlı değildir: değdiği hücreleri sahiplenir (ızgara binaları üstüne kurulamaz), yol hücrelerini
  yolla paylaşır; yola dönmüş iki komşu buluştukları hücreyi paylaşır, böylece otoparklar ve evler arada boşluk
  kalmadan yan yana dizilir (çakışmayı çizilen parseller belirler). Kaidesi de binayla birlikte döner. Izgaraya paralel yollarda ve R ile elle döndürünce ızgara yerleşimi geçerlidir. Geri alma, kayıt ve
  yol erişimi bu yerleşimi olduğu gibi tanır.
- **Yola yaslanan binalar:** binalar önündeki yola yaslanarak çizilir: düz yolda arada çim şerit kalırsa kaldırım
  kenarına çekilir; kavisli ya da çapraz yolda en çok 50° döner: ön cephe, iki köşesinin karşısındaki yol noktalarını birleştiren
  çizgiye paralel olur (yalnız bir köşe değil, yüz yola yaslanır) ve kaldırıma değene dek ileri ya da geri kaydırılır. Yerleştirirken imleç yol eğrisine denk gelmeyen bir
  hücredeyse araç yakındaki (±2 hücre) uygun parsel ve yönlerden en yakınını seçer. Yalnızca görüntü: hücreler yerinde
  kalır, seçme / yıkma / taşıma çizildiği yerden çalışır. Arada başka bir bina varsa kaydırılmaz. Döndürülmüş ve
  kaydırılmış hâli komşu binaların çizildiği yere ya da yol yüzeyine taşacaksa bina döndürülmez, kendi hücrelerinde
  kalır; sonradan yanına bina konunca komşular yeniden hesaplanır. Kayıt binaların çizildiği yeri olduğu gibi saklar.
- **Yol kenarı bölgeleme:** seçim yalnızca işaret edilen yola bakan araziyi alır; köşede kesişen yolun cephesine
  taşmaz. Başka türde bölgelenmiş arazi sınırdır: yeni bölge onun sınırına kadar uzanır, onu ve arkasını
  değiştirmez (örneğin konutun yanına sanayi çizerken konut korunur). Fırça modu ve "Kaldır" eskisi gibi her şeye işler.
- **Yol eklemleri:** aynı türden iki yol hafif açıyla birleştiğinde uçları ortak bir gönye çizgisinde buluşur;
  araya yırtık gibi görünen boşluk girmez.
- **Taşı (M):** simge, hizmet ve altyapı binaları ücretsiz taşınır; binaya tıklayın, yeni yere tıklayın. Taşınan bina
  yeni bina gibi en yakın yola döner ve kıvrık ya da çapraz yolun kaldırımına mıknatısla çekilir; R ile elle
  döndürülünce ikisi de durur. Bölgede büyüyen binalar taşınmaz.
- **Eğik yolda büyüme:** çapraz ya da kıvrık yol kenarındaki bölgede binalar ızgara karelerine basamak basamak
  (yolla arasında çim üçgenler kalarak) değil, yola dönük ve ön yüzü kaldırımda, komşusuna (10 m'ye kadar kayarak)
  yaslanarak büyür; yalnızca kendi bölgesinin hücrelerine taşar. Izgara parselinin artık sığmadığı aralar da yol
  boyunca uyan en uygun şablonla dolar. Izgaraya paralel yollarda büyüme eskisi gibidir. Eski kayıtlar yüklenince
  eğik yol kenarında kaldırıma değmeyen (köşesiyle değen dahil) bölge binaları, yola dönmüş komşularıyla birlikte
  yola dizilir; bina, seviyesi ve oturanları aynı kalır, oyun kaç binanın yaslandığını bildirir. Önünde yola yaslı
  ev olan arka sıra evleri sığacak yer olmadığı için yerinde kalır (yıkılmaz).
- **Alt çubuk:** araç çubuğu mini harita ve talep göstergesinin sağındaki alanda ortalanır, onların üstüne binmez;
  dar ekranda araçlar küçülür (en dar hâlde yalnız simge, adı ve kısayolu ipucunda), ekrandan taşmaz.
- **Katalog:** her bina menüsünde arama, sıralama (ad, fiyat, boyut) ve favoriler (★, tarayıcıda saklanır).
- **Görevler ve şehir seviyesi:** her başarım bir görevdir; tamamlanınca bütçeye gerçek para ödülü yatar
  (ekonomi raporunda "Görev ödülleri") ve şehir XP kazanır. Üst çubukta şehir seviyesi ve XP çubuğu görünür.
- **Öğretici:** yeni şehirde 6 adımlı rehber. Her adım şehrin gerçek durumuyla (görev ilerlemesi) tamamlanır.
  Ayarlar → Oyun'dan kapatılıp açılır.
- **Arayüz boyutu:** Ayarlar → Oyun'da %85–%130.
- Ayrıntılı belgeler: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md), [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md),
  [docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md).

### Aşama 8 sonrası eklemeler
- **Yaratıcı mod:** yeni şehir ekranındaki seçenekle sınırsız para, tüm binalar / yollar / bölgeler açık ve haritanın
  tamamı kullanılabilir. Gelir-gider raporu yine tutulur; kredi alınmaz, başarımlar kazanılmaz. Kayıtta saklanır.
- **Görünür borular:** su ve kanalizasyon görünümünde borular 3D tüp olarak çizilir; su kaynağına bağlı ağ mavi,
  bağlı olmayan kırmızı, uçlarda vana. Yeni boru (veya elektrik hattı) mevcut bir hattın ucuna ya da ortasına
  başlatılıp bitirilebilir (T bağlantısı); kesişen hatlar da birleşir. Plan kartı kaç bağlantı yapılacağını gösterir.
- **Daha detaylı yollar:** kavşaklarda yuvarlak disk yok; yollar kavşak girişinde kesilir ve aradaki yüzey kavisli
  bordür köşeleriyle doldurulur. Kaldırımlar yükseltilmiş ve bordürlü, köşelerde kesintisiz devam eder; kavşak
  girişlerinde yaya geçidi var; çıkmaz uçlar düz biter.
- **Yol kenarı bölgeleme:** imleç yolun yanındaki boş alana gelince yolun yalnızca o tarafı seçilir (yolun üzerinde iki
  taraf); tıklayın veya sürükleyerek birden çok sokağı bölgeleyin.
- **Mimari stiller:** Modern, Avrupa, Asya, Akdeniz, Osmanlı. Bölgeleme aracında stil seçilir; boyanan hücreler o
  stili alır ve orada büyüyen binalar o stilde çıkar. Aynı bölgeyi başka stille boyamak mevcut binaları da çevirir.
  Stiller yalnızca renk değil gövde de değiştirir (kat kat, basamaklı, çıkmalı, kuleli); ayrıca: kiremit ve mansart çatılar, panjurlar, ferforje balkonlar, çizgili
  tenteler (Avrupa); geniş saçaklı uçları kalkık çatılar, pagoda tepeler, fenerler, neon tabelalar (Asya); beyaz
  badana, teras çatılar, pergolalar, kemerler, begonviller (Akdeniz); cumbalar, geniş saçaklar, kubbeli çarşılar
  (Osmanlı). Stil kayıtta saklanır. Altı stil daha: İskandinav (koyu kırmızı ahşap, beyaz pervazlar, dik ve çimen
  çatılar), Arap (kerpiç, mazgallı düz çatılar, meşrebiye kafesleri, rüzgâr kuleleri, kubbeler), Slav (pastel sıva,
  oymalı pencere süsleri, soğan kubbeler), Amerikan (verandalı ahşap evler, yangın merdivenleri, çatı su tankları),
  Orta Çağ (yarım ahşap çatkı, çıkma katlar, köşe kuleleri). Fütüristik stil kaldırıldı.
- **Ofis bölgesi (O, 500 nüfusta açılır):** bürolar ve iş kuleleri artık ayrı bölgede büyür. Talebi şehrin eğitimli
  (lise ve üniversite) çalışan sayısına göre oluşur; ofisler kirlilik üretmez, ticaret oranından vergi öder. Eski
  kayıtlarda ticaret bölgesindeki ofis binaları yüklenirken ofis bölgesine taşınır.
- **Refah ve kat sınırı:** bölgeleme aracında konut için refah (Karışık / Mütevazı / Orta / Varlıklı) ve her bölge
  için kat sınırı (Sınırsız / Alçak ≤ 3 kat / Orta ≤ 7 kat) seçilir ve hücrelere boyanır. Mütevazı semtlerde sıra
  evler, lojmanlar ve toplu konut (çok sakin); varlıklı semtlerde villa, konak ve rezidanslar (az sakin, çevresinin
  arazi değerini yükseltir) büyür. Kat sınırı katıdır: sınırı aşan binalar büyümez, bir bina sınırda daha büyük
  karşılığı yoksa seviye atlamaz (bina panelinde gerekçesi yazılır). Refah bir tercihtir: o refahta parsele uyan bina
  yoksa başka konut büyür. Her ikisi de kayıtta saklanır.
- **Yeni bina türleri:** sıra evler (her biri ayrı renk, kapı ve çatılı bitişik evler), avlulu bloklar (kemerli
  girişli, ortası bahçeli dört kanat), villa, konak, malikâne, toplu konut, bahçe apartmanları; dükkân sıraları,
  kafe, lokanta, butik, pasajlı çarşı; stüdyo ofis, büro, teknoloji atölyesi, ofis kompleksi, ofis parkı, iş kulesi.
- **Binaları tek tek yerleştirme:** Binalar aracında Konut / Ticaret / Sanayi / Ofis sekmeleri. Seçilen bina seçilen stilde
  elle kurulur: hazır bina bedeli ödenir (hücre sayısı ve seviyeye göre), parselin bölgesi kendiliğinden atanır, bina
  inşaattan sonra diğerleri gibi yaşar ve gelişir; yıkılırsa bedelin yarısı iade edilir.
- **Yumuşak sokak lambaları:** gece lamba başlıkları ve yoldaki ışık halkası çok daha hafif ve yayvan; gece parlaması
  (bloom) azaltıldı. Ayarlar → Grafik → "Sokak lambası parlaklığı" ile ayarlanır.
- **Yükseltilmiş yollar:** yol aracında PageUp / PageDown ya da çubuktaki oklarla 3 m adımlarla 24 m'ye kadar.
  Yükseltilmiş yol ayaklar üzerinde durur, en az 6 m alçaktaki yolların üzerinden kavşak kurmadan geçer, köprü
  fiyatına yapılır, kenarına bina yapılmaz ve binalar ona bağlanmaz. Yol ucu yalnızca kendi yüksekliğine yakın
  yollara bağlanır. Dar sokaklar yükseltilemez.
- **Döner kavşak:** trafik aracında "Döner kavşak" seçilip 3–6 yollu bir kavşağa tıklanır. Kollar kısalır, iki şeritli
  tek yönlü bir halka kurulur; araçlar halkada ortası sollarında kalacak şekilde döner. Halka yol fiyatına yapılır;
  arazi, bina, eğim ve kesişen yol denetlenir.
- **Oteller ve kumarhaneler:** ticaretin 3. seviyesinde butik otel, otel, lüks otel kulesi, kumarhane ve kumarhane
  oteli büyür (12–26 kat). Kat sınırlı semtlerde büyümezler.
- **Trafik düzenleme (K):** yol parçalarını tek yön yapma / yönünü çevirme, kavşaklara trafik lambası (₺600) veya dur
  levhası (₺60). Tek yönlü yol tüm şeritleri tek yöne verir (kapasite iki katı), oklarla ve orta çizgisiz çizilir.
  Kavşak beklemesi trafik modelinde kontrole ve yoğunluğa bağlıdır: kontrolsüz kavşak sakinken hızlı, yoğunken tıkanır;
  lamba sabit ama yoğunlukta daha iyi; dur levhası herkesi durdurur. Rotalar buna göre yeniden hesaplanır.
- **Trafik kuralları:** araçlar kırmızıda ve sarıda (durabiliyorsa) stop çizgisinde durur, dur levhasında tam durup
  geçer, yaya geçidindeki yayalara yol verir; kavşaklarda geldikleri şeritten çıkacakları şeride eğriyle döner,
  yumuşak fren ve hızlanma yapar. Yayalar köşeleri kavisle döner, kavşakta karşıya geçmek için kaldırımda bekler
  (lambalı kavşakta kendi yeşilinde, lambasızda araç yokken ya da bir süre bekledikten sonra) ve yaya geçidinden geçer.
- **Yayalar:** kaldırımlarda yürüyen insanlar. Bir sokakta kaç kişinin yürüdüğü, o sokağın kenarındaki binalarda
  gerçekten yaşayan/çalışan insan sayısına ve günün saatine bağlıdır (gece neredeyse boş, işe gidiş-dönüş saatlerinde
  kalabalık); her figür birkaç kişiyi temsil eder. Kavşaklarda başka sokağa geçerler. Sayıları "En fazla araç / yaya"
  ayarıyla sınırlanır.
- **Daha detaylı araçlar:** yan profilden şekillendirilmiş gövdeler (eğimli kaput ve ön cam, tavan, bagaj), jantlı
  tekerlekler, aynalar, ızgara, plakalar, sinyal lambaları; kamyonlarda kabin, yakıt deposu, nervürlü kasa, yuvarlak tank.
- **Yıkım filtresi:** Hepsi / Yollar / Binalar / Elektrik hatları / Borular (Tab ile değiştirilir). "Hepsi"de imleç
  hattın üzerindeyse yolun üstündeki elektrik hattı seçilir; borular su görünümü açıkken seçilir.
- **Detaylı simge ve hizmet binaları:** saat kulesi (pilastırlar, dört kadran ve akrep-yelkovan, açık çan katı ve çan,
  bakır külah), belediye binası (sütunlu giriş, alınlık, kubbe kasnağı, fener, bayraklar, havuzlar), meydan, anıt;
  polis, itfaiye (araç kapıları, hortum kulesi, itfaiye araçları), hastane (helikopter pisti, acil girişi, ambulanslar),
  okullar (oyun alanı, saha, spor salonu), çöp tesisi, parklar, santral (soğutma kulesi, bacalar), rüzgâr türbini,
  su kulesi, arıtma tesisi. Modeller `src/game/data/models/` içinde.
- **Yaya çeşitliliği:** pantolonlu, elbiseli, sırt çantalı, el çantalı figürler; çocuklar ve yaşlılar (daha yavaş,
  gri saçlı); ten, saç ve kıyafet renkleri kişi başına; bazıları çift yürür, çocuklar hep bir yetişkinle.
- **Daha detaylı binalar:** her büyüyen bina şablonunun 6 görünümü var; renk yanında yapı da değişir (kırma / beşik /
  düz teras çatı, çatı penceresi, veranda, garaj ve araba, çit, bahçe havuzu, kademeli kuleler, köşe kanatları,
  balkonlar, çatı su depoları ve klima üniteleri, tabela ve tenteler, testere dişi çatılar, silolar, kamyonlar).

### Aşama 8'de neler var
- **Kayıt sistemi (IndexedDB):** şehir tarayıcıda saklanır — yollar, binalar (durum, seviye, inşaat), bölgeler,
  elektrik hatları ve borular, bütçe ve hesap defteri, krediler, hane halkları, talep, oyun saati, kamera, başarımlar
  ve istatistik geçmişi. Arazi tohumdan yeniden üretilir; doluluk, şebekeler, hizmet kapsaması, arazi değeri ve trafik
  yüklemede yeniden hesaplanır. Rastgele sayı akışı da kaydedildiği için yüklenen şehir, kaydedilmeseydi nasıl
  devam edecekse öyle devam eder (birim testiyle doğrulanır).
  - **Kaydet:** Ctrl+S, üst çubuktaki disket düğmesi veya Ayarlar → Oyun. Aynı şehrin kaydının üzerine yazar;
    "Yeni kayıt olarak" ayrı bir kopya oluşturur.
  - **Otomatik kayıt:** her 1/3/5/10 dakikada bir (ayarlanabilir, kapatılabilir), sekmeden çıkarken ve ana menüye
    dönerken; şehir başına tek otomatik kayıt yuvası.
  - **Ana menü:** "Devam et" (en son kayıt), kayıtlı şehirler listesi (küçük resim, nüfus, bütçe, tarih), iki adımlı
    silme, **dosya olarak indirme (.json)** ve **dosyadan içe aktarma**. Bozuk / yabancı / daha yeni sürüm dosyaları
    açıklayıcı bir mesajla reddedilir; tanınmayan bina ve yol türleri uyarıyla atlanır.
- **Başarımlar (26):** ilk yol, ilk bölge, elektrik/su/kanalizasyon, nüfus hedefleri (100 → 10.000), 5 km yol,
  10 kavşak, karma şehir, kamu hizmetleri, 3. seviye bina, kesintisiz altyapı, mutlu şehir, tam istihdam, akıcı trafik,
  kârlı gün, hazine, kredi kapatma, 7 / 30 gün. Hepsi canlı şehir verisinden ölçülür, ilerleme çubuğuyla gösterilir,
  şehirle birlikte kaydedilir.
- **İstatistikler:** her oyun saatinde bir ölçüm (nüfus, mutluluk, bütçe, günlük gelir/gider, işsizlik, iş yeri,
  trafik yoğunluğu, işe ulaşım süresi, sağlık, suç, bölgelere göre bina sayısı). 1 gün / 7 gün / 30 gün / tümü
  aralıklı çizgi grafik, üzerine gelince değer; erişilebilirlik için tablo görünümü. Doldukça eski kayıtlar seyreltilir.
- **Optimizasyon:** 10 saniyelik yavaş simülasyon adımında elektrik/su şebekesi artık yalnızca bir şey değiştiğinde
  yeniden çözülüyor, çözücü tam ızgara dizilerini yeniden kullanıyor ve arazi değeri hücre başına geri çağırma yerine
  hazır dizilerle hesaplanıyor (adım ~5,7 ms → ~3,9 ms).
- **Sağlamlık:** arayüz çökerse şehir otomatik kayda yazılır; WebGL bağlamı koparsa şehir kaydedilip açıklayıcı
  hata ekranı gösterilir; ana menüde de bildirimler görünür.
- **Yayın:** `npm run build` → `dist/` (statik dosyalar, herhangi bir statik sunucuda çalışır; `npm run preview` ile denenir).

### Aşama 7'de neler var
- **Gündüz ve gece:** güneş oyun saatine göre doğar (06:00), yükselir ve batar (20:00); gün batımında sıcak ışık, gece ay ışığı,
  yıldızlar, karanlık gökyüzü ve sis. Gökyüzü aydınlatması (IBL) güneş belirgin hareket ettikçe yeniden hesaplanır.
  Ayarlardan döngü / hep gündüz / hep gece seçilebilir.
- **Gece ışıkları (gerçek verilere bağlı):** pencereler yalnızca **elektriği olan ve içinde insan bulunan** binalarda yanar —
  evlerde oturan sayısına göre (gece yarısından sonra azalır), dükkânlarda açıkken, işyerlerinde çalışana göre. Elektrik kesintisinde
  bina karanlık kalır. Her yolda sokak lambaları (sokak: tek taraf, cadde: iki taraf şaşırtmalı, bulvar: orta refüjde çift kollu)
  gece yanar ve yola ışık halkası düşürür. Araç farları ve stop lambaları gece yanar.
- **Bina modelleri:** cephe doku atlası (konut penceresi, ofis cam giydirme, dükkân vitrini, sanayi kaplaması); dükkânların
  zemin katı vitrin, üst katları konut. Her büyüyen bina şablonunun 3 görünümü var (duvar/çatı/vurgu rengi ve çatı biçimi —
  beşik veya **kırma çatı**). **LOD:** kapı, baca, çalı, çatı üniteleri gibi küçük parçalar uzaktan çizilmez.
- **Araçlar:** sedan, hatchback, SUV, panelvan, kutu kamyon ve tanker; tekerlekler, camlar, farlar, stop lambaları.
- **Ağaçlar:** rüzgârda salınım (her ağaç farklı fazda), yeni ince uzun kavak türü, bulvar refüjlerinde ve geniş kaldırımlarda
  sokak ağaçları.
- **Sesler (Web Audio ile üretilir, ses dosyası yok):** ortam sesi kameranın çevresini dinler — yoldaki araç sayısına göre trafik
  uğultusu (oyun duraklayınca kesilir), bina yoğunluğuna göre şehir uğultusu, ağaçlık alanda gündüz kuşlar / gece cırcır böcekleri,
  uzaklaştıkça rüzgâr. Efektler: yol, bina, hat, yıkım, bölgeleme, hata, nüfus hedefi. Ses ilk tıklamada başlar (tarayıcı kuralı).
- **Şehir girişi:** yeni şehir, haritayı baştan sona geçen ve şehrin arazisine girmeden yanından akan bir
  şehirlerarası yolla başlar; yol geniş kavislerle döner, keskin zikzak yapmaz. Şehre tek yol girer: bir kavşaktan
  ayrılan bağlantı yolu. Göçmenler, ziyaretçiler, ithal mallar ve ihracat bu yoldan geçer; ona
  bağlı olmayan sokaklarda bina yapılmaz ve kimse taşınmaz.
- **Resimli modeller:** binalar, araçlar, yayalar ve ağaçlar mürekkep kenarlı maket görünümünde (ekran filtresi
  değil, modelin kendi malzemesi). Katalog kartlarında binaların 3B küçük resimleri, yol kartlarında yol kesiti
  çizimi; yollar Sokaklar / Geniş yollar / Otoyol, konutlar Hepsi / Evler / Az katlı / Yüksek sekmelerinde.
- **Grafik ayarları:** ön ayar (otomatik/yüksek/orta/düşük) ve tek tek gölge kalitesi, çözünürlük ölçeği, ağaç ve bina detay
  mesafesi, en fazla araç, ışık parlaması (bloom), gündüz/gece. Bir değeri değiştirmek ön ayarı **Özel** yapar.
- **Araba sahipliği ve park:** bir evin sakinleri aile (2,3 kişi) sayılır; aile başına araba evin kime yapıldığına
  bağlıdır (mütevazı ~0,3, orta ~0,55, varlıklı ~0,95; seviye ve yüksek eğitim biraz artırır). İşe ve alışverişe
  yalnızca arabası olanlar arabayla gider; ötekiler yürür ya da otobüse biner. Her yolun park yerleri vardır: evlerin
  kendi garaj / bahçe yerleri, sokaktaki açık (40) ve katlı (160) otoparklar, otoparklı yolların park şeritleri.
  Arabalar saate göre yer değiştirir (gece evde, gündüz işte ve dükkânlarda). Yer bulamayan kaldırıma kaçak park
  eder; polis kapsaması olan yerlerde bir kısmına ceza kesilir (bütçede "Park cezaları"). Kaçak yer de yoksa araç
  dönüp durur: Kent Sesi ve danışman bunu söyler. Ekranda araç kaybolmaz: yolculuğun sonunda kaldırımdaki boş
  yere park eder ya da arsaya / garaja döner, yolculuk park edilmiş bir arabanın yanından başlıyorsa o araba
  park yerinden çıkar; uzun süre takılan araç kenara çeker, yol ağı değişince o an yoldakiler olduğu yerde park
  eder. Sokaklarda görünen park etmiş arabalar park modelinin o sokak için hesapladığı sayıdır.
- **Otoparklar (Hizmetler → Ulaşım ve otopark):** Sokak Otoparkı (1×2, 6 araç, ₺450), Açık Otopark (2×2, 40),
  Katlı Otopark (2×2, 160; 300 nüfus), Yeraltı Otoparkı (2×2, 220, üstü park; 1.000 nüfus). Her biri önündeki
  yolun park yerlerine eklenir. "Sokağa park şeridi" yol aracını yenileme kipinde açar: tıklanan sokak iki yanı
  park şeritli Otoparklı Sokak olur. Hizmet seçicisi sekmelere ayrıldı (Güvenlik, Sağlık, Eğitim, Ulaşım ve otopark,
  Parklar) ve ekrandan taşmaz; itfaiye Güvenlik sekmesindedir (500 nüfusta açılır).
- **Park manevrası:** araç park yerine şeritte ilerleyip yanaşarak girer, park yerinden önce yana açılıp sonra
  şeride katılarak çıkar. Kaçak park edenler yarısı kaldırımda durur, yoldan geçen araçların önünü kesmez.
- **Şehir Giriş Bulvarı:** şehirlerarası yoldan şehre giren yol şehrin en geniş yoludur: 32 m, 6 şerit, ortası
  ağaçlı refüj. Eski kayıtlar yüklenince yolun yeni genişliğine düşen binalar geri çekilir (yer yoksa yıkılır) ve
  oyun bunu bildirir.
- **Yer açma:** hizmet ve diğer binalar başka binaların üzerine kurulabilir; araç arsadaki binaları turuncu
  önizlemeyle gösterir ve kurarken yıkar (oyuncu binalarının yarı fiyatı iade edilir). Bir yolu daha geniş bir
  yola dönüştürürken yeni yolun üzerine gelen binalar yoldan uzağa 1–3 hücre geri çekilir (aynı bina, sakinleri
  ve seviyesiyle); yer bulamayanlar yıkılır. Plan kartı kaç binanın çekileceğini / yıkılacağını yazar.
- **Yeni yollar:** Patika (3 m, araçsız, bina aralarından geçer, yanında imar açılmaz), Ağaçlı Refüjlü Sokak (2 şerit,
  ortası ağaçlı), Çimli Refüjlü Cadde (4 şerit, ortası çimli). Yaya Yolu 6 m'den 5 m'ye indi.
- **Derinlikli cepheler:** pencere camları duvarın 35 cm içinde çizilir (paralaks: bakış açısıyla pencere
  pervazları görünür, girinti gölgelidir); üçgen eklemez.
- **Otobüs modeli:** beyaz gövde, hat renginde bel şeridi ve tavan kenarı, pencere dizisi ve dikmeler, geniş ön cam,
  turuncu hat tabelası, farlar ve stop lambaları, kaldırım tarafında iki camlı kapı, aynalar, tavan kliması, jantlı
  tekerlekler.
- **Şehirde yürü (I ya da üst çubuktaki yürüyen adam):** kameranın baktığı yere en yakın sokağın kaldırımında, yol
  boyunca bakarak göz hizasına (1,7 m) inilir. W A S D yürür, Shift koşar, haritaya tıklayınca fare kilitlenir ve
  fareyle bakılır (ya da Q / E ile dönülür), Esc ya da "Şehre dön" çıkar ve kamera yürüyüşün bittiği yere döner.
  Binalar (çizildikleri yerde) ve köprüsüz su yürüyeni durdurur, duvar boyunca kayar; yollarda yol yüzeyine, başka
  yerde araziye basar. Yürürken inşaat araçları gizlenir, haritaya tıklamak bir şey kurmaz; simülasyon sürer.
- **Görünüm (Ayarlar → Grafik):** Standart, Yumuşak (sıcak, yumuşak ışık, ince çizgiler), Kasvetli (bulutlu, soğuk,
  soluk) ve Canlı (doygun renkler, belirgin kontur). Güneş ve gök ışığını, pusu, kontur kalınlığını ve son görüntünün
  doygunluk / kontrast / tonunu değiştirir; Standart ek maliyet getirmez, diğerleri tek bir tam ekran geçişi ekler.
  **Günün saati:** Döngü (oyun saati), Sabah, Gündüz, Akşam, Gece — yalnızca ışık; simülasyon saati değişmez.
  Gün doğumu ve batımı yumuşak: güneş ufuk yakınında daha yavaş yükselir, gece→gündüz geçişi ~90 oyun dakikası sürer
  ve ana ışık güneşten aya sıçramadan, yönü ve rengi karışarak geçer.
- **Cephe çeşitleri:** her cephe stilinin (konut, ofis, dükkân, sanayi) dört pencere tasarımı var (panjurlu, Fransız
  balkonlu, kemerli, şerit pencereli, kanatlı cam, tuğla…); hangisi olduğu binanın konumundan seçilir, komşular
  farklı görünür. Yere değen duvarların zemin katı ayrı çizilir: kapılar, vitrinler, tenteler, lobi camları, sanayi
  kepenkleri. Hepsi tek bir doku atlasında; üçgen sayısı artmaz, gece ışıkları aynı biçimde yanar.
- **Performans:** ağaçların ayrıntılı modeli artık yalnızca yakında çizilir (yüksek ön ayarda 380 m; eskiden 600 m),
  kayaların da uzak için sade modeli var; bina havuzları görüş alanı dışında kalınca (gölge geçişinde de) çizilmez,
  küçük bina ayrıntıları gölge düşürmez. Yüksek ön ayarda çözünürlük sınırı 1,5. Ölçülen: ~300 binalı bir test
  şehrinde uzak görünümde çizim çağrısı ~785 → ~386, üçgen ~1,8 M → ~0,54 M. Kayıtlı ayarlar bir ön ayardaysa o
  ön ayarın güncel değerlerini alır.
  **Ses ayarları:** ana ses, ortam, efekt, sessiz. Ayarlar tarayıcıda (localStorage) saklanır; şehir kaydı Aşama 8'de.

### Aşama 6'da neler var
- **Trafik modeli (vatandaş başına ajan yok):** haneler işe ve alışverişe, sanayi dükkânlara yük taşır. Günlük seferler saatlik
  profillerle dağıtılır (sabah ve akşam yoğun saatleri, oyun saatine göre). Hedef seçimi çekim modeliyle (büyüklük × seyahat süresi).
- **Rota ve kapasite:** seferler yön bazlı şerit ağında seyahat süresine göre yönlendirilir (Dijkstra, kavşak gecikmesi; otoyol tek yön).
  Yol türünün kapasitesi aşıldıkça süre BPR eğrisiyle uzar; her güncellemede akışlar harmanlanır, sıkışan yoldan **alternatif rotalara** kayar.
- **Araçlar:** kameraya yakın yollarda gerçek 3D otomobil ve kamyonlar; her biri modelin verdiği gerçek rotayı izler (kavşaktaki dönüş
  rotadan gelir), yolun o anki sıkışık hızında, sağ şeritte ve öndeki araçla mesafe koruyarak gider. Sayısı görünen yollardaki araç
  yüküne bağlıdır; grafik kalitesine göre üst sınır vardır.
- **Trafik haritası (T veya Katmanlar):** her yolun her yönü akıcı → yoğun → kapasite aşıldı → tıkalı renginde.
  Yol inceleyicisinde iki yönlü akış, doluluk ve ortalama hız; Şehir sekmesinde yoldaki araç, sefer/saat, ortalama yoğunluk/hız,
  ortalama işe ulaşım süresi, tıkalı yol uzunluğu ve rota bulamayan yolculuklar.
- **Mutluluk:** uzun/sıkışık işe ulaşım ve işe hiç ulaşamamak mutluluğu düşürür; gürültü de etkiler. Nüfus sekmesinde
  mutluluğun etken etken dökümü (sakin ağırlıklı); yeni **Mutluluk** katmanı.
- **Kirlilik ve gürültü:** trafik egzozu (dur-kalkta artar) hava kirliliğine eklenir; trafik, sanayi ve işlek dükkânlar **gürültü**
  üretir (yeni katman). Gürültü arazi değerini ve sağlığı düşürür.
- **Eğitim ve sağlık:** Sağlık ve Eğitim katmanlarında binalar artık sakinlerin gerçek sağlık ve eğitim düzeyine göre renklenir;
  kirlilik ve gürültü sağlığı etkiler.
- **Düzeltme:** oyun saati (08:00 başlangıcı) artık motor ve arayüzde ortak; trafik yoğun saatleri ekrandaki saatle eşleşir.


### Aşama 5'te neler var
- **Elektrik (P):** Kömür Santrali (20 MW, kirletir) ve Rüzgâr Türbini (1,5 MW). Elektrik bitişik binalar üzerinden
  (1 hücrelik aralıkla) ve çizilen **elektrik hatları** boyunca iletilir; direkler ve sarkan teller görünür.
  Her şebeke parçası kendi üretimi kadar tüketiciye enerji verir.
- **Su ve kanalizasyon (U):** Su Pompası ve Atık Su Deşarjı nehir/göl kıyısına kurulur; Su Kulesi her yere.
  **Borular** şebeke oluşturur: borudan 5 hücre içindeki binalar su ve kanalizasyon hizmeti alır, tesis boruya 2 hücre içinde olmalıdır.
  Deşarj suyu kirletir; Arıtma Tesisi (1.000 nüfus) kirletmez.
- **Kamu hizmetleri (J):** Polis (500), İtfaiye (500), Hastane (1.000), İlkokul ve Lise (1.000), Çöp Toplama, Mahalle ve Şehir Parkı.
  Her tesisin etki yarıçapı ve kapasitesi var; kapasite aşılınca kapsama zayıflar.
- **Etkiler:** elektriksiz/susuz konutlar mutsuz olur ve uzun süre hizmetsiz kalan binalar terk edilir; seviye 2 için elektrik + su,
  seviye 3 için ek olarak kanalizasyon ve en az iki kamu hizmeti gerekir. Suç işsizlik ve şehir büyüklüğüyle artar, polis düşürür.
  Hastane sağlığı (yaşlı ölümlerini) etkiler; okullar gençlerin eğitim düzeyini belirler. Yangınlar çıkar: itfaiye kapsamında söner,
  kapsam dışında bina yanıp yıkılır. Çöp toplanmazsa mutluluk ve arazi değeri düşer.
- **Bilgi katmanları (L):** elektrik, su, kanalizasyon, polis, suç, itfaiye, sağlık, eğitim, çöp, arazi değeri, kirlilik —
  zemin rengi ve bina renkleriyle, lejantla. Altyapı araçları ilgili katmanı otomatik açar.
- **Sorun simgeleri:** elektriksiz, susuz, kanalizasyonsuz, çöp, yangın, yol erişimi yok.
- **Bütçe:** elektrik, su ve kamu hizmetleri bakım satırları artık gerçek (tesisler + hat/boru metre başına).
  Şehir sekmesinde arz/talep çubukları ve hizmet kapsamı; inceleyicide binanın elektrik/su/kanalizasyon ve hizmet durumu.


### Aşama 4'te neler var
- **Vergiler:** Konut / Ticaret / Sanayi oranları %0–29 (nötr %9), Bütçe sekmesindeki kaydırıcılarla.
  Konut vergisi çalışanların ücretlerinden, ticaret ve sanayi vergisi işletme kârından (seviye ve müşteri sayısına bağlı) alınır.
- **Etkiler:** nötrün üstündeki her puan konut mutluluğunu ve ilgili bölge talebini düşürür (altında artırır); mutluluk göçü belirler.
- **Giderler:** yol bakımı (metre başına, tür bazlı) ve belediye binası bakımı her gün tahsil edilir.
- **Bütçe raporu:** günlük gelir/gider kalemleri, bugünkü gerçekleşen hareketler, son 14 günün net grafiği, üst çubukta tahmini haftalık net.
- **Bütçe açığı:** bakım ve kredi ödemeleri bakiyeyi eksiye düşürebilir; açıkta inşaat yapılamaz, mutluluk düşer, uyarılar çıkar (iflas eşiği −₺25.000).
- **Krediler:** ₺20.000 / ₺50.000 / ₺100.000 (faizli, günlük taksit), en fazla 2 kredi, erken kapatma.
- **İş gücü:** işler eğitim düzeyi ister (fabrika çoğunlukla eğitimsiz, ofis yüksek eğitim); eğitimli işçi alt işlere geçebilir, tersi olmaz.
  Nüfus sekmesinde eğitim düzeyine göre işsizler ve boş işler; binaların günlük vergisi inceleyicide.
- **Denge:** yol ve belediye binası bakım ücretleri bakımın gerçek bir karar olması için artırıldı.

### Aşama 3'te neler var
- **Bölgeleme (Z):** Konut (yeşil), Ticaret (mavi, 100 nüfusta açılır), Sanayi (sarı, 250 nüfusta açılır).
  "Yol kenarı" seçimi (imlecin olduğu taraf, parsel derinliği 1–4 hücre; sürükleyerek birden çok sokak) veya fırça (1×1 / 3×3 / 5×5), "Kaldır" ile silme.
  Yalnızca yoldan 4 hücre içindeki, sahip olunan, kuru ve düz araziler bölgelenebilir; otoyol kenarı bölgelenemez.
  Farklı bölgeyle üzerine boyanan arsadaki bina yıkılır.
- **Otomatik gelişim:** talep olan bölgede yola bakan uygun arsa bulunur, şablon seçilir, inşaat alanı kurulur ve bina tamamlanır.
  28 veri tanımlı şablon (her bölge × 3 seviye × 1×1 / 1×2 / 2×2 parsel); modeller data/buildings.ts içindeki parametrelerden üretilir.
- **Seviyeler:** arazi değeri, doluluk ve (konutta) mutluluk eşikleri aşılınca bina bir üst seviyeye geçer (ev → apartman → konut kulesi).
  İnceleyicide "Seviye N için" eksikler listelenir.
- **Arazi değeri ve kirlilik:** yol erişimi, su manzarası ve simge yapılar (Meydan, Saat Kulesi, Anıt, Belediye) değeri artırır; sanayi kirletir ve değeri düşürür.
- **Nüfus (gruplandırılmış simülasyon):** her konut binası bir hane grubu; yaş grupları, eğitim, istihdam, gelir düzeyi, mutluluk.
  Göç (şehrin çekiciliğine göre), doğum, yaşlanma, ölüm, mutsuzlukta göç.
- **Talep (RCI):** boş konut, işsizlik ve iş yeri ihtiyacından hesaplanır; alt köşedeki göstergede gösterilir.
- **Terk edilme:** yol erişimini kaybeden bina terk edilir ve bir süre sonra kaldırılır.
- **Kilometre taşları:** 100 / 250 / 500 / 1.000 / 2.500 / 5.000 nüfusta bildirim ve kilit açma (Ana Cadde, Bulvar 2.500; Otoyol 5.000).
- **Performans:** bitki örtüsü LOD/hücre düzenlemesiyle örnek bir şehir görünümünde üçgen sayısı 5,2 M → 1,5 M.

### Aşama 2'de neler var
- **Yol ağı:** düğüm–kenar grafiği (`RoadGraph`), ikinci dereceden Bézier eğrileriyle düz ve kavisli yollar.
- **Çizim:** tıkla-tıkla veya sürükle-bırak; yol bittiği yerden devam eder. Kavisli modda başlangıç → kontrol → bitiş.
- **Bağlantılar ve kavşaklar:** uçlar mevcut kavşaklara/yollara yapışır; kesişmeler otomatik kavşağa dönüşür (T, dört yol, çoklu).
- **Doğrulama:** eğim, viraj yarıçapı, kavşak aralığı, dar açı, çakışma, bina üzerinden geçme, kilitli arazi, köprü (yalnız köprü destekli türler), bütçe.
- **Köprüler:** su üzerinde güverte, rampalar (%10), ayaklar.
- **Görünüm:** şerit çizgileri, kaldırımlar, refüj — hepsi `data/roads.ts` verisinden shader ile; parça başına değil chunk × tür başına birleştirilmiş mesh.
- **Yenileme:** mevcut yolu başka türe dönüştürme (yeni maliyet − eski yolun %50 iadesi).
- **Binalar:** veri odaklı katalog (`data/buildings.ts`) — model parçaları da veride. Belediye Binası (tek), Kent Meydanı, Saat Kulesi, Cumhuriyet Anıtı. Yola bakma şartı, otomatik yönlenme, R ile döndürme, eğim/su/çakışma kontrolü, temel kaidesi.
- **Yıkım:** yol parçası veya bina; %50 iade.
- **Bütçe:** inşaat bedeli gerçekten düşülür (`Treasury`); yetersiz bütçede inşaat engellenir.
- **Ağaç temizleme:** yol ve binaların altındaki ağaçlar kaldırılır.
- **Seçim:** bina / yol / hücre bilgileri; Şehir sekmesinde yol uzunluğu, kavşak, çıkmaz, bina ve harcama istatistikleri.

Henüz yok (planlı aşamada gelecek): peyzaj aracı, gece/gündüz, ses ve gelişmiş araç modelleri (7), kayıt ve başarımlar (8);
toplu taşıma ve tünel planlanmadı (ileride).

## Çalıştırma

```powershell
npm install          # bağımlılıklar
npm run dev          # geliştirme sunucusu → http://localhost:5173
npm test             # Vitest birim testleri
npm run test:e2e     # Playwright tarayıcı testi (ilk sefer: npx playwright install chromium)
npm run build        # production derlemesi → dist/
npm run preview      # derlemeyi yerelde sun
```

Gereksinim: Node.js 20+ ve WebGL 2 destekli masaüstü tarayıcı.

## Kontroller

| Tuş | İşlev |
| --- | --- |
| W A S D / Oklar | Kamera hareketi (Shift: hızlı) |
| Fare tekerleği | İmlece doğru yakınlaş/uzaklaş |
| Sağ fare sürükle | Döndür + eğ |
| Orta fare sürükle | Kaydır |
| Q / E | Döndür |
| Sol fare | Seç / yerleştir |
| ESC | İşlemi iptal / araçtan çık |
| Space | Duraklat |
| 1 / 2 / 3 | Oyun hızı |
| V / Y / Z / B / X | Seçim / Yol / Bölgeleme / Bina / Yıkım aracı |
| M | Bina taşıma aracı |
| Ctrl+Z / Ctrl+Y | Bina işlemini geri al / yinele |
| P / U / J | Elektrik / Su / Hizmetler aracı |
| L | Bilgi katmanları |
| T | Trafik yoğunluğu katmanı |
| [ / ] | Fırça boyutu / parsel derinliği |
| Ctrl (yol) | Izgara ve açı yakalamayı kapat |
| Sağ tık (yol) | Çizimi iptal et |
| R | Binayı döndür |
| G | Izgara |
| C / Home | Şehir merkezine dön |
| F | Seçime odaklan |
| H / F1 | Kontroller penceresi |
| K | Trafik düzenleme (Tab: mod değiştir) |
| Ctrl+S | Şehri kaydet |

## Mimari

Oyun çekirdeği (`src/game`) React'ten bağımsızdır. React yalnızca HUD'u çizer;
motorla iletişim `EventBus` olayları → `store/gameBridge.ts` → Zustand ile kurulur.

```
src/
  game/
    core/        Game (orkestratör), Input, EventBus, config, settings (grafik/ses ayarları), olay tipleri
    camera/      CameraController (yörünge kamera, sönümleme, sınırlar)
    rendering/   SkyEnvironment, Lighting, QualityManager, materials/TerrainMaterial
    world/       World, Heightfield, WorldGrid, UnlockMap, OuterGrid, TerrainMeshes,
                 Vegetation, Water, TerrainPicker, generation/ (gürültü, arazi, worker protokolü)
    entities/    TreeModels; road/ (curve, RoadGraph); building/ (BuildingPlacement, BuildingRegistry, BuildingModels);
                 infra/ (UtilityLines: elektrik hatları ve borular)
    tools/       ToolManager, SelectTool, RoadTool, BuildingTool, MoveTool, LineTool, DemolishTool, TrafficTool, ZoneTool,
                 placement/ (snapping, RoadPlanner, RoadPreview)
    rendering/   … roads/ (roadGeometry, RoadMaterial, RoadRenderer), BuildingRenderer, PowerLineRenderer,
                 InfoLayers + InfoLayerView (bilgi katmanları), ProblemIcons, VehicleRenderer + VehicleModels (3D araçlar),
                 TrafficOverlay (trafik haritası), DayNight (gündüz/gece), StreetFurniture (lambalar, sokak ağaçları),
                 PostProcessing (bloom), windowLights, foliage (rüzgâr), nightUniform
    audio/       AudioEngine (prosedürel ortam sesi ve efektler)
    simulation/  SimScheduler, CitySimulation (büyüme, nüfus, talep, seviye, terk), Population, Demand,
                 LandValue, LotFinder, Workforce (eğitim-iş eşleştirme), Utilities (elektrik/su/kanalizasyon şebekeleri),
                 Services (kapsama alanları, suç), traffic/TrafficModel (sefer üretimi, çekim modeli, rota ataması, BPR)
    systems/     City (yollar + binalar + doluluk + hazine), Treasury (kategorili hareketler), Economy (vergi, rapor, kredi),
                 Achievements (görevler, ödüller, şehir seviyesi), StatsHistory (istatistik geçmişi), UndoHistory (geri al / yinele)
    data/        roads.ts, buildings.ts (özel + bölge şablonları), infrastructure.ts (santral, su, hizmet binaları, hatlar),
                 zones.ts, economy.ts (vergi, ücret, kredi ayarları)
    world/       … ZoneMap (bölgeler + boş arsa dizini), Occupancy
    save/        CitySave (kayıt biçimi, serileştirme, doğrulama), SaveStore (IndexedDB / bellek arka ucu)
  workers/       worldgen.worker.ts (dünya üretimi Web Worker'da)
  ui/            hud, toolbar, panels, menus, notifications, components
  store/         Zustand store + motor köprüsü + saveManager (kayıt yuvaları, otomatik kayıt, içe/dışa aktarma)
tests/unit       Vitest   ·   tests/e2e   Playwright
```

### Dünya
- 256×256 hücre, hücre 8×8 m (2,05 km kare), 32×32 hücrelik 64 chunk (her biri ayrı frustum culling).
- Başlangıçta merkezdeki 2×2 arazi karosu (%25) şehre ait; diğerleri kilitli (satın alma ekonomiyle gelir).
- Tohum tabanlı deterministik arazi: merkezde düzlükler, kenarlarda tepeler, menderesli nehir, göl,
  harita dışında ufka uzanan dağlar (geometrik aralıklı tek bir halka mesh).
- Ağaçlar/kayalar: hücre bazlı InstancedMesh, mesafeye göre yüksek/düşük LOD.

### Performans teknikleri (Aşama 1)
InstancedMesh, chunk bazlı frustum culling, bitki örtüsü LOD'u, analitik yükseklik alanı ray-march ile
zemin seçimi (üçgen raycast yok), GPU tarafı ızgara/vurgulama (ek geometri yok), önceden ayrılmış
önizleme tamponları, Web Worker'da dünya üretimi, sabit zaman adımlı simülasyon, dar Zustand
seçicileri, kamera izleyen sıkı gölge kamerası, otomatik grafik kalitesi.

## Yol haritası
1. ✅ Oyun çekirdeği · 2. ✅ İnşaat (yol ağı, kavşaklar, köprüler, binalar, yıkım) · 3. ✅ Bölgeleme ve nüfus · 4. ✅ Ekonomi ·
5. ✅ Altyapı ve hizmetler · 6. ✅ Trafik ve gelişmiş simülasyon · 7. ✅ Görsel kalite, gece/gündüz, ses · 8. ✅ Kayıt, başarımlar, yayın
