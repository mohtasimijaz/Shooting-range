import * as THREE from "three";
import { Sound } from "../audio/Sound";
import { HUD } from "../ui/HUD";
import { buildHall } from "../world/Hall";
import { Player } from "./Player";
import { Score } from "./Score";
import { targetFromObject } from "./Target";
import { WaveManager } from "./WaveManager";
import { WeaponLoadout } from "./Weapon";

export type Phase =
  | "menu"
  | "countdown"
  | "playing"
  | "paused"
  | "end";

const MATCH_TIME = 60;
/** Seconds added to the clock every time a wave is cleared. */
const WAVE_TIME_BONUS = 15;

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly player = new Player();
  readonly weapons = new WeaponLoadout();
  readonly score = new Score();
  readonly waves: WaveManager;
  readonly hud = new HUD();
  readonly sound = new Sound();
  readonly raycaster = new THREE.Raycaster();
  readonly hallMeshes: THREE.Mesh[];

  phase: Phase = "menu";
  timeLeft = MATCH_TIME;

  private countdown = 3;
  private clock = new THREE.Clock();
  private sparks: { mesh: THREE.Mesh; life: number }[] = [];
  private canvas: HTMLCanvasElement;

  constructor(host: HTMLElement) {
    // Phase 1: lighter background and a fog that pushes the back wall into view.
    this.scene.background = new THREE.Color(0x1b1f26);
    this.scene.fog = new THREE.Fog(0x1b1f26, 26, 60);

    // The camera must be part of the scene so the first-person weapon,
    // muzzle flash and gun light (its children) are actually rendered.
    this.scene.add(this.player.camera);

    this.hallMeshes = buildHall(this.scene);
    this.waves = new WaveManager(this.scene);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
    });

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, 2),
    );

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    host.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.resize();
    this.player.setWeaponModel(this.weapons.def);
    this.bind();
    this.hud.showMenu();
  }

  startLoop(): void {
    const tick = () => {
      const dt = Math.min(0.05, this.clock.getDelta());

      this.update(dt);
      this.renderer.render(this.scene, this.player.camera);

      requestAnimationFrame(tick);
    };

    this.clock.start();
    tick();
  }

  private bind(): void {
    window.addEventListener("resize", () => this.resize());

    this.hud.onPlay(() => this.begin());
    this.hud.onRestart(() => this.begin());
    this.hud.onResume(() => this.resume());

    this.canvas.addEventListener("click", () => {
      this.sound.unlock();

      if (
        this.phase === "playing" ||
        this.phase === "countdown"
      ) {
        void this.canvas.requestPointerLock();
      }

      if (this.phase === "paused") {
        this.resume();
      }
    });

    document.addEventListener("pointerlockchange", () => {
      if (
        document.pointerLockElement !== this.canvas &&
        this.phase === "playing"
      ) {
        this.pause();
      }
    });

    document.addEventListener("mousemove", (event) => {
      if (document.pointerLockElement !== this.canvas) return;

      if (
        this.phase !== "playing" &&
        this.phase !== "countdown"
      ) {
        return;
      }

      this.player.onMouseMove(event);
    });

    document.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      if (this.phase !== "playing") return;

      if (document.pointerLockElement !== this.canvas) return;

      this.tryFire();
    });

    document.addEventListener("keydown", (event) => {
      if (event.repeat) return;

      this.player.setKey(event.code, true);

      if (
        this.phase !== "playing" &&
        this.phase !== "paused"
      ) {
        return;
      }

      if (event.code === "KeyR") {
        if (this.weapons.startReload()) {
          this.sound.reload();
        }
      }

      if (event.code === "Digit1") this.switchWeapon(0);
      if (event.code === "Digit2") this.switchWeapon(1);
      if (event.code === "Digit3") this.switchWeapon(2);

      if (
        event.code === "Escape" &&
        this.phase === "playing"
      ) {
        this.pause();
      }
    });

    document.addEventListener("keyup", (event) => {
      this.player.setKey(event.code, false);
    });

    document.addEventListener(
      "wheel",
      (event) => {
        if (this.phase !== "playing") return;

        event.preventDefault();

        this.weapons.cycle(event.deltaY > 0 ? 1 : -1);
        this.player.setWeaponModel(this.weapons.def);
      },
      { passive: false },
    );
  }

  private begin(): void {
    this.sound.unlock();
    this.clearSparks();
    this.waves.reset();
    this.weapons.reset();
    this.score.reset();
    this.player.reset();
    this.player.setWeaponModel(this.weapons.def);

    this.timeLeft = MATCH_TIME;
    this.countdown = 3;
    this.phase = "countdown";

    this.waves.startCurrent();
    this.hud.showCountdown(3);

    void this.canvas.requestPointerLock();
    this.sound.wave();
  }

  private pause(): void {
    if (this.phase !== "playing") return;

    this.phase = "paused";
    this.hud.showPause();

    document.exitPointerLock();
  }

  private resume(): void {
    if (this.phase !== "paused") return;

    this.phase = "playing";
    this.hud.showPlaying();

    void this.canvas.requestPointerLock();
  }

  private finish(win: boolean): void {
    this.phase = "end";

    document.exitPointerLock();
    this.hud.showEnd(win, this.score.points);
  }

  private switchWeapon(index: number): void {
    this.weapons.select(index);
    this.player.setWeaponModel(this.weapons.def);
  }

  private tryFire(): void {
    if (!this.weapons.fire()) {
      if (this.weapons.reloading > 0) return;

      if (this.weapons.mag[this.weapons.index] <= 0) {
        this.sound.reload();
      }

      return;
    }

    this.sound.fire(this.weapons.def.id);
    this.player.kick(this.weapons.def.recoil);

    this.raycaster.setFromCamera(
      new THREE.Vector2(0, 0),
      this.player.camera,
    );

    // Test live targets first, independently of hall geometry.
    const targetGroups = this.waves.targets
      .filter((target) => target.alive && target.hittable)
      .map((target) => target.group);

    const targetHits = this.raycaster.intersectObjects(
      targetGroups,
      true,
    );

    const targetHit = targetHits.find((intersection) => {
      const target = targetFromObject(intersection.object);

      return (
        target !== null &&
        target.alive &&
        target.hittable
      );
    });

    if (targetHit) {
      this.spawnSpark(targetHit.point);

      const target = targetFromObject(targetHit.object);

      if (!target) {
        this.score.registerMiss(this.clock.elapsedTime);
        return;
      }

      const killed = target.hit(this.weapons.def.damage);

      this.sound.hit();

      this.score.registerHit(
        this.clock.elapsedTime,
        killed ? target.points : 25,
      );

      if (killed) {
        this.waves.remaining = Math.max(
          0,
          this.waves.remaining - 1,
        );

        if (this.waves.remaining <= 0) {
          if (!this.waves.advance()) {
            this.finish(true);
            return;
          }

          // Next wave: add time and restock ammo.
          this.timeLeft += WAVE_TIME_BONUS;
          this.weapons.refillReserves();
          this.hud.showBanner(
            `Wave ${this.waves.waveNumber}: ${this.waves.waveName}`,
            `+${WAVE_TIME_BONUS}s  ·  ammo restocked`,
          );
          this.sound.wave();
        }
      }

      return;
    }

    // No target intersection: show impact feedback on the hall.
    const hallHits = this.raycaster.intersectObjects(
      this.hallMeshes,
      false,
    );

    if (hallHits.length > 0) {
      this.spawnSpark(hallHits[0].point);
    }

    this.score.registerMiss(this.clock.elapsedTime);
  }

  private spawnSpark(point: THREE.Vector3): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 6, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffe082,
      }),
    );

    mesh.position.copy(point);
    this.scene.add(mesh);

    this.sparks.push({
      mesh,
      life: 0.12,
    });
  }

  private clearSparks(): void {
    for (const spark of this.sparks) {
      this.scene.remove(spark.mesh);
      spark.mesh.geometry.dispose();

      (spark.mesh.material as THREE.Material).dispose();
    }

    this.sparks = [];
  }

  private update(dt: number): void {
    if (this.phase === "countdown") {
      this.player.update(dt);

      this.countdown -= dt;

      const number = Math.ceil(this.countdown);
      this.hud.showCountdown(number);

      if (this.countdown <= 0) {
        this.phase = "playing";
        this.hud.showPlaying();
        this.hud.showBanner(
          `Wave ${this.waves.waveNumber}: ${this.waves.waveName}`,
          `${this.waves.totalWaves} waves`,
        );
      }

      this.syncHud();
      this.updateSparks(dt);
      return;
    }

    if (this.phase !== "playing") {
      this.player.update(dt);
      this.updateSparks(dt);
      return;
    }

    this.player.update(dt);
    this.weapons.update(dt);
    this.waves.update(dt);
    this.score.tick(this.clock.elapsedTime);

    this.timeLeft -= dt;

    if (this.timeLeft <= 0) {
      this.finish(false);
      return;
    }

    this.updateSparks(dt);
    this.syncHud();
  }

  private updateSparks(dt: number): void {
    for (const spark of this.sparks) {
      spark.life -= dt;
      spark.mesh.scale.multiplyScalar(1 + dt * 8);
    }

    this.sparks = this.sparks.filter((spark) => {
      if (spark.life > 0) return true;

      this.scene.remove(spark.mesh);
      spark.mesh.geometry.dispose();

      (spark.mesh.material as THREE.Material).dispose();

      return false;
    });
  }

  private syncHud(): void {
    this.hud.update({
      wave: this.waves.waveNumber,
      totalWaves: this.waves.totalWaves,
      time: this.timeLeft,
      score: this.score.points,
      combo: this.score.combo,
      gun: this.weapons.def.name,
      mag: this.weapons.mag[this.weapons.index],
      reserve: this.weapons.reserve[this.weapons.index],
      reloading: this.weapons.reloading > 0,
    });
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.player.camera.aspect = width / height;
    this.player.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }
}