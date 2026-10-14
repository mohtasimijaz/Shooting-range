import * as THREE from "three";

export type TargetKind = "static" | "mover" | "popup";

export interface TargetSpec {
  kind: TargetKind;
  x: number;
  y: number;
  z: number;
  hp: number;
  points: number;
}

const BOARD = new THREE.BoxGeometry(0.7, 1.15, 0.06);
const POLE = new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8);
const BASE = new THREE.BoxGeometry(0.35, 0.06, 0.25);

export class Target {
  readonly group = new THREE.Group();
  readonly kind: TargetKind;
  hp: number;
  readonly points: number;
  alive = true;
  hittable = true;
  private flash = 0;
  private dieT = 0;
  private t = Math.random() * Math.PI * 2;
  private originX: number;
  private board: THREE.Mesh;
  private boardMat: THREE.MeshStandardMaterial;
  private popupVisible = true;
  private popupTimer = 0.4 + Math.random() * 0.8;

  constructor(spec: TargetSpec) {
    this.kind = spec.kind;
    this.hp = spec.hp;
    this.points = spec.points;
    this.originX = spec.x;

    const color =
      spec.kind === "mover" ? 0xc45c2a : spec.kind === "popup" ? 0x2a6aad : 0xd9c7a4;
    this.boardMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
    });
    this.board = new THREE.Mesh(BOARD, this.boardMat);
    this.board.position.y = 1.55;
    this.board.castShadow = true;
    this.board.userData.target = this;

    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x555555,
      metalness: 0.5,
      roughness: 0.4,
    });
    const pole = new THREE.Mesh(POLE, poleMat);
    pole.position.y = 0.6;
    pole.userData.target = this;

    const base = new THREE.Mesh(
      BASE,
      new THREE.MeshStandardMaterial({ color: 0x333333 }),
    );
    base.position.y = 0.03;
    base.userData.target = this;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.18, 16),
      new THREE.MeshBasicMaterial({ color: 0xb22222, side: THREE.DoubleSide }),
    );
    ring.position.set(0, 1.62, 0.034);
    ring.userData.target = this;

    this.group.add(this.board, pole, base, ring);
    this.group.position.set(spec.x, spec.y, spec.z);
    this.group.userData.target = this;
  }

  hit(damage: number): boolean {
    if (!this.alive || !this.hittable) return false;
    this.hp -= damage;
    this.flash = 0.12;
    if (this.hp <= 0) {
      this.alive = false;
      this.hittable = false;
      this.dieT = 0.45;
      return true;
    }
    return false;
  }

  update(dt: number): boolean {
    this.t += dt;
    if (this.flash > 0) {
      this.flash -= dt;
      this.boardMat.emissive.setHex(this.flash > 0 ? 0xffeeaa : 0x000000);
    }

    if (!this.alive) {
      this.dieT -= dt;
      this.group.rotation.x = (1 - Math.max(this.dieT, 0) / 0.45) * 1.2;
      this.group.position.y -= dt * 0.8;
      const s = Math.max(0.01, this.dieT / 0.45);
      this.group.scale.setScalar(s);
      return this.dieT <= 0;
    }

    if (this.kind === "mover") {
      this.group.position.x = this.originX + Math.sin(this.t * 1.4) * 2.4;
    }

    if (this.kind === "popup") {
      this.popupTimer -= dt;
      if (this.popupTimer <= 0) {
        this.popupVisible = !this.popupVisible;
        this.popupTimer = this.popupVisible ? 1.8 : 1.1;
      }
      this.hittable = this.popupVisible;
      const targetY = this.popupVisible ? 0 : -1.35;
      this.group.position.y += (targetY - this.group.position.y) * Math.min(1, dt * 10);
    }

    return false;
  }
}

export function targetFromObject(obj: THREE.Object3D | null): Target | null {
  let o: THREE.Object3D | null = obj;
  while (o) {
    const t = o.userData.target;
    if (t instanceof Target) return t;
    o = o.parent;
  }
  return null;
}
