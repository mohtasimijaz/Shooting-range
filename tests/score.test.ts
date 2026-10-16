import { describe, expect, it } from "vitest";
import { COMBO_WINDOW, MAX_MULTIPLIER, Score } from "../src/game/Score";

describe("Score", () => {
  it("scores a single hit at x1", () => {
    const s = new Score();
    expect(s.registerHit(0, 100)).toBe(100);
    expect(s.points).toBe(100);
    expect(s.combo).toBe(1);
  });

  it("builds a combo inside the window", () => {
    const s = new Score();
    s.registerHit(0, 100);
    expect(s.registerHit(0.5, 100)).toBe(125);
    expect(s.registerHit(1.0, 100)).toBe(150);
    expect(s.combo).toBe(3);
    expect(s.bestCombo).toBe(3);
  });

  it("resets the combo after the window or on a miss", () => {
    const s = new Score();
    s.registerHit(0, 100);
    s.registerHit(0.5, 100);
    s.tick(0.5 + COMBO_WINDOW + 0.01);
    expect(s.combo).toBe(0);
    s.registerHit(5, 100);
    s.registerMiss(5.1);
    expect(s.combo).toBe(0);
    expect(s.registerHit(5.2, 100)).toBe(100);
  });

  it("caps the multiplier", () => {
    const s = new Score();
    for (let i = 0; i < 40; i++) s.registerHit(i * 0.1, 10);
    expect(s.multiplier).toBe(MAX_MULTIPLIER);
  });

  it("applies the precision bonus", () => {
    const s = new Score();
    expect(s.registerHit(0, 100, 1.5)).toBe(150);
  });

  it("tracks accuracy", () => {
    const s = new Score();
    expect(s.accuracy).toBe(0);
    for (let i = 0; i < 4; i++) s.registerShot();
    s.registerHit(0, 10);
    s.registerHit(0.1, 10);
    s.registerHit(0.2, 10);
    expect(s.accuracy).toBe(75);
  });

  it("penalties never push the score below zero", () => {
    const s = new Score();
    s.registerHit(0, 100);
    expect(s.applyPenalty(0.1, 250)).toBe(100);
    expect(s.points).toBe(0);
    expect(s.penalties).toBe(1);
    expect(s.combo).toBe(0);
  });

  it("reset clears everything", () => {
    const s = new Score();
    s.registerShot();
    s.registerHit(0, 100);
    s.registerKill();
    s.reset();
    expect([s.points, s.shots, s.hits, s.kills, s.combo, s.bestCombo]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
