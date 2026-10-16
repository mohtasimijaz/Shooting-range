import * as THREE from "three";
import type { QualityProfile } from "../core/Device";
import { BENCH } from "../world/Hall";
import { bulletHoleTexture } from "../world/Textures";
import type { WeaponClass } from "./Weapon";

/**
 * Pooled visual effects: ejected brass, impact particles, tracers and bullet
 * holes. Everything is allocated once up front and recycled, so sustained
 * automatic fire creates no garbage and no new GPU resources.
 */

export type Surface = "concrete" | "steel" | "wood" | "rubber" | "foam" | "paper";

const GRAVITY = 9.81;
const CASING_LIFE = 5;

interface Casing {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  bounces: number;
  resting: boolean;
  radius: number;
}

interface Tracer {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  from: THREE.Vector3;
  dir: THREE.Vector3;
  dist: number;
  t: number;
  active: boolean;
}

function casingGeometry(kind: WeaponClass): THREE.LatheGeometry {
  // Profile (radius, height) revolved around Y. Rifle cases are bottlenecked.
  const pts =
    kind === "rifle"
      ? [
          [0, 0], [0.0058, 0], [0.0058, 0.0012], [0.005, 0.0016], [0.0057, 0.0025],
          [0.0056, 0.029], [0.004, 0.033], [0.0038, 0.039], [0.0032, 0.039],
        ]
      : [
          [0, 0], [0.0049, 0], [0.0049, 0.001], [0.0043, 0.0014], [0.0048, 0.0022],
          [0.0047, 0.019], [0.0042, 0.019],
        ];
  const geo = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 12);
  geo.translate(0, -(kind === "rifle" ? 0.0195 : 0.0095), 0);
  return geo;
}

// Soft round particles with per-particle size and alpha.
const PARTICLE_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.05, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.1, d));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

class ParticleSystem {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly grow: Float32Array;
  private readonly baseAlpha: Float32Array;
  private readonly count: number;
  private next = 0;

  constructor(count: number, additive: boolean) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.gravity = new Float32Array(count);
    this.drag = new Float32Array(count);
    this.grow = new Float32Array(count);
    this.baseAlpha = new Float32Array(count);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 2), 40);

    this.material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  setScale(pixelHeight: number): void {
    this.material.uniforms.uScale.value = pixelHeight;
  }

  emit(
    at: THREE.Vector3,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.Color,
    size: number,
    life: number,
    gravity: number,
    drag: number,
    grow: number,
    alpha: number,
  ): void {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    this.pos[i * 3] = at.x;
    this.pos[i * 3 + 1] = at.y;
    this.pos[i * 3 + 2] = at.z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.gravity[i] = gravity;
    this.drag[i] = drag;
    this.grow[i] = grow;
    this.baseAlpha[i] = alpha;
    this.alpha[i] = alpha;
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.gravity[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = this.baseAlpha[i] * t;
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.alpha.fill(0);
  }
}

const SURFACE_COLORS: Record<Surface, number[]> = {
  concrete: [0x9a948a, 0x7d776e, 0xb3ada2],
  steel: [0x6d7178, 0x55595f],
  wood: [0x7a5233, 0xa6774c],
  rubber: [0x2a2a2c, 0x3a3a3d],
  foam: [0x4a5058, 0x5d646d],
  paper: [0xf3efe4, 0xe2dccd, 0x2b2f36],
};

export class Effects {
  /** Called on a casing's first bounces (for the tinkle sound). */
  onCasingBounce: ((strength: number) => void) | null = null;

  private readonly scene: THREE.Scene;
  private readonly casings: Casing[] = [];
  private casingNext = 0;
  private readonly casingGeo: Record<WeaponClass, THREE.LatheGeometry>;
  private readonly casingMat: THREE.MeshStandardMaterial;
  private readonly sparks: ParticleSystem;
  private readonly dust: ParticleSystem;
  private readonly tracers: Tracer[] = [];
  private readonly decals: THREE.Mesh[] = [];
  private decalNext = 0;
  private readonly decalGeo = new THREE.PlaneGeometry(1, 1);
  private readonly decalMat: THREE.MeshBasicMaterial;
  private readonly tmpColor = new THREE.Color();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene, quality: QualityProfile) {
    this.scene = scene;

    this.casingGeo = { pistol: casingGeometry("pistol"), rifle: casingGeometry("rifle") };
    this.casingMat = new THREE.MeshStandardMaterial({ color: 0xd9a64a, metalness: 1, roughness: 0.3 });
    for (let i = 0; i < quality.casingPool; i++) {
      const mesh = new THREE.Mesh(this.casingGeo.pistol, this.casingMat);
      mesh.visible = false;
      scene.add(mesh);
      this.casings.push({
        mesh,
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        life: 0,
        bounces: 0,
        resting: false,
        radius: 0.005,
      });
    }

    this.sparks = new ParticleSystem(Math.round(quality.particlePool * 0.4), true);
    this.dust = new ParticleSystem(Math.round(quality.particlePool * 0.6), false);
    scene.add(this.sparks.points, this.dust.points);

    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd08a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 1), mat);
      mesh.visible = false;
      scene.add(mesh);
      this.tracers.push({ mesh, mat, from: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, t: 0, active: false });
    }

    this.decalMat = new THREE.MeshBasicMaterial({
      map: bulletHoleTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    for (let i = 0; i < 120; i++) {
      const mesh = new THREE.Mesh(this.decalGeo, this.decalMat);
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.decals.push(mesh);
    }
  }

  setPixelScale(pixelHeight: number): void {
    this.sparks.setScale(pixelHeight);
    this.dust.setScale(pixelHeight);
  }

  /** Throws a spent case out of the ejection port (world space). */
  ejectCasing(at: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, forward: THREE.Vector3, kind: WeaponClass): void {
    if (this.casings.length === 0) return;
    const c = this.casings[this.casingNext];
    this.casingNext = (this.casingNext + 1) % this.casings.length;
    c.mesh.geometry = this.casingGeo[kind];
    c.radius = kind === "rifle" ? 0.0058 : 0.0049;
    c.mesh.position.copy(at);
    c.mesh.scale.setScalar(1);
    c.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.PI / 2);
    c.mesh.visible = true;
    const side = kind === "rifle" ? 2.4 : 1.9;
    c.vel
      .copy(right)
      .multiplyScalar(side + Math.random() * 0.8)
      .addScaledVector(up, 1.4 + Math.random() * 0.8)
      .addScaledVector(forward, -0.3 + Math.random() * 0.4);
    c.spin.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 40);
    c.life = CASING_LIFE;
    c.bounces = 0;
    c.resting = false;
  }

  /** Impact particles at a hit point, flavoured by the surface. */
  impact(point: THREE.Vector3, normal: THREE.Vector3, surface: Surface): void {
    const colors = SURFACE_COLORS[surface];
    const dustCount = surface === "steel" ? 2 : surface === "paper" ? 5 : 7;
    for (let i = 0; i < dustCount; i++) {
      this.tmpColor.setHex(colors[Math.floor(Math.random() * colors.length)]);
      const s = surface === "paper" ? 1.6 : 0.8;
      this.dust.emit(
        point,
        normal.x * (0.6 + Math.random()) * s + (Math.random() - 0.5) * 0.8,
        normal.y * (0.6 + Math.random()) * s + Math.random() * 0.6,
        normal.z * (0.6 + Math.random()) * s + (Math.random() - 0.5) * 0.8,
        this.tmpColor,
        surface === "paper" ? 0.025 : 0.05 + Math.random() * 0.05,
        0.5 + Math.random() * 0.6,
        surface === "paper" ? 3 : 1.2,
        2.5,
        surface === "paper" ? 0 : 0.18,
        surface === "paper" ? 0.95 : 0.55,
      );
    }

    if (surface === "steel" || surface === "concrete") {
      const sparkCount = surface === "steel" ? 12 : 3;
      for (let i = 0; i < sparkCount; i++) {
        this.tmpColor.setRGB(1, 0.55 + Math.random() * 0.35, 0.2 + Math.random() * 0.2);
        const speed = 2.5 + Math.random() * 3.5;
        this.sparks.emit(
          point,
          (normal.x + (Math.random() - 0.5) * 1.6) * speed,
          (normal.y + Math.random() * 0.8) * speed,
          (normal.z + (Math.random() - 0.5) * 1.6) * speed,
          this.tmpColor,
          0.018 + Math.random() * 0.012,
          0.18 + Math.random() * 0.25,
          GRAVITY,
          1,
          0,
          1,
        );
      }
    }
  }

  /** Small grey smoke puff at the muzzle. */
  muzzleSmoke(at: THREE.Vector3, forward: THREE.Vector3): void {
    for (let i = 0; i < 2; i++) {
      this.tmpColor.setHex(0xb8b4ac);
      this.dust.emit(
        at,
        forward.x * 0.6 + (Math.random() - 0.5) * 0.2,
        0.15 + Math.random() * 0.2,
        forward.z * 0.6 + (Math.random() - 0.5) * 0.2,
        this.tmpColor,
        0.06,
        0.7 + Math.random() * 0.4,
        -0.25,
        2.2,
        0.35,
        0.22,
      );
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const tr = this.tracers.find((t) => !t.active) ?? this.tracers[0];
    tr.from.copy(from);
    tr.dir.subVectors(to, from);
    tr.dist = tr.dir.length();
    if (tr.dist < 0.5) return;
    tr.dir.divideScalar(tr.dist);
    tr.t = 0;
    tr.active = true;
    tr.mesh.visible = true;
    tr.mesh.quaternion.setFromUnitVectors(this.zAxis, tr.dir);
  }

  /**
   * Bullet hole decal. With `parent`, the decal is attached to that object
   * (paper targets) so it moves with it; otherwise it sits in the world.
   */
  bulletHole(point: THREE.Vector3, normal: THREE.Vector3, size: number, parent?: THREE.Object3D): void {
    const mesh = this.decals[this.decalNext];
    this.decalNext = (this.decalNext + 1) % this.decals.length;
    mesh.visible = true;
    mesh.scale.setScalar(size * (0.85 + Math.random() * 0.3));
    this.tmpV.copy(point).addScaledVector(normal, 0.002);
    this.tmpQ.setFromUnitVectors(this.zAxis, normal);
    mesh.position.copy(this.tmpV);
    mesh.quaternion.copy(this.tmpQ);
    mesh.rotateZ(Math.random() * Math.PI * 2);
    if (parent) {
      parent.add(mesh);
      parent.updateWorldMatrix(true, false);
      // Convert the world transform into the parent's space.
      const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
      mesh.applyMatrix4(inv);
    } else {
      this.scene.add(mesh);
    }
  }

  update(dt: number): void {
    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) {
        c.mesh.visible = false;
        continue;
      }
      if (c.life < 0.4) c.mesh.scale.setScalar(c.life / 0.4);
      if (c.resting) continue;

      c.vel.y -= GRAVITY * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;

      const p = c.mesh.position;
      const onBench = p.x > BENCH.minX && p.x < BENCH.maxX && p.z > BENCH.minZ && p.z < BENCH.maxZ;
      const floorY = (onBench && p.y > BENCH.top - 0.05 ? BENCH.top : 0) + c.radius;
      if (p.y < floorY && c.vel.y < 0) {
        p.y = floorY;
        const strength = Math.min(1, -c.vel.y / 4);
        c.vel.y = -c.vel.y * 0.38;
        c.vel.x *= 0.55;
        c.vel.z *= 0.55;
        c.spin.multiplyScalar(0.5);
        c.bounces += 1;
        if (c.bounces <= 2 && strength > 0.15) this.onCasingBounce?.(strength);
        if (Math.abs(c.vel.y) < 0.35) {
          c.resting = true;
          c.mesh.rotation.set(0, c.mesh.rotation.y, Math.PI / 2);
        }
      }
    }

    for (const tr of this.tracers) {
      if (!tr.active) continue;
      tr.t += dt;
      const speed = 320;
      const head = Math.min(tr.dist, tr.t * speed);
      const len = Math.min(2.2, head);
      if (tr.t > tr.dist / speed + 0.03) {
        tr.active = false;
        tr.mesh.visible = false;
        continue;
      }
      tr.mesh.scale.set(1, 1, len);
      tr.mesh.position.copy(tr.from).addScaledVector(tr.dir, head - len / 2);
      tr.mat.opacity = 0.85;
    }

    this.sparks.update(dt);
    this.dust.update(dt);
  }

  /** Clears everything (new game). */
  reset(): void {
    for (const c of this.casings) {
      c.life = 0;
      c.mesh.visible = false;
    }
    for (const tr of this.tracers) {
      tr.active = false;
      tr.mesh.visible = false;
    }
    for (const d of this.decals) {
      d.visible = false;
      d.removeFromParent();
    }
    this.sparks.clear();
    this.dust.clear();
  }
}
