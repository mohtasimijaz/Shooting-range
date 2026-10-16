/**
 * Points, combo multiplier and run statistics.
 * Hits within COMBO_WINDOW seconds of each other build a combo; each step adds
 * 0.25 to the multiplier (capped). A miss or a no-shoot hit resets it.
 */

export const COMBO_WINDOW = 1.0;
export const MAX_MULTIPLIER = 4;

export class Score {
  points = 0;
  combo = 0;
  multiplier = 1;
  shots = 0;
  hits = 0;
  kills = 0;
  bestCombo = 0;
  bullseyes = 0;
  penalties = 0;
  private lastHit = -999;

  /** Hit percentage 0..100 (0 when nothing has been fired). */
  get accuracy(): number {
    return this.shots === 0 ? 0 : Math.round((this.hits / this.shots) * 100);
  }

  reset(): void {
    this.points = 0;
    this.combo = 0;
    this.multiplier = 1;
    this.shots = 0;
    this.hits = 0;
    this.kills = 0;
    this.bestCombo = 0;
    this.bullseyes = 0;
    this.penalties = 0;
    this.lastHit = -999;
  }

  registerShot(): void {
    this.shots += 1;
  }

  /**
   * Scores a hit. `precision` multiplies the base points (bullseye bonus).
   * Returns the points actually gained.
   */
  registerHit(now: number, basePoints: number, precision = 1): number {
    this.hits += 1;
    this.combo = now - this.lastHit <= COMBO_WINDOW ? this.combo + 1 : 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.lastHit = now;
    this.multiplier = Math.min(MAX_MULTIPLIER, 1 + Math.max(0, this.combo - 1) * 0.25);
    const gained = Math.round(basePoints * precision * this.multiplier);
    this.points += gained;
    return gained;
  }

  registerKill(): void {
    this.kills += 1;
  }

  registerBullseye(): void {
    this.bullseyes += 1;
  }

  registerMiss(now: number): void {
    this.breakCombo(now);
  }

  /** No-shoot hit: lose points (never below zero) and the combo. */
  applyPenalty(now: number, amount: number): number {
    const lost = Math.min(this.points, amount);
    this.points -= lost;
    this.penalties += 1;
    this.breakCombo(now);
    return lost;
  }

  addBonus(points: number): void {
    this.points += points;
  }

  tick(now: number): void {
    if (this.combo > 0 && now - this.lastHit > COMBO_WINDOW) {
      this.combo = 0;
      this.multiplier = 1;
    }
  }

  /** 0..1 of the combo window remaining (for the HUD combo bar). */
  comboTimeLeft(now: number): number {
    if (this.combo <= 1) return 0;
    return Math.max(0, 1 - (now - this.lastHit) / COMBO_WINDOW);
  }

  private breakCombo(now: number): void {
    this.combo = 0;
    this.multiplier = 1;
    this.lastHit = now - COMBO_WINDOW - 1;
  }
}
