import * as THREE from "three";
import { createPistolModel, type WeaponDef } from "./Weapon";
import { LANE_MAX_X, LANE_MIN_X, PLAYER_Z } from "../world/Hall";

export class Player {
  readonly camera: THREE.PerspectiveCamera;
  readonly muzzleWorld = new THREE.Vector3();

  // FIX: Start with a horizontal camera angle.
  pitch = 0;
  yaw = 0;
  x = 0;

  private keys = { a: false, d: false };
  private viewRoot = new THREE.Group();
  private model: THREE.Group | null = null;
  private recoil = 0;
  private slideNode: THREE.Object3D | null = null;
  private slideTravel = 0;
  private slideT = 0;
  private breathT = 0;
  private sway = 0;
  private flash: THREE.PointLight;
  private gunLight: THREE.PointLight;
  private flashMesh: THREE.Mesh;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
    this.camera.position.set(0, 1.55, PLAYER_Z);
    this.camera.add(this.viewRoot);

    // Small light that keeps the held pistol readable in any lighting.
    this.gunLight = new THREE.PointLight(0xfff0dd, 0.9, 1.6, 1.5);
    this.gunLight.position.set(0.05, 0.15, 0.1);
    this.camera.add(this.gunLight);

    this.flash = new THREE.PointLight(0xffcc88, 0, 4);
    this.flash.position.set(0.22, -0.16, -0.62);
    this.camera.add(this.flash);

    this.flashMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffeeaa,
        transparent: true,
        opacity: 0,
      }),
    );
    this.flashMesh.position.copy(this.flash.position);
    this.camera.add(this.flashMesh);
  }

  setWeaponModel(def: WeaponDef): void {
    if (this.model) {
      this.viewRoot.remove(this.model);

      this.model.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();

          const m = o.material;

          if (Array.isArray(m)) {
            m.forEach((x) => x.dispose());
          } else {
            m.dispose();
          }
        }
      });
    }

    this.model = createPistolModel(def);

    // Animated parts and muzzle position are published by the model.
    const slide: unknown = this.model.userData.slide;
    this.slideNode = slide instanceof THREE.Object3D ? slide : null;
    const travel: unknown = this.model.userData.slideTravel;
    this.slideTravel = typeof travel === "number" ? travel : 0;
    this.slideT = 0;

    const muzzle: unknown = this.model.userData.muzzle;
    if (muzzle instanceof THREE.Vector3) {
      this.model.updateMatrix();
      const p = muzzle.clone().applyMatrix4(this.model.matrix);
      this.flash.position.copy(p);
      this.flashMesh.position.copy(p);
    }
    this.viewRoot.add(this.model);
  }

  kick(amount: number): void {
    this.recoil = Math.min(0.18, this.recoil + amount);
    this.slideT = 1;
    this.flash.intensity = 8;
    (this.flashMesh.material as THREE.MeshBasicMaterial).opacity = 1;
  }

  onMouseMove(e: MouseEvent, sensitivity = 0.0022): void {
    this.yaw -= e.movementX * sensitivity;
    this.pitch -= e.movementY * sensitivity;

    this.pitch = THREE.MathUtils.clamp(
      this.pitch,
      -1.15,
      1.15,
    );

    this.yaw = THREE.MathUtils.clamp(
      this.yaw,
      -1.25,
      1.25,
    );
  }

  setKey(code: string, down: boolean): void {
    if (code === "KeyA" || code === "ArrowLeft") {
      this.keys.a = down;
    }

    if (code === "KeyD" || code === "ArrowRight") {
      this.keys.d = down;
    }
  }

  update(dt: number): void {
    const speed = 4.2;

    if (this.keys.a) this.x -= speed * dt;
    if (this.keys.d) this.x += speed * dt;

    this.x = THREE.MathUtils.clamp(
      this.x,
      LANE_MIN_X,
      LANE_MAX_X,
    );

    this.camera.position.x = this.x;
    this.camera.position.y = 1.55;
    this.camera.position.z = PLAYER_Z;

    this.camera.rotation.set(
      this.pitch,
      this.yaw,
      0,
      "YXZ",
    );

    this.recoil = Math.max(0, this.recoil - dt * 0.55);

    // Slide snaps back on every shot and returns quickly.
    this.slideT = Math.max(0, this.slideT - dt * 9);
    if (this.slideNode) {
      this.slideNode.position.z = this.slideTravel * this.slideT;
    }

    // Subtle idle breathing and strafe sway of the weapon.
    this.breathT += dt;
    const move = (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0);
    this.sway += (move - this.sway) * Math.min(1, dt * 6);
    this.viewRoot.position.set(
      -this.sway * 0.012,
      Math.sin(this.breathT * 1.7) * 0.0022,
      this.recoil * 0.15,
    );
    this.viewRoot.rotation.x = this.recoil;
    this.viewRoot.rotation.z = -this.sway * 0.025;

    this.flash.intensity = Math.max(
      0,
      this.flash.intensity - dt * 40,
    );

    const mat = this.flashMesh.material as THREE.MeshBasicMaterial;

    mat.opacity = Math.max(
      0,
      mat.opacity - dt * 8,
    );

    this.flash.getWorldPosition(this.muzzleWorld);
  }

  reset(): void {
    this.yaw = 0;

    // FIX: Keep the same horizontal aim after restarting.
    this.pitch = 0;

    this.x = 0;
    this.recoil = 0;

    this.keys.a = false;
    this.keys.d = false;
  }
}