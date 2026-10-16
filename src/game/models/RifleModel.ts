import * as THREE from "three";
import type { WeaponId } from "../Weapon";
import {
  blob,
  box,
  boxBatch,
  fingers,
  gunMaterials,
  limb,
  part,
  sideGeometry,
  tube,
  type GunMaterials,
  type Pt,
} from "./Materials";

/**
 * Procedural first-person assault rifles: AK-47 and M416.
 * Same userData contract as the pistols (slide = bolt carrier group).
 */

export function createRifleModel(id: WeaponId): THREE.Group {
  const M = gunMaterials();
  if (id === "ak47") return buildAK(M);
  if (id === "m416") return buildM416(M);
  throw new Error(`${id} is not a rifle`);
}

/** Banana / slightly curved box magazine as a side outline. */
function curvedMag(topRear: number, topFront: number, topV: number, length: number, curve: number): Pt[] {
  const n = 8;
  const back: Pt[] = [];
  const front: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const offset = curve * t * t;
    const v = topV - length * t;
    back.push([topRear + offset, v]);
    front.push([topFront + offset + 0.008 * t, v]);
  }
  return [...back, ...front.reverse()];
}

/** Right hand on the pistol grip + forearm, left hand at `supportU`. */
function addHands(
  g: THREE.Group,
  M: GunMaterials,
  gripU: number,
  support: { u: number; v: number; vertical: boolean },
): void {
  // Right hand around the pistol grip.
  blob(g, M.glove, [0.03, 0.046, 0.04], [0.006, -0.078, -(gripU - 0.012)]);
  fingers(
    g,
    M.gloveKnuckle,
    new THREE.Vector3(0.002, -0.06, -(gripU + 0.028)),
    new THREE.Vector3(0, -0.017, 0.006),
    3,
    0.0092,
    0.024,
    new THREE.Euler(0, 0, Math.PI / 2),
  );
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.045, 4, 8), M.glove);
  thumb.rotation.x = Math.PI / 2;
  thumb.position.set(-0.022, -0.03, -(gripU + 0.02));
  g.add(thumb);
  const rWrist = new THREE.Vector3(0.012, -0.11, -(gripU - 0.03));
  const rElbow = new THREE.Vector3(0.1, -0.29, 0.22);
  limb(g, M.glove, rWrist, rWrist.clone().lerp(rElbow, 0.18), 0.03, 0.033);
  limb(g, M.sleeve, rWrist.clone().lerp(rElbow, 0.16), rElbow, 0.037, 0.047);

  // Left support hand.
  const su = support.u;
  if (support.vertical) {
    // Gripping a vertical foregrip.
    blob(g, M.glove, [0.03, 0.04, 0.034], [-0.004, support.v - 0.03, -(su - 0.004)]);
    fingers(
      g,
      M.gloveKnuckle,
      new THREE.Vector3(0.0, support.v - 0.018, -(su + 0.018)),
      new THREE.Vector3(0, -0.015, 0),
      4,
      0.0088,
      0.022,
      new THREE.Euler(0, 0, Math.PI / 2),
    );
  } else {
    // Cupping the handguard from below, fingers over the right side.
    blob(g, M.glove, [0.03, 0.026, 0.05], [-0.01, support.v - 0.012, -su]);
    fingers(
      g,
      M.gloveKnuckle,
      new THREE.Vector3(0.022, support.v + 0.006, -(su - 0.024)),
      new THREE.Vector3(0, 0, -0.016),
      4,
      0.0088,
      0.012,
      new THREE.Euler(0, 0, 0.2),
    );
    const lThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0088, 0.04, 4, 8), M.glove);
    lThumb.rotation.x = Math.PI / 2;
    lThumb.position.set(-0.026, support.v + 0.012, -(su + 0.01));
    g.add(lThumb);
  }
  const lWrist = new THREE.Vector3(-0.02, support.v - 0.05, -(su - 0.02));
  const lElbow = new THREE.Vector3(-0.2, -0.3, -(su - 0.4));
  limb(g, M.glove, lWrist, lWrist.clone().lerp(lElbow, 0.2), 0.029, 0.032);
  limb(g, M.sleeve, lWrist.clone().lerp(lElbow, 0.18), lElbow, 0.036, 0.046);
}

function place(g: THREE.Group): void {
  g.position.set(0.15, -0.19, -0.36);
  g.rotation.set(0.015, 0.03, 0);
}

// ---------------------------------------------------------------------------
// AK-47: stamped receiver, laminated wood furniture, curved steel magazine.
// ---------------------------------------------------------------------------

function buildAK(M: GunMaterials): THREE.Group {
  const g = new THREE.Group();
  const bolt = new THREE.Group();
  g.add(bolt);

  // Receiver + dust cover.
  part(g, sideGeometry([[-0.005, -0.03], [-0.005, 0.02], [0.27, 0.02], [0.27, -0.032]], 0.034, 0.0015), M.blackSteel);
  part(
    g,
    sideGeometry([[-0.005, 0.02], [-0.012, 0.03], [0.0, 0.038], [0.24, 0.042], [0.268, 0.031], [0.268, 0.02]], 0.03, 0.0015),
    M.blackSteel,
  );
  // Rivets on the receiver sides.
  const rivets: [number, number, number, number, number, number][] = [];
  for (const side of [-1, 1]) {
    for (const [u, v] of [[0.02, -0.02], [0.06, -0.02], [0.22, -0.018], [0.25, -0.005], [0.03, 0.008]]) {
      rivets.push([0.002, 0.004, 0.004, side * 0.0182, v, u]);
    }
  }
  boxBatch(g, M.steel, rivets);

  // Ejection port + bolt carrier visible through it (right side).
  box(g, M.dark, 0.0016, 0.014, 0.08, 0.0176, 0.012, 0.165);
  box(bolt, M.steel, 0.003, 0.01, 0.06, 0.0165, 0.012, 0.17);
  // Charging handle on the bolt carrier.
  box(bolt, M.steel, 0.016, 0.007, 0.01, 0.025, 0.022, 0.215);
  blob(bolt, M.steel, [0.007, 0.006, 0.007], [0.035, 0.022, -0.215]);
  // Safety / selector lever (right side).
  const selector = box(g, M.steel, 0.002, 0.008, 0.11, 0.019, 0.004, 0.13);
  selector.rotation.x = -0.06;

  // Rear sight block and leaf.
  box(g, M.blackSteel, 0.026, 0.02, 0.04, 0, 0.03, 0.29);
  box(g, M.dark, 0.02, 0.006, 0.03, 0, 0.042, 0.29);
  box(g, M.blackSteel, 0.008, 0.008, 0.004, 0, 0.048, 0.276);

  // Wood handguards.
  part(g, sideGeometry([[0.28, -0.028], [0.28, 0.012], [0.47, 0.012], [0.47, -0.02], [0.45, -0.03], [0.3, -0.03]], 0.042, 0.004), M.wood);
  tube(g, M.wood, 0.0135, 0.305, 0.455, 0.033, 0, 16);
  tube(g, M.blackSteel, 0.008, 0.455, 0.53, 0.033, 0, 12);
  // Handguard retainer bands.
  box(g, M.blackSteel, 0.046, 0.046, 0.008, 0, -0.006, 0.282);
  box(g, M.blackSteel, 0.046, 0.044, 0.008, 0, -0.008, 0.468);

  // Barrel, gas block, front sight, muzzle brake.
  tube(g, M.blackSteel, 0.0085, 0.27, 0.64, 0.0, 0, 18);
  box(g, M.blackSteel, 0.02, 0.04, 0.03, 0, 0.016, 0.535);
  box(g, M.blackSteel, 0.018, 0.036, 0.024, 0, 0.012, 0.612);
  box(g, M.blackSteel, 0.022, 0.022, 0.004, 0, 0.04, 0.612);
  box(g, M.blackSteel, 0.003, 0.016, 0.003, 0, 0.042, 0.612);
  tube(g, M.blackSteel, 0.0115, 0.635, 0.68, 0.0, 0, 18);
  box(g, M.dark, 0.016, 0.006, 0.02, 0, 0.009, 0.665);
  tube(g, M.dark, 0.0045, 0.676, 0.6815, 0.0, 0, 10);

  // Pistol grip (wood) + trigger + guard.
  part(g, sideGeometry([[0.078, -0.03], [0.045, -0.03], [0.018, -0.13], [0.052, -0.136]], 0.028, 0.003), M.wood);
  box(g, M.blackSteel, 0.008, 0.004, 0.075, 0, -0.06, 0.115);
  box(g, M.blackSteel, 0.008, 0.032, 0.004, 0, -0.045, 0.152);
  const trigger = box(g, M.steel, 0.006, 0.024, 0.006, 0, -0.042, 0.105);
  trigger.rotation.x = -0.25;

  // Curved magazine (removable).
  const mag = new THREE.Group();
  part(mag, sideGeometry(curvedMag(0.125, 0.19, -0.03, 0.2, 0.075), 0.026, 0.0015), M.blackSteel);
  const ribs: [number, number, number, number, number, number][] = [];
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    ribs.push([0.028, 0.004, 0.05, 0, -0.03 - 0.2 * t, 0.157 + 0.075 * t * t]);
  }
  boxBatch(mag, M.dark, ribs);
  g.add(mag);

  // Wood stock with steel butt plate.
  part(
    g,
    sideGeometry([[-0.005, 0.018], [-0.27, 0.004], [-0.285, -0.004], [-0.285, -0.105], [-0.265, -0.112], [-0.005, -0.034]], 0.038, 0.003),
    M.wood,
  );
  box(g, M.blackSteel, 0.04, 0.11, 0.006, 0, -0.052, -0.289);

  addHands(g, M, 0.045, { u: 0.38, v: -0.03, vertical: false });

  g.userData.slide = bolt;
  g.userData.slideTravel = 0.045;
  g.userData.muzzle = new THREE.Vector3(0, 0, -0.69);
  g.userData.eject = new THREE.Vector3(0.024, 0.016, -0.165);
  g.userData.mag = mag;
  place(g);
  return g;
}

// ---------------------------------------------------------------------------
// M416: flat-top aluminium receiver, quad rail, red dot, PMAG, foregrip.
// ---------------------------------------------------------------------------

function buildM416(M: GunMaterials): THREE.Group {
  const g = new THREE.Group();
  const bolt = new THREE.Group();
  g.add(bolt);

  // Upper and lower receivers.
  part(g, sideGeometry([[-0.012, 0.0], [-0.012, 0.03], [0.22, 0.03], [0.22, 0.0]], 0.03, 0.0015), M.anodized);
  part(
    g,
    sideGeometry([[0.0, 0.0], [0.2, 0.0], [0.2, -0.02], [0.17, -0.03], [0.06, -0.03], [0.03, -0.02], [0.0, -0.02]], 0.028, 0.0015),
    M.anodized,
  );
  // Magwell flare.
  box(g, M.anodized, 0.032, 0.03, 0.062, 0, -0.04, 0.132);

  // Full-length top rail with slots.
  box(g, M.anodized, 0.022, 0.008, 0.53, 0, 0.034, 0.255);
  const slots: [number, number, number, number, number, number][] = [];
  for (let u = 0.0; u < 0.51; u += 0.012) slots.push([0.0225, 0.0035, 0.004, 0, 0.0365, u]);
  boxBatch(g, M.dark, slots);

  // Free-float handguard with side rails.
  part(g, sideGeometry([[0.22, -0.026], [0.22, 0.03], [0.5, 0.03], [0.5, -0.026]], 0.042, 0.003), M.anodized);
  const sideSlots: [number, number, number, number, number, number][] = [];
  for (const side of [-1, 1]) {
    for (let u = 0.24; u < 0.49; u += 0.02) sideSlots.push([0.003, 0.012, 0.009, side * 0.0245, 0.002, u]);
  }
  boxBatch(g, M.dark, sideSlots);

  // Vertical foregrip.
  limb(g, M.polymer, new THREE.Vector3(0, -0.026, -0.38), new THREE.Vector3(0, -0.11, -0.372), 0.014, 0.013);

  // Barrel + flash hider.
  tube(g, M.blackSteel, 0.0075, 0.5, 0.6, 0.005, 0, 16);
  tube(g, M.blackSteel, 0.0105, 0.598, 0.648, 0.005, 0, 18);
  const hiderSlots: [number, number, number, number, number, number][] = [];
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    hiderSlots.push([0.0022, 0.0022, 0.03, Math.cos(a) * 0.0103, 0.005 + Math.sin(a) * 0.0103, 0.628]);
  }
  boxBatch(g, M.dark, hiderSlots);
  tube(g, M.dark, 0.0045, 0.645, 0.6485, 0.005, 0, 10);

  // Red-dot sight on the rail.
  box(g, M.anodized, 0.02, 0.008, 0.05, 0, 0.042, 0.08);
  tube(g, M.anodized, 0.017, 0.055, 0.105, 0.064, 0, 20);
  const lensGeo = new THREE.CircleGeometry(0.0145, 20);
  const lensRear = new THREE.Mesh(lensGeo, M.lens);
  lensRear.position.set(0, 0.064, -0.054);
  g.add(lensRear);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0012, 8, 6), M.redDot);
  dot.position.set(0, 0.064, -0.09);
  g.add(dot);
  // Flip-up iron sights.
  box(g, M.anodized, 0.016, 0.016, 0.01, 0, 0.046, 0.005);
  box(g, M.anodized, 0.004, 0.02, 0.006, 0, 0.048, 0.49);

  // Charging handle (T) at the rear of the upper.
  box(g, M.anodized, 0.034, 0.006, 0.01, 0, 0.026, -0.008);
  // Ejection port, brass deflector, forward assist.
  box(g, M.dark, 0.0016, 0.014, 0.066, 0.0158, 0.013, 0.125);
  box(bolt, M.steel, 0.003, 0.01, 0.05, 0.0148, 0.013, 0.13);
  box(g, M.anodized, 0.006, 0.01, 0.012, 0.017, 0.02, 0.085);
  const assist = tube(g, M.anodized, 0.006, 0.03, 0.06, 0.02, 0.019, 12);
  assist.rotation.y = 0.3;

  // Pistol grip, trigger, guard.
  part(g, sideGeometry([[0.075, -0.02], [0.045, -0.02], [0.015, -0.125], [0.048, -0.13]], 0.026, 0.003), M.polymer);
  box(g, M.polymer, 0.008, 0.004, 0.07, 0, -0.05, 0.11);
  const trigger = box(g, M.steel, 0.005, 0.02, 0.005, 0, -0.034, 0.1);
  trigger.rotation.x = -0.25;
  // Safety selector (left side).
  box(g, M.blackSteel, 0.002, 0.006, 0.02, -0.0152, -0.008, 0.05);

  // Tan polymer magazine (removable).
  const mag = new THREE.Group();
  part(mag, sideGeometry(curvedMag(0.105, 0.158, -0.05, 0.165, 0.025), 0.026, 0.002), M.polymerTan);
  box(mag, M.polymerTan, 0.03, 0.008, 0.066, 0, -0.218, 0.157);
  g.add(mag);

  // Buffer tube + collapsible stock.
  tube(g, M.anodized, 0.013, -0.2, -0.012, 0.01, 0, 18);
  part(
    g,
    sideGeometry([[-0.12, 0.03], [-0.268, 0.03], [-0.28, 0.02], [-0.28, -0.085], [-0.262, -0.092], [-0.2, -0.03], [-0.12, -0.012]], 0.036, 0.003),
    M.polymer,
  );
  box(g, M.rubber, 0.04, 0.115, 0.01, 0, -0.03, -0.285);

  addHands(g, M, 0.04, { u: 0.375, v: -0.04, vertical: true });

  g.userData.slide = bolt;
  g.userData.slideTravel = 0.035;
  g.userData.muzzle = new THREE.Vector3(0, 0.005, -0.66);
  g.userData.eject = new THREE.Vector3(0.022, 0.014, -0.125);
  g.userData.mag = mag;
  place(g);
  return g;
}
