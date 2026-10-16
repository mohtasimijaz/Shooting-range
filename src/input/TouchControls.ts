import type { Input } from "./Input";
import {
  CONTROL_IDS,
  FALLBACK_PLACEMENT,
  clampCenter,
  cloneLayout,
  defaultLayout,
  type ControlId,
  type Insets,
  type Placement,
  type TouchLayout,
} from "./Layout";

/**
 * On-screen controls for phones and tablets (landscape).
 *
 *  - Joystick: floating (appears under the left thumb, left 40% of the screen)
 *    or fixed at a chosen spot.
 *  - Anywhere else: drag to aim.
 *  - FIRE (and an optional left FIRE): hold to shoot; dragging on it also aims.
 *  - RELOAD, MODE (single/auto), PAUSE buttons, and the HUD weapon slots.
 *
 * Every control can be moved and resized with the layout editor; the layout
 * is applied here. Pointer Events with pointer capture track several fingers.
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
  private readonly joyHint = el("joy-hint");
  private readonly elements: Record<ControlId, HTMLElement>;
  private readonly insetProbe: HTMLElement;

  private layout: TouchLayout = defaultLayout();
  private joyId: number | null = null;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private joyScale = 1;
  private lookId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;
  /** Fingers currently on a fire button, with their last position. */
  private readonly firePointers = new Map<number, { x: number; y: number }>();

  constructor(input: Input) {
    this.input = input;
    this.elements = {
      fire: el("t-fire"),
      fireLeft: el("t-fire-left"),
      reload: el("t-reload"),
      mode: el("t-mode"),
      pause: el("t-pause"),
      slots: el("weapon-slots"),
      joy: this.joy,
    };

    // Reads the notch / home-bar safe areas so controls never go under them.
    this.insetProbe = document.createElement("div");
    this.insetProbe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;" +
      "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
    document.body.appendChild(this.insetProbe);

    this.bindLookLayer();
    this.bindFire(this.elements.fire);
    this.bindFire(this.elements.fireLeft);
    this.bindTap(this.elements.reload, () => this.input.pushAction({ type: "reload" }));
    this.bindTap(this.elements.mode, () => this.input.pushAction({ type: "mode" }));
    this.bindTap(this.elements.pause, () => this.input.pushAction({ type: "pause" }));

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

    window.addEventListener("resize", () => this.applyLayout(this.layout));
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
    if (!visible) this.reset();
    // Sizes are only measurable once visible, so re-apply on the next frame.
    if (visible) requestAnimationFrame(() => this.applyLayout(this.layout));
  }

  reset(): void {
    this.joyId = null;
    this.lookId = null;
    this.firePointers.clear();
    this.joy.classList.remove("active");
    this.knob.style.transform = "translate(-50%, -50%)";
    this.elements.fire.classList.remove("pressed");
    this.elements.fireLeft.classList.remove("pressed");
  }

  /** The DOM element of a control (used by the layout editor). */
  element(id: ControlId): HTMLElement {
    return this.elements[id];
  }

  /** Controls that exist with the given layout. */
  activeControls(layout: TouchLayout): ControlId[] {
    return CONTROL_IDS.filter((id) => (id === "joy" ? layout.fixedJoystick : id === "fireLeft" ? layout.leftFire : true));
  }

  safeInsets(): Insets {
    const cs = getComputedStyle(this.insetProbe);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
  }

  /** Places every control according to the layout (and clamps it on screen). */
  applyLayout(layout: TouchLayout): void {
    this.layout = cloneLayout(layout);
    this.elements.fireLeft.classList.toggle("hidden", !layout.leftFire);
    this.joy.classList.toggle("fixed", layout.fixedJoystick);
    this.joyHint.classList.toggle("hidden", layout.fixedJoystick);
    if (layout.fixedJoystick) {
      this.joy.style.left = "";
      this.joy.style.top = "";
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const insets = this.safeInsets();
    for (const id of CONTROL_IDS) {
      const node = this.elements[id];
      const placement: Placement | undefined =
        layout.controls[id] ?? (id === "joy" && layout.fixedJoystick ? FALLBACK_PLACEMENT.joy : undefined);
      if (!placement || (id === "joy" && !layout.fixedJoystick)) {
        node.classList.remove("custom");
        node.style.removeProperty("--x");
        node.style.removeProperty("--y");
        node.style.removeProperty("--s");
        continue;
      }
      const halfW = (node.offsetWidth * placement.scale) / 2;
      const halfH = (node.offsetHeight * placement.scale) / 2;
      const c = clampCenter(placement.x * vw, placement.y * vh, halfW, halfH, vw, vh, insets);
      node.classList.add("custom");
      node.style.setProperty("--x", `${c.x}px`);
      node.style.setProperty("--y", `${c.y}px`);
      node.style.setProperty("--s", String(placement.scale));
    }
    this.joyScale = layout.fixedJoystick ? (layout.controls.joy?.scale ?? 1) : 1;
  }

  private bindLookLayer(): void {
    this.look.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (this.joyId === null && this.startsJoystick(e.clientX, e.clientY)) {
        this.joyId = e.pointerId;
        if (this.layout.fixedJoystick) {
          const r = this.joy.getBoundingClientRect();
          this.joyOriginX = r.left + r.width / 2;
          this.joyOriginY = r.top + r.height / 2;
        } else {
          this.joyOriginX = e.clientX;
          this.joyOriginY = e.clientY;
          this.joy.style.left = `${e.clientX}px`;
          this.joy.style.top = `${e.clientY}px`;
        }
        this.joy.classList.add("active");
        this.moveJoystick(e.clientX, e.clientY);
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
        this.moveJoystick(e.clientX, e.clientY);
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

  /** Floating: anywhere in the left 40%. Fixed: on or near the stick. */
  private startsJoystick(x: number, y: number): boolean {
    if (!this.layout.fixedJoystick) return x < window.innerWidth * 0.4;
    const r = this.joy.getBoundingClientRect();
    const dist = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
    return dist <= (r.width / 2) * 1.35;
  }

  private moveJoystick(x: number, y: number): void {
    const radius = JOY_RADIUS * this.joyScale;
    const dx = x - this.joyOriginX;
    const dy = y - this.joyOriginY;
    const len = Math.hypot(dx, dy);
    const k = len > radius ? radius / len : 1;
    // The knob lives inside the scaled stick, so undo the scale for its offset.
    this.knob.style.transform = `translate(calc(-50% + ${(dx * k) / this.joyScale}px), calc(-50% + ${(dy * k) / this.joyScale}px))`;
    const v = (dx * k) / radius;
    this.input.setJoystick(Math.abs(v) < JOY_DEADZONE ? 0 : v);
  }

  private bindFire(button: HTMLElement): void {
    button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.firePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      button.setPointerCapture(e.pointerId);
      button.classList.add("pressed");
      this.input.pressFire(true);
    });

    // Sliding the thumb on a fire button also aims, like most mobile shooters.
    button.addEventListener("pointermove", (e) => {
      const last = this.firePointers.get(e.pointerId);
      if (!last) return;
      this.input.addLookPixels(e.clientX - last.x, e.clientY - last.y, true);
      last.x = e.clientX;
      last.y = e.clientY;
    });

    const end = (e: PointerEvent) => {
      if (!this.firePointers.delete(e.pointerId)) return;
      button.classList.remove("pressed");
      if (this.firePointers.size === 0) this.input.pressFire(false);
    };
    button.addEventListener("pointerup", end);
    button.addEventListener("pointercancel", end);
  }

  private bindTap(node: HTMLElement, fn: () => void): void {
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