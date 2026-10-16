/**
 * Weapon definitions and the player's loadout (ammo, reload, fire modes,
 * spread). Pure logic with no three.js dependency so it can be unit tested.
 * The 3D models live in ./models.
 */

export type WeaponId = "nine" | "compact" | "magnum" | "ak47" | "m416";
export type WeaponClass = "pistol" | "rifle";
export type FireMode = "single" | "auto";

export interface WeaponDef {
  id: WeaponId;
  /** Short name used in the HUD. */
  name: string;
  /** Long description used in the weapons menu. */
  label: string;
  cls: WeaponClass;
  caliber: string;
  magSize: number;
  reserve: number;
  /** Seconds between shots. */
  fireInterval: number;
  damage: number;
  /** Damage multiplier against steel (armored) targets. */
  armorFactor: number;
  /** Vertical view kick per shot, radians. */
  recoil: number;
  /** Maximum random horizontal kick per shot, radians. */
  recoilYaw: number;
  /** Share of the kick that stays (muzzle climb the player must pull down). */
  climb: number;
  /** Resting spread cone half-angle, radians. */
  spreadBase: number;
  spreadPerShot: number;
  spreadMax: number;
  /** Spread recovered per second. */
  spreadRecovery: number;
  reloadTime: number;
  /** First entry is the default mode. */
  modes: FireMode[];
  /** Show a tracer every N rounds (0 = never). */
  tracerEvery: number;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: "nine",
    name: "9mm",
    label: "9mm Service Pistol",
    cls: "pistol",
    caliber: "9×19mm",
    magSize: 15,
    reserve: 60,
    fireInterval: 0.16,
    damage: 1,
    armorFactor: 0.5,
    recoil: 0.018,
    recoilYaw: 0.006,
    climb: 0.2,
    spreadBase: 0.0015,
    spreadPerShot: 0.006,
    spreadMax: 0.025,
    spreadRecovery: 0.12,
    reloadTime: 1.05,
    modes: ["single"],
    tracerEvery: 0,
  },
  {
    id: "compact",
    name: "Compact",
    label: "Compact Carry Pistol",
    cls: "pistol",
    caliber: "9×19mm",
    magSize: 12,
    reserve: 60,
    fireInterval: 0.1,
    damage: 1,
    armorFactor: 0.5,
    recoil: 0.013,
    recoilYaw: 0.008,
    climb: 0.2,
    spreadBase: 0.0025,
    spreadPerShot: 0.007,
    spreadMax: 0.03,
    spreadRecovery: 0.14,
    reloadTime: 0.85,
    modes: ["single"],
    tracerEvery: 0,
  },
  {
    id: "magnum",
    name: "Magnum",
    label: ".44 Magnum Pistol",
    cls: "pistol",
    caliber: ".44 Magnum",
    magSize: 8,
    reserve: 32,
    fireInterval: 0.42,
    damage: 3,
    armorFactor: 1,
    recoil: 0.045,
    recoilYaw: 0.01,
    climb: 0.15,
    spreadBase: 0.0012,
    spreadPerShot: 0.015,
    spreadMax: 0.04,
    spreadRecovery: 0.1,
    reloadTime: 1.35,
    modes: ["single"],
    tracerEvery: 0,
  },
  {
    id: "ak47",
    name: "AK-47",
    label: "AK-47 Assault Rifle",
    cls: "rifle",
    caliber: "7.62×39mm",
    magSize: 30,
    reserve: 120,
    fireInterval: 0.1, // 600 rounds per minute
    damage: 2,
    armorFactor: 1,
    recoil: 0.016,
    recoilYaw: 0.009,
    climb: 0.35,
    spreadBase: 0.0025,
    spreadPerShot: 0.0045,
    spreadMax: 0.035,
    spreadRecovery: 0.12,
    reloadTime: 2.3,
    modes: ["auto", "single"],
    tracerEvery: 3,
  },
  {
    id: "m416",
    name: "M416",
    label: "M416 Assault Rifle",
    cls: "rifle",
    caliber: "5.56×45mm",
    magSize: 30,
    reserve: 150,
    fireInterval: 0.08, // 750 rounds per minute
    damage: 1.5,
    armorFactor: 1,
    recoil: 0.01,
    recoilYaw: 0.005,
    climb: 0.3,
    spreadBase: 0.0018,
    spreadPerShot: 0.003,
    spreadMax: 0.022,
    spreadRecovery: 0.14,
    reloadTime: 2.0,
    modes: ["auto", "single"],
    tracerEvery: 3,
  },
];

export interface FireResult {
  fired: boolean;
  /** A reload began because of this trigger pull (empty magazine). */
  reloadStarted: boolean;
  /** Trigger pulled on an empty gun with no reserve ammo. */
  dry: boolean;
}

export class WeaponLoadout {
  readonly defs = WEAPONS;
  index = 0;
  mag: number[] = WEAPONS.map((w) => w.magSize);
  reserve: number[] = WEAPONS.map((w) => w.reserve);
  modeIndex: number[] = WEAPONS.map(() => 0);
  cooldown = 0;
  /** Seconds of reload remaining (0 = not reloading). */
  reloading = 0;
  /** Current spread cone half-angle in radians. */
  spread = WEAPONS[0].spreadBase;
  /** Rounds fired by the current weapon since the magazine went in. */
  roundsFired = 0;
  /** Seconds since the last shot (spread only recovers once firing stops). */
  private sinceShot = 99;

  get def(): WeaponDef {
    return this.defs[this.index];
  }

  get mode(): FireMode {
    return this.def.modes[this.modeIndex[this.index]] ?? "single";
  }

  /** 0..1 progress of the current reload (0 when not reloading). */
  get reloadProgress(): number {
    if (this.reloading <= 0) return 0;
    return 1 - this.reloading / this.def.reloadTime;
  }

  reset(): void {
    this.index = 0;
    this.mag = WEAPONS.map((w) => w.magSize);
    this.reserve = WEAPONS.map((w) => w.reserve);
    this.modeIndex = WEAPONS.map(() => 0);
    this.cooldown = 0;
    this.reloading = 0;
    this.spread = this.def.spreadBase;
    this.roundsFired = 0;
    this.sinceShot = 99;
  }

  /** Restocks every gun's reserve ammo (used between waves). */
  refillReserves(): void {
    this.reserve = WEAPONS.map((w) => w.reserve);
  }

  /** Switches weapon. Cancels a reload in progress. Returns true if changed. */
  select(index: number): boolean {
    if (index < 0 || index >= this.defs.length || index === this.index) return false;
    this.index = index;
    this.reloading = 0;
    this.cooldown = Math.max(this.cooldown, 0.2); // raise time
    this.spread = this.def.spreadBase;
    this.sinceShot = 99;
    return true;
  }

  cycle(dir: number): boolean {
    return this.select((this.index + dir + this.defs.length) % this.defs.length);
  }

  /** Toggles single/auto on weapons that support both. Returns true if changed. */
  toggleMode(): boolean {
    const modes = this.def.modes;
    if (modes.length < 2) return false;
    this.modeIndex[this.index] = (this.modeIndex[this.index] + 1) % modes.length;
    return true;
  }

  update(dt: number): void {
    // The overshoot past zero (at most one frame) is kept and carried into the
    // next shot, so automatic fire keeps its exact rate at any frame rate.
    if (this.cooldown > 0) this.cooldown -= dt;
    this.sinceShot += dt;
    if (this.sinceShot > this.def.fireInterval * 1.25) {
      this.spread = Math.max(this.def.spreadBase, this.spread - this.def.spreadRecovery * dt);
    }
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.finishReload();
    }
  }

  canFire(): boolean {
    return this.reloading <= 0 && this.cooldown <= 0 && this.mag[this.index] > 0;
  }

  fire(): FireResult {
    if (!this.canFire()) {
      const empty = this.mag[this.index] <= 0 && this.reloading <= 0;
      if (empty && this.cooldown <= 0) {
        const reloadStarted = this.startReload();
        return { fired: false, reloadStarted, dry: !reloadStarted };
      }
      return { fired: false, reloadStarted: false, dry: false };
    }
    this.mag[this.index] -= 1;
    this.roundsFired += 1;
    // Carry the overshoot only while firing continuously (not after a pause).
    const carry = this.sinceShot < this.def.fireInterval * 2 ? Math.min(0, this.cooldown) : 0;
    this.cooldown = carry + this.def.fireInterval;
    this.sinceShot = 0;
    this.spread = Math.min(this.def.spreadMax, this.spread + this.def.spreadPerShot);
    const reloadStarted = this.mag[this.index] <= 0 ? this.startReload() : false;
    return { fired: true, reloadStarted, dry: false };
  }

  startReload(): boolean {
    if (this.reloading > 0) return false;
    if (this.mag[this.index] >= this.def.magSize) return false;
    if (this.reserve[this.index] <= 0) return false;
    this.reloading = this.def.reloadTime;
    return true;
  }

  /** Aborts a reload in progress (e.g. when the game is paused). */
  cancelReload(): void {
    this.reloading = 0;
  }

  private finishReload(): void {
    this.reloading = 0;
    const need = this.def.magSize - this.mag[this.index];
    const take = Math.min(need, this.reserve[this.index]);
    this.mag[this.index] += take;
    this.reserve[this.index] -= take;
    this.roundsFired = 0;
  }
}
