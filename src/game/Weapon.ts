import * as THREE from "three";

export type WeaponId = "nine" | "compact" | "magnum";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  magSize: number;
  reserve: number;
  fireInterval: number;
  damage: number;
  recoil: number;
  reloadTime: number;
  color: number;
  accent: number;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: "nine",
    name: "9mm",
    magSize: 15,
    reserve: 45,
    fireInterval: 0.18,
    damage: 1,
    recoil: 0.035,
    reloadTime: 1.05,
    color: 0x2a2d32,
    accent: 0x6b7078,
  },
  {
    id: "compact",
    name: "Compact",
    magSize: 12,
    reserve: 48,
    fireInterval: 0.09,
    damage: 1,
    recoil: 0.02,
    reloadTime: 0.85,
    color: 0x1c1c1c,
    accent: 0x3d3d3d,
  },
  {
    id: "magnum",
    name: "Magnum",
    magSize: 8,
    reserve: 24,
    fireInterval: 0.45,
    damage: 3,
    recoil: 0.07,
    reloadTime: 1.35,
    color: 0x3a2a1a,
    accent: 0xb08a4a,
  },
];

export class WeaponLoadout {
  readonly defs = WEAPONS;
  index = 0;
  mag: number[] = WEAPONS.map((w) => w.magSize);
  reserve: number[] = WEAPONS.map((w) => w.reserve);
  cooldown = 0;
  reloading = 0;

  get def(): WeaponDef {
    return this.defs[this.index];
  }

  reset(): void {
    this.index = 0;
    this.mag = WEAPONS.map((w) => w.magSize);
    this.reserve = WEAPONS.map((w) => w.reserve);
    this.cooldown = 0;
    this.reloading = 0;
  }

  select(index: number): void {
    if (index < 0 || index >= this.defs.length) return;
    if (this.reloading > 0) return;
    this.index = index;
  }

  cycle(dir: number): void {
    this.select((this.index + dir + this.defs.length) % this.defs.length);
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.finishReload();
      }
    }
  }

  canFire(): boolean {
    return this.reloading <= 0 && this.cooldown <= 0 && this.mag[this.index] > 0;
  }

  fire(): boolean {
    if (!this.canFire()) {
      if (this.mag[this.index] <= 0 && this.reloading <= 0) {
        this.startReload();
      }
      return false;
    }
    this.mag[this.index] -= 1;
    this.cooldown = this.def.fireInterval;
    if (this.mag[this.index] <= 0) {
      this.startReload();
    }
    return true;
  }

  startReload(): boolean {
    if (this.reloading > 0) return false;
    if (this.mag[this.index] >= this.def.magSize) return false;
    if (this.reserve[this.index] <= 0) return false;
    this.reloading = this.def.reloadTime;
    return true;
  }

  private finishReload(): void {
    this.reloading = 0;
    const need = this.def.magSize - this.mag[this.index];
    const take = Math.min(need, this.reserve[this.index]);
    this.mag[this.index] += take;
    this.reserve[this.index] -= take;
  }
}

export function createPistolModel(def: WeaponDef): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({
    color: def.color,
    metalness: 0.75,
    roughness: 0.35,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: def.accent,
    metalness: 0.4,
    roughness: 0.5,
  });
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.055), accent);
  grip.position.set(0, -0.08, 0.02);
  grip.rotation.x = 0.25;
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 0.22), steel);
  slide.position.set(0, 0.02, -0.06);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.08, 10),
    steel,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.018, -0.2);
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.02), steel);
  trigger.position.set(0, -0.02, 0.01);
  g.add(grip, slide, barrel, trigger);
  if (def.id === "magnum") {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.05), accent);
    mag.position.set(0, -0.12, 0.03);
    g.add(mag);
    slide.scale.set(1.15, 1.2, 1.05);
  }
  if (def.id === "compact") {
    slide.scale.set(0.9, 0.9, 0.82);
    barrel.scale.set(1, 1, 0.7);
  }
  g.position.set(0.22, -0.2, -0.42);
  g.rotation.set(0.04, 0.08, 0.04);
  return g;
}
