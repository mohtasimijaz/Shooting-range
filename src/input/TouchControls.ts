import type { Input } from "./Input";

/**
 * On-screen controls for phones and tablets (landscape).
 *
 *  - Left 40% of the screen: a floating strafe stick appears under the thumb.
 *  - Anywhere else: drag to aim.
 *  - FIRE: hold to shoot (automatic weapons keep firing); dragging on it also aims.
 *  - RELOAD, MODE (single/auto), PAUSE buttons, and the HUD weapon slots.
 *
 * Pointer Events with pointer capture are used so several fingers can be
 * tracked independently.
 */

const JOY_RADIUS = 56;
const JOY_DEADZONE = 0.12;

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
}

export class TouchControls {
  private readonly input: Input;
  private readonly root = el("touch-ui");
  private readonly look = el("touch-look");
  private readonly joy = el("joy");
  private readonly knob = el("joy-knob");
  private readonly fire = el("t-fire");

  private joyId: number | null = null;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private lookId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;
  private fireId: number | null = null;
  private fireLastX = 0;
  private fireLastY = 0;

  constructor(input: Input) {
    this.input = input;
    this.bindLookLayer();
    this.bindFire();
    this.bindTap("t-reload", () => this.input.pushAction({ type: "reload" }));
    this.bindTap("t-mode", () => this.input.pushAction({ type: "mode" }));
    this.bindTap("t-pause", () => this.input.pushAction({ type: "pause" }));

    for (const slot of Array.from(document.querySelectorAll<HTMLElement>("[data-slot]"))) {
      const index = Number(slot.dataset.slot);
      this.bindTap(slot, () => this.input.pushAction({ type: "weapon", index }));
    }

    // Stop iOS from scrolling / zooming the page while playing.
    for (const type of ["touchmove", "gesturestart"]) {
      document.addEventListener(type, (e) => {
        if (!this.root.classList.contains("hidden")) e.preventDefault();
      }, { passive: false });
    }
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
    if (!visible) this.reset();
  }

  reset(): void {
    this.joyId = null;
    this.lookId = null;
    this.fireId = null;
    this.joy.classList.remove("active");
    this.knob.style.transform = "translate(-50%, -50%)";
    this.fire.classList.remove("pressed");
  }

  private bindLookLayer(): void {
    this.look.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (e.clientX < window.innerWidth * 0.4 && this.joyId === null) {
        this.joyId = e.pointerId;
        this.joyOriginX = e.clientX;
        this.joyOriginY = e.clientY;
        this.joy.style.left = `${e.clientX}px`;
        this.joy.style.top = `${e.clientY}px`;
        this.joy.classList.add("active");
      } else if (this.lookId === null) {
        this.lookId = e.pointerId;
        this.lookLastX = e.clientX;
        this.lookLastY = e.clientY;
      } else {
        return;
      }
      this.look.setPointerCapture(e.pointerId);
    });

    this.look.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.joyId) {
        const dx = e.clientX - this.joyOriginX;
        const dy = e.clientY - this.joyOriginY;
        const len = Math.hypot(dx, dy);
        const k = len > JOY_RADIUS ? JOY_RADIUS / len : 1;
        this.knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
        const x = (dx * k) / JOY_RADIUS;
        this.input.setJoystick(Math.abs(x) < JOY_DEADZONE ? 0 : x);
      } else if (e.pointerId === this.lookId) {
        this.input.addLookPixels(e.clientX - this.lookLastX, e.clientY - this.lookLastY, true);
        this.lookLastX = e.clientX;
        this.lookLastY = e.clientY;
      }
    });

    const end = (e: PointerEvent) => {
      if (e.pointerId === this.joyId) {
        this.joyId = null;
        this.input.setJoystick(0);
        this.joy.classList.remove("active");
        this.knob.style.transform = "translate(-50%, -50%)";
      } else if (e.pointerId === this.lookId) {
        this.lookId = null;
      }
    };
    this.look.addEventListener("pointerup", end);
    this.look.addEventListener("pointercancel", end);
  }

  private bindFire(): void {
    this.fire.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.fireId !== null) return;
      this.fireId = e.pointerId;
      this.fireLastX = e.clientX;
      this.fireLastY = e.clientY;
      this.fire.setPointerCapture(e.pointerId);
      this.fire.classList.add("pressed");
      this.input.pressFire(true);
    });

    // Sliding the thumb on the fire button also aims, like most mobile shooters.
    this.fire.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.fireId) return;
      this.input.addLookPixels(e.clientX - this.fireLastX, e.clientY - this.fireLastY, true);
      this.fireLastX = e.clientX;
      this.fireLastY = e.clientY;
    });

    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.fireId) return;
      this.fireId = null;
      this.fire.classList.remove("pressed");
      this.input.pressFire(false);
    };
    this.fire.addEventListener("pointerup", end);
    this.fire.addEventListener("pointercancel", end);
  }

  private bindTap(target: string | HTMLElement, fn: () => void): void {
    const node = typeof target === "string" ? el(target) : target;
    node.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      node.classList.add("pressed");
      fn();
    });
    const release = () => node.classList.remove("pressed");
    node.addEventListener("pointerup", release);
    node.addEventListener("pointercancel", release);
    node.addEventListener("pointerleave", release);
  }
}
