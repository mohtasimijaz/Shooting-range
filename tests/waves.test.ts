import { describe, expect, it } from "vitest";
import {
  CHECKPOINTS,
  TOTAL_WAVES,
  UNLOCK_WAVE,
  checkpointFor,
  generateWave,
  waveParams,
  type TargetKind,
} from "../src/game/WaveGen";

const ALL = Array.from({ length: TOTAL_WAVES }, (_, i) => generateWave(i + 1));

describe("50-wave campaign", () => {
  it("has 50 waves in 5 tiers of 10", () => {
    expect(TOTAL_WAVES).toBe(50);
    expect(ALL).toHaveLength(50);
    expect(new Set(ALL.map((w) => w.tierName)).size).toBe(5);
    ALL.forEach((w, i) => expect(w.tier).toBe(Math.floor(i / 10)));
  });

  it("every wave is valid", () => {
    for (const w of ALL) {
      expect(w.name.length).toBeGreaterThan(0);
      expect(w.requiredCount).toBeGreaterThan(0);
      expect(w.timeBonus).toBeGreaterThan(0);
      const required = w.entries
        .filter((e) => e.kind !== "civilian" && e.kind !== "bonus")
        .reduce((s, e) => s + e.count, 0);
      expect(required).toBe(w.requiredCount);
      for (const e of w.entries) {
        expect(e.count).toBeGreaterThan(0);
        expect(e.hp).toBeGreaterThanOrEqual(1);
        expect(e.hp).toBeLessThanOrEqual(5);
        expect(Number.isFinite(e.points)).toBe(true);
        expect(w.number).toBeGreaterThanOrEqual(UNLOCK_WAVE[e.kind]);
        if (e.kind === "popup") {
          expect(e.popupUp).toBeGreaterThan(0);
          expect(e.popupDown).toBeGreaterThan(0);
        }
      }
    }
  });

  it("base difficulty never gets easier from one wave to the next", () => {
    for (let n = 2; n <= TOTAL_WAVES; n++) {
      const a = waveParams(n - 1);
      const b = waveParams(n);
      expect(b.count).toBeGreaterThanOrEqual(a.count);
      expect(b.maxHp).toBeGreaterThanOrEqual(a.maxHp);
      expect(b.speed).toBeGreaterThanOrEqual(a.speed);
      expect(b.exposure).toBeLessThanOrEqual(a.exposure);
      expect(b.hidden).toBeLessThanOrEqual(a.hidden);
      expect(b.rows).toBeGreaterThanOrEqual(a.rows);
    }
  });

  it("wave 50 is much harder than wave 1", () => {
    const first = waveParams(1);
    const last = waveParams(50);
    expect(last.count).toBe(16);
    expect(first.count).toBe(6);
    expect(last.maxHp).toBe(4);
    expect(last.speed).toBeGreaterThan(first.speed * 2.5);
    expect(last.exposure).toBeLessThan(first.exposure / 2);
    expect(last.rows).toBe(3);
  });

  it("each tier's average target count rises", () => {
    const avg = (tier: number) =>
      ALL.filter((w) => w.tier === tier).reduce((s, w) => s + w.requiredCount, 0) / 10;
    for (let t = 1; t < 5; t++) expect(avg(t)).toBeGreaterThan(avg(t - 1));
  });

  it("every 10th wave is a boss wave with extra targets", () => {
    for (const w of ALL) {
      expect(w.boss).toBe(w.number % 10 === 0);
      if (w.boss) expect(w.requiredCount).toBe(w.params.count + 2);
    }
  });

  it("introduces new target types tier by tier", () => {
    const firstSeen = new Map<TargetKind, number>();
    for (const w of ALL) for (const e of w.entries) if (!firstSeen.has(e.kind)) firstSeen.set(e.kind, w.number);
    expect(firstSeen.get("static")).toBe(1);
    expect(firstSeen.get("zigzag")).toBeGreaterThanOrEqual(11);
    expect(firstSeen.get("steel")).toBeGreaterThanOrEqual(21);
    expect(firstSeen.get("civilian")).toBe(21);
    expect(firstSeen.get("swinger")).toBeGreaterThanOrEqual(31);
    expect(firstSeen.get("bonus")).toBe(31);
  });

  it("is deterministic", () => {
    expect(generateWave(37)).toEqual(generateWave(37));
  });

  it("clamps out-of-range wave numbers", () => {
    expect(generateWave(0).number).toBe(1);
    expect(generateWave(999).number).toBe(50);
  });

  it("maps waves to checkpoints", () => {
    expect(CHECKPOINTS).toEqual([1, 11, 21, 31, 41]);
    expect(checkpointFor(1)).toBe(1);
    expect(checkpointFor(10)).toBe(1);
    expect(checkpointFor(11)).toBe(11);
    expect(checkpointFor(35)).toBe(31);
    expect(checkpointFor(50)).toBe(41);
  });
});
