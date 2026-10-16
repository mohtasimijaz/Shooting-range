import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { metalRoughnessTexture, stippleTexture, woodTexture } from "../../world/Textures";

/**
 * Shared PBR materials for the first-person weapons and hands.
 * They are created once and reused by every model (models are built once at
 * startup and only shown/hidden, so nothing needs to be disposed on switch).
 * Metals rely on the scene environment map for realistic reflections.
 */

export interface GunMaterials {
  /** Parkerized / nitrided black steel (slides, receivers). */
  blackSteel: THREE.MeshStandardMaterial;
  /** Brighter machined steel (barrels, pins, levers). */
  steel: THREE.MeshStandardMaterial;
  /** Polished stainless (magnum slide). */
  chrome: THREE.MeshStandardMaterial;
  /** Anodized aluminium (M416 receiver and rail). */
  anodized: THREE.MeshStandardMaterial;
  polymer: THREE.MeshStandardMaterial;
  polymerTan: THREE.MeshStandardMaterial;
  /** AK furniture (laminated wood). */
  wood: THREE.MeshStandardMaterial;
  /** Magnum grip panels. */
  walnut: THREE.MeshStandardMaterial;
  /** Dark recesses: ejection ports, serrations, bores. */
  dark: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  sightDot: THREE.MeshBasicMaterial;
  redDot: THREE.MeshBasicMaterial;
  lens: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
  gloveKnuckle: THREE.MeshStandardMaterial;
  sleeve: THREE.MeshStandardMaterial;
}

let cached: GunMaterials | null = null;

export function gunMaterials(): GunMaterials {
  if (cached) return cached;
  const rough = metalRoughnessTexture();
  const stipple = stippleTexture();

  cached = {
    blackSteel: new THREE.MeshStandardMaterial({
      color: 0x2b2e33,
      metalness: 0.75,
      roughness: 0.42,
      roughnessMap: rough,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: 0x9a9ea5,
      metalness: 0.9,
      roughness: 0.3,
      roughnessMap: rough,
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: 0xd5d9df,
      metalness: 1,
      roughness: 0.18,
      roughnessMap: rough,
    }),
    anodized: new THREE.MeshStandardMaterial({
      color: 0x24262a,
      metalness: 0.55,
      roughness: 0.5,
      roughnessMap: rough,
    }),
    polymer: new THREE.MeshStandardMaterial({
      color: 0x26282c,
      metalness: 0.05,
      roughness: 0.72,
      map: stipple,
    }),
    polymerTan: new THREE.MeshStandardMaterial({
      color: 0xb59f74,
      metalness: 0.02,
      roughness: 0.75,
      map: stipple,
    }),
    wood: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.5,
      map: woodTexture("ak", "#7a4a2c", "#3a210f", [2, 1]),
    }),
    walnut: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.42,
      map: woodTexture("walnut", "#5b3a22", "#26140a", [1, 2]),
    }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.9, metalness: 0.2 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.95 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd8a84a, metalness: 1, roughness: 0.28 }),
    sightDot: new THREE.MeshBasicMaterial({ color: 0xf6f4ea }),
    redDot: new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }),
    lens: new THREE.MeshStandardMaterial({
      color: 0x3a6f6a,
      metalness: 0.9,
      roughness: 0.05,
      transparent: true,
      opacity: 0.35,
    }),
    glove: new THREE.MeshStandardMaterial({ color: 0x1f2023, roughness: 0.92, metalness: 0 }),
    gloveKnuckle: new THREE.MeshStandardMaterial({ color: 0x34363b, roughness: 0.8, metalness: 0 }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x3b4436, roughness: 1, metalness: 0 }),
  };
  return cached;
}

// ---------------------------------------------------------------------------
// Geometry helpers shared by the pistol and rifle builders.
// Local axes: the barrel points along -Z, +Y is up, +X is the shooter's right.
// "u" values run along the barrel (forward = +u), "v" is height.
// ---------------------------------------------------------------------------

export type Pt = [number, number];

/** Extrudes a side-view outline (u = forward, v = up) into a part of a given width. */
export function sideGeometry(points: Pt[], width: number, bevel: number, hole?: Pt[]): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  points.forEach(([u, v], i) => {
    if (i === 0) shape.moveTo(u, v);
    else shape.lineTo(u, v);
  });
  shape.closePath();

  if (hole) {
    const path = new THREE.Path();
    hole.forEach(([u, v], i) => {
      if (i === 0) path.moveTo(u, v);
      else path.lineTo(u, v);
    });
    path.closePath();
    shape.holes.push(path);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(Math.PI / 2); // shape +x (u) -> world -z (forward), depth -> x
  return geo;
}

export function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  parent.add(mesh);
  return mesh;
}

/** Axis-aligned box: sx/sy/sz sizes, centre at (x, y) and forward position u. */
export function box(
  parent: THREE.Object3D,
  mat: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  u: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(x, y, -u);
  parent.add(mesh);
  return mesh;
}

/** Cylinder along the barrel axis from u0 to u1 at height v. */
export function tube(
  parent: THREE.Object3D,
  mat: THREE.Material,
  radius: number,
  u0: number,
  u1: number,
  v: number,
  x = 0,
  segments = 16,
  radiusEnd = radius,
): THREE.Mesh {
  const len = Math.abs(u1 - u0);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusEnd, radius, len, segments), mat);
  mesh.rotation.x = -Math.PI / 2; // +y of the cylinder -> -z (forward)
  mesh.position.set(x, v, -(u0 + u1) / 2);
  parent.add(mesh);
  return mesh;
}

/**
 * Many small boxes (serrations, rail slots, ribs) merged into one mesh so they
 * cost a single draw call. Entries: [sx, sy, sz, x, y, u].
 */
export function boxBatch(
  parent: THREE.Object3D,
  mat: THREE.Material,
  entries: [number, number, number, number, number, number][],
): THREE.Mesh | null {
  if (entries.length === 0) return null;
  const geos = entries.map(([sx, sy, sz, x, y, u]) => {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    geo.translate(x, y, -u);
    return geo;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((geo) => geo.dispose());
  if (!merged) return null;
  return part(parent, merged, mat);
}

const UP = new THREE.Vector3(0, 1, 0);

/** Tapered cylinder between two local points (arms, fingers). */
export function limb(
  parent: THREE.Object3D,
  mat: THREE.Material,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radiusA: number,
  radiusB: number,
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusB, radiusA, len, 14), mat);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  parent.add(mesh);
  return mesh;
}

export function blob(
  parent: THREE.Object3D,
  mat: THREE.Material,
  scale: [number, number, number],
  pos: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
  mesh.scale.set(...scale);
  mesh.position.set(...pos);
  parent.add(mesh);
  return mesh;
}

/** Fingers wrapped around a grip/handguard: a row of short capsules. */
export function fingers(
  parent: THREE.Object3D,
  mat: THREE.Material,
  start: THREE.Vector3,
  step: THREE.Vector3,
  count: number,
  radius: number,
  length: number,
  rotation: THREE.Euler,
): void {
  const geo = new THREE.CapsuleGeometry(radius, length, 4, 8);
  for (let i = 0; i < count; i++) {
    const f = new THREE.Mesh(geo, mat);
    f.position.copy(start).addScaledVector(step, i);
    f.rotation.copy(rotation);
    parent.add(f);
  }
}
