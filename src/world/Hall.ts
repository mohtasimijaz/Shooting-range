import * as THREE from "three";

export const LANE_MIN_X = -5.2;
export const LANE_MAX_X = 5.2;
export const PLAYER_Z = 10.2;
export const TARGET_Z = [-7.5, -9.5, -11.5];

/**
 * Builds the shooting hall.
 * Returns the meshes that bullets can hit (used for impact sparks).
 *
 * Phase 1: brighter, believable indoor lighting.
 *  - lighter surface colours so the room reads clearly
 *  - visible emissive ceiling light panels
 *  - cool ambient fill + warm key lights
 *  - the target bay is the brightest area of the room
 *  - only 2 shadow-casting lights (performance)
 */
export function buildHall(scene: THREE.Scene): THREE.Mesh[] {
  const colliders: THREE.Mesh[] = [];

  // ---------- Materials ----------
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x5b5954,
    roughness: 0.55,
    metalness: 0.1,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x8a8478,
    roughness: 0.85,
  });
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x9a9a98,
    roughness: 0.9,
  });
  const backMat = new THREE.MeshStandardMaterial({
    color: 0x3b4048,
    roughness: 0.95,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: 0x6d4c36,
    roughness: 0.7,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x7a7e84,
    metalness: 0.6,
    roughness: 0.4,
  });

  // ---------- Room shell ----------
  const floor = new THREE.Mesh(new THREE.BoxGeometry(18, 0.2, 30), floorMat);
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  scene.add(floor);
  colliders.push(floor);

  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(18, 0.15, 30),
    ceilingMat,
  );
  ceiling.position.y = 5.2;
  scene.add(ceiling);

  const left = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.4, 30), wallMat);
  left.position.set(-9, 2.6, 0);
  left.receiveShadow = true;
  scene.add(left);
  colliders.push(left);

  const right = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.4, 30), wallMat);
  right.position.set(9, 2.6, 0);
  right.receiveShadow = true;
  scene.add(right);
  colliders.push(right);

  const back = new THREE.Mesh(new THREE.BoxGeometry(18, 5.4, 0.4), backMat);
  back.position.set(0, 2.6, -14.2);
  back.receiveShadow = true;
  scene.add(back);
  colliders.push(back);

  const rear = new THREE.Mesh(new THREE.BoxGeometry(18, 5.4, 0.3), wallMat);
  rear.position.set(0, 2.6, 14.4);
  scene.add(rear);
  colliders.push(rear);

  // ---------- Shooting counter ----------
  const counter = new THREE.Mesh(new THREE.BoxGeometry(12, 1.05, 0.7), wood);
  counter.position.set(0, 0.52, 9.35);
  counter.castShadow = true;
  counter.receiveShadow = true;
  scene.add(counter);
  colliders.push(counter);

  for (let i = -2; i <= 2; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 0.12), metal);
    post.position.set(i * 2.6, 0.52, 9.05);
    scene.add(post);
  }

  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xc9a227 }),
  );
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.02, 9.7);
  scene.add(line);

  for (const z of TARGET_Z) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(14, 0.05, 0.08), metal);
    rail.position.set(0, 0.08, z);
    scene.add(rail);
  }

  // ---------- Visible ceiling light panels (emissive, one InstancedMesh) ----------
  const panelRows = [7, 2, -3, -8, -12];
  const panelCols = [-5.5, -1.8, 1.8, 5.5];
  const panelGeo = new THREE.BoxGeometry(2.2, 0.06, 0.6);
  const panelMat = new THREE.MeshBasicMaterial({
    color: 0xfff3dc,
    toneMapped: false,
  });
  const panels = new THREE.InstancedMesh(
    panelGeo,
    panelMat,
    panelRows.length * panelCols.length,
  );
  const m = new THREE.Matrix4();
  let idx = 0;
  for (const z of panelRows) {
    for (const x of panelCols) {
      m.makeTranslation(x, 5.08, z);
      panels.setMatrixAt(idx++, m);
    }
  }
  panels.instanceMatrix.needsUpdate = true;
  scene.add(panels);

  // ---------- Lighting ----------
  // Cool ambient fill + sky/ground hemisphere so no area is pitch black.
  scene.add(new THREE.AmbientLight(0xaab8d0, 0.85));
  scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x3a3630, 0.9));

  // Fill lights over the firing area (warm, no shadows).
  const fillPositions: [number, number][] = [
    [-5, 6],
    [5, 6],
    [-5, -1],
    [5, -1],
  ];
  for (const [x, z] of fillPositions) {
    const light = new THREE.SpotLight(0xfff1d6, 55, 30, 1.0, 0.7, 1.1);
    light.position.set(x, 4.9, z);
    light.target.position.set(x * 0.5, 0, z - 2);
    scene.add(light, light.target);
  }

  // Key lights over the target bay: the brightest area, 2 shadow casters.
  for (const x of [-3, 3]) {
    const key = new THREE.SpotLight(0xfff4e0, 120, 30, 0.8, 0.5, 1.1);
    key.position.set(x, 4.8, -4.5);
    key.target.position.set(0, 1.2, -10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    scene.add(key, key.target);
  }

  // Soft wash on the back wall so the end of the room is visible.
  const wash = new THREE.SpotLight(0xcfe0ff, 45, 24, 0.9, 0.8, 1.1);
  wash.position.set(0, 4.9, -8);
  wash.target.position.set(0, 2.2, -14);
  scene.add(wash, wash.target);

  return colliders;
}