import { useState } from 'react';
import type { AudioSettings, GraphicsSettings } from '../../game/core/settings';
import type { DayNightMode } from '../../game/rendering/DayNight';
import type { ShadowQuality } from '../../game/rendering/QualityManager';
import { AUTOSAVE_MINUTES, UI_SCALES, type GameplaySettings } from '../../game/core/settings';
import { getGame, stopGame } from '../../store/gameBridge';
import { exportSave, saveBeforeLeaving, saveCity } from '../../store/saveManager';
import { useGameStore } from '../../store/gameStore';
import { Icon } from '../components/Icon';

const ART_STYLES: { id: GraphicsSettings['artStyle']; label: string }[] = [
  { id: 'sketch', label: 'Eskiz' },
  { id: 'realistic', label: 'Gerçekçi' },
];

const PRESETS: { id: GraphicsSettings['preset']; label: string }[] = [
  { id: 'auto', label: 'Otomatik' },
  { id: 'high', label: 'Yüksek' },
  { id: 'medium', label: 'Orta' },
  { id: 'low', label: 'Düşük' },
];

const SHADOWS: { id: ShadowQuality; label: string }[] = [
  { id: 'off', label: 'Kapalı' },
  { id: 'low', label: 'Düşük' },
  { id: 'medium', label: 'Orta' },
  { id: 'high', label: 'Yüksek' },
];

const DAY_NIGHT: { id: DayNightMode; label: string }[] = [
  { id: 'cycle', label: 'Döngü' },
  { id: 'day', label: 'Hep gündüz' },
  { id: 'night', label: 'Hep gece' },
];

type Tab = 'graphics' | 'audio' | 'game';

function Slider(props: { id: string; label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="tax-row">
      <div className="tax-head">
        <span>{props.label}</span>
        <strong data-testid={`${props.id}-value`}>{props.format(props.value)}</strong>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        data-testid={props.id}
        aria-label={props.label}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </div>
  );
}

function GraphicsTab({ g }: { g: GraphicsSettings }) {
  const setG = (patch: Partial<GraphicsSettings>) => getGame()?.setGraphics(patch);
  return (
    <>
      <div className="section-title">Kalite ön ayarı</div>
      <div className="segmented">
        {PRESETS.map((o) => (
          <button key={o.id} className={g.preset === o.id ? 'active' : ''} onClick={() => setG({ preset: o.id })} data-testid={`quality-${o.id}`}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="hint" data-testid="graphics-preset-hint">
        {g.preset === 'auto'
          ? 'Otomatik mod kare hızını ölçer ve gerekirse kaliteyi düşürür.'
          : g.preset === 'custom'
            ? 'Özel ayarlar kullanılıyor; bir ön ayar seçerek geri dönebilirsiniz.'
            : 'Sabit ön ayar.'}
      </p>
      <div className="section-title">Çizim stili</div>
      <div className="segmented">
        {ART_STYLES.map((o) => (
          <button key={o.id} className={g.artStyle === o.id ? 'active' : ''} onClick={() => setG({ artStyle: o.id })} data-testid={`art-${o.id}`}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="hint">Eskiz: mürekkep çizgileri, suluboya ve kâğıt dokusu. Gerçekçi: klasik 3B görüntü.</p>
      <div className="section-title">Gölgeler</div>
      <div className="segmented">
        {SHADOWS.map((o) => (
          <button key={o.id} className={g.shadows === o.id ? 'active' : ''} onClick={() => setG({ shadows: o.id })} data-testid={`shadows-${o.id}`}>
            {o.label}
          </button>
        ))}
      </div>
      <Slider id="gfx-resolution" label="Çözünürlük ölçeği" value={g.resolution} min={0.5} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setG({ resolution: v })} />
      <Slider id="gfx-vegetation" label="Ağaç detay mesafesi" value={g.vegetationDistance} min={150} max={1000} step={10} format={(v) => `${v} m`} onChange={(v) => setG({ vegetationDistance: v })} />
      <Slider id="gfx-detail" label="Bina detay mesafesi" value={g.buildingDetail} min={200} max={1600} step={20} format={(v) => `${v} m`} onChange={(v) => setG({ buildingDetail: v })} />
      <Slider id="gfx-vehicles" label="En fazla araç / yaya" value={g.vehicles} min={0} max={600} step={10} format={(v) => `${v}`} onChange={(v) => setG({ vehicles: v })} />
      <Slider id="gfx-streetlights" label="Sokak lambası parlaklığı" value={g.streetLights} min={0} max={1} step={0.05} format={(v) => `%${Math.round(v * 100)}`} onChange={(v) => setG({ streetLights: v })} />
      <label className="toggle">
        <input type="checkbox" checked={g.bloom} onChange={() => setG({ bloom: !g.bloom })} data-testid="gfx-bloom" />
        <span>Işık parlaması (bloom)</span>
      </label>
      <div className="section-title">Gündüz ve gece</div>
      <div className="segmented three">
        {DAY_NIGHT.map((o) => (
          <button key={o.id} className={g.dayNight === o.id ? 'active' : ''} onClick={() => setG({ dayNight: o.id })} data-testid={`daynight-${o.id}`}>
            {o.label}
          </button>
        ))}
      </div>
    </>
  );
}

function AudioTab({ a }: { a: AudioSettings }) {
  const setA = (patch: Partial<AudioSettings>) => getGame()?.setAudio(patch);
  const pct = (v: number) => `%${Math.round(v * 100)}`;
  return (
    <>
      <label className="toggle">
        <input type="checkbox" checked={a.muted} onChange={() => setA({ muted: !a.muted })} data-testid="audio-mute" />
        <span>Sesi kapat</span>
      </label>
      <Slider id="audio-master" label="Ana ses" value={a.master} min={0} max={1} step={0.05} format={pct} onChange={(v) => setA({ master: v })} />
      <Slider id="audio-ambience" label="Ortam sesleri" value={a.ambience} min={0} max={1} step={0.05} format={pct} onChange={(v) => setA({ ambience: v })} />
      <Slider id="audio-effects" label="Efektler" value={a.effects} min={0} max={1} step={0.05} format={pct} onChange={(v) => setA({ effects: v })} />
      <p className="hint">Ortam sesi kameranın yakınındaki trafiği, binaları ve ağaçları dinler: yoğun yollar uğuldar, ormanda gündüz kuşlar, gece cırcır böcekleri duyulur.</p>
    </>
  );
}

function GameplayTab({ p }: { p: GameplaySettings }) {
  const saving = useGameStore((s) => s.saving);
  const lastSavedAt = useGameStore((s) => s.lastSavedAt);
  const currentSlot = useGameStore((s) => s.currentSlot);
  const persistent = useGameStore((s) => s.storagePersistent);
  const setP = (patch: Partial<GameplaySettings>) => getGame()?.setGameplay(patch);
  return (
    <>
      <div className="section-title">Arayüz</div>
      <div className="kv">
        <span>Arayüz boyutu</span>
      </div>
      <div className="segmented">
        {UI_SCALES.map((v) => (
          <button key={v} className={p.uiScale === v ? 'active' : ''} onClick={() => setP({ uiScale: v })} data-testid={`ui-scale-${v}`}>
            %{Math.round(v * 100)}
          </button>
        ))}
      </div>
      <label className="toggle" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={p.tutorial} onChange={() => setP({ tutorial: !p.tutorial })} data-testid="tutorial-toggle" />
        <span>Öğreticiyi göster</span>
      </label>
      <div className="section-title">Kayıt</div>
      <div className="btn-row">
        <button className="btn primary" onClick={() => void saveCity('manual')} disabled={saving} data-testid="btn-save-city">
          <Icon name="save" size={15} /> {currentSlot ? 'Kaydet' : 'Kaydet (yeni)'}
        </button>
        <button className="btn" onClick={() => void saveCity('manual', true)} disabled={saving || !currentSlot} data-testid="btn-save-as" title="Mevcut kaydı koruyup yeni bir kayıt oluşturur">
          Yeni kayıt olarak
        </button>
      </div>
      <button className="btn full" onClick={() => void exportSave()} data-testid="btn-export-current">
        <Icon name="download" size={15} /> Dosya olarak indir (.json)
      </button>
      <p className="hint" data-testid="last-saved">
        {saving ? 'Kaydediliyor…' : lastSavedAt ? `Son kayıt: ${new Date(lastSavedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : 'Bu oturumda henüz kaydedilmedi.'}
        {!persistent && ' Tarayıcı kalıcı depolama sunmuyor; dosya olarak indirin.'}
      </p>
      <label className="toggle">
        <input type="checkbox" checked={p.autosave} onChange={() => setP({ autosave: !p.autosave })} data-testid="autosave-toggle" />
        <span>Otomatik kayıt</span>
      </label>
      {p.autosave && (
        <div className="segmented" style={{ marginTop: 8 }}>
          {AUTOSAVE_MINUTES.map((m) => (
            <button key={m} className={p.autosaveMinutes === m ? 'active' : ''} onClick={() => setP({ autosaveMinutes: m })} data-testid={`autosave-${m}`}>
              {m} dk
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function SettingsMenu() {
  const open = useGameStore((s) => s.settingsOpen);
  const settings = useGameStore((s) => s.settings);
  const grid = useGameStore((s) => s.grid);
  const set = useGameStore((s) => s.set);
  const [tab, setTab] = useState<Tab>('graphics');
  if (!open) return null;

  const backToMenu = async () => {
    await saveBeforeLeaving();
    stopGame();
    set({ screen: 'menu', settingsOpen: false, selection: null, hover: null, roadPlan: null, world: null, perf: null, minutes: 0 });
  };

  return (
    <div className="panel popover settings" data-testid="settings">
      <div className="panel-header">
        <h3>
          <Icon name="settings" size={16} /> Ayarlar
        </h3>
        <button className="icon-btn small" onClick={() => set({ settingsOpen: false })} title="Kapat">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="tabs settings-tabs">
        <button className={tab === 'graphics' ? 'active' : ''} onClick={() => setTab('graphics')} data-testid="settings-tab-graphics">
          Grafik
        </button>
        <button className={tab === 'audio' ? 'active' : ''} onClick={() => setTab('audio')} data-testid="settings-tab-audio">
          Ses
        </button>
        <button className={tab === 'game' ? 'active' : ''} onClick={() => setTab('game')} data-testid="settings-tab-game">
          Oyun
        </button>
      </div>
      <div className="settings-body">
        {tab === 'graphics' && <GraphicsTab g={settings.graphics} />}
        {tab === 'audio' && <AudioTab a={settings.audio} />}
        {tab === 'game' && (
          <>
            <label className="toggle">
              <input type="checkbox" checked={grid} onChange={() => getGame()?.toggleGrid()} />
              <span>İnşaat ızgarasını göster</span>
            </label>
            <GameplayTab p={settings.gameplay} />
            <div className="section-title">Şehir</div>
            <button className="btn full" onClick={() => void backToMenu()} data-testid="btn-main-menu">
              Ana menüye dön
            </button>
            <p className="hint">{settings.gameplay.autosave ? 'Ana menüye dönerken şehir otomatik kaydedilir.' : 'Otomatik kayıt kapalı: ana menüye dönmeden önce kaydedin.'}</p>
          </>
        )}
      </div>
    </div>
  );
}
