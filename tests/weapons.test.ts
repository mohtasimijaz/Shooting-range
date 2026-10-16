import { describe, expect, it } from "vitest";
import { WEAPONS, WeaponLoadout } from "../src/game/Weapon";

function idx(id: string): number {
  return WEAPONS.findIndex((w) => w.id === id);
}

/** Advances the loadout in small steps, like the game loop does. */
function run(l: WeaponLoadout, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.01) l.update(0.01);
}

describe("weapon definitions", () => {
  it("has 3 pistols and the AK-47 and M416 rifles", () => {
    expect(WEAPONS.map((w) => w.id)).toEqual(["nine", "compact", "magnum", "ak47", "m416"]);
    expect(WEAPONS.filter((w) => w.cls === "rifle").map((w) => w.name)).toEqual(["AK-47", "M416"]);
  });

  it("rifles support both auto and single fire, pistols are semi-auto", () => {
    for (const w of WEAPONS) {
      if (w.cls === "rifle") expect(w.modes).toEqual(["auto", "single"]);
      else expect(w.modes).toEqual(["single"]);
    }
  });

  it("has sane numbers", () => {
    for (const w of WEAPONS) {
      expect(w.magSize).toBeGreaterThan(0);
      expect(w.reserve).toBeGreaterThanOrEqual(w.magSize);
      expect(w.fireInterval).toBeGreaterThan(0);
      expect(w.damage).toBeGreaterThan(0);
      expect(w.spreadMax).toBeGreaterThanOrEqual(w.spreadBase);
    }
  });
});

describe("WeaponLoadout", () => {
  it("fires, respects the fire interval and counts ammo", () => {
    const l = new WeaponLoadout();
    expect(l.fire().fired).toBe(true);
    expect(l.mag[0]).toBe(WEAPONS[0].magSize - 1);
    expect(l.fire().fired).toBe(false); // still cooling down
    run(l, WEAPONS[0].fireInterval + 0.01);
    expect(l.fire().fired).toBe(true);
  });

  it("auto-reloads when the magazine empties and refills from reserve", () => {
    const l = new WeaponLoadout();
    const def = WEAPONS[0];
    let reloadStarted = false;
    for (let i = 0; i < def.magSize; i++) {
      const r = l.fire();
      expect(r.fired).toBe(true);
      reloadStarted ||= r.reloadStarted;
      run(l, def.fireInterval + 0.01);
    }
    expect(reloadStarted).toBe(true);
    expect(l.reloading).toBeGreaterThan(0);
    run(l, def.reloadTime + 0.05);
    expect(l.reloading).toBe(0);
    expect(l.mag[0]).toBe(def.magSize);
    expect(l.reserve[0]).toBe(def.reserve - def.magSize);
  });

  it("reports a dry trigger when completely out of ammo", () => {
    const l = new WeaponLoadout();
    l.mag[0] = 0;
    l.reserve[0] = 0;
    const r = l.fire();
    expect(r).toEqual({ fired: false, reloadStarted: false, dry: true });
  });

  it("does not reload a full magazine", () => {
    const l = new WeaponLoadout();
    expect(l.startReload()).toBe(false);
  });

  it("toggles fire mode only on rifles", () => {
    const l = new WeaponLoadout();
    expect(l.toggleMode()).toBe(false);
    expect(l.mode).toBe("single");
    l.select(idx("ak47"));
    expect(l.mode).toBe("auto");
    expect(l.toggleMode()).toBe(true);
    expect(l.mode).toBe("single");
    expect(l.toggleMode()).toBe(true);
    expect(l.mode).toBe("auto");
  });

  it("remembers the fire mode per weapon", () => {
    const l = new WeaponLoadout();
    l.select(idx("m416"));
    l.toggleMode();
    l.select(idx("ak47"));
    expect(l.mode).toBe("auto");
    l.select(idx("m416"));
    expect(l.mode).toBe("single");
  });

  it("switching weapon cancels a reload and reports changes", () => {
    const l = new WeaponLoadout();
    l.mag[0] = 3;
    expect(l.startReload()).toBe(true);
    expect(l.select(0)).toBe(false); // same weapon
    expect(l.select(idx("ak47"))).toBe(true);
    expect(l.reloading).toBe(0);
    expect(l.mag[0]).toBe(3);
    expect(l.select(99)).toBe(false);
  });

  it("cycles through all five weapons", () => {
    const l = new WeaponLoadout();
    const seen = new Set<number>();
    for (let i = 0; i < 5; i++) {
      seen.add(l.index);
      l.cycle(1);
    }
    expect(seen.size).toBe(5);
    expect(l.index).toBe(0);
    l.cycle(-1);
    expect(l.index).toBe(4);
  });

  it("automatic fire rate matches the rifle RPM", () => {
    const l = new WeaponLoadout();
    l.select(idx("m416"));
    run(l, 0.3); // raise time
    let shots = 0;
    for (let t = 0; t < 1; t += 0.005) {
      if (l.fire().fired) shots++;
      l.update(0.005);
    }
    // 750 rpm = 12.5 rounds per second.
    expect(shots).toBeGreaterThanOrEqual(12);
    expect(shots).toBeLessThanOrEqual(13);
  });

  it("keeps the exact automatic rate at a low (30 fps) frame rate", () => {
    const l = new WeaponLoadout();
    l.select(idx("ak47"));
    run(l, 0.3);
    let shots = 0;
    const dt = 1 / 30;
    for (let t = 0; t < 2 - 1e-9; t += dt) {
      while (l.canFire()) {
        l.fire();
        shots++;
      }
      l.update(dt);
    }
    // 600 rpm = 10 rounds per second -> 20 in two seconds.
    expect(shots).toBeGreaterThanOrEqual(19);
    expect(shots).toBeLessThanOrEqual(21);
  });

  it("spread grows during sustained automatic fire and recovers after", () => {
    const l = new WeaponLoadout();
    l.select(idx("ak47"));
    run(l, 0.3);
    const def = l.def;
    const base = l.spread;
    let shots = 0;
    for (let t = 0; t < 1.2; t += 0.005) {
      if (l.fire().fired) shots++;
      l.update(0.005);
    }
    expect(shots).toBeGreaterThanOrEqual(10);
    expect(l.spread).toBeCloseTo(def.spreadMax, 5);
    run(l, 2);
    expect(l.spread).toBeCloseTo(base, 5);
  });

  it("refills reserves between waves", () => {
    const l = new WeaponLoadout();
    l.reserve = l.reserve.map(() => 0);
    l.refillReserves();
    expect(l.reserve).toEqual(WEAPONS.map((w) => w.reserve));
  });
});
