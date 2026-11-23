import { useEffect, useRef, useState, type FormEvent } from 'react';
import { APP_VERSION } from '../../game/core/config';
import type { SaveMeta } from '../../game/save/CitySave';
import { useGameStore } from '../../store/gameStore';
import { deleteSave, exportSave, importSave, loadSave, refreshSaves } from '../../store/saveManager';
import { formatGameDate, formatMoney, formatNumber } from '../../utils/format';
import { Icon } from '../components/Icon';

const randomSeed = () => String(Math.floor(Math.random() * 999_999_999));

const savedAgo = (t: number) =>
  new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function SaveRow({ m }: { m: SaveMeta }) {
  const [confirm, setConfirm] = useState(false);
  const { date } = formatGameDate(m.gameMinutes);
  return (
    <li className="save-row" data-testid="save-row">
      <button className="save-main" onClick={() => void loadSave(m.id)} data-testid={`load-${m.id}`} title="Bu kaydı aç">
        {m.thumbnail ? <img src={m.thumbnail} alt="" className="save-thumb" /> : <div className="save-thumb empty"><Icon name="building" size={20} /></div>}
        <div className="save-text">
          <div className="save-name">
            {m.name}
            {m.kind === 'auto' && <span className="chip">Otomatik</span>}
            {m.sandbox && <span className="chip">Yaratıcı</span>}
          </div>
          <div className="save-sub">
            {formatNumber(m.population)} nüfus · {m.sandbox ? 'sınırsız para' : formatMoney(m.balance)} · {date}
          </div>
          <div className="save-sub faint">
            {savedAgo(m.savedAt)} · {m.achievements} başarım · tohum {m.seed}
          </div>
        </div>
      </button>
      <div className="save-actions">
        <button className="icon-btn small" onClick={() => void exportSave(m.id)} title="Dosya olarak indir" data-testid={`export-${m.id}`}>
          <Icon name="download" size={14} />
        </button>
        {confirm ? (
          <button className="btn danger small" onClick={() => void deleteSave(m.id)} onBlur={() => setConfirm(false)} autoFocus data-testid={`confirm-delete-${m.id}`}>
            Sil?
          </button>
        ) : (
          <button className="icon-btn small" onClick={() => setConfirm(true)} title="Kaydı sil" data-testid={`delete-${m.id}`}>
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>
    </li>
  );
}

function SavedCities() {
  const saves = useGameStore((s) => s.saves);
  const loaded = useGameStore((s) => s.savesLoaded);
  const persistent = useGameStore((s) => s.storagePersistent);
  const file = useRef<HTMLInputElement>(null);
  return (
    <div data-testid="saved-cities">
      {!persistent && <p className="hint warn-text">Bu tarayıcı kalıcı depolama sunmuyor: kayıtlar yalnızca sayfa açıkken durur. Dışa aktararak saklayın.</p>}
      {!loaded ? (
        <p className="hint">Kayıtlar okunuyor…</p>
      ) : saves.length === 0 ? (
        <p className="hint" data-testid="no-saves">Henüz kayıtlı şehir yok. Oyun içinde Ctrl+S ile veya Ayarlar → Oyun bölümünden kaydedebilirsiniz.</p>
      ) : (
        <ul className="save-list">
          {saves.map((m) => (
            <SaveRow key={m.id} m={m} />
          ))}
        </ul>
      )}
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="import-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importSave(f);
        }}
      />
      <button type="button" className="btn secondary full" onClick={() => file.current?.click()} data-testid="btn-import">
        <Icon name="upload" size={16} /> Dosyadan içe aktar
      </button>
    </div>
  );
}

export function MainMenu() {
  const set = useGameStore((s) => s.set);
  const saves = useGameStore((s) => s.saves);
  const [name, setName] = useState(useGameStore.getState().cityName);
  const [seed, setSeed] = useState(() => useGameStore.getState().seedText || randomSeed());
  const [tab, setTab] = useState<'new' | 'saves'>('new');
  const [sandbox, setSandbox] = useState(useGameStore.getState().newSandbox);

  useEffect(() => {
    void refreshSaves();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cityName = name.trim() || 'Yeni Şehir';
    set({ cityName, seedText: seed.trim(), newSandbox: sandbox, pendingLoad: null, currentSlot: null, screen: 'loading', loading: { fraction: 0, label: 'Hazırlanıyor' }, error: null });
  };
  const latest = saves[0];

  return (
    <div className="menu-screen">
      <div className="menu-bg" aria-hidden />
      <div className="menu-card panel" data-testid="main-menu">
        <div className="menu-logo">
          <div className="brand-mark big" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <h1>REIS'S CITIES</h1>
          <p>Şehrini sıfırdan kur, yönet ve büyüt.</p>
        </div>

        {latest && (
          <button className="btn primary full big continue" onClick={() => void loadSave(latest.id)} data-testid="btn-continue">
            <Icon name="play" size={16} /> Devam et: {latest.name}
          </button>
        )}

        <div className="tabs menu-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'new'} className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')} data-testid="menu-tab-new">
            Yeni şehir
          </button>
          <button role="tab" aria-selected={tab === 'saves'} className={tab === 'saves' ? 'active' : ''} onClick={() => setTab('saves')} data-testid="menu-tab-saves">
            Kayıtlı şehirler{saves.length ? ` (${saves.length})` : ''}
          </button>
        </div>

        {tab === 'new' ? (
          <form onSubmit={submit}>
            <label className="field">
              <span>Şehir adı</span>
              <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Yeni Şehir" data-testid="input-city" autoFocus />
            </label>
            <label className="field">
              <span>Harita tohumu</span>
              <div className="field-row">
                <input value={seed} maxLength={24} onChange={(e) => setSeed(e.target.value)} placeholder="Rastgele" data-testid="input-seed" />
                <button type="button" className="icon-btn" onClick={() => setSeed(randomSeed())} title="Rastgele tohum">
                  <Icon name="dice" size={18} />
                </button>
              </div>
              <small>Aynı tohum her zaman aynı araziyi üretir.</small>
            </label>
            <label className="check-field">
              <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} data-testid="input-sandbox" />
              <span>
                <strong>Yaratıcı mod</strong>
                <small>Sınırsız para, tüm binalar, yollar ve bölgeler açık, haritanın tamamı kullanılabilir. Görev ödülleri verilmez.</small>
              </span>
            </label>
            <button type="submit" className={`btn full big ${latest ? 'secondary' : 'primary'}`} data-testid="btn-start">
              Şehri Kur
            </button>
          </form>
        ) : (
          <SavedCities />
        )}
        <div className="menu-foot">v{APP_VERSION}</div>
      </div>
    </div>
  );
}
