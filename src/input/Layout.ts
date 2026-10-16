/**
 * Custom touch-control layout: data model, validation and clamping.
 * Pure logic with no DOM access so it can be unit tested.
 *
 * Positions are stored as fractions of the screen (0..1, control centre), so a
 * saved layout carries over between phones and orientations.
 */

export type ControlId = "fire" | "fireLeft" | "reload" | "mode" | "pause" | "slots" | "joy";

export const CONTROL_IDS: ControlId[] = ["fire", "fireLeft", "reload", "mode", "pause", "slots", "joy"];

export const CONTROL_LABELS: Record<ControlId, string> = {
  fire: "Fire",
  fireLeft: "Left fire",
  reload: "Reload",
  mode: "Fire mode",
  pause: "Pause",
  slots: "Weapon slots",
  joy: "Joystick",
};

export interface Placement {
  /** Centre X as a fraction of the screen width. */
  x: number;
  /** Centre Y as a fraction of the screen height. */
  y: number;
  /** Size multiplier. */
  scale: number;
}

export interface TouchLayout {
  /** Only controls the player moved or resized; the rest use the default spot. */
  controls: Partial<Record<ControlId, Placement>>;
  /** Fixed joystick at a chosen spot instead of one that floats under the thumb. */
  fixedJoystick: boolean;
  /** Second fire button for the left thumb. */
  leftFire: boolean;
}

export const SCALE_MIN = 0.7;
export const SCALE_MAX = 1.5;

/** Where controls that have no default CSS spot appear when first enabled. */
export const FALLBACK_PLACEMENT: Partial<Record<ControlId, Placement>> = {
  joy: { x: 0.15, y: 0.68, scale: 1 },
  fireLeft: { x: 0.09, y: 0.42, scale: 1 },
};

export function defaultLayout(): TouchLayout {
  return { controls: {}, fixedJoystick: false, leftFire: false };
}

export function cloneLayout(layout: TouchLayout): TouchLayout {
  const controls: Partial<Record<ControlId, Placement>> = {};
  for (const id of CONTROL_IDS) {
    const p = layout.controls[id];
    if (p) controls[id] = { ...p };
  }
  return { controls, fixedJoystick: layout.fixedJoystick, leftFire: layout.leftFire };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function clampScale(scale: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
}

/** Turns anything read from storage into a valid layout (bad data -> defaults). */
export function sanitizeLayout(raw: unknown): TouchLayout {
  const layout = defaultLayout();
  if (!raw || typeof raw !== "object") return layout;
  const r = raw as Record<string, unknown>;
  layout.fixedJoystick = r.fixedJoystick === true;
  layout.leftFire = r.leftFire === true;
  const controls = r.controls;
  if (controls && typeof controls === "object") {
    for (const id of CONTROL_IDS) {
      const p = (controls as Record<string, unknown>)[id];
      if (!p || typeof p !== "object") continue;
      const { x, y, scale } = p as Record<string, unknown>;
      if (!isNum(x) || !isNum(y)) continue;
      layout.controls[id] = { x: clamp01(x), y: clamp01(y), scale: clampScale(isNum(scale) ? scale : 1) };
    }
  }
  return layout;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Keeps a control of the given half-size fully on screen and out of the
 * notch / home-bar areas. All values in pixels; returns the clamped centre.
 */
export function clampCenter(
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  viewW: number,
  viewH: number,
  insets: Insets,
  margin = 6,
): { x: number; y: number } {
  const minX = insets.left + margin + halfW;
  const maxX = viewW - insets.right - margin - halfW;
  const minY = insets.top + margin + halfH;
  const maxY = viewH - insets.bottom - margin - halfH;
  return {
    x: minX > maxX ? viewW / 2 : Math.min(maxX, Math.max(minX, x)),
    y: minY > maxY ? viewH / 2 : Math.min(maxY, Math.max(minY, y)),
  };
}