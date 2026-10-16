import { describe, expect, it } from "vitest";
import {
  SCALE_MAX,
  SCALE_MIN,
  clampCenter,
  cloneLayout,
  defaultLayout,
  sanitizeLayout,
} from "../src/input/Layout";

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

describe("touch layout", () => {
  it("defaults to the built-in layout", () => {
    expect(defaultLayout()).toEqual({ controls: {}, fixedJoystick: false, leftFire: false });
  });

  it("turns missing or broken saved data into the default layout", () => {
    for (const raw of [undefined, null, 42, "x", [], { controls: "nope" }]) {
      expect(sanitizeLayout(raw)).toEqual(defaultLayout());
    }
  });

  it("keeps valid placements and options", () => {
    const layout = sanitizeLayout({
      fixedJoystick: true,
      leftFire: true,
      controls: { fire: { x: 0.9, y: 0.5, scale: 1.2 }, joy: { x: 0.1, y: 0.7, scale: 1 } },
    });
    expect(layout.fixedJoystick).toBe(true);
    expect(layout.leftFire).toBe(true);
    expect(layout.controls.fire).toEqual({ x: 0.9, y: 0.5, scale: 1.2 });
    expect(layout.controls.joy).toEqual({ x: 0.1, y: 0.7, scale: 1 });
  });

  it("clamps positions and sizes and drops unknown or invalid entries", () => {
    const layout = sanitizeLayout({
      fixedJoystick: "yes",
      controls: {
        fire: { x: 3, y: -1, scale: 9 },
        reload: { x: 0.5, y: 0.5, scale: 0.1 },
        mode: { x: 0.5, y: 0.5 },
        pause: { x: "a", y: 0.5, scale: 1 },
        rocket: { x: 0.5, y: 0.5, scale: 1 },
      },
    });
    expect(layout.fixedJoystick).toBe(false);
    expect(layout.controls.fire).toEqual({ x: 1, y: 0, scale: SCALE_MAX });
    expect(layout.controls.reload?.scale).toBe(SCALE_MIN);
    expect(layout.controls.mode?.scale).toBe(1);
    expect(layout.controls.pause).toBeUndefined();
    expect(Object.keys(layout.controls)).not.toContain("rocket");
  });

  it("clone is independent of the original", () => {
    const a = sanitizeLayout({ controls: { fire: { x: 0.5, y: 0.5, scale: 1 } } });
    const b = cloneLayout(a);
    b.controls.fire!.x = 0.1;
    b.leftFire = true;
    expect(a.controls.fire!.x).toBe(0.5);
    expect(a.leftFire).toBe(false);
  });

  it("keeps controls fully on screen", () => {
    expect(clampCenter(-50, -50, 40, 40, 800, 400, NO_INSETS, 6)).toEqual({ x: 46, y: 46 });
    expect(clampCenter(5000, 5000, 40, 40, 800, 400, NO_INSETS, 6)).toEqual({ x: 754, y: 354 });
    expect(clampCenter(300, 200, 40, 40, 800, 400, NO_INSETS)).toEqual({ x: 300, y: 200 });
  });

  it("keeps controls out of the notch and home-bar areas", () => {
    const insets = { top: 0, right: 44, bottom: 21, left: 44 };
    const c = clampCenter(800, 400, 30, 30, 800, 400, insets, 6);
    expect(c.x).toBe(800 - 44 - 6 - 30);
    expect(c.y).toBe(400 - 21 - 6 - 30);
  });

  it("centres a control that is bigger than the screen", () => {
    expect(clampCenter(10, 10, 600, 300, 800, 400, NO_INSETS)).toEqual({ x: 400, y: 200 });
  });
});