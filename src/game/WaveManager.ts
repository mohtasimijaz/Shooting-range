import * as THREE from "three";
import { Target, type TargetKind } from "./Target";
import { TARGET_Z } from "../world/Hall";

interface WaveDef {
  name: string;
  entries: {
    kind: TargetKind;
    count: number;
    hp: number;
    points: number;
    speed?: number;
    popupUp?: number;
    popupDown?: number;
  }[];
}

const WAVES: WaveDef[] = [
  {
    name: "Paper",
    entries: [{ kind: "static", count: 6, hp: 1, points: 100 }],
  },
  {
    name: "Movers",
    entries: [{ kind: "mover", count: 8, hp: 2, points: 150 }],
  },
  {
    name: "Pop-up",
    entries: [{ kind: "popup", count: 8, hp: 1, points: 200 }],
  },
  {
    name: "Mixed",
    entries: [
      { kind: "static", count: 4, hp: 1, points: 100 },
      { kind: "mover", count: 4, hp: 2, points: 150 },
      { kind: "popup", count: 4, hp: 1, points: 220 },
    ],
  },
  {
    name: "Fast Movers",
    entries: [
      { kind: "mover", count: 8, hp: 2, points: 180, speed: 1.7 },
    ],
  },
  {
    name: "Quick Draw",
    entries: [
      {
        kind: "popup",
        count: 10,
        hp: 1,
        points: 230,
        popupUp: 1.0,
        popupDown: 0.9,
      },
    ],
  },
  {
    name: "Armored",
    entries: [
      { kind: "mover", count: 6, hp: 3, points: 260, speed: 1.2 },
      { kind: "static", count: 4, hp: 3, points: 200 },
    ],
  },
  {
    name: "Gauntlet",
    entries: [
      { kind: "static", count: 3, hp: 2, points: 150 },
      { kind: "mover", count: 5, hp: 2, points: 220, speed: 1.5 },
      {
        kind: "popup",
        count: 4,
        hp: 1,
        points: 260,
        popupUp: 1.0,
        popupDown: 0.9,
      },
    ],
  },
];

export class WaveManager {
  targets: Target[] = [];
  waveIndex = 0;
  remaining = 0;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  get totalWaves(): number {
    return WAVES.length;
  }

  get waveNumber(): number {
    return this.waveIndex + 1;
  }

  get waveName(): string {
    return WAVES[this.waveIndex]?.name ?? "";
  }

  reset(): void {
    this.clear();
    this.waveIndex = 0;
  }

  startCurrent(): void {
    this.spawnWave(WAVES[this.waveIndex]);
  }

  advance(): boolean {
    this.clear();
    this.waveIndex += 1;
    if (this.waveIndex >= WAVES.length) return false;
    this.spawnWave(WAVES[this.waveIndex]);
    return true;
  }

  update(dt: number): void {
    for (const target of this.targets) {
      if (target.update(dt)) {
        this.scene.remove(target.group);
      }
    }
    this.targets = this.targets.filter((t) => t.alive || t.group.parent);
  }

  private spawnWave(wave: WaveDef): void {
    const specs: {
      kind: TargetKind;
      hp: number;
      points: number;
      speed?: number;
      popupUp?: number;
      popupDown?: number;
    }[] = [];
    for (const e of wave.entries) {
      for (let i = 0; i < e.count; i++) {
        specs.push({
          kind: e.kind,
          hp: e.hp,
          points: e.points,
          speed: e.speed,
          popupUp: e.popupUp,
          popupDown: e.popupDown,
        });
      }
    }
    this.remaining = specs.length;
    const xs = spreadX(specs.length);
    specs.forEach((s, i) => {
      const z = TARGET_Z[i % TARGET_Z.length];
      const y = 0;
      const target = new Target({
        kind: s.kind,
        x: xs[i],
        y,
        z: z + (s.kind === "mover" ? 0 : (i % 3) * 0.05),
        hp: s.hp,
        points: s.points,
        speed: s.speed,
        popupUp: s.popupUp,
        popupDown: s.popupDown,
      });
      this.targets.push(target);
      this.scene.add(target.group);
    });
  }

  private clear(): void {
    for (const t of this.targets) {
      this.scene.remove(t.group);
    }
    this.targets = [];
    this.remaining = 0;
  }
}

function spreadX(n: number): number[] {
  const xs: number[] = [];
  const width = 10;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const inRow = Math.min(4, n - row * 4);
    const x = -width / 2 + ((col + 0.5) * width) / inRow;
    xs.push(x + (row % 2 === 0 ? 0 : 0.6));
  }
  return xs;
}