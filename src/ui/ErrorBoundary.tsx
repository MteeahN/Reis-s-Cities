import { Component, type ReactNode } from 'react';
import { stopGame } from '../store/gameBridge';
import { useGameStore } from '../store/gameStore';
import { saveCity } from '../store/saveManager';

interface State {
  error: Error | null;
  saved: boolean | null;
}

/**
 * Catches a crash in the HUD. The engine keeps running underneath, so the
 * city is saved (autosave slot) before the player is offered the menu.
 */
export class HudErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, saved: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error(error);
    void saveCity('auto').then((saved) => this.setState({ saved }));
  }

  private toMenu = () => {
    stopGame();
    useGameStore.setState({ screen: 'menu', settingsOpen: false, popup: null, selection: null, hover: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    const { saved } = this.state;
    return (
      <div className="loading-screen" data-testid="hud-error">
        <div className="panel menu-card">
          <h2>Arayüzde bir hata oluştu</h2>
          <p className="hint">{this.state.error.message}</p>
          <p className="hint">
            {saved === null ? 'Şehir kaydediliyor…' : saved ? 'Şehriniz otomatik kayda yazıldı; ana menüden devam edebilirsiniz.' : 'Şehir kaydedilemedi.'}
          </p>
          <button className="btn primary full" onClick={this.toMenu} disabled={saved === null}>
            Ana menüye dön
          </button>
        </div>
      </div>
    );
  }
}
