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
- Trafik toplu (agregat) modeldir; görünen araç ve yayalar bu modelin akışından örneklenir.

## Geri al / yinele

`systems/UndoHistory.ts` yalnızca yığınları tutar; `City.undoLast / redoLast` işlemleri uygular. Kapsam:
elle konan binaların yerleştirme, yıkım ve taşıma işlemleri. Geri alma sırasında kayıt kapalıdır
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
