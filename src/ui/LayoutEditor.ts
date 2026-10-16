import type { Settings } from "../core/Settings";
import {
  CONTROL_LABELS,
  FALLBACK_PLACEMENT,
  clampScale,
  cloneLayout,
  defaultLayout,
  type ControlId,
  type TouchLayout,
} from "../input/Layout";
import type { TouchControls } from "../input/TouchControls";

/**
 * Touch layout editor (Settings → Customize touch controls).
 *
 * Shows the real HUD and touch controls with a dashed handle over each one.
 * Drag a handle to move its control, tap to select it and use the slider to
 * resize it. Save stores the layout in Settings; Cancel restores the saved one.
 */

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
}

const HANDLE_PAD = 6;

export class LayoutEditor {
  private readonly touch: TouchControls;
  private readonly settings: Settings;
  private readonly root = el("layout-editor");
  private readonly handlesHost = el("le-handles");
  private readonly panel = el("le-panel");
  private readonly grip = el("le-grip");
  private readonly selectedLabel = el("le-selected");
  private readonly size = el<HTMLInputElement>("le-size");
  private readonly sizeOut = el("le-size-out");
  private readonly fixedJoy = el<HTMLInputElement>("le-fixed-joy");
  private readonly leftFire = el<HTMLInputElement>("le-left-fire");

  private working: TouchLayout = defaultLayout();
  private selected: ControlId = "fire";
  private handles = new Map<ControlId, HTMLElement>();
  private onClose: (() => void) | null = null;
  private opened = false;

  constructor(touch: TouchControls, settings: Settings) {
    this.touch = touch;
    this.settings = settings;

    this.size.addEventListener("input", () => this.resizeSelected(Number(this.size.value)));
    this.fixedJoy.addEventListener("change", () => {
      this.working.fixedJoystick = this.fixedJoy.checked;
      if (this.fixedJoy.checked) this.selected = "joy";
      this.refresh(true);
    });
    this.leftFire.addEventListener("change", () => {
      this.working.leftFire = this.leftFire.checked;
      if (this.leftFire.checked) this.selected = "fireLeft";
      this.refresh(true);
    });
    el("le-reset").addEventListener("click", () => {
      this.working = defaultLayout();
      this.selected = "fire";
      this.refresh(true);
    });
    el("le-cancel").addEventListener("click", () => this.close(false));
    el("le-save").addEventListener("click", () => this.close(true));

    this.bindPanelDrag();
    window.addEventListener("resize", () => {
      if (this.opened) requestAnimationFrame(() => this.refresh(false));
    });
  }

  get isOpen(): boolean {
    return this.opened;
  }

  open(onClose?: () => void): void {
    this.onClose = onClose ?? null;
    this.opened = true;
    this.working = cloneLayout(this.settings.data.touchLayout);
    this.selected = "fire";
    document.body.classList.add("editing-controls");
    this.root.classList.remove("hidden");
    this.panel.style.left = "";
    this.panel.style.top = "";
    this.panel.style.transform = "";
    // Controls only have a size once visible, so lay out on the next frame.
    requestAnimationFrame(() => this.refresh(true));
  }

  private close(save: boolean): void {
    if (save) this.settings.update({ touchLayout: cloneLayout(this.working) });
    this.touch.applyLayout(this.settings.data.touchLayout);
    this.opened = false;
    this.root.classList.add("hidden");
    document.body.classList.remove("editing-controls");
    this.handlesHost.replaceChildren();
    this.handles.clear();
    this.onClose?.();
  }

  /** Re-applies the working layout; `rebuild` recreates the handles. */
  private refresh(rebuild: boolean): void {
    this.fixedJoy.checked = this.working.fixedJoystick;
    this.leftFire.checked = this.working.leftFire;
    const active = this.touch.activeControls(this.working);
    if (!active.includes(this.selected)) this.selected = "fire";
    this.touch.applyLayout(this.working);
    if (rebuild) this.buildHandles(active);
    this.positionHandles();
    this.syncPanel();
  }

  private buildHandles(active: ControlId[]): void {
    this.handlesHost.replaceChildren();
    this.handles.clear();
    for (const id of active) {
      const handle = document.createElement("div");
      handle.className = "le-handle";
      const label = document.createElement("span");
      label.textContent = CONTROL_LABELS[id];
      handle.appendChild(label);
      this.bindHandle(handle, id);
      this.handlesHost.appendChild(handle);
      this.handles.set(id, handle);
    }
  }

  private positionHandles(): void {
    for (const [id, handle] of this.handles) {
      const r = this.touch.element(id).getBoundingClientRect();
      handle.style.left = `${r.left - HANDLE_PAD}px`;
      handle.style.top = `${r.top - HANDLE_PAD}px`;
      handle.style.width = `${r.width + HANDLE_PAD * 2}px`;
      handle.style.height = `${r.height + HANDLE_PAD * 2}px`;
      handle.classList.toggle("selected", id === this.selected);
    }
  }

  private syncPanel(): void {
    this.selectedLabel.textContent = CONTROL_LABELS[this.selected];
    const scale = this.scaleOf(this.selected);
    this.size.value = String(scale);
    this.sizeOut.textContent = `${Math.round(scale * 100)}%`;
  }

  private scaleOf(id: ControlId): number {
    return this.working.controls[id]?.scale ?? FALLBACK_PLACEMENT[id]?.scale ?? 1;
  }

  /** Current on-screen centre of a control, in pixels. */
  private centerOf(id: ControlId): { x: number; y: number } {
    const r = this.touch.element(id).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** Stores a control at a centre (px) with a scale, then reads back the clamped spot. */
  private place(id: ControlId, x: number, y: number, scale: number): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.working.controls[id] = { x: x / vw, y: y / vh, scale: clampScale(scale) };
    this.touch.applyLayout(this.working);
    const c = this.centerOf(id);
    this.working.controls[id] = { x: c.x / vw, y: c.y / vh, scale: clampScale(scale) };
    this.positionHandles();
  }

  private resizeSelected(scale: number): void {
    const c = this.centerOf(this.selected);
    this.place(this.selected, c.x, c.y, scale);
    this.syncPanel();
  }

  private bindHandle(handle: HTMLElement, id: ControlId): void {
    let dragId: number | null = null;
    let offX = 0;
    let offY = 0;
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.selected = id;
      this.syncPanel();
      this.positionHandles();
      const c = this.centerOf(id);
      offX = e.clientX - c.x;
      offY = e.clientY - c.y;
      dragId = e.pointerId;
      handle.setPointerCapture(e.pointerId);
      handle.classList.add("dragging");
    });
    handle.addEventListener("pointermove", (e) => {
      if (e.pointerId !== dragId) return;
      this.place(id, e.clientX - offX, e.clientY - offY, this.scaleOf(id));
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== dragId) return;
      dragId = null;
      handle.classList.remove("dragging");
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  /** The panel can be dragged by its title so it never hides a control. */
  private bindPanelDrag(): void {
    let dragId: number | null = null;
    let offX = 0;
    let offY = 0;
    this.grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const r = this.panel.getBoundingClientRect();
      offX = e.clientX - r.left;
      offY = e.clientY - r.top;
      dragId = e.pointerId;
      this.grip.setPointerCapture(e.pointerId);
    });
    this.grip.addEventListener("pointermove", (e) => {
      if (e.pointerId !== dragId) return;
      const r = this.panel.getBoundingClientRect();
      const x = Math.min(window.innerWidth - r.width, Math.max(0, e.clientX - offX));
      const y = Math.min(window.innerHeight - r.height, Math.max(0, e.clientY - offY));
      this.panel.style.transform = "none";
      this.panel.style.left = `${x}px`;
      this.panel.style.top = `${y}px`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === dragId) dragId = null;
    };
    this.grip.addEventListener("pointerup", end);
    this.grip.addEventListener("pointercancel", end);
  }
}