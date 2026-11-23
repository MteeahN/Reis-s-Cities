# Reis's Cities

Tarayıcıda çalışan, stilize gerçekçi 3D şehir kurma ve yönetme simülasyonu.
**Mevcut durum: Aşama 8 — Kayıt, başarımlar, yayın (v0.8.0)** — 8 aşamalık planın tamamı bitti.

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
  Stiller yalnızca renk değil yapı da değiştirir: kiremit ve mansart çatılar, panjurlar, ferforje balkonlar, çizgili
  tenteler (Avrupa); geniş saçaklı uçları kalkık çatılar, pagoda tepeler, fenerler, neon tabelalar (Asya); beyaz
  badana, teras çatılar, pergolalar, kemerler, begonviller (Akdeniz); cumbalar, geniş saçaklar, kubbeli çarşılar
  (Osmanlı). Stil kayıtta saklanır. Altı stil daha: İskandinav (koyu kırmızı ahşap, beyaz pervazlar, dik ve çimen
  çatılar), Arap (kerpiç, mazgallı düz çatılar, meşrebiye kafesleri, rüzgâr kuleleri, kubbeler), Slav (pastel sıva,
  oymalı pencere süsleri, soğan kubbeler), Amerikan (verandalı ahşap evler, yangın merdivenleri, çatı su tankları),
  Orta Çağ (yarım ahşap çatkı, çıkma katlar, köşe kuleleri), Fütüristik (ışık şeritleri, cam kubbeler, halkalar).
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
- **Grafik ayarları:** ön ayar (otomatik/yüksek/orta/düşük) ve tek tek gölge kalitesi, çözünürlük ölçeği, ağaç ve bina detay
  mesafesi, en fazla araç, ışık parlaması (bloom), gündüz/gece. Bir değeri değiştirmek ön ayarı **Özel** yapar.
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
    tools/       ToolManager, SelectTool, RoadTool, BuildingTool, LineTool, DemolishTool,
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
                 Achievements (başarımlar), StatsHistory (istatistik geçmişi)
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
