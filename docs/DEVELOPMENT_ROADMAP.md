# Reis's Cities — Geliştirme Yol Haritası

## Tamamlananlar

1. ✅ Oyun çekirdeği: arazi, kamera, ızgara, chunk'lar
2. ✅ İnşaat: yol ağı, kavşaklar, köprüler, binalar, yıkım
3. ✅ Bölgeleme ve nüfus
4. ✅ Ekonomi: vergiler, bakım, rapor, krediler
5. ✅ Altyapı ve hizmetler: elektrik, su, kanalizasyon, polis, itfaiye, sağlık, eğitim, çöp, parklar
6. ✅ Trafik ve gelişmiş simülasyon: rota ataması, sinyaller, tek yönlü yollar
7. ✅ Görsel kalite: gece/gündüz, ışıklar, bloom, ses
8. ✅ Kayıt, başarımlar, yayın
9. ✅ Ofis bölgesi, refah ve kat sınırı, 11 mimari stil
10. ✅ Geri al / yinele, bina taşıma, katalog araması ve favoriler, görev ödülleri, şehir seviyesi, öğretici,
    arayüz boyutu
11. ✅ Resimli model görünümü (modellerde mürekkep kenar), katalogda 3B küçük resimler, yol kartı çizimleri,
    yol sekmeleri, konutta kat sekmeleri, tek yönlü sokak ve cadde
12. ✅ Haritayı baştan sona geçen şehirlerarası yol ve şehre bağlantı kavşağı (göç, inşaat, ithalat/ihracat ve
    ziyaretçiler bu yoldan), trafik kilitlenmesinin çözülmesi, stile göre bina gövdesi,
    kavisli yolda binaların yola taşmaması, araçların birbirine girmemesi, daha seyrek araç ve yaya
13. ✅ Şehrin dışından geçen kavisli şehirlerarası yol ve tek bağlantı yolu, yükseltilmiş yollar ve üst geçitler,
    döner kavşak, yüksek katlı oteller ve kumarhaneler; fütüristik stil kaldırıldı
14. ✅ Yollar, bölgeleme, hatlar ve trafik düzenlemeleri için geri al / yinele; Kent Sesi vatandaş akışı;
    aynı türden yolların açılı eklemlerinde gönye
15. ✅ Binaların kaldırıma yaslanması, yol kenarı bölgelemenin tek yolda kalması ve başka bölgenin sınırında durması
16. ✅ Cadde kenarı yolları (park şeridi ve park eden araçlar, ağaçlı kaldırımlar, geniş kaldırımlar), kavşak
    dışında kalan sokak lambaları, eğime göre eğilen ya da yamaca oturan binalar
17. ✅ Serbest ve yay yol çizimi, yol kaplamaları (parke, tuğla, beton) ve yeniden kaplama, yaya yolu, otoyol rampası,
    arazi aracı (yükselt, alçalt, düzle, yumuşat, gölet)
18. ✅ Zemin kaplama boyası (8 malzeme) ve 20 süs eşyası (yerleştirme, döndürme, yıkım, geri alma, kayıt)
19. ✅ Otobüs durakları ve hatları: yol ağında rota, yolcu hesabı, trafikten düşülen yolculuklar, bilet ve işletme
20. ✅ Danışmanlar paneli (gerçek rakamlarla öneriler ve ilgili araç); Kent Sesi'nde talep ölçeği düzeltildi
21. ✅ Anaokulu, sağlık ocağı, üniversite, kütüphane, yüzme havuzu, beş park türü, açık ve katlı otopark; bölge
    renkleri yalnızca bölgeleme aracında
22. ✅ Yeşil okla hemen yükseltme, yerleşim unvanı
23. ✅ Otobüs garajı (garaj kapasitesi kadar otobüs çalışır), hatlar arası aktarma, hat düzenleme (durak ekle / çıkar,
    ad, renk), toplu taşıma kapsama katmanı, duraklarda bekleyen yolcular
24. ✅ Binalar eğri ve açılı yollara döner (en çok 50°); ön cephe yola paralel yaslanır, komşulara ve yola taşmaz
25. ✅ Vatandaş dilekçeleri (söz ver / reddet, süreli, gerçek kapsamayla denetim, belediyeye güven mutluluğa etki)
26. ✅ Fazla elektrik, su ve arıtma kapasitesini komşu kasabalara satış
27. ✅ Yola mıknatıs: elle konan bina kıvrık / çapraz yola her açıda döner, ızgaradan bağımsız durur, komşuya yanaşır
28. ✅ Görünüm seçenekleri (Standart / Yumuşak / Kasvetli / Canlı) ve günün saati (sabah, akşam dahil)
29. ✅ Cephe atlası: stil başına dört pencere tasarımı, zemin katta kapı / vitrin / kepenk
30. ✅ Performans: ağaç ve kaya LOD'u, bina havuzlarında görüş alanı ayıklama, ayrıntılarda gölgesiz çizim
31. ✅ Şehirde yürüyüş: birinci şahıs kamera, kaldırımdan başlar, bina ve suyla çarpışma, fare kilidiyle bakış

## Bilinen sınırlar (dürüst durum)

- Giriş yolundan önce kaydedilmiş şehirlerde giriş yolu yoktur; bu şehirlerde bağlantı kuralı uygulanmaz.
- Şehirlerarası yol tektir; ikinci bir dış bağlantı (demiryolu, liman, ikinci otoyol) yok. Bağlantı kavşağı
  hemzemindir; hazır katlı kavşak (yonca) yok, oyuncu yükseltilmiş yollarla üst geçit kurabilir.
- Yükseltilmiş yolun güvertesi altındaki araziyi izler (yerden sabit yükseklikte); düz bir köprü çizgisi değildir.
  Altına bina yapılmaz.
- Döner kavşakta araçlar halkaya girerken içerideki araca ayrıca yol vermez; kavşak beklemesi trafik modelinde
  ışıksız kavşak gibi hesaplanır.

- Geri al kapsamı: binalar, yollar, bölgeleme, hatlar ve trafik düzenlemeleri. Arazi satın alma, vergi ve kredi
  geri alınmaz; bölgelemeyi geri almak o bölgeleme yüzünden yıkılan büyüyen binaları geri getirmez.
- Kent Sesi kayda yazılmaz; yüklenen şehirde akış boş başlar ve şehrin o anki durumundan yazılır.
- Tünel ve araç girmeyen yaya yolu yok.
- Arazi aracında kanal, plaj, tepe / dağ şablonları ve zemin kaplama boyası yok; mini harita arazi düzenlemelerini
  göstermez. Kavşak yüzeyleri her zaman asfalttır.
- Toplu taşımada yalnızca otobüs var (metro, tren, tramvay yok). Otobüsler sabit hızla dolaşır, her
  durakta bekler ama trafikte beklemez; garajdan hatta gidip gelmezler. Aktarma, yolcunun hangi işe gittiğini tek tek
  izlemez: bağlı hatların ulaştığı işler toplam erişime indirimli eklenir. Kaplama ve süsler yalnızca görünümdür; simülasyona etkileri yoktur. Kaplama 2 m
  karelerle boyanır (kenarlar kademelidir).
- Afetler ve danışmanlar yok.
- Günlük (tekrarlanan) görevler yok; tüm görevler kalıcı.
- Katalog bugün 96 bina tanımı içerir (her biri birçok stil ve varyantla çizilir); 600 hedefine ulaşılmadı.
- Dokunmatik kontroller temel düzeyde.

## Sıradaki adımlar (öneri)

1. Toplu taşıma: metro ve tramvay; otobüslerin trafikte beklemesi.
2. Peyzaj: kanal, plaj ve tepe şablonları.
4. Afetler (yangın yayılması, sel) ve danışman ipuçları.
5. Daha fazla özgün bina: okul ve hastane çeşitleri, stadyum, liman, havaalanı.
6. Mobil dokunmatik kontrollerin iyileştirilmesi.
