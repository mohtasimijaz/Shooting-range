import * as THREE from "three";
import { RAIL_Y } from "../world/Hall";
import { cardboardTexture, FACES, faceTexture, type FaceId } from "../world/Textures";
import type { TargetKind } from "./WaveGen";

export type { TargetKind } from "./WaveGen";

/**
 * Range targets.
 *
 *  static / mover / zigzag / civilian / bonus  hang from an overhead carrier
 *  swinger                                     pendulum hanging from the rail
 *  popup                                       turning target on a floor stand
 *  steel                                       hinged steel plate (armored)
 *
 * All geometry and materials are shared between targets, so spawning and
 * clearing waves never leaks GPU memory.
 */

export interface TargetSpec {
  kind: TargetKind;
  x: number;
  z: number;
  hp: number;
  points: number;
  /** Movement speed multiplier (1 = normal). */
  speed?: number;
  /** Pop-up targets: seconds visible / hidden. */
  popupUp?: number;
  popupDown?: number;
  /** Half-width of the sweep for movers / zig-zags (keeps them in their slot). */
  range?: number;
}

export type HitZone = "x" | "head" | "inner" | "body";

type Mount = "hung" | "stand" | "pendulum" | "plate";

interface Shared {
  faceMats: Record<FaceId, THREE.Material[]>;
  boards: Record<FaceId, THREE.BoxGeometry>;
  hitboxes: Record<FaceId | "steel", THREE.BoxGeometry>;
  hitMat: THREE.MeshBasicMaterial;
  metal: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  steelPaint: THREE.MeshStandardMaterial;
  carriage: THREE.BoxGeometry;
  clamp: THREE.BoxGeometry;
  rod: THREE.CylinderGeometry;
  plate: THREE.CylinderGeometry;
  standBase: THREE.BoxGeometry;
  standLeg: THREE.BoxGeometry;
}

let shared: Shared | null = null;

function getShared(): Shared {
  if (shared) return shared;
  const card = new THREE.MeshStandardMaterial({ map: cardboardTexture(), roughness: 0.95 });
  const faceMats = {} as Record<FaceId, THREE.Material[]>;
  const boards = {} as Record<FaceId, THREE.BoxGeometry>;
  const hitboxes = {} as Record<FaceId | "steel", THREE.BoxGeometry>;
  for (const id of Object.keys(FACES) as FaceId[]) {
    const info = FACES[id];
    // Matte, slightly off-white paper so lit targets never glare.
    const front = new THREE.MeshStandardMaterial({
      map: faceTexture(id),
      color: id === "bonus" ? 0xe6e6e6 : 0xcfcac0,
      roughness: 1,
      envMapIntensity: 0.4,
      transparent: id === "bonus",
      alphaTest: id === "bonus" ? 0.5 : 0,
    });
    const edge = id === "bonus" ? front : card;
    // BoxGeometry groups: +x, -x, +y, -y, +z (front, faces the shooter), -z.
    faceMats[id] = [edge, edge, edge, edge, front, id === "bonus" ? front : card];
    boards[id] = new THREE.BoxGeometry(info.width, info.height, 0.008);
    hitboxes[id] = new THREE.BoxGeometry(info.width + 0.16, info.height + 0.16, 0.22);
  }
  hitboxes.steel = new THREE.BoxGeometry(0.62, 0.62, 0.22);
  shared = {
    faceMats,
    boards,
    hitboxes,
    hitMat: new THREE.MeshBasicMaterial({ visible: false }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8e949b, metalness: 0.8, roughness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.5, roughness: 0.55 }),
    steelPaint: new THREE.MeshStandardMaterial({ color: 0xbdb7a9, metalness: 0.3, roughness: 0.6 }),
    carriage: new THREE.BoxGeometry(0.2, 0.12, 0.16),
    clamp: new THREE.BoxGeometry(1, 0.035, 0.035),
    rod: new THREE.CylinderGeometry(0.01, 0.01, 1, 6),
    plate: new THREE.CylinderGeometry(0.24, 0.24, 0.018, 28),
    standBase: new THREE.BoxGeometry(0.7, 0.3, 0.42),
    standLeg: new THREE.BoxGeometry(0.04, 1, 0.04),
  };
  return shared;
}

function faceFor(kind: TargetKind): FaceId | null {
  switch (kind) {
    case "static":
    case "zigzag":
      return "bullseye";
    case "mover":
    case "popup":
    case "swinger":
      return "silhouette";
    case "civilian":
      return "civilian";
    case "bonus":
      return "bonus";
    case "steel":
      return null;
  }
}

const DIE_TIME = 0.6;

export class Target {
  readonly group = new THREE.Group();
  readonly kind: TargetKind;
  readonly points: number;
  readonly face: FaceId | null;
  /** Required targets must all be cleared to finish the wave. */
  readonly required: boolean;
  readonly armored: boolean;
  /** The mesh that receives bullet holes / precision hits. */
  readonly board: THREE.Mesh;
  hp: number;
  alive = true;
  hittable = true;
  /** True when a bonus target left before being shot. */
  escaped = false;

  private readonly mount: Mount;
  private readonly pivot = new THREE.Group();
  private readonly originX: number;
  private readonly speed: number;
  private readonly range: number;
  private readonly popupUp: number;
  private readonly popupDown: number;
  private t = Math.random() * Math.PI * 2;
  private popupVisible = false;
  private popupTimer = 0.5 + Math.random() * 0.8;
  private popupAngle = 1;
  private zigVel = 0;
  private zigTimer = 0;
  private react = 0;
  private reactVel = 0;
  private dieT = 0;
  private life = 0;
  private readonly lifetime: number;

  constructor(spec: TargetSpec) {
    const S = getShared();
    this.kind = spec.kind;
    this.hp = spec.hp;
    this.points = spec.points;
    this.originX = spec.x;
    this.speed = spec.speed ?? 1;
    this.range = spec.range ?? 2.2;
    this.popupUp = spec.popupUp ?? 1.8;
    this.popupDown = spec.popupDown ?? 1.1;
    this.face = faceFor(spec.kind);
    this.required = spec.kind !== "civilian" && spec.kind !== "bonus";
    this.armored = spec.kind === "steel";
    this.lifetime = spec.kind === "bonus" ? 7 : Infinity;
    this.mount =
      spec.kind === "popup" ? "stand" : spec.kind === "steel" ? "plate" : spec.kind === "swinger" ? "pendulum" : "hung";
    this.zigVel = (Math.random() < 0.5 ? -1 : 1) * 1.7 * this.speed;

    this.group.position.set(spec.x, 0, spec.z);
    this.group.add(this.pivot);

    let hitboxGeo: THREE.BoxGeometry;
    if (this.face) {
      const info = FACES[this.face];
      this.board = new THREE.Mesh(S.boards[this.face], S.faceMats[this.face]);
      hitboxGeo = S.hitboxes[this.face];

      if (this.mount === "stand") {
        // Turning target: pivot at the top of a floor stand.
        this.pivot.position.y = 0.55;
        this.board.position.y = 0.03 + info.height / 2;
        const base = new THREE.Mesh(S.standBase, S.dark);
        base.position.y = 0.15;
        base.castShadow = true;
        const leg = new THREE.Mesh(S.standLeg, S.metal);
        leg.scale.y = 0.27;
        leg.position.y = 0.42;
        this.group.add(base, leg);
        this.popupAngle = 1;
      } else {
        const clipY = this.kind === "bonus" ? RAIL_Y - 0.5 : 2.06;
        const rodTop = this.mount === "pendulum" ? 0 : RAIL_Y - clipY;
        this.pivot.position.y = this.mount === "pendulum" ? RAIL_Y : clipY;
        const boardTop = this.mount === "pendulum" ? -(RAIL_Y - 2.06) : 0;
        this.board.position.y = boardTop - info.height / 2;

        // Carrier trolley on the rail with a rod down to the clamp bar.
        const carriage = new THREE.Mesh(S.carriage, S.dark);
        carriage.position.y = RAIL_Y - 0.03;
        this.group.add(carriage);
        const rod = new THREE.Mesh(S.rod, S.metal);
        if (this.mount === "pendulum") {
          rod.scale.y = -boardTop;
          rod.position.y = boardTop / 2;
          this.pivot.add(rod);
        } else {
          rod.scale.y = rodTop;
          rod.position.y = clipY + rodTop / 2;
          this.group.add(rod);
        }
        const clamp = new THREE.Mesh(S.clamp, S.dark);
        clamp.scale.x = info.width * 0.9;
        clamp.position.y = boardTop + 0.01;
        clamp.position.z = 0.006;
        this.pivot.add(clamp);
      }
    } else {
      // Steel plate hanging from a hinge on a post.
      this.board = new THREE.Mesh(S.plate, S.steelPaint);
      this.board.rotation.x = Math.PI / 2;
      hitboxGeo = S.hitboxes.steel;
      this.pivot.position.y = 1.55;
      this.board.position.y = -0.3;
      const base = new THREE.Mesh(S.standBase, S.dark);
      base.position.y = 0.15;
      const post = new THREE.Mesh(S.standLeg, S.metal);
      post.scale.set(1.4, 1.3, 1.4);
      post.position.set(0, 0.95, -0.06);
      const arm = new THREE.Mesh(S.clamp, S.metal);
      arm.scale.x = 0.3;
      arm.position.set(0, 1.58, -0.04);
      this.group.add(base, post, arm);
    }

    this.board.castShadow = true;
    this.board.userData.target = this;
    this.pivot.add(this.board);

    const hitbox = new THREE.Mesh(hitboxGeo, S.hitMat);
    hitbox.position.copy(this.board.position);
    hitbox.position.z += 0.06;
    hitbox.name = "target-hitbox";
    this.pivot.add(hitbox);

    this.group.userData.target = this;
    if (this.kind === "popup") {
      this.hittable = false;
      this.applyPivot();
    }
  }

  /** Applies damage. Returns true if this hit destroyed the target. */
  hit(damage: number): boolean {
    if (!this.alive || !this.hittable) return false;
    this.hp -= damage;
    this.reactVel += this.armored ? 9 : 5;
    if (this.hp <= 1e-6) {
      this.alive = false;
      this.hittable = false;
      this.dieT = DIE_TIME;
      return true;
    }
    return false;
  }

  /** Scoring zone for a hit at the given UV on the front face. */
  zoneAt(uv: THREE.Vector2): HitZone {
    if (!this.face) return "body";
    const info = FACES[this.face];
    if (info.headV !== undefined && uv.y > info.headV) return "head";
    const dx = (uv.x - info.cx) * info.width;
    const dy = (uv.y - info.cy) * info.height;
    const r = Math.hypot(dx, dy);
    if (r <= info.xRadius) return "x";
    if (r <= info.innerRadius) return "inner";
    return "body";
  }

  /** Advances animation. Returns true when the target can be removed. */
  update(dt: number): boolean {
    this.t += dt;
    this.life += dt;

    // Hit reaction: damped spring on the pivot.
    this.reactVel += (-60 * this.react - 7 * this.reactVel) * dt;
    this.react += this.reactVel * dt;

    if (!this.alive) {
      this.dieT -= dt;
      const p = 1 - Math.max(0, this.dieT) / DIE_TIME;
      if (this.mount === "stand") {
        this.popupAngle = Math.min(1, this.popupAngle + dt * 4);
      } else if (this.mount === "plate") {
        this.react = Math.max(this.react, p * 1.4);
      } else {
        this.react = Math.max(this.react, p * 1.3);
        if (p > 0.5) this.group.position.y += dt * 3;
      }
      this.applyPivot();
      return this.dieT <= 0;
    }

    if (this.life > this.lifetime) {
      this.alive = false;
      this.hittable = false;
      this.escaped = true;
      this.dieT = DIE_TIME;
    }

    switch (this.kind) {
      case "mover":
        this.group.position.x = this.originX + Math.sin(this.t * 1.4 * this.speed) * this.range;
        break;
      case "bonus":
        this.group.position.x = this.originX + Math.sin(this.t * 1.1 * this.speed) * 4;
        break;
      case "zigzag": {
        this.zigTimer -= dt;
        const off = this.group.position.x - this.originX;
        if (this.zigTimer <= 0 || Math.abs(off) > this.range) {
          const dir = Math.abs(off) > this.range ? -Math.sign(off) : Math.random() < 0.5 ? -1 : 1;
          this.zigVel = dir * (1.2 + Math.random() * 1.0) * this.speed;
          this.zigTimer = (0.35 + Math.random() * 0.7) / Math.sqrt(this.speed);
        }
        this.group.position.x += this.zigVel * dt;
        break;
      }
      case "swinger":
        this.pivot.rotation.z = Math.sin(this.t * 1.5 * this.speed) * 0.38;
        break;
      case "popup":
        this.popupTimer -= dt;
        if (this.popupTimer <= 0) {
          this.popupVisible = !this.popupVisible;
          this.popupTimer = this.popupVisible ? this.popupUp : this.popupDown;
        }
        this.popupAngle += ((this.popupVisible ? 0 : 1) - this.popupAngle) * Math.min(1, dt * 14);
        this.hittable = this.popupAngle < 0.35;
        break;
      default:
        break;
    }

    this.applyPivot();
    return false;
  }

  private applyPivot(): void {
    if (this.mount === "stand") {
      // Board above the pivot: negative X rotation tips it away from the shooter.
      this.pivot.rotation.x = -this.popupAngle * (Math.PI / 2) * 0.96 - this.react * 0.6;
    } else {
      // Board below the pivot: positive X rotation swings the bottom away.
      this.pivot.rotation.x = this.react * (this.mount === "plate" ? 0.7 : 0.45);
    }
  }
}

export function targetFromObject(obj: THREE.Object3D | null): Target | null {
  let current: THREE.Object3D | null = obj;
  while (current) {
    const target: unknown = current.userData.target;
    if (target instanceof Target) return target;
    current = current.parent;
  }
  return null;
}