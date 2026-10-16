import * as THREE from "three";
import { LANE_MAX_X, LANE_MIN_X, PLAYER_Z } from "../world/Hall";
import { muzzleFlashTexture } from "../world/Textures";
import { createPistolModel } from "./models/PistolModel";
import { createRifleModel } from "./models/RifleModel";
import { WEAPONS, type WeaponDef, type WeaponId } from "./Weapon";

/**
 * First-person camera and the held weapon.
 *
 * The weapon is rendered in its own "view" scene with its own camera, drawn on
 * top of the world after clearing depth. This keeps the gun from clipping into
 * the bench or walls and lets it have its own flattering lighting.
 * The view camera sits at the origin, so view-scene coordinates are the same as
 * the main camera's local space (used to place casings and tracers in the world).
 */

const EYE_HEIGHT = 1.55;
const STRAFE_SPEED = 4.2;
const PITCH_MIN = -0.75;
const PITCH_MAX = 0.9;
const YAW_LIMIT = 1.2;

export class Player {
  readonly camera: THREE.PerspectiveCamera;
  readonly viewCamera: THREE.PerspectiveCamera;
  readonly viewScene = new THREE.Scene();

  pitch = 0;
  yaw = 0;
  x = 0;

  private readonly viewRoot = new THREE.Group();
  private readonly models = new Map<WeaponId, THREE.Group>();
  private model: THREE.Group | null = null;
  private def: WeaponDef = WEAPONS[0];

  // Recoil
  private punchPitch = 0;
  private punchYaw = 0;
  private gunKick = 0;
  private slideT = 0;
  private boltPulse = 0;

  // Motion
  private breathT = 0;
  private bobT = 0;
  private sway = 0;
  private lookSwayX = 0;
  private lookSwayY = 0;
  private switchT = 0;
  private reloadP = 0;

  // Muzzle flash
  private readonly flashMat: THREE.MeshBasicMaterial;
  private readonly flashGroups = new Map<WeaponId, THREE.Group>();
  private flashT = 0;
  private readonly viewFlashLight: THREE.PointLight;
  private readonly worldFlashLight: THREE.PointLight;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
    this.camera.position.set(0, EYE_HEIGHT, PLAYER_Z);
    this.camera.rotation.order = "YXZ";

    this.viewCamera = new THREE.PerspectiveCamera(70, 1, 0.01, 5);
    this.viewScene.add(this.viewCamera, this.viewRoot);

    // Weapon lighting: soft sky fill + a warm key from above-left + cool rim.
    this.viewScene.add(new THREE.HemisphereLight(0xe4ebf5, 0x2b2621, 1.1));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
    key.position.set(-0.6, 1.2, 0.4);
    const rim = new THREE.DirectionalLight(0xbcd4ff, 1.1);
    rim.position.set(0.8, 0.3, -1);
    this.viewScene.add(key, rim);

    this.viewFlashLight = new THREE.PointLight(0xffb060, 0, 1.5, 2);
    this.viewScene.add(this.viewFlashLight);

    // Lights the room for a frame when a shot is fired.
    this.worldFlashLight = new THREE.PointLight(0xffb060, 0, 8, 2);
    this.worldFlashLight.position.set(0.15, -0.1, -0.9);
    this.camera.add(this.worldFlashLight);

    this.flashMat = new THREE.MeshBasicMaterial({
      map: muzzleFlashTexture(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });

    const flashGeo = new THREE.PlaneGeometry(1, 1);
    for (const def of WEAPONS) {
      const model = def.cls === "rifle" ? createRifleModel(def.id) : createPistolModel(def.id);
      model.visible = false;

      // Two flash cards at the muzzle: one facing the shooter (star) and one
      // along the barrel (flame cone), both additive.
      const muzzle = model.userData.muzzle as THREE.Vector3;
      const flash = new THREE.Group();
      flash.position.copy(muzzle);
      const size = def.cls === "rifle" ? 0.13 : def.id === "magnum" ? 0.11 : 0.075;
      const front = new THREE.Mesh(flashGeo, this.flashMat);
      front.scale.setScalar(size);
      const side = new THREE.Mesh(flashGeo, this.flashMat);
      side.scale.set(size * 1.8, size * 0.8, 1);
      side.rotation.y = Math.PI / 2;
      side.position.z = -size * 0.7;
      flash.add(front, side);
      flash.visible = false;
      model.add(flash);

      this.flashGroups.set(def.id, flash);
      this.models.set(def.id, model);
      this.viewRoot.add(model);
    }
    this.setWeapon(WEAPONS[0], false);
  }

  /** Shows the given weapon. `animate` plays the raise animation. */
  setWeapon(def: WeaponDef, animate = true): void {
    if (this.model) this.model.visible = false;
    this.def = def;
    this.model = this.models.get(def.id) ?? null;
    if (this.model) this.model.visible = true;
    this.slideT = 0;
    this.gunKick = 0;
    this.switchT = animate ? 1 : 0;
    this.flashT = 0;
  }

  applyLook(dx: number, dy: number): void {
    this.yaw = THREE.MathUtils.clamp(this.yaw - dx, -YAW_LIMIT, YAW_LIMIT);
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy, PITCH_MIN, PITCH_MAX);
    // The gun lags slightly behind fast look movements.
    this.lookSwayX = THREE.MathUtils.clamp(this.lookSwayX + dx * 0.6, -0.06, 0.06);
    this.lookSwayY = THREE.MathUtils.clamp(this.lookSwayY + dy * 0.6, -0.05, 0.05);
  }

  /** Recoil for one shot. `climbScale` lowers permanent climb on touch devices. */
  kick(def: WeaponDef, climbScale = 1): void {
    const v = def.recoil * (0.85 + Math.random() * 0.3);
    const h = (Math.random() * 2 - 1) * def.recoilYaw;
    const climb = def.climb * climbScale;
    this.pitch = Math.min(PITCH_MAX, this.pitch + v * climb);
    this.yaw = THREE.MathUtils.clamp(this.yaw + h * climb, -YAW_LIMIT, YAW_LIMIT);
    this.punchPitch = Math.min(0.12, this.punchPitch + v * (1 - climb));
    this.punchYaw += h * (1 - climb);

    this.gunKick = Math.min(1.4, this.gunKick + (def.cls === "rifle" ? 0.55 : 1));
    this.slideT = 1;
    this.flashT = 0.055;
    const flash = this.flashGroups.get(def.id);
    if (flash) {
      flash.rotation.z = Math.random() * Math.PI * 2;
      const s = 0.8 + Math.random() * 0.45;
      flash.scale.setScalar(s);
    }
  }

  /** Bolt/slide pulse at the end of a reload (chambering a round). */
  chamber(): void {
    this.boltPulse = 1;
  }

  update(dt: number, moveX: number, reloadProgress: number): void {
    this.x = THREE.MathUtils.clamp(this.x + moveX * STRAFE_SPEED * dt, LANE_MIN_X, LANE_MAX_X);

    // Transient recoil recovers quickly.
    const recover = Math.min(1, dt * 12);
    this.punchPitch -= this.punchPitch * recover;
    this.punchYaw -= this.punchYaw * recover;

    this.camera.position.set(this.x, EYE_HEIGHT, PLAYER_Z);
    this.camera.rotation.set(this.pitch + this.punchPitch, this.yaw + this.punchYaw, 0);
    this.camera.updateMatrixWorld();

    this.animateWeapon(dt, moveX, reloadProgress);
  }

  /** Converts a point in the current weapon's model space to world space. */
  modelPointToWorld(local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    out.copy(local);
    if (this.model) {
      this.model.updateWorldMatrix(true, false);
      this.model.localToWorld(out);
    }
    return out.applyMatrix4(this.camera.matrixWorld);
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    const local = this.model?.userData.muzzle;
    return this.modelPointToWorld(local instanceof THREE.Vector3 ? local : new THREE.Vector3(), out);
  }

  ejectWorld(out: THREE.Vector3): THREE.Vector3 {
    const local = this.model?.userData.eject;
    return this.modelPointToWorld(local instanceof THREE.Vector3 ? local : new THREE.Vector3(), out);
  }

  /** Camera basis vectors in world space. */
  axes(right: THREE.Vector3, up: THREE.Vector3, forward: THREE.Vector3): void {
    this.camera.matrixWorld.extractBasis(right, up, forward);
    forward.negate();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = aspect;
    this.viewCamera.updateProjectionMatrix();
  }

  reset(): void {
    this.yaw = 0;
    this.pitch = 0;
    this.x = 0;
    this.punchPitch = 0;
    this.punchYaw = 0;
    this.gunKick = 0;
    this.slideT = 0;
    this.boltPulse = 0;
    this.sway = 0;
    this.flashT = 0;
    this.reloadP = 0;
  }

  private animateWeapon(dt: number, moveX: number, reloadProgress: number): void {
    const model = this.model;
    if (!model) return;
    const isRifle = this.def.cls === "rifle";

    this.gunKick = Math.max(0, this.gunKick - dt * (isRifle ? 9 : 6));
    this.slideT = Math.max(0, this.slideT - dt * (isRifle ? 22 : 11));
    this.boltPulse = Math.max(0, this.boltPulse - dt * 4);
    this.switchT = Math.max(0, this.switchT - dt * 3.6);
    this.lookSwayX -= this.lookSwayX * Math.min(1, dt * 8);
    this.lookSwayY -= this.lookSwayY * Math.min(1, dt * 8);

    // Slide / bolt travel: shot cycling, plus a slower pull when chambering.
    const slide: unknown = model.userData.slide;
    const travel = typeof model.userData.slideTravel === "number" ? model.userData.slideTravel : 0;
    if (slide instanceof THREE.Object3D) {
      const chamber = Math.sin(this.boltPulse * Math.PI);
      slide.position.z = travel * Math.max(this.slideT, chamber);
    }

    // Reload: tilt the gun, drop the magazine out and bring a fresh one in.
    this.reloadP += ((reloadProgress > 0 ? 1 : 0) - this.reloadP) * Math.min(1, dt * 10);
    const r = reloadProgress;
    const mag: unknown = model.userData.mag;
    if (mag instanceof THREE.Object3D) {
      let drop = 0;
      if (r > 0 && r < 0.3) drop = (r / 0.3) ** 2;
      else if (r >= 0.3 && r < 0.55) drop = 1;
      else if (r >= 0.55 && r < 0.85) drop = 1 - ((r - 0.55) / 0.3) * (2 - (r - 0.55) / 0.3);
      mag.position.y = -drop * 0.32;
      mag.visible = drop < 0.98;
    }
    const tilt = this.reloadP * Math.sin(Math.min(1, r) * Math.PI);

    // Idle breathing, strafe sway and walk bob.
    this.breathT += dt;
    this.sway += (moveX - this.sway) * Math.min(1, dt * 6);
    this.bobT += dt * Math.abs(this.sway) * 9;
    const bob = Math.abs(this.sway);
    const kick = this.gunKick;
    const kickBack = isRifle ? 0.035 : 0.05;
    const kickUp = isRifle ? 0.04 : 0.18;
    const raise = this.switchT * this.switchT;

    this.viewRoot.position.set(
      -this.sway * 0.012 - this.lookSwayX * 0.25 + Math.sin(this.bobT) * 0.006 * bob,
      Math.sin(this.breathT * 1.7) * 0.0022 - Math.abs(Math.cos(this.bobT)) * 0.006 * bob - raise * 0.22 - tilt * 0.045 + this.lookSwayY * 0.2,
      kick * kickBack,
    );
    this.viewRoot.rotation.set(
      kick * kickUp + raise * -0.6 - tilt * 0.22,
      this.lookSwayX * 0.8,
      -this.sway * 0.025 + tilt * (isRifle ? 0.45 : 0.3),
    );

    // Muzzle flash fade.
    const flash = this.flashGroups.get(this.def.id);
    this.flashT = Math.max(0, this.flashT - dt);
    const f = this.flashT > 0 ? this.flashT / 0.055 : 0;
    this.flashMat.opacity = f;
    if (flash) flash.visible = f > 0;
    this.viewFlashLight.intensity = f * 4;
    this.worldFlashLight.intensity = f * (isRifle ? 30 : 22);
    if (flash && f > 0) {
      flash.getWorldPosition(this.viewFlashLight.position);
    }
  }
}
