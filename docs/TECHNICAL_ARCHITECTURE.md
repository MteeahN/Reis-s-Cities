# Reis's Cities — Teknik Mimari

## Yığın

TypeScript, Three.js (WebGL 2), React 19 (yalnızca HUD), Zustand, Vite, Vitest, Playwright.
Kayıtlar IndexedDB'de (`save/SaveStore.ts`, ince bir sarmalayıcı; Dexie gerekmedi). Kayıt doğrulaması elle
yazılmış şema kontrolüyle yapılır (`save/CitySave.ts → validateSave`); bilinmeyen veriler atılır, bozuk kayıt
oyuncuya açık bir hata mesajıyla reddedilir.

## Katmanlar

```
React HUD (src/ui)  ←  Zustand store (src/store)  ←  EventBus olayları  ←  Game (src/game/core/Game.ts)
                                                                         ├─ City (oyun durumu, tüm değişiklikler buradan)
                                                                         ├─ CitySimulation + SimScheduler (sabit adım)
                                                                         ├─ ToolManager (tek aktif araç)
                                                                         └─ Renderer'lar (Three.js sahnesi)
```

- Motor React'ten bağımsızdır. UI motoru yalnızca `getGame()` üzerinden genel API ile çağırır
  (`setTool`, `undo`, `setGraphics`…); motor UI'ya yalnızca olay gönderir.
- **City** tek doğruluk kaynağıdır: yol grafı, bina kaydı, hücre doluluğu, bölgeler, hazine. Para, doluluk ve
  bölge her işlemde birlikte güncellenir.
- **Renderer'lar** `RoadGraph.onChange` ve `BuildingRegistry.onChange` olaylarını dinleyip yalnızca değişen
  parçayı yeniden kurar.

## Simülasyon

- `SimScheduler` gerçek zamandan bağımsız sabit adımlarla ilerler (1×, 2×, 3×, duraklat).
- Ekonomi günlük, büyüme ve nüfus belirli adım aralıklarında hesaplanır; her karede değil.
- Trafik toplu (agregat) modeldir; görünen araç ve yayalar bu modelin akışından örneklenir. Görünen araçlar
  aynı şeritte ve döndükleri yolda öndeki araçla mesafe korur; bir kavşaktan aynı anda tek yönden geçilir
  (yalnızca ışıksız kavşaklarda; ışıklar akışları zaten ayırır). 30 oyun saniyesi kıpırdamayan görünür araç
  sahneden çıkar: görünen araçlar toplu akışın bir örneğidir, bir blok etrafında kilitlenen kuyruk böylece çözülür.
- Dış bağlantı: `City.entries` şehirlerarası yolun harita kenarındaki iki ucudur, `City.entryLink` şehre giren
  bağlantı yolunun ucudur (ikisi de kayıtta saklanır). Rota `systems/HighwayRoute.ts` ile 16 m'lik ızgarada A*
  aranır: maliyet eğimin karesiyle artar, su köprü maliyeti ekler, şehrin arazisi (ve 40 m'lik pay) ek maliyetle
  kaçınılır. Yol Ramer–Douglas–Peucker ile sadeleştirilir, 60 m'den dar dönecek köşeler atılır (`relaxCorners`),
  kalan köşeler ikinci derece B-spline parçalarına çevrilir (`smoothPieces`: her köşe, iki bacağın orta noktaları
  arasındaki Bézier'in kontrol noktası olur; parçalar aynı yönle birleşir).
  `City.outsideEdges()` uçlardan ulaşılabilen yolları bulur; göç, inşaat ve trafik modelinin dış yolculukları
  bunu kullanır (yolculuklar iki uca eşit bölünür).
- Yükseklik: `RoadNode.y` yolun yerden yüksekliğidir (kayıtta `el`); kenar boyunca uçlar arasında doğrusal
  (`RoadGraph.elevationAt`). Planlayıcı kesişmede yükseklik farkı `OVERPASS_CLEARANCE` (6 m) veya fazlaysa kavşak
  kurmaz (üst geçit), 0,5–6 m arasında hata verir; çakışma ve uç kontrolleri de yüksekliğe bakar. Yerden 2 m'den
  yüksek kısım köprü fiyatıyla ödenir. `RoadRenderer` düğüm yüksekliğine `y`'yi ekler; köprü yan duvarları ve
  ayaklar mevcut köprü kuralından gelir. Yükseltilmiş kenarlar bölgeleme ve bina bağlantısına sayılmaz.
- Döner kavşak: `tools/placement/Roundabout.ts` kolları yarıçapta `splitEdge` ile keser, eski kavşağa uzanan
  parçaları siler ve kesim noktalarını tek yönlü (`oneway2`) çember yaylarıyla bağlar (150°'den geniş aralara ara
  düğüm). Yön, sağdan trafik için ortası solda kalacak biçimdedir.
- Serbest / yay yol: `tools/placement/pathShapes.ts` çizgiyi seyreltir, sadeleştirir, dar köşeleri atar ve B-spline
  parçalarına çevirir (yay: üç noktadan geçen çember, en çok 60°'lik parçalar). `City.buildRoadPath` parçaları sırayla
  planlayıp kurar; biri geçersizse ağı `applySnapshot` ile ve parayı geri koyar.
- Kaplama: `RoadEdge.surface` (kayıtta `sf`), bölünmede korunur; yol malzemesi anahtarı türe, tek yöne ve kaplamaya
  göredir, desen dünya koordinatında çizilir.
- Arazi: `City.editTerrain` yükseklik alanını fırçayla değiştirir (yol/bina/kilitli hücrelere değen köşeler sabit),
  `World.refreshTerrain` hücreleri yeniden sınıflar ve etkilenen parçaların geometrisini yeniden kurar. Değişen
  köşelerin son yükseklikleri `terrainEdits` olarak kaydedilir ve yüklemede yollardan önce uygulanır; her basış
  bir `terrain` geri alma girdisidir.
- Hemen yükseltme: `CitySimulation.canUpgrade / upgradePrice / upgradeNow`; seviye gereksinimleri otomatik büyümeyle
  aynıdır, yalnızca bekleme süresi atlanır. Geri alma girdisi binanın önceki şablonunu ve seviyesini tutar.
- Park: `simulation/Parking.ts`. `homeCars` aile ve araba sayısını, `carShare` arabayla yapılan iş / alışveriş
  payını verir; `TrafficModel` ev kökenli seferleri bununla çarpar. `ParkingModel.update` trafik adımında yol
  parçası başına talep (saate göre evde / işte / dükkânda araç, binanın kendi yeri düşülerek) ile kamuya açık arzı
  (park şeritleri, `PARKING_BUILDINGS`) karşılaştırır; taşan kaçak, kaçak sınırını aşan "yer bulamayan" olur, ceza
  polis alanıyla çarpılır (`parkingFines`). `VehicleRenderer` görünür yollara modelin sayısınca park etmiş araba
  koyar, varan aracı boş yere ya da arsaya (`enter` animasyonu) alır, başlayan yolculuğu park yerinden çıkarır.
- Yer açma: `City.planBuilding(…, bulldoze)` arsadaki binaları `plan.bulldoze` olarak verir; `placeBuilding` önce
  onları yıkar. `City.planUpgrade` yolun üzerindeki binalar için `roadDisplacement` (geri çekme hedefi ya da yıkım)
  hesaplar, `upgradeRoad` uygular (`relocateBuilding` → `BuildingRegistry.relocate`, kimlik korunur). Yol eklenince
  yakındaki binaların kaldırım hizası (`resnapNear`) yeniden hesaplanır.
- Cephe derinliği: facade gölgelendiricisi türev tabanlı bir TBN ile bakış yönünü duvar çerçevesine alır, cam maskesini
  (parlama atlası) derinlik sayıp atlas koordinatını kaydırır ve girintiyi karartır.
- Yürüyüş: `camera/WalkController.ts` saf mantıktır (göz yüksekliği, hız, eksen eksen kayarak çarpışma); Game ona
  `walkGround` (yol profili ya da arazi) ve `walkBlocked` (`City.buildingAtWorld`, köprüsüz su) verir. Yürürken
  `cameraCtl.update` çağrılmaz; `cameraCtl.target/distance` yürüyene eşitlenir ki ağaç / bina LOD'u, trafik ve gölge
  kamerası yakın çekimi görsün. İşaretçi olayları araçlara gitmez; tıklama fare kilidi ister (`Input` kilitliyken
  hareketi bakış olarak sayar).
- Görünümler: `rendering/Looks.ts` (`LOOKS`); `DayNightCycle.look` güneş / gök ışığı, pozlama ve pusu çarpanlarını
  uygular, `inkScaleUniform` tüm `patchInk` malzemelerinin kontur gücünü ölçekler, `PostProcessing.setLook` gerekirse
  son geçişte doygunluk / kontrast / ton uygular (bloom kapalı ve görünüm Standart ise kompozitör hiç kullanılmaz).
- Cephe atlası: 4 sütun × 8 satır (256 px karo). Satır 0–3 üst katlar (stil), 4–7 zemin katlar; sütun tasarım çeşidi.
  `aTile` = stil (+10: duvar yere değiyor). Gölgelendirici çeşidi örnek konumunun karmasından, zemin katta kapıyı
  bölme karmasından seçer.
- LOD / ayıklama: `Vegetation.update` hücre eşik geçişinde görünürlüğü değiştirir (her karede değil); kayaların
  `rockLow` modeli var. `InstancePool` örnek değişince sınır küresini sıfırlar ve `frustumCulled` açıktır;
  ayrıntı havuzları gölge düşürmez.
- Yola mıknatıs: `City.magnetPlan` imlece en yakın (yüksek olmayan, otoyol olmayan) yol noktasının teğetinden açıyı,
  `layFront` ile kirişe paralel ön yüzü ve kaldırıma uzaklığı bulur; çakışmada teğet boyunca kayar, komşuya yanaşır.
  `planFree` doğrular: değilen hücreler (`freeCells`, yol hücreleri hariç), çizilen dörtgenlerin çakışması, yol yüzeyi,
  eğim. Bina en yakın çeyrek dönüşe göre bir ızgara parseline dosyalanır (i, j, w, d, rot) ve çizim farkı ox / oz / oyaw
  olarak sabit kalır; `PlacedBuilding.free` kapladığı hücrelerdir (kayda yazılır, `snap` uygulanmaz). Geri alma `Spot.free`,
  yol erişimi `City.roadAccessOf` ile. `magnetSlide` kaydırma ve komşuya yanaşmayı (yakın olan tarafa) yapar.
- Paylaşılan hücreler: `Occupancy.setBuilding` dolu bir hücreye ikinci bina yazınca ikisini `shared` haritasında tutar;
  `clearBuilding` hücreyi kalan sahibe bırakır, `ownersAt(k)` hepsini verir. `freeCells` yalnızca serbest (yola dönmüş)
  binaların hücresini paylaşmaya izin verir; ızgara binasının hücresi dolu sayılır. Bölgeleme `ownersAt` ile bakar.
- Eğik yolda büyüme: `City.spawnGrowable` önce `growAlongRoad(lot)` dener: parsel ızgaraya ±3°'den fazla açılı bir yola
  bakıyorsa bina `magnetSlide` ile (uyma koşulu `growFits`: çakışma yok, hücreler aynı bölge ve kuru, eğim ≤ 3 m) serbest
  yerleşir, komşuya 10 m'ye kadar yanaşır. Uymazsa ızgara parseli yalnız kaldırıma yaslanıyorsa kurulur, yoksa atlanır
  (null). `findLot` boş dönerse `City.freeLotAt(k)` tohum hücresinin yanındaki yol boyunca şablon arar (`Lot.free`).
  `magnetSlide` önce 1 m, son metrede 0,25 m adımla ilerler.
- Eski kayıtlar: `Game.restoreSave` → `City.fitGrowablesToRoads()`. Aday: eğik yola bakan, ön yüzünün en uzak noktası
  kaldırımdan ≥ 1,5 m olan ızgara büyüyenleri ve yola dönmüş (oyaw > 3°) ızgara komşuları. `relayTogether` hepsini
  hücrelerinden kaldırır, yol boyunca sırayla (arka sıra en son) `relayTarget` ile dizer (`BuildingRegistry.relay` id ve
  durumu korur); yer bulamayan yerinde kalır, ona çarpan dizilmişler `reset` ile geri alınır (en çok 3 deneme, sonra
  zincirleme geri alma). Kalanlar `relayOneByOne` ile tek tek denenir. Bölge haritası sonda yeniden hesaplanır.
- Su: `Water` arazinin işaretli derinliğini (0,1 m adım, 128 = su yüzeyi) dünyanın 3 katı alanı kaplayan 768² bir
  dokuya yazar (`setDepth`, bir sonraki karede okunur; arazi aracı yalnızca değişen dikdörtgeni yeniler). Shader
  derinlikten renk ve saydamlık, sığlıkta köpük, üç kayan dalga katmanından dünya uzayında normal üretir.
- Zemin: `TerrainMaterial` (v6) dünya normali (`vWorldNormal`) ile dik yamaçta kaya, `rcWet` ile kıyıda ıslaklık
  (pürüzlülük de düşer); ince çim ve çiçekler yalnız yakında (fwidth ile söner).
- Araç takibi: `VehicleRenderer` çizdiği konumu `Vehicle.drawn`a yazar; `followAt`, `followState` (yolculuk bitince
  null), `Game.updateFollow` → `CameraController.track(x, z, yaw?)`; olay `follow`, arayüz `FollowHud`.
- Kavşakta park: `VehicleRenderer.spacesOf` park yerlerini `RoadRenderer.setbackAt` + 4 m'den başlatır (en az 8 m),
  ağ değişince yeniden düzenler.
- Taşıma: `BuildingRegistry.move` kimliği ve durumu koruyarak ızgaraya ya da serbest yere taşır; bölge binaları da taşınır.
- Taşıma: `City.magnetMove` ve `planMove(…, free)` binanın kendi hücrelerini boş sayar (`withoutOwnCells`), `asMove` ücreti
  ve tekillik hatasını kaldırır. `tools/placement/nearLot.gridPlanNear` bina ve taşıma araçlarının ortak ızgara araması.
- Dilekçeler: `systems/Petitions.ts` (`City.petitions`). `CitySimulation.populationStep` her adımda
  `petitionWorld(homes)` ile her evin eksiklerini (hizmet alanı < 0,3 ya da çalışan hattın durağı 260 m'den uzak)
  verir; `Petitions.update` süreleri, tutulan / tutulmayan sözleri denetler, yeni dilekçeyi tohumlu rastgeleyle seçer.
  `happinessTerm()` mutluluk etkenlerine "Belediyeye güven" olarak girer. Game `petitions` olayını yayar.
- Komşulara satış: `systems/Exports.ts` (`City.exports`) teklif edilen miktarı tutar; `sold(stats)` gerçek fazlayla
  (üretim − hizmet verilen) sınırlıdır, `income` günlük oran `exportSales` olarak `Economy`'ye girer.
- Toplu taşıma: `simulation/Transit.ts` durakları (konum) ve hatları (durak sırası, otobüs sayısı) tutar. Durak en
  yakın araç yoluna bağlanır; hat rotası ardışık duraklar arasında yön kurallı Dijkstra ile bulunur (yol / ağ sürümüne
  göre önbellekli). `Transit.update` trafik adımından önce her ev için otobüs payını hesaplar; `TrafficModel` ev
  kökenli iş ve alışveriş yolculuklarını `1 − pay` ile çarpar. Bilet ve işletme `Economy` günlük oranlarındadır.
  `TransitRenderer` kulübeleri, sağ şeritte giden otobüsleri ve araç açıkken hat çizgilerini çizer.
  Garaj: `Transit.update` etkin `bus_depot` binalarından `depotCapacity` (garaj başına 30) hesaplar; toplam otobüs
  fazlaysa `running(line)` her hatta adil pay verir, yolcu ve çizim bu sayıyla yapılır. `City.busFleetError` alımı
  engeller. Aktarma: `connected(id)` durakları `TRANSFER_WALK` içindeki hatları (geçişli) bulur; erişim hesabında
  doğrudan ulaşılmayan ama bağlı hatla ulaşılan iş/dükkân 0,7 ile sayılır. `stopRiders` gidişi eve en yakın durağa,
  dönüşü varış yerlerine yakın duraklara dağıtır; `TransitRenderer` bunu bekleyen insan figürlerine çevirir.
  Hat düzenleme `City.toggleLineStop` (`Transit.insertIndex` en az sapma), `renameBusLine`, `recolorBusLine`;
  hepsi `editTransit` ile geri alınır. Katman: `InfoLayers` `'transit'`.
- Zemin kaplama: `City.paint` 2 m'lik ızgarada (1024²) malzeme kimliği tutar; `DecorRenderer` bu diziyi doğrudan
  arazi malzemesine doku olarak verir, desen arazi shader'ında dünya koordinatında çizilir. Kayıtta RLE.
- Süsler: `data/decor.ts` ilkel parçalardan modeller; `DecorRenderer` tür başına bir InstancedMesh kullanır.
  `City.props` kimlikli listedir; bina ya da yol üzerine kurulunca ilgili süsler silinir.
- Bina hizası: `City.roadSnap` önündeki düz yol ile parselin ön kenarı arasındaki boşluğu (en fazla 1,25 hücre)
  ölçer; `BuildingRegistry` bunu binaya `ox/oz` olarak yazar, `BuildingRenderer` modeli o kadar kaydırır.
  Doluluk hücreleri değişmez; `City.buildingAtWorld` seçme ve yıkmada kaydırılmış yeri dikkate alır.
- Cadde kenarı: `RoadTypeDef.parking` (park şeridi genişliği) ve `trees`. Yol malzemesi park şeridini ve cepleri
  çizer; araç şerit genişliği park şeridini dışarıda bırakır. `StreetFurniture.layout` park eden araçları
  (`carModels`, model başına bir InstancedMesh), lambaları ve ağaçları kavşak geri çekilmesinden (`setbackAt` + 3 m)
  sonra ve hiçbir yolun araç yüzeyinde olmayacak şekilde yerleştirir.
- Bina oturuşu: `City.groundSeat` köşe yüksekliklerinden eğimi bulur; `BuildingRegistry` bunu `seat` olarak yazar
  (seviye atlayınca yeniden hesaplanır). `BuildingRenderer` alçak binaları zemin normaline göre eğer, diğerlerini
  `seat.y` yüksekliğine indirir; kaide yalnızca gerektiğinde çizilir.
- Yol kenarı bölgeleme (`ZoneTool`): aday hücreler yolun o tarafındaki, en yakın yolu bu yol olan hücrelerdir;
  bir hücreden yola giden doğru başka türde bölgelenmiş bir hücreden geçiyorsa hücre seçilmez.
- Yol doluluğu: hücrenin merkezi yola yakınsa ya da karesinin herhangi bir yeri yol yüzeyine değiyorsa hücre yol
  sayılır; kavisli ve çapraz yollarda binalar yola taşmaz.

## Geri al / yinele

`systems/UndoHistory.ts` yalnızca yığınları tutar; `City.undoLast / redoLast` işlemleri uygular. Kapsam:
elle konan binaların yerleştirme, yıkım ve taşıma işlemleri; yol ağı düzenlemeleri (`City.editRoads` ağın önceki
ve sonraki `serialize()` halini ve hazine farkını saklar; `RoadGraph.applySnapshot` yalnızca farklı kenarları
ekler / siler, kimlikler hiç yeniden kullanılmadığı için aynı kimlik aynı geometridir); bölgeleme (değişen
hücrelerin bölge, stil, refah ve kat sınırı değerleri); hat yapımı / yıkımı (aynı kimlikle geri kurulur).
Geri gelen yol bina olan bir hücreden geçecekse işlem yapılmaz. Geri alma sırasında kayıt kapalıdır
(`recording = false`) ki işlem tekrar yığına girmesin. Yer doluysa giriş düşürülür ve oyuncuya neden gösterilir.

## Kayıt biçimi

`CitySave` v1: yollar, binalar, bölgeler ve bölge kuralları (RLE), hatlar, hazine, ekonomi, nüfus, simülasyon
durumu, saat, kamera, görevler, istatistik geçmişi. Kayıt deterministiktir (aynı durum → aynı JSON).
Eski kayıtlar yüklenirken taşınır (ör. ofis binalarının ofis bölgesine geçmesi).

## Resimli görünüm

`rendering/ink.ts` iki parçadır. `inkEdges` geometriye üçgen başına ağırlık merkezi koordinatı (`aInk`) yazar;
neredeyse aynı düzlemdeki komşu üçgenlerin ortak kenarı (dörtgen köşegeni, yumuşak silindir) gizlenir.
`patchInk` malzemenin mevcut shader yamasını koruyarak bu kenarlara ekranda sabit kalınlıkta çizgi çizer ve
uzaklıkla soldurur. Örnekleme (instancing) ve araç/yaya/ağaç animasyonlarıyla birlikte çalışır; son işlem
geçişi gerekmez. `rendering/Thumbnails.ts` katalog resimlerini oyunun kendi renderer'ıyla küçük bir hedefe
çizer ve önbelleğe alır.

## Performans

InstancedMesh, chunk bazlı frustum culling, bitki örtüsü LOD'u, analitik zemin seçimi, Web Worker'da dünya
üretimi, otomatik grafik kalitesi, dar Zustand seçicileri, sıkı gölge kamerası.

## Testler

- `tests/unit` (Vitest): ızgara, yerleşim, çarpışma, maliyet, yol bağlantısı, vergi, büyüme, mutluluk,
  kayıt/yükleme ve sürüm uyumu, bölge kuralları, geri al/taşı, katalog, görev ödülleri.
- `tests/e2e` (Playwright): şehir kurma, kayıt, yeniden yükleme, ayarlar.
