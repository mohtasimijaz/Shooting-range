import * as THREE from "three";

export type WeaponId = "nine" | "compact" | "magnum";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  magSize: number;
  reserve: number;
  fireInterval: number;
  damage: number;
  recoil: number;
  reloadTime: number;
  color: number;
  accent: number;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: "nine",
    name: "9mm",
    magSize: 15,
    reserve: 45,
    fireInterval: 0.18,
    damage: 1,
    recoil: 0.035,
    reloadTime: 1.05,
    color: 0x2a2d32,
    accent: 0x6b7078,
  },
  {
    id: "compact",
    name: "Compact",
    magSize: 12,
    reserve: 48,
    fireInterval: 0.09,
    damage: 1,
    recoil: 0.02,
    reloadTime: 0.85,
    color: 0x1c1c1c,
    accent: 0x3d3d3d,
  },
  {
    id: "magnum",
    name: "Magnum",
    magSize: 8,
    reserve: 24,
    fireInterval: 0.45,
    damage: 3,
    recoil: 0.07,
    reloadTime: 1.35,
    color: 0x3a2a1a,
    accent: 0xb08a4a,
  },
];

export class WeaponLoadout {
  readonly defs = WEAPONS;
  index = 0;
  mag: number[] = WEAPONS.map((w) => w.magSize);
  reserve: number[] = WEAPONS.map((w) => w.reserve);
  cooldown = 0;
  reloading = 0;

  get def(): WeaponDef {
    return this.defs[this.index];
  }

  reset(): void {
    this.index = 0;
    this.mag = WEAPONS.map((w) => w.magSize);
    this.reserve = WEAPONS.map((w) => w.reserve);
    this.cooldown = 0;
    this.reloading = 0;
  }

  /** Restocks every gun's reserve ammo (used between waves). */
  refillReserves(): void {
    this.reserve = WEAPONS.map((w) => w.reserve);
  }

  select(index: number): void {
    if (index < 0 || index >= this.defs.length) return;
    if (this.reloading > 0) return;
    this.index = index;
  }

  cycle(dir: number): void {
    this.select((this.index + dir + this.defs.length) % this.defs.length);
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.finishReload();
      }
    }
  }

  canFire(): boolean {
    return this.reloading <= 0 && this.cooldown <= 0 && this.mag[this.index] > 0;
  }

  fire(): boolean {
    if (!this.canFire()) {
      if (this.mag[this.index] <= 0 && this.reloading <= 0) {
        this.startReload();
      }
      return false;
    }
    this.mag[this.index] -= 1;
    this.cooldown = this.def.fireInterval;
    if (this.mag[this.index] <= 0) {
      this.startReload();
    }
    return true;
  }

  startReload(): boolean {
    if (this.reloading > 0) return false;
    if (this.mag[this.index] >= this.def.magSize) return false;
    if (this.reserve[this.index] <= 0) return false;
    this.reloading = this.def.reloadTime;
    return true;
  }

  private finishReload(): void {
    this.reloading = 0;
    const need = this.def.magSize - this.mag[this.index];
    const take = Math.min(need, this.reserve[this.index]);
    this.mag[this.index] += take;
    this.reserve[this.index] -= take;
  }
}

// ---------------------------------------------------------------------------
// Procedural first-person pistol models (no external assets).
// Local axes: the barrel points along -Z, +Y is up, +X is the shooter's right.
// "u" values below run along the barrel (forward = +u), v = height.
// ---------------------------------------------------------------------------

type Pt = [number, number];

interface PistolSpec {
  rear: number;
  front: number;
  slideH: number;
  slideW: number;
  gripW: number;
  gripH: number;
  gripDepth: number;
  slideColor: number;
  slideMetal: number;
  slideRough: number;
  frameColor: number;
  slideTravel: number;
  barrelRadius: number;
}

const SPECS: Record<WeaponId, PistolSpec> = {
  // Full-size service pistol: black slide, black stippled polymer frame.
  nine: {
    rear: -0.09,
    front: 0.108,
    slideH: 0.033,
    slideW: 0.026,
    gripW: 0.031,
    gripH: 0.108,
    gripDepth: 0.082,
    slideColor: 0x34383e,
    slideMetal: 0.45,
    slideRough: 0.4,
    frameColor: 0x2a2c30,
    slideTravel: 0.022,
    barrelRadius: 0.0058,
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
    slideColor: 0x26282c,
    slideMetal: 0.45,
    slideRough: 0.4,
    frameColor: 0xb59f74,
    slideTravel: 0.017,
    barrelRadius: 0.0052,
  },
  // Large chrome magnum: heavy slide, ribbed top, wood grips.
  magnum: {
    rear: -0.105,
    front: 0.142,
    slideH: 0.043,
    slideW: 0.031,
    gripW: 0.036,
    gripH: 0.118,
    gripDepth: 0.09,
    slideColor: 0xc4c9d0,
    slideMetal: 0.5,
    slideRough: 0.28,
    frameColor: 0x303034,
    slideTravel: 0.03,
    barrelRadius: 0.0085,
  },
};

const GRIP_SLOPE = 0.27; // grip leans back toward the shooter

let stippleTexture: THREE.CanvasTexture | null = null;

/** Small shared grip-stipple texture (generated once, reused by every pistol). */
function getStipple(): THREE.CanvasTexture {
  if (stippleTexture) return stippleTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#b9b9b9";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = Math.random() < 0.6 ? "#6a6a6a" : "#e6e6e6";
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(110, 110);
  tex.colorSpace = THREE.SRGBColorSpace;
  stippleTexture = tex;
  return tex;
}

/** Extrudes a side-view outline (u = forward, v = up) into a part of a given width. */
function sideGeometry(
  points: Pt[],
  width: number,
  bevel: number,
  hole?: Pt[],
): THREE.ExtrudeGeometry {
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

function addBox(
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

export function createPistolModel(def: WeaponDef): THREE.Group {
  const spec = SPECS[def.id];
  const { rear, front, slideH: h, slideW: w, gripW, gripH, gripDepth } = spec;
  const isMagnum = def.id === "magnum";

  const g = new THREE.Group();
  const slideGroup = new THREE.Group(); // moves back when firing
  g.add(slideGroup);

  // ----- Materials -----
  const slideMat = new THREE.MeshStandardMaterial({
    color: spec.slideColor,
    metalness: spec.slideMetal,
    roughness: spec.slideRough,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: spec.frameColor,
    roughness: 0.7,
    metalness: 0.05,
    map: getStipple(),
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x8d9096,
    metalness: 0.5,
    roughness: 0.35,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x08080a,
    roughness: 0.9,
  });
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xf6f4ea });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x5b3a22,
    roughness: 0.55,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x1d1d20,
    roughness: 0.95,
  });
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: 0x2f3a45,
    roughness: 1,
  });

  // ----- Slide -----
  const slide = new THREE.Mesh(
    sideGeometry(
      [
        [rear, 0],
        [rear, h],
        [front - 0.018, h],
        [front, h - 0.008],
        [front, 0],
      ],
      w,
      0.0025,
    ),
    slideMat,
  );
  slideGroup.add(slide);
  const halfW = w / 2 + 0.0025;

  // Rear serrations (both sides); front serrations on the two smaller pistols.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      addBox(slideGroup, darkMat, 0.0016, h * 0.62, 0.0022, side * (halfW + 0.0004), h * 0.5, rear + 0.012 + i * 0.0062);
    }
    if (!isMagnum) {
      for (let i = 0; i < 3; i++) {
        addBox(slideGroup, darkMat, 0.0016, h * 0.62, 0.0022, side * (halfW + 0.0004), h * 0.5, front - 0.026 - i * 0.0062);
      }
    }
  }

  // Ejection port (right side).
  addBox(slideGroup, darkMat, 0.0014, h * 0.45, 0.04, halfW, h * 0.66, rear + 0.08);

  // Magnum: ventilated rib along the top.
  if (isMagnum) {
    const ribStart = rear + 0.032;
    const ribEnd = front - 0.032;
    addBox(slideGroup, slideMat, 0.009, 0.003, ribEnd - ribStart, 0, h + 0.0015, (ribStart + ribEnd) / 2);
    for (let u = ribStart + 0.008; u < ribEnd - 0.008; u += 0.014) {
      addBox(slideGroup, darkMat, 0.0092, 0.0032, 0.0032, 0, h + 0.0015, u);
    }
  }

  // Three-dot sights, with white dots on the faces that point at the shooter.
  const rearSightU = rear + 0.01;
  for (const side of [-1, 1]) {
    addBox(slideGroup, darkMat, 0.0055, 0.006, 0.007, side * 0.0048, h + 0.003, rearSightU);
    addBox(slideGroup, dotMat, 0.0032, 0.0032, 0.0006, side * 0.0048, h + 0.0032, rearSightU - 0.0037);
  }
  const frontSightU = front - 0.014;
  addBox(slideGroup, darkMat, 0.004, 0.0075, 0.007, 0, h + 0.00375, frontSightU);
  addBox(slideGroup, dotMat, 0.0028, 0.0028, 0.0006, 0, h + 0.0045, frontSightU - 0.0037);

  // ----- Barrel tip (does not recoil) -----
  const barrelLen = 0.014;
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(spec.barrelRadius, spec.barrelRadius, barrelLen, 14),
    steelMat,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, h * 0.5, -(front + barrelLen / 2 - 0.004));
  g.add(barrel);

  // ----- Frame: dust cover + grip -----
  const dust = new THREE.Mesh(
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
  g.add(dust);

  const gripTopRear = rear + 0.002;
  const gripTopFront = gripTopRear + gripDepth;
  const lean = gripH * GRIP_SLOPE;
  const grip = new THREE.Mesh(
    sideGeometry(
      [
        [gripTopFront, -0.003],
        [gripTopRear, -0.003],
        [gripTopRear - lean, -gripH],
        [gripTopFront - lean, -gripH],
      ],
      gripW,
      0.003,
    ),
    frameMat,
  );
  g.add(grip);

  // Magazine floor plate.
  addBox(g, darkMat, gripW + 0.003, 0.008, gripDepth + 0.004, 0, -gripH - 0.002, (gripTopFront + gripTopRear) / 2 - lean);

  // Magnum: wood grip panels on both sides.
  if (isMagnum) {
    for (const side of [-1, 1]) {
      const panel = addBox(
        g,
        woodMat,
        0.003,
        gripH * 0.92,
        gripDepth * 0.88,
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
  const guard = new THREE.Mesh(
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
  g.add(guard);
  addBox(g, steelMat, 0.006, 0.022, 0.007, 0, -0.034, gripTopFront + 0.008);

  // Slide-stop lever (left side).
  addBox(g, steelMat, 0.002, 0.005, 0.022, -((w - 0.006) / 2 + 0.001), -0.004, gripTopFront + 0.012);

  // ----- Gloved right hand + sleeve (visible behind and left of the grip) -----
  const handU = gripTopRear - 0.016 - lean * 0.45;
  const hand = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), gloveMat);
  hand.scale.set(0.028, 0.045, 0.042);
  hand.position.set(0.003, -0.05, -handU);
  g.add(hand);

  const web = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), gloveMat);
  web.scale.set(0.022, 0.016, 0.03);
  web.position.set(0.003, -0.012, -(gripTopRear - 0.006));
  g.add(web);

  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.055, 4, 8), gloveMat);
  thumb.rotation.x = Math.PI / 2;
  thumb.position.set(-(gripW / 2 + 0.01), -0.012, -(gripTopRear + 0.03));
  g.add(thumb);

  const armTilt = 0.3;
  const armDir = new THREE.Vector3(0, -Math.sin(armTilt), Math.cos(armTilt));
  const wrist = new THREE.Vector3(0.006, -0.055, -handU + 0.02);

  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.07, 14), gloveMat);
  cuff.rotation.x = Math.PI / 2 + armTilt;
  cuff.position.copy(wrist).addScaledVector(armDir, 0.035);
  g.add(cuff);

  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.35, 14), sleeveMat);
  sleeve.rotation.x = Math.PI / 2 + armTilt;
  sleeve.position.copy(wrist).addScaledVector(armDir, 0.07 + 0.175);
  g.add(sleeve);

  // ----- Metadata used by Player for animation / muzzle flash -----
  g.userData.slide = slideGroup;
  g.userData.slideTravel = spec.slideTravel;
  g.userData.muzzle = new THREE.Vector3(0, h * 0.5, -(front + 0.016));

  // Lower-right of the view, barrel pointing toward the crosshair.
  g.position.set(0.17, -0.15, -0.5);
  g.rotation.set(0, 0.035, 0);
  g.scale.setScalar(1.2); // slightly larger than life so it reads well on screen
  return g;
}