import { expect, test, type Page } from '@playwright/test';

/** New cities open at the entry road's end; the tests draw their street at the map centre. */
/** Road segments shown in the city panel (the game-laid highway is several segments). */
async function segments(page: Page): Promise<number> {
  return Number((await page.getByTestId('stat-road-segments').innerText()).replace(/\D/g, ''));
}

async function centreCamera(page: Page): Promise<void> {
  await page.evaluate(() => {
    const c = (window as unknown as { __reis: { game: { cameraCtl: { yaw: number; pitch: number; setView(x: number, z: number, yaw: number, pitch: number, d: number): void } } } }).__reis.game.cameraCtl;
    c.setView(1024, 1024, c.yaw, c.pitch, 520);
  });
}

test('creates a city, renders the world and drives the HUD', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await page.getByTestId('input-city').fill('Test Şehri');
  await page.getByTestId('input-seed').fill('12345');
  await page.getByTestId('btn-start').click();

  // World generation runs in a worker; software WebGL in CI can be slow.
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 80_000 });
  await centreCamera(page);
  await expect(page.getByTestId('city-name')).toHaveText('Test Şehri');
  await page.getByTestId('tab-world').click();
  await expect(page.getByTestId('world-seed')).toHaveText('12345');

  // The engine actually rendered geometry.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __reis: { renderer: { info: { render: { triangles: number } } } } }).__reis.renderer.info.render.triangles))
    .toBeGreaterThan(10_000);

  // Road tool via hotkey, then ESC back to select.
  await page.locator('canvas.game-canvas').click({ position: { x: 800, y: 450 } });
  await page.keyboard.press('y');
  await expect(page.getByTestId('road-types')).toBeVisible();
  await expect(page.getByTestId('tool-road')).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-select')).toHaveClass(/active/);

  // Pause / resume.
  await page.getByTestId('btn-pause').click();
  await expect(page.getByTestId('pause-banner')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('pause-banner')).toBeHidden();

  // Grid toggle and help overlay.
  await page.getByTestId('tool-grid').click();
  await expect(page.getByTestId('tool-grid')).toHaveClass(/active/);
  await page.keyboard.press('h');
  await expect(page.getByTestId('help')).toBeVisible();

  // The terrain tool (once a locked placeholder) is available.
  await expect(page.getByTestId('tool-terrain')).toBeEnabled();

  // Phase 5: power picker, line tool and info layers.
  await page.keyboard.press('h');
  await expect(page.getByTestId('help')).toBeHidden();
  await page.keyboard.press('p');
  await expect(page.getByTestId('picker-power')).toBeVisible();
  await page.getByTestId('line-tool-power').click();
  await expect(page.getByTestId('tool-power')).toHaveClass(/active/);
  await expect(page.getByTestId('layer-legend')).toContainText('Elektrik');
  await page.keyboard.press('j');
  // Services are grouped in tabs: the fire station is under safety, the hospital under health.
  await expect(page.getByTestId('building-type-fire_station')).toBeVisible();
  await page.getByTestId('service-tab-health').click();
  await expect(page.getByTestId('building-type-hospital')).toBeDisabled(); // unlocks at 1,000 residents
  await page.getByTestId('service-tab-city').click();
  await expect(page.getByTestId('building-type-parking_small')).toBeVisible();
  await expect(page.getByTestId('parking-lane-tool')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('tool-layers').click();
  await page.getByTestId('layer-crime').click();
  await expect(page.getByTestId('layer-legend')).toContainText('Suç');
  await page.getByTestId('tool-layers').click();

  // The toolbar never covers the demand meter or the minimap, and stays on screen, on narrow screens too.
  for (const width of [1024, 1366, 1600]) {
    await page.setViewportSize({ width, height: 768 });
    const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
    const bar = await box('.toolbar');
    const demand = await box('.demand');
    const minimap = await box('.minimap');
    for (const o of [demand, minimap]) expect(bar.x >= o.x + o.width || bar.y >= o.y + o.height).toBe(true);
    expect(bar.x).toBeGreaterThanOrEqual(0);
    expect(bar.x + bar.width).toBeLessThanOrEqual(width);
    await expect(page.getByTestId('tool-select')).toBeInViewport();
  }
  await page.setViewportSize({ width: 1600, height: 900 });

  // Walking the streets in first person: the build toolbar hides, Esc returns to the city camera.
  await page.getByTestId('btn-walk').click();
  await expect(page.getByTestId('walk-hud')).toBeVisible();
  await expect(page.getByTestId('tool-road')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('walk-hud')).toBeHidden();
  await expect(page.getByTestId('tool-road')).toBeVisible();

  // Phase 7: graphics and sound settings change the running engine and persist.
  type R = { __reis: { game: { getSettings(): { graphics: Record<string, unknown>; audio: Record<string, unknown> }; dayNight: { night: number } } } };
  const settings = () => page.evaluate(() => (window as unknown as R).__reis.game.getSettings());
  await page.getByTestId('btn-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.getByTestId('quality-low').click();
  await expect(page.getByTestId('shadows-off')).toHaveClass(/active/);
  expect((await settings()).graphics).toMatchObject({ preset: 'low', shadows: 'off', bloom: false });
  await page.getByTestId('shadows-medium').click();
  await expect(page.getByTestId('graphics-preset-hint')).toContainText('Özel');
  await page.getByTestId('look-vivid').click();
  expect((await settings()).graphics).toMatchObject({ look: 'vivid' });
  await page.getByTestId('daynight-night').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as R).__reis.game.dayNight.night)).toBe(1);
  await page.getByTestId('settings-tab-audio').click();
  await page.getByTestId('audio-mute').check();
  expect((await settings()).audio.muted).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('reis.settings.v1') ?? '{}').graphics?.dayNight)).toBe('night');

  expect(errors).toEqual([]);
});

test('zoning a street grows houses and brings residents', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('input-seed').fill('12345');
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 80_000 });
  await centreCamera(page);
  const base = await segments(page);

  const canvas = page.locator('canvas.game-canvas');
  await canvas.click({ position: { x: 900, y: 600 } });
  await page.keyboard.press('y');
  await canvas.click({ position: { x: 600, y: 560 } });
  await canvas.hover({ position: { x: 1150, y: 470 } });
  await canvas.click({ position: { x: 1150, y: 470 } });
  await page.keyboard.press('Escape');
  await expect.poll(() => segments(page)).toBe(base + 1);

  // Zone both sides of the road with the fill mode (default: residential).
  await page.keyboard.press('z');
  await expect(page.getByTestId('zone-picker')).toBeVisible();
  await expect(page.getByTestId('zone-commercial')).toBeDisabled(); // unlocks at 100 residents
  const mid = await page.evaluate(() => {
    type V = { clone(): V; set(x: number, y: number, z: number): V; project(c: unknown): V; x: number; y: number };
    const r = (window as unknown as { __reis: { game: { cameraCtl: { camera: { position: V } } }; city: { roads: { edges: Map<number, { poly: { points: { x: number; z: number }[] } }> } }; renderer: { domElement: HTMLCanvasElement } } }).__reis;
    const e = [...r.city.roads.edges.values()].at(-1)!;
    const p = e.poly.points[Math.floor(e.poly.points.length / 2)];
    const cam = r.game.cameraCtl.camera;
    const v = cam.position.clone().set(p.x, 10, p.z).project(cam);
    return { x: ((v.x + 1) / 2) * r.renderer.domElement.clientWidth, y: ((1 - v.y) / 2) * r.renderer.domElement.clientHeight };
  });
  await canvas.hover({ position: mid });
  await canvas.click({ position: mid });
  const zoned = await page.evaluate(() => (window as unknown as { __reis: { city: { zones: { countZoned(): Record<number, number> } } } }).__reis.city.zones.countZoned()[1]);
  expect(zoned).toBeGreaterThan(30);

  // Houses need electricity and water: a wind turbine, a water tower, and a pipe and power line along the street.
  // The city hall gives residents a workplace to drive to.
  const infra = await page.evaluate(async () => {
    type P = { x: number; z: number };
    type C = {
      zones: { zoneable: Uint8Array };
      roads: { edges: Map<number, { a: number; b: number; typeId: string; poly: { points: P[] } }>; nodes: Map<number, { id: number; x: number; z: number }>; nearestNode(x: number, z: number, r: number): { id: number; x: number; z: number } | null };
      entryLink: P;
      plannerWorld: unknown;
      buildRoad(p: unknown): unknown;
      planBuilding(id: string, i: number, j: number, rot: number): { valid: boolean };
      placeBuilding(p: unknown): unknown;
      planLine(k: string, a: P, b: P): { valid: boolean };
      buildLine(p: unknown): boolean;
    };
    const city = (window as unknown as { __reis: { city: C } }).__reis.city;
    const pts = [...city.roads.edges.values()].filter((e) => e.typeId !== 'intercity' && e.typeId !== 'citylink').at(-1)!.poly.points;
    const a = pts[0];
    const b = pts[pts.length - 1];
    // Zoneable cells nearest the test street first, so the utilities sit by its pipe and power line.
    const mx = ((a.x + b.x) / 2) / 8;
    const mz = ((a.z + b.z) / 2) / 8;
    const cells: number[] = [];
    for (let k = 0; k < 256 * 256; k++) if (city.zones.zoneable[k]) cells.push(k);
    cells.sort((p, q) => Math.hypot((p % 256) - mx, Math.floor(p / 256) - mz) - Math.hypot((q % 256) - mx, Math.floor(q / 256) - mz));
    const place = (id: string) => {
      for (const k of cells) {
        for (const rot of [0, 1, 2, 3]) {
          const p = city.planBuilding(id, k % 256, Math.floor(k / 256), rot);
          if (p.valid) return city.placeBuilding(p) !== null;
        }
      }
      return false;
    };
    const built = [place('wind_turbine'), place('water_tower'), place('city_hall'), city.buildLine(city.planLine('pipe', a, b)), city.buildLine(city.planLine('power', a, b))];
    // Connect the street to the entry road: newcomers arrive through it.
    const dev = (p: string) => import(/* @vite-ignore */ p);
    const { planRoad } = await dev('/src/game/tools/placement/RoadPlanner.ts');
    const { getRoadType } = await dev('/src/game/data/roads.ts');
    const end = city.roads.nearestNode(city.entryLink.x, city.entryLink.z, 2)!;
    let linked = false;
    for (const q of [b, a]) {
      const n = city.roads.nearestNode(q.x, q.z, 2);
      if (!n || linked) continue;
      // A city road may bridge the river between the street and the link road.
      for (const type of ['street', 'city']) {
        if (linked) break;
        const plan = planRoad(city.roads as never, { kind: 'node', nodeId: n.id, point: n }, { kind: 'node', nodeId: end.id, point: end }, null, getRoadType(type), city.plannerWorld as never, 1e9);
        if (plan.valid) linked = city.buildRoad(plan) !== null;
      }
    }
    return [linked, ...built];
  });
  expect(infra, JSON.stringify(infra)).toEqual([true, true, true, true, true, true]);

  // Fast-forward the fixed-step simulation (same code path as normal ticks).
  await page.evaluate(() => {
    const g = (window as unknown as { __reis: { game: { sim: { advance(dt: number): void } } } }).__reis.game;
    for (let i = 0; i < 3000; i++) g.sim.advance(0.1);
  });
  await expect.poll(async () => Number((await page.getByTestId('population').innerText()).replace(/\D/g, ''))).toBeGreaterThan(10);
  await page.getByTestId('tab-people').click();
  await expect(page.getByTestId('stat-population')).not.toHaveText('0');
  await expect(page.getByTestId('happiness-factors')).toContainText('Temel');

  // Phase 6: residents drive to work at the city hall; the traffic map shows it.
  await page.getByTestId('tab-city').click();
  await expect.poll(async () => Number((await page.getByTestId('stat-trips').innerText()).replace(/\D/g, ''))).toBeGreaterThan(0);
  await page.getByTestId('tool-layers').click();
  await page.getByTestId('layer-traffic').click();
  await expect(page.getByTestId('layer-legend')).toContainText('Trafik yoğunluğu');
  await page.getByTestId('tool-layers').click();

  // Budget: taxes are collected and the residential rate can be changed with the keyboard.
  await page.getByTestId('tab-economy').click();
  await expect(page.getByTestId('tax-residential-value')).toHaveText('%9');
  await page.getByTestId('tax-residential').focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('tax-residential-value')).toHaveText('%14');
  await expect(page.getByTestId('eco-upkeep-roads')).toContainText('₺');
  expect(errors).toEqual([]);
});

test('builds a road, charges the budget and demolishes it with a refund', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByTestId('input-seed').fill('12345');
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 80_000 });
  await centreCamera(page);
  const base = await segments(page);

  const canvas = page.locator('canvas.game-canvas');
  const budgetText = () => page.getByTestId('budget').innerText();
  const before = await budgetText();

  await canvas.click({ position: { x: 900, y: 600 } });
  await page.keyboard.press('y');
  await canvas.click({ position: { x: 600, y: 560 } });
  await canvas.hover({ position: { x: 1150, y: 470 } });
  await canvas.click({ position: { x: 1150, y: 470 } });
  await page.keyboard.press('Escape');

  await expect.poll(() => segments(page)).toBe(base + 1);
  expect(await budgetText()).not.toBe(before);

  // Demolish it: project the built road's midpoint to the screen and click it.
  const mid = await page.evaluate(() => {
    type V = { x: number; y: number; z: number; clone(): V; set(x: number, y: number, z: number): V; project(c: unknown): V };
    const r = (window as unknown as {
      __reis: {
        game: { cameraCtl: { camera: { position: V } } };
        city: { roads: { edges: Map<number, { poly: { points: { x: number; z: number }[] } }> }; };
        renderer: { domElement: HTMLCanvasElement };
      };
    }).__reis;
    const e = [...r.city.roads.edges.values()].at(-1)!;
    const p = e.poly.points[Math.floor(e.poly.points.length / 2)];
    const cam = r.game.cameraCtl.camera;
    const v = cam.position.clone().set(p.x, 10, p.z).project(cam);
    const el = r.renderer.domElement;
    return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
  });
  await page.keyboard.press('x');
  await canvas.hover({ position: mid });
  await expect(page.getByTestId('inspector-demolish')).toContainText('Mahalle Yolu');
  await canvas.click({ position: mid });
  await expect.poll(() => segments(page)).toBe(base);
  await expect(page.getByTestId('toast').first()).toContainText('iade');

  expect(errors).toEqual([]);
});

test('saves a city to IndexedDB, survives a reload and continues; achievements and statistics', async ({ page }) => {
  // Generates the world twice (new city, then the reload): give it room on a busy machine.
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('btn-continue')).toHaveCount(0);
  await page.getByTestId('input-city').fill('Kayıt Kenti');
  await page.getByTestId('input-seed').fill('12345');
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 80_000 });
  await centreCamera(page);
  const base = await segments(page);

  const canvas = page.locator('canvas.game-canvas');
  await canvas.click({ position: { x: 900, y: 600 } });
  await page.keyboard.press('y');
  await canvas.click({ position: { x: 600, y: 560 } });
  await canvas.hover({ position: { x: 1150, y: 470 } });
  await canvas.click({ position: { x: 1150, y: 470 } });
  await page.keyboard.press('Escape');
  await expect.poll(() => segments(page)).toBe(base + 1);

  // The first road earns an achievement (checked on the next simulation step).
  await page.getByTestId('btn-achievements').click();
  await expect(page.getByTestId('achievement-first_road')).toHaveAttribute('data-earned', 'true');
  await page.getByTestId('btn-stats').click();
  await expect(page.getByTestId('stats-panel')).toBeVisible();
  await page.getByTestId('btn-stats').click();

  // Manual save (Ctrl+S); pause first so the budget can't move before saving.
  await page.getByTestId('btn-pause').click();
  // Read after the pause: the mission reward for the first road is already paid.
  const budget = await page.getByTestId('budget').innerText();
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('toast').filter({ hasText: 'kaydedildi' })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('btn-continue')).toContainText('Kayıt Kenti');
  await page.getByTestId('menu-tab-saves').click();
  await expect(page.getByTestId('save-row')).toHaveCount(1);
  await page.getByTestId('btn-continue').click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 80_000 });
  await expect(page.getByTestId('city-name')).toHaveText('Kayıt Kenti');
  await expect.poll(() => segments(page)).toBe(base + 1);
  await expect(page.getByTestId('pause-banner')).toBeVisible();
  expect(await page.getByTestId('budget').innerText()).toBe(budget);
  await page.getByTestId('btn-achievements').click();
  await expect(page.getByTestId('achievement-first_road')).toHaveAttribute('data-earned', 'true');

  // Leaving through the menu writes the autosave slot as well.
  await page.getByTestId('btn-settings').click();
  await page.getByTestId('settings-tab-game').click();
  await page.getByTestId('btn-main-menu').click();
  await page.getByTestId('menu-tab-saves').click();
  await expect(page.getByTestId('save-row')).toHaveCount(2);
  expect(errors).toEqual([]);
});
