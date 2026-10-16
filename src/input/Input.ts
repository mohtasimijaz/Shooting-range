import { IS_TOUCH } from "../core/Device";
import { TouchControls } from "./TouchControls";

/**
 * One input layer for mouse/keyboard and touch.
 *
 * Devices only write state here; the Game reads it once per frame and decides
 * what is allowed in the current phase (so e.g. reloading while paused is
 * impossible by construction).
 */

export type InputAction =
  | { type: "reload" }
  | { type: "weapon"; index: number }
  | { type: "cycle"; dir: 1 | -1 }
  | { type: "mode" }
  | { type: "pause" };

/** Radians of rotation per pixel of mouse movement at sensitivity 1. */
const MOUSE_RAD_PER_PX = 0.0022;
/** Radians of rotation per pixel of finger movement at sensitivity 1. */
const TOUCH_RAD_PER_PX = 0.0052;
/** Some browsers report huge spikes in movementX right after locking. */
const MAX_MOUSE_STEP = 180;

export class Input {
  /** True while the trigger (mouse button or fire button) is held. */
  fireHeld = false;
  /** Game toggles this; when false nothing is recorded. */
  enabled = false;
  /** Multiplier applied to look input (aim assist lowers it over targets). */
  lookScale = 1;

  readonly touch: TouchControls | null;

  private readonly canvas: HTMLCanvasElement;
  private readonly sensitivity: () => number;
  private keyLeft = false;
  private keyRight = false;
  private joyX = 0;
  private lookX = 0;
  private lookY = 0;
  private firePressed = false;
  private actions: InputAction[] = [];

  constructor(canvas: HTMLCanvasElement, sensitivity: () => number) {
    this.canvas = canvas;
    this.sensitivity = sensitivity;
    this.touch = IS_TOUCH ? new TouchControls(this) : null;
    this.bindDesktop();
  }

  /** Strafe input in -1..1 (keyboard and joystick combined). */
  get moveX(): number {
    const keys = (this.keyRight ? 1 : 0) - (this.keyLeft ? 1 : 0);
    return Math.max(-1, Math.min(1, keys + this.joyX));
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  // ----- Called by device handlers -----

  addLookPixels(dx: number, dy: number, touch: boolean): void {
    if (!this.enabled) return;
    const k = (touch ? TOUCH_RAD_PER_PX : MOUSE_RAD_PER_PX) * this.sensitivity() * this.lookScale;
    this.lookX += dx * k;
    this.lookY += dy * k;
  }

  setJoystick(x: number): void {
    this.joyX = this.enabled ? x : 0;
  }

  pressFire(down: boolean): void {
    if (down && !this.enabled) return;
    if (down && !this.fireHeld) this.firePressed = true;
    this.fireHeld = down;
  }

  pushAction(action: InputAction): void {
    if (!this.enabled && action.type !== "pause") return;
    this.actions.push(action);
  }

  // ----- Read by the Game once per frame -----

  consumeLook(): { x: number; y: number } {
    const out = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  consumeFirePressed(): boolean {
    const pressed = this.firePressed;
    this.firePressed = false;
    return pressed;
  }

  consumeActions(): InputAction[] {
    const list = this.actions;
    this.actions = [];
    return list;
  }

  /** Drops every held key/button (on pause, blur, phase changes). */
  releaseAll(): void {
    this.fireHeld = false;
    this.firePressed = false;
    this.keyLeft = false;
    this.keyRight = false;
    this.joyX = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.actions = [];
    this.touch?.reset();
  }

  private bindDesktop(): void {
    document.addEventListener("mousemove", (e) => {
      if (!this.pointerLocked) return;
      const dx = Math.max(-MAX_MOUSE_STEP, Math.min(MAX_MOUSE_STEP, e.movementX));
      const dy = Math.max(-MAX_MOUSE_STEP, Math.min(MAX_MOUSE_STEP, e.movementY));
      this.addLookPixels(dx, dy, false);
    });

    document.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || !this.pointerLocked) return;
      this.pressFire(true);
    });

    document.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.fireHeld = false;
    });

    document.addEventListener("pointerlockchange", () => {
      if (!this.pointerLocked) this.fireHeld = false;
    });

    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("keydown", (e) => {
      this.setKey(e.code, true);
      if (e.repeat) return;
      switch (e.code) {
        case "KeyR":
          this.pushAction({ type: "reload" });
          break;
        case "KeyB":
        case "KeyX":
          this.pushAction({ type: "mode" });
          break;
        case "KeyP":
          this.pushAction({ type: "pause" });
          break;
        case "Digit1":
        case "Digit2":
        case "Digit3":
        case "Digit4":
        case "Digit5":
          this.pushAction({ type: "weapon", index: Number(e.code.slice(5)) - 1 });
          break;
        case "KeyQ":
          this.pushAction({ type: "cycle", dir: -1 });
          break;
        case "KeyE":
          this.pushAction({ type: "cycle", dir: 1 });
          break;
        default:
          break;
      }
    });

    document.addEventListener("keyup", (e) => this.setKey(e.code, false));

    window.addEventListener("blur", () => {
      this.fireHeld = false;
      this.keyLeft = false;
      this.keyRight = false;
    });

    document.addEventListener(
      "wheel",
      (e) => {
        if (!this.enabled || !this.pointerLocked) return;
        e.preventDefault();
        if (e.deltaY !== 0) this.pushAction({ type: "cycle", dir: e.deltaY > 0 ? 1 : -1 });
      },
      { passive: false },
    );
  }

  private setKey(code: string, down: boolean): void {
    if (code === "KeyA" || code === "ArrowLeft") this.keyLeft = down && this.enabled;
    if (code === "KeyD" || code === "ArrowRight") this.keyRight = down && this.enabled;
  }
}
