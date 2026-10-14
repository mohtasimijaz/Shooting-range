const COMBO_WINDOW = 1.0;

export class Score {
  points = 0;
  combo = 0;
  multiplier = 1;
  private lastHit = -999;

  reset(): void {
    this.points = 0;
    this.combo = 0;
    this.multiplier = 1;
    this.lastHit = -999;
  }

  registerHit(now: number, basePoints: number): number {
    if (now - this.lastHit <= COMBO_WINDOW) {
      this.combo += 1;
    } else {
      this.combo = 1;
    }
    this.lastHit = now;
    this.multiplier = 1 + Math.max(0, this.combo - 1) * 0.25;
    const gained = Math.round(basePoints * this.multiplier);
    this.points += gained;
    return gained;
  }

  registerMiss(now: number): void {
    this.combo = 0;
    this.multiplier = 1;
    this.lastHit = now - COMBO_WINDOW - 1;
  }

  tick(now: number): void {
    if (this.combo > 0 && now - this.lastHit > COMBO_WINDOW) {
      this.combo = 0;
      this.multiplier = 1;
    }
  }
}
