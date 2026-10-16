import * as THREE from "three";
import type { WeaponId } from "../Weapon";
import { blob, box, fingers, gunMaterials, part, sideGeometry, tube } from "./Materials";

/**
 * Procedural first-person pistols (9mm, Compact, Magnum).
 *
 * Published userData (read by Player / Effects):
 *   slide        Object3D that travels back on each shot
 *   slideTravel  how far it travels (m)
 *   muzzle       Vector3 muzzle position (model space)
 *   eject        Vector3 ejection-port position (model space)
 *   mag          Object3D magazine (animated during reload)
 */

interface PistolSpec {
  rear: number;
  front: number;
  slideH: number;
  slideW: number;
  gripW: number;
  gripH: number;
  gripDepth: number;
  slideTravel: number;
  barrelRadius: number;
  slide: "black" | "chrome";
  frame: "black" | "tan" | "steel";
}

const SPECS: Record<"nine" | "compact" | "magnum", PistolSpec> = {
  // Full-size service pistol: black slide, black stippled polymer frame, rail.
  nine: {
    rear: -0.09,
    front: 0.108,
    slideH: 0.033,
    slideW: 0.026,
    gripW: 0.031,
    gripH: 0.108,
    gripDepth: 0.082,
    slideTravel: 0.024,
    barrelRadius: 0.0058,
    slide: "black",
    frame: "black",
  },
  // Short compact: black slide on a tan frame.
  compact: {
    rear: -0.074,
    front: 0.082,
    slideH: 0.03,
    slideW: 0.023,
    gripW: 0.028,
    gripH: 0.088,
    gripDepth: 0.072,
    slideTravel: 0.018,
    barrelRadius: 0.0052,
    slide: "black",
    frame: "tan",
  },
  // Large stainless magnum: heavy slide, ventilated rib, walnut grips.
  magnum: {
    rear: -0.105,
    front: 0.142,
    slideH: 0.043,
    slideW: 0.031,
    gripW: 0.036,
    gripH: 0.118,
    gripDepth: 0.09,
    slideTravel: 0.03,
    barrelRadius: 0.0085,
    slide: "chrome",
    frame: "steel",
  },
};

const GRIP_SLOPE = 0.27; // grip leans back toward the shooter

export function createPistolModel(id: WeaponId): THREE.Group {
  if (id !== "nine" && id !== "compact" && id !== "magnum") {
    throw new Error(`${id} is not a pistol`);
  }
  const spec = SPECS[id];
  const M = gunMaterials();
  const { rear, front, slideH: h, slideW: w, gripW, gripH, gripDepth } = spec;
  const isMagnum = id === "magnum";

  const slideMat = spec.slide === "chrome" ? M.chrome : M.blackSteel;
  const frameMat = spec.frame === "tan" ? M.polymerTan : spec.frame === "steel" ? M.blackSteel : M.polymer;

  const g = new THREE.Group();
  const slideGroup = new THREE.Group(); // moves back when firing
  g.add(slideGroup);

  // ----- Slide -----
  part(
    slideGroup,
    sideGeometry(
      [
        [rear, 0],
        [rear, h - 0.004],
        [rear + 0.006, h],
        [front - 0.018, h],
        [front, h - 0.008],
        [front, 0.002],
        [front - 0.004, 0],
      ],
      w,
      0.0025,
    ),
    slideMat,
  );
  const halfW = w / 2 + 0.0025;

  // Rear serrations (both sides); front serrations on the two smaller pistols.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      box(slideGroup, M.dark, 0.0016, h * 0.62, 0.0018, side * (halfW + 0.0004), h * 0.5, rear + 0.01 + i * 0.0055);
    }
    if (!isMagnum) {
      for (let i = 0; i < 4; i++) {
        box(slideGroup, M.dark, 0.0016, h * 0.62, 0.0018, side * (halfW + 0.0004), h * 0.5, front - 0.026 - i * 0.0055);
      }
    }
  }

  // Ejection port (right side) with the barrel hood visible inside it.
  const portU = rear + 0.085;
  box(slideGroup, M.dark, 0.0016, h * 0.45, 0.042, halfW, h * 0.68, portU);
  box(g, M.steel, 0.002, h * 0.32, 0.036, halfW - 0.0006, h * 0.68, portU);
  // Extractor claw.
  box(slideGroup, M.steel, 0.0016, 0.004, 0.018, halfW + 0.0005, h * 0.78, portU - 0.032);

  // Magnum: ventilated rib along the top + exposed hammer.
  if (isMagnum) {
    const ribStart = rear + 0.032;
    const ribEnd = front - 0.032;
    box(slideGroup, slideMat, 0.009, 0.003, ribEnd - ribStart, 0, h + 0.0015, (ribStart + ribEnd) / 2);
    for (let u = ribStart + 0.008; u < ribEnd - 0.008; u += 0.014) {
      box(slideGroup, M.dark, 0.0092, 0.0032, 0.0032, 0, h + 0.0015, u);
    }
    const hammer = box(g, M.blackSteel, 0.008, 0.016, 0.008, 0, h * 0.75, rear - 0.004);
    hammer.rotation.x = 0.4;
  }

  // Three-dot sights, white dots on the faces that point at the shooter.
  const rearSightU = rear + 0.01;
  for (const side of [-1, 1]) {
    box(slideGroup, M.dark, 0.0055, 0.006, 0.007, side * 0.0048, h + 0.003, rearSightU);
    box(slideGroup, M.sightDot, 0.0026, 0.0026, 0.0006, side * 0.0048, h + 0.0034, rearSightU - 0.0037);
  }
  const frontSightU = front - 0.014;
  box(slideGroup, M.dark, 0.004, 0.0075, 0.007, 0, h + 0.00375, frontSightU);
  box(slideGroup, M.sightDot, 0.0026, 0.0026, 0.0006, 0, h + 0.0047, frontSightU - 0.0037);

  // ----- Barrel crown with a dark bore (does not recoil) -----
  const barrelLen = 0.014;
  tube(g, M.steel, spec.barrelRadius, front - 0.004, front + barrelLen - 0.004, h * 0.5, 0, 18);
  tube(g, M.dark, spec.barrelRadius * 0.55, front + barrelLen - 0.006, front + barrelLen - 0.0035, h * 0.5, 0, 12);

  // ----- Frame: dust cover + accessory rail + grip -----
  part(
    g,
    sideGeometry(
      [
        [rear + 0.004, 0.004],
        [front - 0.022, 0.004],
        [front - 0.022, -0.011],
        [front - 0.04, -0.017],
        [rear + 0.004, -0.017],
      ],
      w - 0.006,
      0.0015,
    ),
    frameMat,
  );
  if (!isMagnum) {
    for (let i = 0; i < 3; i++) {
      box(g, M.dark, w - 0.004, 0.003, 0.003, 0, -0.0165, front - 0.03 - i * 0.009);
    }
  }

  const gripTopRear = rear + 0.002;
  const gripTopFront = gripTopRear + gripDepth;
  const lean = gripH * GRIP_SLOPE;
  part(
    g,
    sideGeometry(
      [
        [gripTopFront, -0.003],
        [gripTopRear, -0.003],
        [gripTopRear - 0.004, -0.02],
        [gripTopRear - lean, -gripH],
        [gripTopFront - lean, -gripH],
        [gripTopFront - lean * 0.6, -gripH * 0.55],
        [gripTopFront - lean * 0.45, -gripH * 0.45],
      ],
      gripW,
      0.003,
    ),
    frameMat,
  );

  // Magazine: floor plate + body (body only shows when it drops during reload).
  const mag = new THREE.Group();
  const magCentreU = (gripTopFront + gripTopRear) / 2 - lean;
  box(mag, M.dark, gripW + 0.003, 0.008, gripDepth + 0.004, 0, -gripH - 0.002, magCentreU);
  const body = box(mag, M.blackSteel, gripW - 0.008, gripH * 0.9, gripDepth * 0.7, 0, -gripH / 2 + 0.004, magCentreU + lean / 2);
  body.rotation.x = -Math.atan(GRIP_SLOPE);
  g.add(mag);

  // Magnum: walnut grip panels on both sides.
  if (isMagnum) {
    for (const side of [-1, 1]) {
      const panel = box(
        g,
        M.walnut,
        0.003,
        gripH * 0.88,
        gripDepth * 0.85,
        side * (gripW / 2 + 0.0015),
        -gripH / 2,
        (gripTopFront + gripTopRear) / 2 - lean / 2,
      );
      panel.rotation.x = -Math.atan(GRIP_SLOPE);
    }
  }

  // ----- Trigger guard (with a real opening) + trigger -----
  const gy0 = -0.016;
  const gy1 = -0.056;
  const gx0 = gripTopFront - 0.024;
  const gx1 = gripTopFront + 0.042;
  part(
    g,
    sideGeometry(
      [
        [gx0, gy0],
        [gx1 - 0.006, gy0],
        [gx1, gy0 - 0.006],
        [gx1, gy1 + 0.01],
        [gx1 - 0.01, gy1],
        [gx0, gy1],
      ],
      0.009,
      0.0012,
      [
        [gripTopFront - 0.006, gy0 - 0.006],
        [gx1 - 0.011, gy0 - 0.006],
        [gx1 - 0.006, gy0 - 0.011],
        [gx1 - 0.006, gy1 + 0.014],
        [gx1 - 0.012, gy1 + 0.008],
        [gripTopFront - 0.006, gy1 + 0.008],
      ],
    ),
    frameMat,
  );
  const trigger = box(g, M.steel, 0.006, 0.022, 0.006, 0, -0.033, gripTopFront + 0.01);
  trigger.rotation.x = -0.25;

  // Slide-stop lever + takedown lever (left side).
  box(g, M.blackSteel, 0.002, 0.005, 0.022, -((w - 0.006) / 2 + 0.001), -0.004, gripTopFront + 0.012);
  box(g, M.blackSteel, 0.002, 0.004, 0.008, -((w - 0.006) / 2 + 0.001), -0.006, gripTopFront + 0.032);

  // ----- Gloved shooting hand + sleeve -----
  const handU = gripTopRear - 0.016 - lean * 0.45;
  blob(g, M.glove, [0.028, 0.046, 0.042], [0.004, -0.05, -handU]);
  blob(g, M.glove, [0.022, 0.016, 0.03], [0.003, -0.012, -(gripTopRear - 0.006)]);
  // Right thumb along the left side of the frame.
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.05, 4, 8), M.glove);
  thumb.rotation.x = Math.PI / 2;
  thumb.position.set(-(gripW / 2 + 0.01), -0.012, -(gripTopRear + 0.03));
  g.add(thumb);
  // Right fingers wrapped around the front strap (below the trigger guard).
  fingers(
    g,
    M.gloveKnuckle,
    new THREE.Vector3(0.002, -0.064, -(gripTopFront - lean * 0.6 + 0.004)),
    new THREE.Vector3(0, -0.017, 0.004),
    3,
    0.009,
    0.026,
    new THREE.Euler(0, 0, Math.PI / 2),
  );

  const armTilt = 0.3;
  const armDir = new THREE.Vector3(0, -Math.sin(armTilt), Math.cos(armTilt));
  const wrist = new THREE.Vector3(0.006, -0.055, -handU + 0.02);
  const cuffMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.07, 16), M.glove);
  cuffMesh.rotation.x = Math.PI / 2 + armTilt;
  cuffMesh.position.copy(wrist).addScaledVector(armDir, 0.035);
  g.add(cuffMesh);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.35, 16), M.sleeve);
  sleeve.rotation.x = Math.PI / 2 + armTilt;
  sleeve.position.copy(wrist).addScaledVector(armDir, 0.07 + 0.175);
  g.add(sleeve);

  // ----- Metadata used by Player / Effects -----
  g.userData.slide = slideGroup;
  g.userData.slideTravel = spec.slideTravel;
  g.userData.muzzle = new THREE.Vector3(0, h * 0.5, -(front + 0.014));
  g.userData.eject = new THREE.Vector3(halfW + 0.004, h * 0.75, -portU);
  g.userData.mag = mag;

  // Lower-right of the view, barrel pointing toward the crosshair.
  g.position.set(0.17, -0.15, -0.5);
  g.rotation.set(0, 0.035, 0);
  g.scale.setScalar(1.2);
  return g;
}
