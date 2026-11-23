import { useGameStore } from '../../store/gameStore';

export function LoadingScreen() {
  const { fraction, label } = useGameStore((s) => s.loading);
  const cityName = useGameStore((s) => s.cityName);
  return (
    <div className="loading-screen" data-testid="loading">
      <div className="loading-card">
        <div className="brand-mark big" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <h2>{cityName}</h2>
        <div className="progress">
          <span style={{ width: `${Math.round(fraction * 100)}%` }} />
        </div>
        <p>{label || 'Hazırlanıyor'}…</p>
      </div>
    </div>
  );
}

export function ErrorScreen() {
  const error = useGameStore((s) => s.error);
  const set = useGameStore((s) => s.set);
  return (
    <div className="loading-screen">
      <div className="loading-card panel">
        <h2>Oyun başlatılamadı</h2>
        <p className="text-red">{error}</p>
        <p className="muted small">Tarayıcınızın WebGL 2 desteklediğinden ve donanım hızlandırmanın açık olduğundan emin olun.</p>
        <button className="btn primary" onClick={() => set({ screen: 'menu', error: null })}>
          Ana menü
        </button>
      </div>
    </div>
  );
}
