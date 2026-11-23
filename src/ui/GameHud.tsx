import { useEffect } from 'react';
import { saveCity } from '../store/saveManager';
import { AchievementsPanel } from './panels/AchievementsPanel';
import { StatsPanel } from './panels/StatsPanel';
import { DemandMeter } from './hud/DemandMeter';
import { LayerLegend } from './hud/LayerLegend';
import { TopBar } from './hud/TopBar';
import { HelpOverlay } from './menus/HelpOverlay';
import { SettingsMenu } from './menus/SettingsMenu';
import { Toasts } from './notifications/Toasts';
import { InspectorPanel } from './panels/InspectorPanel';
import { LeftPanel } from './panels/LeftPanel';
import { Minimap } from './panels/Minimap';
import { Toolbar } from './toolbar/Toolbar';

/** HUD overlay. The root ignores pointer events so the 3D view stays interactive. */
export function GameHud() {
  // Ctrl+S saves the city (instead of the browser's "save page").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault();
        if (!e.repeat) void saveCity('manual');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="hud" data-testid="hud">
      <TopBar />
      <SettingsMenu />
      <StatsPanel />
      <AchievementsPanel />
      <Toasts />
      <LayerLegend />
      <div className="hud-left">
        <LeftPanel />
      </div>
      <div className="hud-right">
        <InspectorPanel />
      </div>
      <Minimap />
      <DemandMeter />
      <Toolbar />
      <HelpOverlay />
    </div>
  );
}
