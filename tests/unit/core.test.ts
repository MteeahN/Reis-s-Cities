import { describe, expect, it, vi } from 'vitest';
import { GAME_MINUTES_PER_SECOND } from '../../src/game/core/config';
import { EventBus } from '../../src/game/core/EventBus';
import { QualityManager } from '../../src/game/rendering/QualityManager';
import { SimScheduler } from '../../src/game/simulation/SimScheduler';
import { formatGameDate, formatMoney, toGameDate } from '../../src/utils/format';
import { angleDelta, clamp, smoothstep } from '../../src/utils/math';

describe('SimScheduler', () => {
  it('advances game time at a fixed rate scaled by speed', () => {
    const s = new SimScheduler();
    for (let i = 0; i < 100; i++) s.advance(0.01); // 1 real second
    expect(s.gameMinutes).toBeCloseTo(GAME_MINUTES_PER_SECOND, 0);
    s.speed = 3;
    const before = s.gameMinutes;
    for (let i = 0; i < 100; i++) s.advance(0.01);
    expect(s.gameMinutes - before).toBeCloseTo(GAME_MINUTES_PER_SECOND * 3, 0);
  });

  it('does nothing while paused', () => {
    const s = new SimScheduler();
    s.speed = 0;
    expect(s.advance(1)).toBe(0);
    expect(s.gameMinutes).toBe(0);
  });

  it('runs systems on their own intervals', () => {
    const s = new SimScheduler();
    const fast = vi.fn();
    const slow = vi.fn();
    s.register({ name: 'fast', interval: 1, update: fast });
    s.register({ name: 'slow', interval: 5, update: slow });
    for (let i = 0; i < 20; i++) s.advance(0.1);
    expect(fast).toHaveBeenCalledTimes(20);
    expect(slow).toHaveBeenCalledTimes(4);
  });

  it('caps catch-up work after a long stall', () => {
    const s = new SimScheduler();
    s.speed = 3;
    expect(s.advance(10)).toBeLessThanOrEqual(SimScheduler.MAX_TICKS_PER_FRAME);
  });
});

describe('EventBus', () => {
  it('delivers typed payloads and supports unsubscribe', () => {
    const bus = new EventBus<{ a: number; b: string }>();
    const fn = vi.fn();
    const off = bus.on('a', fn);
    bus.emit('a', 3);
    off();
    bus.emit('a', 4);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });
});

describe('QualityManager', () => {
  it('steps down when FPS stays low and never climbs back to a failed level', () => {
    const levels: string[] = [];
    const q = new QualityManager((l) => levels.push(l));
    const run = (fps: number, seconds: number) => {
      for (let t = 0; t < seconds * fps; t++) q.sample(1 / fps);
    };
    run(60, 3); // cooldown
    let guard = 0;
    while (q.level === 'high' && guard++ < 100_000) q.sample(1 / 25);
    expect(q.level).toBe('medium');
    expect(levels).toEqual(['medium']);
    run(60, 40);
    expect(q.level).toBe('medium');
  });

  it('ignores stalls from a throttled/background tab', () => {
    const q = new QualityManager(() => {});
    for (let i = 0; i < 200; i++) q.sample(1); // 1 FPS "frames" from rAF throttling
    expect(q.level).toBe('high');
  });

  it('respects a manual setting', () => {
    const q = new QualityManager(() => {});
    q.setSetting('low');
    expect(q.level).toBe('low');
  });
});

describe('format & math utils', () => {
  it('formats the game calendar from minute 0 = Day 1 08:00', () => {
    expect(formatGameDate(0)).toEqual({ date: '1 Oca Yıl 1', time: '08:00' });
    expect(toGameDate(16 * 60).day).toBe(2);
    expect(toGameDate(16 * 60).hour).toBe(0);
    expect(toGameDate(30 * 1440).month).toBe(1);
  });

  it('formats money in Turkish lira', () => {
    expect(formatMoney(70000)).toBe('₺70.000');
  });

  it('math helpers behave', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(angleDelta(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2);
  });
});
