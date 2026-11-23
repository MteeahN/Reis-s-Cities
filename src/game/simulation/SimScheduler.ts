import { GAME_MINUTES_PER_SECOND, SIM_TICK_HZ, type GameSpeed } from '../core/config';

export interface SimSystem {
  readonly name: string;
  /** Run every N simulation ticks (lets economy/population/traffic tick at different rates). */
  readonly interval: number;
  update(tick: number, gameMinutes: number): void;
}

/**
 * Fixed-timestep simulation driver, fully decoupled from rendering. Real time
 * is scaled by the game speed and converted into whole ticks; each system runs
 * on its own interval. When paused (speed 0) nothing advances.
 */
export class SimScheduler {
  static readonly TICK_SECONDS = 1 / SIM_TICK_HZ;
  static readonly MAX_TICKS_PER_FRAME = 12;

  speed: GameSpeed = 1;
  tick = 0;
  /** Simulated in-game minutes since the city was founded. */
  gameMinutes = 0;
  private accumulator = 0;
  private readonly systems: SimSystem[] = [];

  register(system: SimSystem): void {
    this.systems.push(system);
  }

  /** Advance by a real-time delta; returns the number of ticks executed. */
  advance(realDt: number): number {
    if (this.speed === 0) return 0;
    this.accumulator += Math.min(realDt, 0.25) * this.speed;
    let ran = 0;
    // Epsilon guards against float drift (e.g. 100 × 0.01 s summing to 0.99999…).
    while (this.accumulator >= SimScheduler.TICK_SECONDS - 1e-9 && ran < SimScheduler.MAX_TICKS_PER_FRAME) {
      this.accumulator -= SimScheduler.TICK_SECONDS;
      this.tick++;
      this.gameMinutes += GAME_MINUTES_PER_SECOND * SimScheduler.TICK_SECONDS;
      for (const s of this.systems) if (this.tick % s.interval === 0) s.update(this.tick, this.gameMinutes);
      ran++;
    }
    if (ran === SimScheduler.MAX_TICKS_PER_FRAME) this.accumulator = 0; // drop backlog instead of spiralling
    return ran;
  }
}
