import { getGame } from '../../store/gameBridge';
import { useGameStore } from '../../store/gameStore';
import { Icon } from '../components/Icon';

const CAR_NAMES = ['Sedan', 'Hatchback', 'SUV', 'Panelvan'];

/** Shown while the camera follows a vehicle: what it is, how fast it goes, how far it still has to go. */
export function FollowHud() {
  const f = useGameStore((s) => s.follow);
  if (!f) return null;
  const name = f.truck ? 'Kamyon' : CAR_NAMES[f.model] ?? 'Otomobil';
  const left = f.remaining >= 1000 ? `${(f.remaining / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(f.remaining / 10) * 10} m`;
  return (
    <div className="follow-hud panel" data-testid="follow-hud">
      <Icon name={f.truck ? 'truck' : 'car'} size={16} />
      <span className="follow-name">{name}</span>
      <span className="follow-stat">{f.manoeuvring ? 'park ediyor / dönüyor' : `${Math.round(f.kmh)} km/sa`}</span>
      <span className="follow-stat">hedefe {left}</span>
      <button className={`btn ${f.behind ? 'active' : ''}`} onClick={() => getGame()?.setFollowBehind(!f.behind)} title="Kamera aracın arkasından baksın" data-testid="follow-behind">
        Arkadan izle
      </button>
      <button className="btn" onClick={() => getGame()?.stopFollow()} title="Takibi bırak (Esc)" data-testid="follow-stop">
        Bırak
      </button>
    </div>
  );
}
