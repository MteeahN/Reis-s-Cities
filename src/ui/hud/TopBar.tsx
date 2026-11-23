import { memo } from 'react';
import { STARTING_BUDGET, type GameSpeed } from '../../game/core/config';
import { getGame } from '../../store/gameBridge';
import { saveCity } from '../../store/saveManager';
import { useGameStore } from '../../store/gameStore';
import { formatGameDate, formatMoney, formatNumber } from '../../utils/format';
import { Icon, type IconName } from '../components/Icon';

function Stat({ icon, label, value, hint, tone }: { icon: IconName; label: string; value: string; hint: string; tone?: string }) {
  return (
    <div className="stat" title={hint}>
      <Icon name={icon} size={18} className={`stat-icon ${tone ?? ''}`} />
      <div className="stat-text">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
      </div>
    </div>
  );
}

const PopulationStat = memo(function PopulationStat() {
  const pop = useGameStore((s) => s.population);
  const total = Math.round(pop?.total ?? 0);
  return (
    <div data-testid="population">
      <Stat
        icon="people"
        label="Nüfus"
        value={formatNumber(total)}
        hint={pop ? `Konut kapasitesi ${formatNumber(pop.housingCapacity)} · boş konut ${formatNumber(Math.round(pop.vacantHomes))}` : 'Konut bölgeleri oluşturarak nüfus kazanın.'}
        tone="tone-green"
      />
    </div>
  );
});

const HappinessStat = memo(function HappinessStat() {
  const pop = useGameStore((s) => s.population);
  const has = !!pop && pop.total >= 1;
  const h = has ? Math.round(pop!.happiness) : 0;
  return (
    <Stat
      icon="smile"
      label="Mutluluk"
      value={has ? `%${h}` : '—'}
      hint={has ? 'Ortalama vatandaş mutluluğu: arazi değeri, kirlilik, iş ve alışveriş imkânı.' : 'Henüz vatandaş yok.'}
      tone={!has ? 'tone-yellow' : h >= 60 ? 'tone-green' : h >= 40 ? 'tone-yellow' : 'tone-red'}
    />
  );
});

const WeeklyStat = memo(function WeeklyStat() {
  const eco = useGameStore((s) => s.economy);
  const weekly = (eco?.projectedDaily ?? 0) * 7;
  return (
    <div data-testid="weekly">
      <Stat
        icon="trend"
        label="Haftalık"
        value={`${weekly >= 0 ? '+' : '−'}${formatMoney(Math.abs(weekly))}`}
        hint="Tahmini haftalık net: vergi gelirleri − bakım giderleri − kredi ödemeleri. Ayrıntılar: Bütçe sekmesi."
        tone={weekly >= 0 ? 'tone-green' : 'tone-red'}
      />
    </div>
  );
});

const Budget = memo(function Budget() {
  const budget = useGameStore((s) => s.budget);
  if (!Number.isFinite(budget)) {
    return (
      <div data-testid="budget">
        <Stat icon="money" label="Bütçe" value="Sınırsız" hint="Yaratıcı mod: para sınırsız, her bina, yol ve bölge açık, tüm arazi kullanılabilir. Gelir ve giderler yine Bütçe sekmesinde raporlanır." tone="tone-blue" />
      </div>
    );
  }
  return (
    <div data-testid="budget">
      <Stat
        icon="money"
        label="Bütçe"
        value={formatMoney(budget)}
        hint={`Belediye bütçesi. Başlangıç: ${formatMoney(STARTING_BUDGET)}. Vergiler eklenir; inşaat, bakım ve kredi ödemeleri düşülür.`}
        tone={budget < 0 ? 'tone-red' : budget < 5000 ? 'tone-yellow' : 'tone-blue'}
      />
    </div>
  );
});

const Clock = memo(function Clock() {
  const minutes = useGameStore((s) => s.minutes);
  const { date, time } = formatGameDate(minutes);
  return (
    <div className="clock" title="Oyun içi tarih ve saat">
      <Icon name="clock" size={18} />
      <div className="stat-text">
        <span className="stat-label">{date}</span>
        <span className="stat-value mono">{time}</span>
      </div>
    </div>
  );
});

const SPEEDS: { speed: GameSpeed; icon: IconName; label: string; key: string }[] = [
  { speed: 1, icon: 'play', label: 'Normal hız', key: '1' },
  { speed: 2, icon: 'fast', label: '2x hız', key: '2' },
  { speed: 3, icon: 'faster', label: '3x hız', key: '3' },
];

const SpeedControls = memo(function SpeedControls() {
  const speed = useGameStore((s) => s.speed);
  const paused = useGameStore((s) => s.paused);
  return (
    <div className="speed-controls" role="group" aria-label="Oyun hızı">
      <button
        className={`icon-btn ${paused ? 'active warn' : ''}`}
        onClick={() => getGame()?.togglePause()}
        title="Duraklat / Devam (Space)"
        aria-pressed={paused}
        data-testid="btn-pause"
      >
        <Icon name="pause" size={16} />
      </button>
      {SPEEDS.map((s) => (
        <button
          key={s.speed}
          className={`icon-btn ${!paused && speed === s.speed ? 'active' : ''}`}
          onClick={() => getGame()?.setSpeed(s.speed)}
          title={`${s.label} (${s.key})`}
          aria-pressed={!paused && speed === s.speed}
          data-testid={`btn-speed-${s.speed}`}
        >
          <Icon name={s.icon} size={16} />
        </button>
      ))}
    </div>
  );
});

export function TopBar() {
  const cityName = useGameStore((s) => s.cityName);
  const set = useGameStore((s) => s.set);
  const helpOpen = useGameStore((s) => s.helpOpen);
  const settingsOpen = useGameStore((s) => s.settingsOpen);
  const popup = useGameStore((s) => s.popup);
  const saving = useGameStore((s) => s.saving);
  const earned = useGameStore((s) => s.achievements.filter((a) => a.earnedAt !== null).length);
  const togglePopup = (p: 'achievements' | 'stats') => set({ popup: popup === p ? null : p, settingsOpen: false, helpOpen: false });

  return (
    <header className="topbar panel">
      <div className="brand">
        <div className="brand-mark" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="brand-text">
          <span className="brand-title">REIS'S CITIES</span>
          <span className="brand-city" data-testid="city-name">{cityName}</span>
        </div>
      </div>

      <div className="stats">
        <PopulationStat />
        <Budget />
        <WeeklyStat />
        <HappinessStat />
      </div>

      <div className="topbar-right">
        <Clock />
        <SpeedControls />
        <div className="divider" />
        <button className={`icon-btn ${saving ? 'active' : ''}`} onClick={() => void saveCity('manual')} disabled={saving} title="Kaydet (Ctrl+S)" data-testid="btn-save">
          <Icon name="save" size={18} />
        </button>
        <button className={`icon-btn ${popup === 'stats' ? 'active' : ''}`} onClick={() => togglePopup('stats')} title="İstatistikler" data-testid="btn-stats">
          <Icon name="chart" size={18} />
        </button>
        <button className={`icon-btn badge-btn ${popup === 'achievements' ? 'active' : ''}`} onClick={() => togglePopup('achievements')} title="Başarımlar" data-testid="btn-achievements">
          <Icon name="trophy" size={18} />
          {earned > 0 && <span className="count-badge">{earned}</span>}
        </button>
        <button
          className={`icon-btn ${settingsOpen ? 'active' : ''}`}
          onClick={() => set({ settingsOpen: !settingsOpen, helpOpen: false, popup: null })}
          title="Ayarlar"
          data-testid="btn-settings"
        >
          <Icon name="settings" size={18} />
        </button>
        <button
          className={`icon-btn ${helpOpen ? 'active' : ''}`}
          onClick={() => set({ helpOpen: !helpOpen, settingsOpen: false, popup: null })}
          title="Kontroller (H)"
          data-testid="btn-help"
        >
          <Icon name="help" size={18} />
        </button>
      </div>
    </header>
  );
}
