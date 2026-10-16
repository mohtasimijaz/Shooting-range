import * as THREE from "three";
import type { QualityProfile } from "../core/Device";
import {
  acousticTexture,
  canvasTexture,
  concreteTexture,
  laneNumberTexture,
  rubberTexture,
  signTexture,
  steelPlateTexture,
  woodTexture,
} from "./Textures";

/**
 * The indoor shooting range.
 *
 *  - Poured concrete floor with painted lane lines, firing line and distance marks
 *  - Acoustic foam walls above steel ballistic wainscot panels
 *  - Angled ceiling baffles, steel trusses, a ventilation duct
 *  - Fluorescent tube fixtures (self-lit, kept soft so they never dazzle)
 *  - Steel "escalator" bullet trap with a rubber berm at the back
 *  - Overhead target carrier rails, a wooden shooting bench with rubber mats
 *
 * Returns the meshes bullets can hit; each has `userData.surface` so impacts
 * get the right effect.
 */

export const LANE_MIN_X = -5.2;
export const LANE_MAX_X = 5.2;
export const PLAYER_Z = 10.2;
/** Target rows: roughly 9 m, 11.5 m and 14 m from the shooter. */
export const TARGET_Z = [1.0, -1.5, -4.0];
/** Height of the overhead target carrier rails. */
export const RAIL_Y = 3.25;
/** Distance of each row's front (moving target) track in front of the row. */
export const FRONT_TRACK_OFFSET = 0.7;

export const ROOM = { halfWidth: 9, backZ: -8.5, rearZ: 12.8, height: 4.6 };
export const BENCH = { minX: -6, maxX: 6, minZ: 9.1, maxZ: 9.8, top: 1.05 };

type SurfaceTag = "concrete" | "steel" | "wood" | "rubber" | "foam";

function tag<T extends THREE.Mesh>(mesh: T, surface: SurfaceTag, colliders: THREE.Mesh[]): T {
  mesh.userData.surface = surface;
  colliders.push(mesh);
  return mesh;
}

function cloneTex(tex: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const t = tex.clone();
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

function floorText(text: string): THREE.CanvasTexture {
  return canvasTexture(`floor-${text}`, 256, 96, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(240,200,80,0.85)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '900 64px Impact, "Arial Black", sans-serif';
    ctx.fillText(text, w / 2, h / 2 + 4);
  });
}

export function buildHall(scene: THREE.Scene, quality: QualityProfile): THREE.Mesh[] {
  const colliders: THREE.Mesh[] = [];
  const W = ROOM.halfWidth * 2;
  const L = ROOM.rearZ - ROOM.backZ;
  const midZ = (ROOM.rearZ + ROOM.backZ) / 2;
  const H = ROOM.height;
  const shadows = quality.shadowLights > 0;

  // ---------- Materials ----------
  const concrete = concreteTexture();
  const floorMat = new THREE.MeshStandardMaterial({
    map: cloneTex(concrete, 4, 5),
    color: 0xbdb8ae,
    roughness: 0.62,
    metalness: 0.05,
  });
  const ceilingMat = new THREE.MeshStandardMaterial({ map: cloneTex(concrete, 3, 4), color: 0x55585e, roughness: 0.95 });
  const foamMat = new THREE.MeshStandardMaterial({ map: cloneTex(acousticTexture(), 12, 2), color: 0xb4bcc8, roughness: 1 });
  const steelPanel = steelPlateTexture();
  const wainscotMat = new THREE.MeshStandardMaterial({
    map: cloneTex(steelPanel, 8, 1),
    color: 0xc8ccd2,
    metalness: 0.55,
    roughness: 0.5,
  });
  const trapMat = new THREE.MeshStandardMaterial({
    map: cloneTex(steelPanel, 6, 1),
    color: 0x9aa0a8,
    metalness: 0.6,
    roughness: 0.45,
  });
  const rubberMat = new THREE.MeshStandardMaterial({ map: cloneTex(rubberTexture(), 6, 2), roughness: 0.95 });
  const benchWood = new THREE.MeshStandardMaterial({
    map: woodTexture("bench", "#8d6a48", "#4a3220", [6, 1]),
    roughness: 0.55,
  });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.6, roughness: 0.45 });
  const galvanized = new THREE.MeshStandardMaterial({ color: 0x9da3aa, metalness: 0.8, roughness: 0.38 });
  const yellowPaint = new THREE.MeshStandardMaterial({ color: 0xe0b33a, roughness: 0.6 });
  const whitePaint = new THREE.MeshStandardMaterial({ color: 0xd8d6cf, roughness: 0.7, transparent: true, opacity: 0.55 });

  // ---------- Shell ----------
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, L), floorMat);
  floor.position.set(0, -0.1, midZ);
  floor.receiveShadow = true;
  scene.add(tag(floor, "concrete", colliders));

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, L), ceilingMat);
  ceiling.position.set(0, H + 0.1, midZ);
  scene.add(tag(ceiling, "concrete", colliders));

  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, H, L), foamMat);
    wall.position.set(side * (ROOM.halfWidth + 0.15), H / 2, midZ);
    wall.receiveShadow = true;
    scene.add(tag(wall, "foam", colliders));

    // Steel ballistic wainscot panels with a top cap.
    const wain = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, L), wainscotMat);
    wain.position.set(side * (ROOM.halfWidth - 0.03), 0.55, midZ);
    wain.receiveShadow = true;
    scene.add(tag(wain, "steel", colliders));
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, L), darkSteel);
    cap.position.set(side * (ROOM.halfWidth - 0.05), 1.12, midZ);
    scene.add(cap);
  }

  const rearWall = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.3), foamMat);
  rearWall.position.set(0, H / 2, ROOM.rearZ + 0.15);
  scene.add(tag(rearWall, "foam", colliders));

  // ---------- Bullet trap + berm ----------
  const berm = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.6), rubberMat);
  berm.position.set(0, H / 2, ROOM.backZ - 0.3);
  berm.receiveShadow = true;
  scene.add(tag(berm, "rubber", colliders));

  const lowerLen = 2.6;
  const lower = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, 0.06, lowerLen), trapMat);
  lower.rotation.x = 0.62;
  lower.position.set(0, Math.sin(0.62) * lowerLen * 0.5, ROOM.backZ + Math.cos(0.62) * lowerLen * 0.5 + 0.05);
  lower.receiveShadow = true;
  scene.add(tag(lower, "steel", colliders));

  const upperLen = 2.2;
  const upper = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, 0.06, upperLen), trapMat);
  upper.rotation.x = -0.75;
  upper.position.set(0, 3.6 - Math.sin(0.75) * upperLen * 0.5, ROOM.backZ + Math.cos(0.75) * upperLen * 0.5 + 0.05);
  scene.add(tag(upper, "steel", colliders));

  // Dark throat between the plates.
  const throat = new THREE.Mesh(
    new THREE.BoxGeometry(W - 0.4, 1.0, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 1 }),
  );
  throat.position.set(0, 2.1, ROOM.backZ + 0.08);
  scene.add(throat);

  // Hazard stripe along the top of the trap.
  const hazard = canvasTexture("hazard", 256, 32, (ctx, w, h) => {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#e3b13c";
    for (let x = -h; x < w + h; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 16, h);
      ctx.lineTo(x + 16 + h, 0);
      ctx.lineTo(x + h, 0);
      ctx.closePath();
      ctx.fill();
    }
  }, { repeat: [10, 1] });
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, 0.22), new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.6 }));
  stripe.position.set(0, 3.75, ROOM.backZ + 0.02);
  scene.add(stripe);

  // ---------- Floor markings ----------
  const firingLine = new THREE.Mesh(new THREE.PlaneGeometry(13, 0.12), yellowPaint);
  firingLine.rotation.x = -Math.PI / 2;
  firingLine.position.set(0, 0.002, BENCH.minZ - 0.08);
  scene.add(firingLine);

  for (const x of [-6, -3, 0, 3, 6]) {
    const laneLine = new THREE.Mesh(new THREE.PlaneGeometry(0.05, BENCH.minZ - ROOM.backZ - 2.4), whitePaint);
    laneLine.rotation.x = -Math.PI / 2;
    laneLine.position.set(x, 0.002, (BENCH.minZ + ROOM.backZ + 2.4) / 2 - 0.2);
    scene.add(laneLine);
  }

  TARGET_Z.forEach((z) => {
    const metres = Math.round(PLAYER_Z - z);
    const text = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.34),
      new THREE.MeshStandardMaterial({ map: floorText(`${metres} M`), transparent: true, roughness: 0.6 }),
    );
    text.rotation.x = -Math.PI / 2;
    text.position.set(-7.6, 0.003, z + 0.5);
    scene.add(text);
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.06), yellowPaint);
    tick.rotation.x = -Math.PI / 2;
    tick.position.set(-7.6, 0.003, z);
    scene.add(tick);
  });

  // ---------- Shooting bench ----------
  const benchW = BENCH.maxX - BENCH.minX;
  const benchD = BENCH.maxZ - BENCH.minZ;
  const top = new THREE.Mesh(new THREE.BoxGeometry(benchW, 0.06, benchD), benchWood);
  top.position.set(0, BENCH.top - 0.03, (BENCH.minZ + BENCH.maxZ) / 2);
  top.castShadow = shadows;
  top.receiveShadow = true;
  scene.add(tag(top, "wood", colliders));

  const apron = new THREE.Mesh(new THREE.BoxGeometry(benchW, BENCH.top - 0.1, 0.05), darkSteel);
  apron.position.set(0, (BENCH.top - 0.06) / 2 + 0.02, BENCH.minZ + 0.03);
  scene.add(tag(apron, "steel", colliders));

  const shelf = new THREE.Mesh(new THREE.BoxGeometry(benchW - 0.1, 0.04, benchD - 0.1), darkSteel);
  shelf.position.set(0, 0.32, (BENCH.minZ + BENCH.maxZ) / 2);
  scene.add(shelf);

  for (let i = 0; i <= 4; i++) {
    const x = BENCH.minX + 0.06 + (i * (benchW - 0.12)) / 4;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, BENCH.top - 0.06, benchD - 0.06), darkSteel);
    leg.position.set(x, (BENCH.top - 0.06) / 2, (BENCH.minZ + BENCH.maxZ) / 2);
    scene.add(leg);
  }

  const matMat = new THREE.MeshStandardMaterial({ map: cloneTex(rubberTexture(), 2, 1), color: 0x9a9da3, roughness: 0.95 });
  [-4.5, -1.5, 1.5, 4.5].forEach((x, i) => {
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.012, benchD - 0.12), matMat);
    mat.position.set(x, BENCH.top + 0.006, (BENCH.minZ + BENCH.maxZ) / 2);
    mat.receiveShadow = true;
    scene.add(mat);

    // Lane number signs hanging above the bench.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.42),
      new THREE.MeshStandardMaterial({ map: laneNumberTexture(i + 1), roughness: 0.5 }),
    );
    sign.position.set(x, 3.05, BENCH.minZ - 3.2);
    scene.add(sign);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, H - 3.26, 6), galvanized);
    rod.position.set(x, (H + 3.26) / 2, BENCH.minZ - 3.2);
    scene.add(rod);
  });

  // Steel posts at both ends of the bench.
  for (const side of [-1, 1]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.06), darkSteel);
    frame.position.set(side * 6.3, 1.2, BENCH.minZ - 0.25);
    scene.add(frame);
  }

  // ---------- Overhead target carrier rails ----------
  // Each distance row has a back track (static targets) and a front track
  // (moving targets) so carriers never pass through each other.
  const railGeo = new THREE.BoxGeometry(13.5, 0.08, 0.12);
  const hangerGeo = new THREE.CylinderGeometry(0.012, 0.012, H - RAIL_Y, 6);
  for (const rowZ of TARGET_Z) {
    for (const z of [rowZ, rowZ + FRONT_TRACK_OFFSET]) {
      const rail = new THREE.Mesh(railGeo, galvanized);
      rail.position.set(0, RAIL_Y + 0.04, z);
      scene.add(tag(rail, "steel", colliders));
      for (const x of [-6, -2, 2, 6]) {
        const hanger = new THREE.Mesh(hangerGeo, galvanized);
        hanger.position.set(x, (H + RAIL_Y) / 2, z);
        scene.add(hanger);
      }
    }
  }

  // ---------- Ceiling: baffles, trusses, duct, light fixtures ----------
  const baffleZ: number[] = [];
  for (let z = 7.6; z > ROOM.backZ + 1.5; z -= 2.2) baffleZ.push(z);
  const baffles = new THREE.InstancedMesh(new THREE.BoxGeometry(W - 0.6, 0.85, 0.05), trapMat, baffleZ.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.65, 0, 0));
  baffleZ.forEach((z, i) => {
    m4.compose(new THREE.Vector3(0, H - 0.5, z), q, new THREE.Vector3(1, 1, 1));
    baffles.setMatrixAt(i, m4);
  });
  baffles.instanceMatrix.needsUpdate = true;
  scene.add(tag(baffles, "steel", colliders));

  for (const x of [-4.5, 4.5]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, L), darkSteel);
    beam.position.set(x, H - 0.15, midZ);
    scene.add(beam);
  }
  const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, L, 20, 1, true), galvanized);
  duct.rotation.x = Math.PI / 2;
  duct.position.set(7.4, H - 0.5, midZ);
  scene.add(duct);

  const fixtureZ = [9.2, 6.5, 4.3, 2.1, -0.1, -2.3, -4.5];
  const fixtureX = [-5.4, -1.8, 1.8, 5.4];
  const count = fixtureZ.length * fixtureX.length;
  const housing = new THREE.InstancedMesh(new THREE.BoxGeometry(1.32, 0.07, 0.26), darkSteel, count);
  // Tubes stay just below the bloom threshold: they read as lit fixtures
  // without flaring or dazzling the player.
  const tubes = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1.22, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.82, 0.8, 0.76) }),
    count * 2,
  );
  const tubeRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  const ident = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  let hi = 0;
  let ti = 0;
  const fixtureY = 3.55;
  for (const z of fixtureZ) {
    for (const x of fixtureX) {
      m4.compose(new THREE.Vector3(x, fixtureY + 0.05, z), ident, one);
      housing.setMatrixAt(hi++, m4);
      for (const dz of [-0.06, 0.06]) {
        m4.compose(new THREE.Vector3(x, fixtureY - 0.005, z + dz), tubeRot, one);
        tubes.setMatrixAt(ti++, m4);
      }
    }
  }
  housing.instanceMatrix.needsUpdate = true;
  tubes.instanceMatrix.needsUpdate = true;
  scene.add(housing, tubes);

  // ---------- Signs and range status lamp ----------
  const signs: [string, string[], string, string, string | undefined, number, number][] = [
    ["eyes", ["EYE & EAR", "PROTECTION", "REQUIRED"], "#f4f1e8", "#16171a", "#1d5fa8", -1, 5.5],
    ["muzzle", ["KEEP MUZZLE", "DOWNRANGE"], "#f4f1e8", "#16171a", "#c62828", 1, 5.5],
    ["cease", ["CEASE FIRE", "ON WHISTLE"], "#16171a", "#e3b13c", undefined, -1, 0.5],
  ];
  for (const [key, lines, bg, fg, accent, side, z] of signs) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.8),
      new THREE.MeshStandardMaterial({ map: signTexture(key, lines, bg, fg, accent), roughness: 0.55 }),
    );
    sign.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    sign.position.set(side * (ROOM.halfWidth - 0.02), 2.4, z);
    scene.add(sign);
  }

  const lampBox = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.2), darkSteel);
  lampBox.position.set(-ROOM.halfWidth + 0.08, 2.6, 8.4);
  scene.add(lampBox);
  const lampGreen = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.85, 0.35) }),
  );
  lampGreen.position.set(-ROOM.halfWidth + 0.16, 2.5, 8.4);
  const lampRed = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshStandardMaterial({ color: 0x3a0b0b }));
  lampRed.position.set(-ROOM.halfWidth + 0.16, 2.7, 8.4);
  scene.add(lampGreen, lampRed);

  // ---------- Lighting ----------
  scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x3a3630, quality.fillLights ? 0.35 : 0.6));
  scene.add(new THREE.AmbientLight(0xaab8d0, quality.fillLights ? 0.12 : 0.22));

  // Key lights over the target bay (the brightest area of the room).
  for (const [i, x] of [-3, 3].entries()) {
    const key = new THREE.SpotLight(0xfff1dc, 22, 24, 0.85, 0.6, 1.2);
    key.position.set(x, H - 0.3, 4.2);
    key.target.position.set(x * 0.3, 1.2, -2.2);
    if (i < quality.shadowLights) {
      key.castShadow = true;
      key.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.02;
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 20;
    }
    scene.add(key, key.target);
  }

  if (quality.fillLights) {
    for (const x of [-4.5, 4.5]) {
      const fill = new THREE.SpotLight(0xfff1d6, 11, 16, 1.0, 0.7, 1.2);
      fill.position.set(x, H - 0.3, 9.5);
      fill.target.position.set(x * 0.5, 0.8, 6.5);
      scene.add(fill, fill.target);
    }
  }

  // Wash on the bullet trap so the end of the room reads clearly.
  const wash = new THREE.SpotLight(0xd6e4ff, 14, 16, 1.0, 0.8, 1.2);
  wash.position.set(0, H - 0.3, -2.5);
  wash.target.position.set(0, 1.6, ROOM.backZ);
  scene.add(wash, wash.target);

  return colliders;
}