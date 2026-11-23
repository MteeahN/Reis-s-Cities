import { describe, expect, it } from 'vitest';
import { ambienceMix, channelGain } from '../../src/game/audio/AudioEngine';
import { DEFAULT_SETTINGS, nextGraphics, presetValues, sanitizeSettings } from '../../src/game/core/settings';
import { getBuilding, ALL_BUILDINGS } from '../../src/game/data/buildings';
import { getRoadType } from '../../src/game/data/roads';
import { ZoneType } from '../../src/game/data/zones';
import { buildingGeometry, hipGeometry, isDetailPart, variantCount, variantParts } from '../../src/game/entities/building/BuildingModels';
import { PROCEDURAL_VARIANTS, variantSpec } from '../../src/game/entities/building/ProceduralBuildings';
import { RoadGraph } from '../../src/game/entities/road/RoadGraph';
import { SUNRISE_HOUR, SUNSET_HOUR, skyStateAt, sunPosition } from '../../src/game/rendering/DayNight';
import { RoadRenderer } from '../../src/game/rendering/roads/RoadRenderer';
import { StreetFurniture, lampLayout } from '../../src/game/rendering/StreetFurniture';
import { windowLitShare, type LitInput } from '../../src/game/rendering/windowLights';
import { carModels, truckModels } from '../../src/game/rendering/VehicleModels';

describe('Day/night cycle', () => {
  it('the sun rises, peaks at midday and sets', () => {
    expect(Math.abs(sunPosition(SUNRISE_HOUR * 60).elevation)).toBeLessThan(0.5);
    expect(Math.abs(sunPosition(SUNSET_HOUR * 60).elevation)).toBeLessThan(0.5);
    expect(sunPosition(13 * 60).elevation).toBeGreaterThan(55);
    expect(sunPosition(0).elevation).toBeLessThan(-15);
    // East in the morning, west in the evening.
    expect(sunPosition(8 * 60).azimuth).toBeLessThan(sunPosition(18 * 60).azimuth);
  });

  it('night factor, stars and light follow the clock', () => {
    const noon = skyStateAt(12 * 60);
    const midnight = skyStateAt(0);
    expect(noon.night).toBe(0);
    expect(midnight.night).toBe(1);
    expect(noon.stars).toBe(0);
    expect(midnight.stars).toBeGreaterThan(0.9);
    expect(noon.lightIntensity).toBeGreaterThan(midnight.lightIntensity * 4);
    // At night the key light is the moon: from above, not from below the horizon.
    expect(midnight.lightElevation).toBeGreaterThan(20);
  });

  it('light changes smoothly through a whole day (no pops at dusk or dawn)', () => {
    let prev = skyStateAt(0);
    for (let m = 1; m <= 1440; m++) {
      const s = skyStateAt(m);
      expect(Math.abs(s.lightIntensity - prev.lightIntensity)).toBeLessThan(0.08);
      expect(Math.abs(s.night - prev.night)).toBeLessThan(0.05);
      prev = s;
    }
  });
});

describe('Window lights at night', () => {
  const base: LitInput = { state: 'active', zone: ZoneType.Residential, occupants: 4, capacity: 4, needsPower: true, powered: true, hour: 21 };
  it('lit windows follow occupancy and power', () => {
    expect(windowLitShare(base)).toBeGreaterThan(0.5);
    expect(windowLitShare({ ...base, occupants: 0 })).toBe(0);
    expect(windowLitShare({ ...base, powered: false })).toBe(0); // blackout
    expect(windowLitShare({ ...base, state: 'abandoned' })).toBe(0);
    expect(windowLitShare({ ...base, state: 'construction' })).toBe(0);
  });
  it('homes go dark late at night; closed shops are dark', () => {
    expect(windowLitShare({ ...base, hour: 3 })).toBeLessThan(windowLitShare(base) / 2);
    const shop = { ...base, zone: ZoneType.Commercial };
    expect(windowLitShare({ ...shop, occupants: 0 })).toBe(0);
    expect(windowLitShare({ ...shop, hour: 2 })).toBeLessThan(windowLitShare({ ...shop, hour: 19 }));
  });
});

describe('Building models', () => {
  it('growables have colour/roof variants that differ from the base look', () => {
    const def = getBuilding('res1_house_a');
    expect(variantCount(def)).toBe(PROCEDURAL_VARIANTS);
    const v1 = variantSpec(def.spec!, 1);
    expect(v1.roof).not.toBe(def.spec!.roof);
    expect(v1.wall).not.toBe(def.spec!.wall);
    // Variant 2 of a house uses a hipped roof.
    expect(variantParts(def, 2).some((p) => p.shape === 'hip')).toBe(true);
    // Hand-authored landmarks have a single look.
    expect(variantCount(getBuilding('city_hall'))).toBe(1);
  });

  it('every catalogue model and variant builds, with facades tagged by atlas tile', () => {
    for (const def of ALL_BUILDINGS) {
      for (let v = 0; v < variantCount(def); v++) {
        const g = buildingGeometry(def, v);
        expect(g.plain || g.facade).toBeTruthy();
        expect(g.height).toBeGreaterThan(0);
        if (g.facade) {
          const tiles = new Set(g.facade.getAttribute('aTile').array as Float32Array);
          for (const t of tiles) expect([0, 1, 2, 3]).toContain(t);
        }
      }
    }
    // Offices use the curtain-wall tile, shops the shopfront tile.
    expect([...(buildingGeometry(getBuilding('com3_office_m')).facade!.getAttribute('aTile').array as Float32Array)]).toContain(1);
    expect([...(buildingGeometry(getBuilding('com1_shop')).facade!.getAttribute('aTile').array as Float32Array)]).toContain(2);
  });

  it('small parts go to the LOD detail layer, construction sites keep them', () => {
    const def = getBuilding('res1_house_a');
    expect(def.model.some(isDetailPart)).toBe(true);
    expect(buildingGeometry(def).detail).not.toBeNull();
    expect(buildingGeometry(def, 0, false).detail).toBeNull();
  });

  it('hipped roofs slope on all four sides', () => {
    const g = hipGeometry(10, 3, 6);
    const n = g.getAttribute('normal');
    let ups = 0;
    for (let i = 0; i < n.count; i++) if (n.getY(i) > 0.3) ups++;
    expect(ups).toBe(18); // 2 trapezoids (6 verts each) + 2 triangles (3 each)
  });
});

describe('Vehicles', () => {
  it('ships several car and truck models with lamps', () => {
    const cars = carModels();
    const trucks = truckModels();
    expect(cars.length).toBeGreaterThanOrEqual(4);
    expect(trucks.length).toBeGreaterThanOrEqual(2);
    for (const g of [...cars, ...trucks]) {
      const glow = g.getAttribute('aGlow').array as Float32Array;
      expect(glow.some((v) => v > 0.5)).toBe(true);
    }
  });
});

describe('Street furniture', () => {
  it('lamp layout depends on the road type', () => {
    expect(lampLayout(getRoadType('street')).offsets).toHaveLength(1);
    expect(lampLayout(getRoadType('avenue')).offsets).toHaveLength(2);
    expect(lampLayout(getRoadType('boulevard')).offsets).toEqual([0]); // median
  });

  it('places lamps along roads and trees on boulevard medians, away from junctions', () => {
    const g = new RoadGraph();
    const a = g.addNode(100, 100).id;
    const b = g.addNode(400, 100).id;
    const c = g.addNode(400, 400).id;
    g.addEdge(a, b, 'street', { x: 250, z: 100 }, 0);
    g.addEdge(b, c, 'boulevard', { x: 400, z: 250 }, 0);
    // Dry land above the water level (height 0 would make the roads bridges).
    const rr = new RoadRenderer(g, () => 10);
    const f = new StreetFurniture(g, rr, () => 10);
    const { lamps, trees } = f.layout();
    expect(lamps.length).toBeGreaterThan(10);
    expect(trees.length).toBeGreaterThan(5);
    for (const l of lamps) {
      // Not inside a junction area.
      for (const n of [g.nodes.get(a)!, g.nodes.get(b)!, g.nodes.get(c)!]) expect(Math.hypot(l.x - n.x, l.z - n.z)).toBeGreaterThan(6);
      expect(Math.hypot(l.ix, l.iz)).toBeCloseTo(1, 3);
    }
    // Boulevard trees stand on the median line x = 400.
    for (const t of trees) expect(Math.abs(t.x - 400)).toBeLessThan(0.5);
    rr.dispose();
    f.dispose();
  });
});

describe('Settings', () => {
  it('sanitizes stored settings field by field', () => {
    const s = sanitizeSettings({ graphics: { preset: 'ultra', resolution: 9, vehicles: -5, bloom: 'yes', dayNight: 'night' }, audio: { master: 0.3, muted: 1 } });
    expect(s.graphics.preset).toBe(DEFAULT_SETTINGS.graphics.preset);
    expect(s.graphics.resolution).toBe(2);
    expect(s.graphics.vehicles).toBe(0);
    expect(s.graphics.bloom).toBe(DEFAULT_SETTINGS.graphics.bloom);
    expect(s.graphics.dayNight).toBe('night');
    expect(s.audio.master).toBe(0.3);
    expect(s.audio.muted).toBe(false);
    expect(sanitizeSettings('garbage')).toEqual(DEFAULT_SETTINGS);
  });

  it('presets copy their values; editing a value makes it custom', () => {
    const g = DEFAULT_SETTINGS.graphics;
    const low = nextGraphics(g, { preset: 'low' }, 'high');
    expect(low).toMatchObject({ preset: 'low', ...presetValues('low') });
    expect(low.shadows).toBe('off');
    const custom = nextGraphics(low, { vehicles: 420 }, 'high');
    expect(custom.preset).toBe('custom');
    expect(custom.vehicles).toBe(420);
    // Day/night is independent of presets.
    expect(nextGraphics(low, { dayNight: 'day' }, 'high').preset).toBe('low');
    // 'auto' takes the level auto quality is on right now.
    expect(nextGraphics(custom, { preset: 'auto' }, 'medium')).toMatchObject({ preset: 'auto', ...presetValues('medium') });
  });
});

describe('Ambience', () => {
  const quiet = { vehicles: 0, buildings: 0, trees: 0, cameraDistance: 200, night: 0, paused: false };
  it('busy roads and dense blocks are heard near the camera', () => {
    const m = ambienceMix({ ...quiet, vehicles: 80, buildings: 60 });
    expect(m.traffic).toBeGreaterThan(0.8);
    expect(m.city).toBeGreaterThan(0.8);
    expect(ambienceMix({ ...quiet, vehicles: 80, paused: true }).traffic).toBeLessThan(m.traffic * 0.2);
  });
  it('woods have birds by day and crickets by night', () => {
    const day = ambienceMix({ ...quiet, trees: 200 });
    const night = ambienceMix({ ...quiet, trees: 200, night: 1 });
    expect(day.birds).toBeGreaterThan(0.8);
    expect(day.crickets).toBe(0);
    expect(night.crickets).toBeGreaterThan(0.8);
    expect(night.birds).toBe(0);
  });
  it('zooming out leaves mostly wind', () => {
    const far = ambienceMix({ ...quiet, vehicles: 80, buildings: 60, trees: 200, cameraDistance: 1600 });
    expect(far.traffic).toBe(0);
    expect(far.birds).toBe(0);
    expect(far.wind).toBeGreaterThan(ambienceMix(quiet).wind);
  });
  it('master volume and mute scale the channels', () => {
    const a = { master: 0.5, ambience: 0.8, effects: 1, muted: false };
    expect(channelGain(a, 'ambience')).toBeCloseTo(0.4);
    expect(channelGain({ ...a, muted: true }, 'effects')).toBe(0);
  });
});
