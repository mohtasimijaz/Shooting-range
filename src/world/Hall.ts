import * as THREE from "three";

export const LANE_MIN_X = -5.2;
export const LANE_MAX_X = 5.2;
export const PLAYER_Z = 10.2;
export const TARGET_Z = [-7.5, -9.5, -11.5];

export function buildHall(scene: THREE.Scene): THREE.Mesh[] {
  const colliders: THREE.Mesh[] = [];

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x3a3936,
    roughness: 0.9,
    metalness: 0.05,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x4a433a,
    roughness: 0.85,
  });
  const backMat = new THREE.MeshStandardMaterial({
    color: 0x1a1614,
    roughness: 0.95,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: 0x5c4030,
    roughness: 0.7,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x6a6e74,
    metalness: 0.6,
    roughness: 0.4,
  });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(18, 0.2, 30), floorMat);
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  scene.add(floor);
  colliders.push(floor);

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(18, 0.15, 30), wallMat);
  ceiling.position.y = 5.2;
  scene.add(ceiling);

  const left = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.4, 30), wallMat);
  left.position.set(-9, 2.6, 0);
  scene.add(left);
  colliders.push(left);

  const right = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.4, 30), wallMat);
  right.position.set(9, 2.6, 0);
  scene.add(right);
  colliders.push(right);

  const back = new THREE.Mesh(new THREE.BoxGeometry(18, 5.4, 0.4), backMat);
  back.position.set(0, 2.6, -14.2);
  scene.add(back);
  colliders.push(back);

  const rear = new THREE.Mesh(new THREE.BoxGeometry(18, 5.4, 0.3), wallMat);
  rear.position.set(0, 2.6, 14.4);
  scene.add(rear);
  colliders.push(rear);

  const counter = new THREE.Mesh(new THREE.BoxGeometry(12, 1.05, 0.7), wood);
  counter.position.set(0, 0.52, 9.35);
  counter.castShadow = true;
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

  scene.add(new THREE.AmbientLight(0xb8a888, 0.28));
  const hemi = new THREE.HemisphereLight(0xd8c8a8, 0x2a241c, 0.35);
  scene.add(hemi);

  const spots = [-6, -2, 2, 6];
  for (const x of spots) {
    const light = new THREE.SpotLight(0xfff1d6, 18, 28, 0.55, 0.4, 1.1);
    light.position.set(x, 4.8, 4);
    light.target.position.set(x * 0.3, 0, -8);
    light.castShadow = true;
    scene.add(light, light.target);
    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.12, 0.5),
      metal,
    );
    fixture.position.set(x, 5.05, 4);
    scene.add(fixture);
  }

  const bay = new THREE.SpotLight(0xffeedd, 12, 22, 0.7, 0.5, 1);
  bay.position.set(0, 4.6, -6);
  bay.target.position.set(0, 1, -11);
  scene.add(bay, bay.target);

  return colliders;
}
