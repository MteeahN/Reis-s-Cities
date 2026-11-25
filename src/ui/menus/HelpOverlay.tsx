import { useGameStore } from '../../store/gameStore';
import { Icon } from '../components/Icon';

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Kamera',
    rows: [
      ['W A S D / Oklar', 'Kamerayı hareket ettir (Shift: hızlı)'],
      ['Fare tekerleği', 'İmlece doğru yakınlaş / uzaklaş'],
      ['Sağ fare + sürükle', 'Döndür ve eğ'],
      ['Orta fare + sürükle', 'Haritayı kaydır'],
      ['Q / E', 'Sola / sağa döndür'],
      ['C / Home', 'Şehir merkezine dön'],
      ['F', 'Seçili alana odaklan'],
    ],
  },
  {
    title: 'Araçlar',
    rows: [
      ['Sol fare', 'Seç / yerleştir'],
      ['V', 'Seçim aracı'],
      ['Y', 'Yol aracı'],
      ['Z', 'Bölgeleme aracı'],
      ['[ / ]', 'Fırça boyutu / parsel derinliği'],
      ['B', 'Bina aracı'],
      ['P / U / J', 'Elektrik / Su / Hizmetler'],
      ['L', 'Bilgi katmanları'],
      ['T', 'Trafik yoğunluğu katmanı'],
      ['X / Delete', 'Yıkım aracı'],
      ['M', 'Bina taşıma aracı (R ile döndür)'],
      ['Ctrl+Z / Ctrl+Y', 'Bina işlemini geri al / yinele'],
      ['R', 'Binayı döndür'],
      ['Ctrl (yol)', 'Izgara ve açı yakalamayı kapat'],
      ['Sağ tık (yol)', 'Çizimi iptal et'],
      ['ESC', 'İşlemi iptal et / araçtan çık'],
      ['G', 'Izgarayı göster / gizle'],
    ],
  },
  {
    title: 'Zaman',
    rows: [
      ['Space', 'Duraklat / devam et'],
      ['1 / 2 / 3', 'Normal / 2x / 3x hız'],
      ['K', 'Trafik düzenleme (tek yön, lamba, dur levhası, döner kavşak; Tab: mod)'],
      ['E', 'Arazi: yükselt, alçalt, düzle, yumuşat, gölet ( [ / ] fırça)'],
      ['Q', 'Zemin kaplama (parke, karo, tuğla, çakıl, kum, çim, ahşap)'],
      ['N', 'Süsler: bank, çardak, havuz, oyun alanı… (R: döndür)'],
      ['O', 'Otobüs: durak koy, hat çiz (Tab: mod, Enter: hattı aç); garaj gerekir, panelden hat düzenlenir'],
      ['I', 'Şehirde yürü: WASD yürü, Shift koş, tıklayıp fareyle bak, Esc çık'],
      ['PageUp / PageDown', 'Yol aracında yolu yükselt / alçalt'],
      ['Ctrl+S', 'Şehri kaydet'],
      ['H / F1', 'Bu pencere'],
    ],
  },
];

export function HelpOverlay() {
  const open = useGameStore((s) => s.helpOpen);
  const set = useGameStore((s) => s.set);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={() => set({ helpOpen: false })}>
      <div className="panel modal" role="dialog" aria-label="Kontroller" onClick={(e) => e.stopPropagation()} data-testid="help">
        <div className="panel-header">
          <h3><Icon name="help" size={16} /> Kontroller</h3>
          <button className="icon-btn small" onClick={() => set({ helpOpen: false })} title="Kapat">
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="help-grid">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="section-title">{g.title}</div>
              {g.rows.map(([k, v]) => (
                <div className="help-row" key={k}>
                  <kbd>{k}</kbd>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
