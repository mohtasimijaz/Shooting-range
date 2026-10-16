import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Sound } from "../audio/Sound";
import { IS_TOUCH, qualityProfile, supportsPointerLock, type QualityProfile } from "../core/Device";
import { Settings, type SettingsData } from "../core/Settings";
import { Input, type InputAction } from "../input/Input";
import { HUD } from "../ui/HUD";
import { buildHall } from "../world/Hall";
import { Effects, type Surface } from "./Effects";
import { Player } from "./Player";
import { Score } from "./Score";
import { Target, targetFromObject, type HitZone } from "./Target";
import { CHECKPOINTS, START_TIME, generateWave } from "./WaveGen";
import { WaveManager } from "./WaveManager";
import { WeaponLoadout } from "./Weapon";

export type Phase = "menu" | "countdown" | "playing" | "paused" | "end";

/** Seconds of calm between a cleared wave and the next one. */
const WAVE_BREAK = 1.6;
const PENALTY_POINTS = 250;
const PENALTY_TIME = 3;
const BONUS_TIME = 3;
const MAX_RANGE = 40;

const PRECISION: Record<HitZone, number> = { x: 1.5, head: 1.5, inner: 1.25, body: 1 };

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly player = new Player();
  readonly weapons = new WeaponLoadout();
  readonly score = new Score();
  readonly waves: WaveManager;
  readonly hud = new HUD();
  readonly sound = new Sound();
  readonly settings = new Settings();
  readonly input: Input;
  readonly effects: Effects;

  phase: Phase = "menu";
  timeLeft = START_TIME;

  private readonly quality: QualityProfile;
  private readonly canvas: HTMLCanvasElement;
  private readonly colliders: THREE.Mesh[];
  private readonly raycaster = new THREE.Raycaster();
  private readonly composer: EffectComposer | null = null;
  private readonly clock = new THREE.Clock();

  private countdown = 3;
  private lastCount = 4;
  private pausedFrom: "countdown" | "playing" = "playing";
  private pendingResume = false;
  private waveBreak = 0;
  private fireBuffer = 0;
  private lastLowBeep = 0;
  private qualityDirty = false;
  private pixelRatio: number;
  private frameAvg = 1 / 60;
  private adaptTimer = 0;
  private onTarget = false;

  // Scratch objects reused every shot.
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();
  private readonly normalMatrix = new THREE.Matrix3();

  constructor(host: HTMLElement) {
    this.quality = qualityProfile(this.settings.data.quality);
    document.body.classList.add(IS_TOUCH ? "touch" : "desktop");

    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality.antialias, powerPreference: "high-performance" });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = this.quality.shadowLights > 0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.autoClear = false;
    host.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    // Image-based lighting: gives metal and painted surfaces believable reflections.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.22;
    this.player.viewScene.environment = env;
    this.player.viewScene.environmentIntensity = 0.85;

    this.scene.background = new THREE.Color(0x15181c);
    this.scene.fog = new THREE.Fog(0x15181c, 22, 44);
    this.scene.add(this.player.camera);

    this.colliders = buildHall(this.scene, this.quality);
    this.waves = new WaveManager(this.scene);
    this.effects = new Effects(this.scene, this.quality);
    this.effects.onCasingBounce = (strength) => this.sound.casing(strength);
    this.input = new Input(this.canvas, () => this.settings.data.sensitivity);

    if (this.quality.bloom) {
      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.scene, this.player.camera));
      const viewPass = new RenderPass(this.player.viewScene, this.player.viewCamera);
      viewPass.clear = false;
      viewPass.clearDepth = true;
      composer.addPass(viewPass);
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.35, 1.0));
      composer.addPass(new OutputPass());
      this.composer = composer;
    }

    this.sound.setVolume(this.settings.data.volume);
    this.hud.loadSettings(this.settings.data);
    this.player.setWeapon(this.weapons.def, false);
    this.waves.start(1); // scenery behind the main menu
    this.resize();
    this.bind();
    this.toMenu();
  }

  startLoop(): void {
    this.clock.start();
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(0.05, this.clock.getDelta());
      this.update(dt);
      this.render();
      this.adaptResolution(dt);
    });
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  private bind(): void {
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => setTimeout(() => this.resize(), 200));

    // Audio can only start inside a user gesture (iOS, Chrome autoplay policy).
    for (const type of ["pointerdown", "touchend", "keydown", "click"]) {
      document.addEventListener(type, () => this.sound.unlock(), { capture: true, passive: true });
    }

    document.addEventListener("visibilitychange", () => {
      this.sound.setSuspended(document.hidden);
      if (document.hidden) this.pause("Paused while the game was in the background");
    });

    document.addEventListener("pointerlockchange", () => {
      const locked = this.input.pointerLocked;
      if (locked && this.phase === "paused" && this.pendingResume) {
        this.doResume();
      } else if (!locked && (this.phase === "playing" || this.phase === "countdown")) {
        this.pause("Click Resume to lock the mouse again");
      }
    });
    document.addEventListener("pointerlockerror", () => {
      if (this.pendingResume) {
        this.pendingResume = false;
        this.hud.setPauseMessage("The browser blocked mouse lock — click Resume again");
      }
    });

    this.canvas.addEventListener("click", () => {
      if (IS_TOUCH) return;
      if ((this.phase === "playing" || this.phase === "countdown") && !this.input.pointerLocked) this.requestLock();
      else if (this.phase === "paused") this.resume();
    });

    this.hud.onPlay(() => this.begin(1));
    this.hud.onContinue(() => this.begin(this.settings.data.checkpoint));
    this.hud.onResume(() => this.resume());
    this.hud.onQuit(() => this.toMenu());
    this.hud.onSettingsChange((patch) => this.applySettings(patch));
  }

  private applySettings(patch: Partial<SettingsData>): void {
    const qualityChanged = patch.quality !== undefined && patch.quality !== this.settings.data.quality;
    this.settings.update(patch);
    if (patch.volume !== undefined) this.sound.setVolume(patch.volume);
    if (qualityChanged) {
      // Lights, shadows and post-processing are built at startup, so a new
      // quality level needs a reload. From the main menu that is instant.
      if (this.phase === "menu") window.location.reload();
      else {
        this.qualityDirty = true;
        this.hud.showQualityNote(true);
      }
    }
  }

  private requestLock(): void {
    if (!supportsPointerLock()) return;
    try {
      const result: unknown = this.canvas.requestPointerLock();
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      // Some browsers throw when called too soon after an unlock.
    }
  }

  private exitLock(): void {
    if (document.pointerLockElement && typeof document.exitPointerLock === "function") document.exitPointerLock();
  }

  private enterFullscreen(): void {
    if (!IS_TOUCH) return;
    const root = document.documentElement;
    if (document.fullscreenElement || typeof root.requestFullscreen !== "function") return;
    root
      .requestFullscreen({ navigationUI: "hide" })
      .then(() => {
        const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        return orientation?.lock?.("landscape");
      })
      .catch(() => undefined);
  }

  // ---------------------------------------------------------------------------
  // Phases
  // ---------------------------------------------------------------------------

  private begin(startWave: number): void {
    this.sound.unlock();
    this.input.releaseAll();
    this.effects.reset();
    this.weapons.reset();
    this.score.reset();
    this.player.reset();
    this.player.setWeapon(this.weapons.def, false);
    this.sound.cancelReload();

    this.timeLeft = START_TIME;
    this.waves.start(startWave);
    this.waveBreak = 0;
    this.fireBuffer = 0;
    this.countdown = 3;
    this.lastCount = 4;
    this.phase = "countdown";
    this.input.enabled = true;
    this.input.touch?.setVisible(true);
    this.hud.invalidate();
    this.hud.showCountdown(3, this.countdownSub());
    this.requestLock();
    this.enterFullscreen();
  }

  private countdownSub(): string {
    const s = this.waves.spec;
    return `Wave ${s.number} · ${s.name}`;
  }

  private pause(message: string): void {
    if (this.phase !== "playing" && this.phase !== "countdown") return;
    this.pausedFrom = this.phase;
    this.phase = "paused";
    this.pendingResume = false;
    this.input.releaseAll();
    this.input.enabled = false;
    this.input.touch?.setVisible(false);
    if (this.weapons.reloading > 0) {
      this.weapons.cancelReload();
      this.sound.cancelReload();
    }
    this.hud.showPause(message);
    this.exitLock();
  }

  private resume(): void {
    if (this.phase !== "paused") return;
    if (IS_TOUCH && window.innerHeight > window.innerWidth) {
      this.hud.setPauseMessage("Rotate your phone to landscape first");
      return;
    }
    if (!supportsPointerLock() || this.input.pointerLocked) {
      this.doResume();
      return;
    }
    // Desktop: wait for the browser to grant pointer lock before resuming.
    this.pendingResume = true;
    this.hud.setPauseMessage("Locking mouse…");
    this.requestLock();
  }

  private doResume(): void {
    this.pendingResume = false;
    this.phase = this.pausedFrom;
    this.input.enabled = true;
    this.input.touch?.setVisible(true);
    this.hud.invalidate();
    if (this.phase === "playing") this.hud.showPlaying();
    this.enterFullscreen();
  }

  private toMenu(): void {
    if (this.qualityDirty) {
      window.location.reload();
      return;
    }
    this.phase = "menu";
    this.input.releaseAll();
    this.input.enabled = false;
    this.input.touch?.setVisible(false);
    this.sound.cancelReload();
    this.exitLock();
    this.effects.reset();
    this.waves.start(1);
    this.player.reset();
    const d = this.settings.data;
    this.hud.showMenu(d.bestScore, d.bestWave, d.checkpoint);
  }

  private finish(win: boolean): void {
    this.phase = "end";
    this.input.releaseAll();
    this.input.enabled = false;
    this.input.touch?.setVisible(false);
    this.sound.cancelReload();
    this.exitLock();
    this.sound.end(win);
    const wave = this.waves.waveNumber;
    const newBest = this.settings.recordRun(this.score.points, wave);
    this.hud.showEnd({
      win,
      score: this.score.points,
      wave,
      kills: this.score.kills,
      accuracy: this.score.accuracy,
      bestCombo: this.score.bestCombo,
      bullseyes: this.score.bullseyes,
      newBest,
      checkpoint: this.settings.data.checkpoint,
    });
  }

  // ---------------------------------------------------------------------------
  // Frame update
  // ---------------------------------------------------------------------------

  private update(dt: number): void {
    this.effects.update(dt);

    for (const action of this.input.consumeActions()) {
      if (action.type === "pause") {
        if (this.phase === "paused") this.resume();
        else this.pause("Game paused");
      } else if (this.phase === "playing") {
        this.handleAction(action);
      }
    }

    if (IS_TOUCH && (this.phase === "playing" || this.phase === "countdown") && window.innerHeight > window.innerWidth) {
      this.pause("Rotate your phone to landscape to continue");
    }

    if (this.phase === "menu") {
      // Slow look-around behind the menu.
      const t = this.clock.elapsedTime;
      this.player.yaw = Math.sin(t * 0.12) * 0.22;
      this.player.pitch = Math.sin(t * 0.09) * 0.04 + 0.02;
      this.player.update(dt, 0, 0);
      this.waves.update(dt);
      return;
    }

    if (this.phase === "countdown") {
      const look = this.input.consumeLook();
      this.player.applyLook(look.x, look.y);
      this.player.update(dt, this.input.moveX, 0);
      this.waves.update(dt);
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastCount) {
        this.lastCount = n;
        this.sound.countdown(n <= 0);
      }
      this.hud.showCountdown(n, this.countdownSub());
      if (this.countdown <= 0) {
        this.phase = "playing";
        this.hud.showPlaying();
        const s = this.waves.spec;
        this.hud.showBanner(`Wave ${s.number}: ${s.name}`, `${s.tierName} · ${s.requiredCount} targets`);
        if (supportsPointerLock() && !this.input.pointerLocked) this.pause("Click Resume to lock the mouse and start");
      }
      this.syncHud();
      return;
    }

    if (this.phase !== "playing") {
      this.player.update(dt, 0, this.weapons.reloadProgress);
      return;
    }

    const now = this.clock.elapsedTime;
    const look = this.input.consumeLook();
    this.player.applyLook(look.x, look.y);

    const wasReloading = this.weapons.reloading > 0;
    this.weapons.update(dt);
    if (wasReloading && this.weapons.reloading <= 0) this.player.chamber();
    this.player.update(dt, this.input.moveX, this.weapons.reloadProgress);

    // Trigger: automatic weapons fire while held; single fire buffers a click
    // briefly so fast taps between shots are not lost.
    const pressed = this.input.consumeFirePressed();
    if (pressed) this.fireBuffer = 0.15;
    this.fireBuffer = Math.max(0, this.fireBuffer - dt);
    if (this.weapons.mode === "auto") {
      if (this.input.fireHeld) {
        this.tryFire(pressed, now);
        // On a very slow frame, catch up on rounds that were due (max 2 extra).
        for (let extra = 0; extra < 2 && this.phase === "playing" && this.weapons.canFire(); extra++) {
          this.tryFire(false, now);
        }
      }
    } else if (this.fireBuffer > 0 && this.weapons.cooldown <= 0) {
      this.fireBuffer = 0;
      this.tryFire(true, now);
    }
    if (this.phase !== "playing") return; // the shot may have ended the run

    this.waves.update(dt);
    this.score.tick(now);

    if (this.waveBreak > 0) {
      this.waveBreak -= dt;
      if (this.waveBreak <= 0) this.startNextWave();
    } else {
      this.timeLeft -= dt;
      const secs = Math.ceil(this.timeLeft);
      if (secs <= 5 && secs > 0 && secs !== this.lastLowBeep) {
        this.lastLowBeep = secs;
        this.sound.lowTime();
      }
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.finish(false);
        return;
      }
    }

    this.updateAim();
    this.syncHud();
  }

  private handleAction(action: InputAction): void {
    switch (action.type) {
      case "reload":
        if (this.weapons.startReload()) this.sound.reload(this.weapons.def);
        break;
      case "weapon":
        this.switchWeapon(() => this.weapons.select(action.index));
        break;
      case "cycle":
        this.switchWeapon(() => this.weapons.cycle(action.dir));
        break;
      case "mode":
        if (this.weapons.toggleMode()) this.sound.modeSwitch();
        else this.hud.toast(`${this.weapons.def.name}: semi-auto only`, "info");
        break;
      case "pause":
        break;
    }
  }

  private switchWeapon(change: () => boolean): void {
    if (!change()) return;
    this.sound.cancelReload();
    this.sound.weaponSwitch();
    this.player.setWeapon(this.weapons.def);
  }

  /** Crosshair spread + aim assist (slower look while over a target on touch). */
  private updateAim(): void {
    this.ndc.set(0, 0);
    this.raycaster.setFromCamera(this.ndc, this.player.camera);
    const groups = this.liveTargetGroups();
    const hit = groups.length > 0 ? this.raycaster.intersectObjects(groups, true)[0] : undefined;
    const target = hit ? targetFromObject(hit.object) : null;
    this.onTarget = target !== null && target.hittable && target.kind !== "civilian";
    this.input.lookScale = IS_TOUCH && this.settings.data.aimAssist && this.onTarget ? 0.5 : 1;

    const cam = this.player.camera;
    const halfFov = THREE.MathUtils.degToRad(cam.fov / 2);
    const gap = 5 + (Math.tan(this.weapons.spread) / Math.tan(halfFov)) * (window.innerHeight / 2);
    this.hud.setSpread(gap, this.onTarget);
  }

  private liveTargetGroups(): THREE.Object3D[] {
    const groups: THREE.Object3D[] = [];
    for (const t of this.waves.targets) if (t.alive && t.hittable) groups.push(t.group);
    return groups;
  }

  // ---------------------------------------------------------------------------
  // Shooting
  // ---------------------------------------------------------------------------

  private tryFire(pressed: boolean, now: number): void {
    const def = this.weapons.def;
    const spread = this.weapons.spread;
    const result = this.weapons.fire();
    if (!result.fired) {
      if (result.reloadStarted) this.sound.reload(def);
      else if (result.dry && pressed) {
        this.sound.dry();
        this.hud.toast("Out of ammo — switch weapon", "info");
      }
      return;
    }
    if (result.reloadStarted) this.sound.reload(def);

    this.score.registerShot();
    this.sound.fire(def.id);

    // Bullet direction: centre of the screen plus a random offset inside the spread cone.
    const cam = this.player.camera;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const r = spread * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    this.ndc.set(Math.tan(r * Math.cos(a)) / tanHalf / cam.aspect, Math.tan(r * Math.sin(a)) / tanHalf);
    this.raycaster.setFromCamera(this.ndc, cam);
    const ray = this.raycaster.ray;

    // Muzzle effects, ejected brass and tracer start (before recoil moves the gun).
    this.player.axes(this.right, this.up, this.forward);
    const muzzle = this.player.muzzleWorld(this.tmpA);
    this.effects.muzzleSmoke(muzzle, this.forward);
    this.effects.ejectCasing(this.player.ejectWorld(this.tmpB), this.right, this.up, this.forward, def.cls);
    this.player.kick(def, IS_TOUCH ? 0.4 : 1);

    const targetHits = this.raycaster.intersectObjects(this.liveTargetGroups(), true);
    const hallHit = this.raycaster.intersectObjects(this.colliders, false)[0];
    const first = targetHits.find((h) => {
      const t = targetFromObject(h.object);
      return t !== null && t.alive && t.hittable;
    });

    let end: THREE.Vector3;
    if (first && (!hallHit || first.distance <= hallHit.distance)) {
      const target = targetFromObject(first.object) as Target;
      end = this.hitTarget(target, first, targetHits, now);
    } else if (hallHit) {
      end = hallHit.point;
      const surface = (hallHit.object.userData.surface as Surface | undefined) ?? "concrete";
      const normal = this.worldNormal(hallHit, ray.direction);
      this.effects.impact(hallHit.point, normal, surface);
      if (surface !== "steel" && !(hallHit.object instanceof THREE.InstancedMesh)) {
        this.effects.bulletHole(hallHit.point, normal, surface === "foam" ? 0.05 : 0.04);
      }
      this.score.registerMiss(now);
    } else {
      end = this.tmpB.copy(ray.origin).addScaledVector(ray.direction, MAX_RANGE);
      this.score.registerMiss(now);
    }

    if (def.tracerEvery > 0 && this.weapons.roundsFired % def.tracerEvery === 0) {
      this.effects.tracer(muzzle, end);
    }
  }

  private worldNormal(hit: THREE.Intersection, rayDir: THREE.Vector3): THREE.Vector3 {
    const out = new THREE.Vector3();
    if (hit.face) {
      this.normalMatrix.getNormalMatrix(hit.object.matrixWorld);
      out.copy(hit.face.normal).applyMatrix3(this.normalMatrix).normalize();
      if (out.dot(rayDir) > 0) out.negate();
    } else {
      out.copy(rayDir).negate();
    }
    return out;
  }

  /** Applies a hit to a target. Returns the impact point. */
  private hitTarget(target: Target, first: THREE.Intersection, hits: THREE.Intersection[], now: number): THREE.Vector3 {
    const def = this.weapons.def;
    const boardHit = hits.find((h) => h.object === target.board);
    const hit = boardHit ?? first;
    const point = hit.point.clone();
    const normal = this.worldNormal(hit, this.raycaster.ray.direction);
    const screen = this.toScreen(point);

    if (target.armored) {
      this.effects.impact(point, normal, "steel");
      this.sound.steel();
    } else {
      this.effects.impact(point, normal, "paper");
      if (boardHit) this.effects.bulletHole(boardHit.point, normal, 0.026, target.board);
    }

    if (target.kind === "civilian") {
      target.hit(99);
      const lost = this.score.applyPenalty(now, PENALTY_POINTS);
      this.timeLeft = Math.max(0, this.timeLeft - PENALTY_TIME);
      this.sound.penalty();
      this.hud.toast(`No shoot!  −${PENALTY_POINTS} · −${PENALTY_TIME}s`, "bad");
      this.hud.popup(screen.x, screen.y, lost > 0 ? `−${lost}` : "NO SHOOT", "bad");
      return point;
    }

    if (target.kind === "bonus") {
      target.hit(99);
      const gained = this.score.registerHit(now, target.points);
      this.score.registerKill();
      this.timeLeft += BONUS_TIME;
      this.sound.bonus();
      this.hud.hitMarker(true);
      this.hud.toast(`Bonus  +${BONUS_TIME}s`, "good");
      this.hud.popup(screen.x, screen.y, `+${gained}`, "good");
      return point;
    }

    const damage = def.damage * (target.armored ? def.armorFactor : 1);
    const killed = target.hit(damage);
    const zone: HitZone =
      boardHit && boardHit.uv && boardHit.face?.materialIndex === 4 ? target.zoneAt(boardHit.uv) : "body";
    const gained = this.score.registerHit(now, killed ? target.points : 25, PRECISION[zone]);

    if (zone === "x" || zone === "head") {
      this.score.registerBullseye();
      this.hud.popup(screen.x, screen.y - 26, zone === "head" ? "HEADSHOT" : "BULLSEYE", "gold");
    }
    this.hud.popup(screen.x, screen.y, `+${gained}`, zone === "body" ? "normal" : "gold");
    this.hud.hitMarker(killed);

    if (killed) {
      this.score.registerKill();
      this.sound.kill();
      this.waves.remaining = Math.max(0, this.waves.remaining - 1);
      if (this.waves.remaining <= 0 && this.waveBreak <= 0) this.waveCleared();
    } else if (!target.armored) {
      this.sound.hit();
    }
    return point;
  }

  private toScreen(point: THREE.Vector3): { x: number; y: number } {
    const p = this.tmpB.copy(point).project(this.player.camera);
    return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
  }

  // ---------------------------------------------------------------------------
  // Waves
  // ---------------------------------------------------------------------------

  private waveCleared(): void {
    this.waves.retireOptional();
    if (!this.waves.hasNext()) {
      this.finish(true);
      return;
    }
    const next = this.waves.waveNumber + 1;
    if (CHECKPOINTS.includes(next) && this.settings.unlockCheckpoint(next)) {
      this.hud.toast(`Checkpoint unlocked · Wave ${next}`, "good");
    }
    this.weapons.refillReserves();
    this.waveBreak = WAVE_BREAK;
    this.hud.showBanner(`Wave ${this.waves.waveNumber} cleared`, `Ammo restocked · +${generateWave(next).timeBonus}s`);
    this.sound.wave();
  }

  private startNextWave(): void {
    const prevTier = this.waves.spec.tier;
    this.waves.start(this.waves.waveNumber + 1);
    const s = this.waves.spec;
    this.timeLeft += s.timeBonus;
    const parts = [s.tier !== prevTier ? `New tier: ${s.tierName}` : s.tierName];
    if (s.boss) parts.push("Boss wave");
    parts.push(`${s.requiredCount} targets`);
    this.hud.showBanner(`Wave ${s.number}: ${s.name}`, parts.join(" · "));
    this.sound.wave();
  }

  private syncHud(): void {
    const now = this.clock.elapsedTime;
    this.hud.update({
      wave: this.waves.waveNumber,
      totalWaves: this.waves.totalWaves,
      tierName: this.waves.spec.tierName,
      remaining: this.waves.remaining,
      required: this.waves.spec.requiredCount,
      time: this.timeLeft,
      score: this.score.points,
      combo: this.score.combo,
      multiplier: this.score.multiplier,
      comboLeft: this.score.comboTimeLeft(now),
      weaponIndex: this.weapons.index,
      weapon: this.weapons.def,
      mode: this.weapons.mode,
      mag: this.weapons.mag[this.weapons.index],
      reserve: this.weapons.reserve[this.weapons.index],
      reloadProgress: this.weapons.reloadProgress,
    });
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    if (this.composer) {
      this.composer.render();
      return;
    }
    // World first, then the weapon on top (depth cleared so it never clips).
    this.renderer.clear();
    this.renderer.render(this.scene, this.player.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.player.viewScene, this.player.viewCamera);
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.player.setAspect(width / height);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(width, height);
    }
    const halfFov = THREE.MathUtils.degToRad(this.player.camera.fov / 2);
    this.effects.setPixelScale((height * this.pixelRatio) / (2 * Math.tan(halfFov)));
  }

  /** Lowers the render resolution when the frame rate drops, raises it when there is headroom. */
  private adaptResolution(dt: number): void {
    if (this.phase !== "playing") return;
    this.frameAvg += (dt - this.frameAvg) * 0.05;
    this.adaptTimer += dt;
    if (this.adaptTimer < 2) return;
    this.adaptTimer = 0;
    const max = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio);
    let next = this.pixelRatio;
    if (this.frameAvg > 1 / 45) next = Math.max(this.quality.minPixelRatio, this.pixelRatio - 0.15);
    else if (this.frameAvg < 1 / 58) next = Math.min(max, this.pixelRatio + 0.1);
    if (Math.abs(next - this.pixelRatio) > 0.01) {
      this.pixelRatio = next;
      this.resize();
    }
  }
}
