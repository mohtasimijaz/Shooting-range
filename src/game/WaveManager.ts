import * as THREE from "three";
import { FRONT_TRACK_OFFSET, TARGET_Z } from "../world/Hall";
import { rng } from "../world/Textures";
import { Target } from "./Target";
import { generateWave, TOTAL_WAVES, type TargetKind, type WaveEntry, type WaveSpec } from "./WaveGen";

/**
 * Spawns and tracks the targets of the current wave.
 *
 * Layout per distance row:
 *   back track  (row z)        static paper, no-shoot and swinging targets
 *   front track (row z + 0.7)  movers and zig-zags, each kept inside its own slot
 *   floor       (row z + 1.3)  pop-up turners and steel plates
 * Bonus targets sweep high across the nearest row.
 */

const FIELD_HALF = 5.2;
const FLOOR_OFFSET = 1.3;

type Group = "back" | "front" | "floor" | "bonus";

function groupOf(kind: TargetKind): Group {
  switch (kind) {
    case "mover":
    case "zigzag":
      return "front";
    case "popup":
    case "steel":
      return "floor";
    case "bonus":
      return "bonus";
    default:
      return "back";
  }
}

export class WaveManager {
  targets: Target[] = [];
  waveNumber = 1;
  remaining = 0;
  spec: WaveSpec = generateWave(1);
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  get totalWaves(): number {
    return TOTAL_WAVES;
  }

  get waveName(): string {
    return this.spec.name;
  }

  /** Clears the field and spawns the given wave. */
  start(wave: number): void {
    this.clear();
    this.waveNumber = Math.min(TOTAL_WAVES, Math.max(1, wave));
    this.spec = generateWave(this.waveNumber);
    this.spawn(this.spec);
  }

  /** True if there is another wave after the current one. */
  hasNext(): boolean {
    return this.waveNumber < TOTAL_WAVES;
  }

  update(dt: number): void {
    for (const target of this.targets) {
      if (target.update(dt)) target.group.removeFromParent();
    }
    this.targets = this.targets.filter((t) => t.group.parent !== null);
  }

  /** Removes the optional targets (no-shoot, bonus) once a wave is cleared. */
  retireOptional(): void {
    for (const t of this.targets) {
      if (!t.required && t.alive) {
        t.alive = false;
        t.hittable = false;
        t.group.removeFromParent();
      }
    }
    this.targets = this.targets.filter((t) => t.group.parent !== null);
  }

  clear(): void {
    for (const t of this.targets) t.group.removeFromParent();
    this.targets = [];
    this.remaining = 0;
  }

  private spawn(spec: WaveSpec): void {
    const rows = TARGET_Z.slice(0, spec.params.rows);
    const items: WaveEntry[] = [];
    for (const e of spec.entries) for (let i = 0; i < e.count; i++) items.push(e);

    // Bucket every target into (row, group) so each track can be laid out.
    const buckets = new Map<string, WaveEntry[]>();
    const groupCounters: Record<Group, number> = { back: 0, front: 0, floor: 0, bonus: 0 };
    for (const item of items) {
      const group = groupOf(item.kind);
      const row = group === "bonus" ? 0 : groupCounters[group]++ % rows.length;
      const key = `${row}:${group}`;
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    }

    // Shuffle each bucket deterministically so kinds interleave along a track.
    const random = rng(spec.number * 7919);
    for (const list of buckets.values()) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    }

    for (const [key, list] of buckets) {
      const [rowStr, group] = key.split(":") as [string, Group];
      const z = rows[Number(rowStr)];
      const n = list.length;
      const slot = (FIELD_HALF * 2) / n;
      list.forEach((item, i) => {
        const centre = -FIELD_HALF + slot * (i + 0.5);
        let x = centre;
        let tz = z;
        let range: number | undefined;
        if (group === "front") {
          tz = z + FRONT_TRACK_OFFSET;
          range = Math.min(2.4, Math.max(0.2, slot / 2 - 0.42));
        } else if (group === "floor") {
          tz = z + FLOOR_OFFSET;
          x += (((i * 7) % 5) - 2) * Math.min(0.12, slot * 0.05);
        } else if (group === "bonus") {
          tz = rows[0] + FRONT_TRACK_OFFSET;
          x = (i % 2 === 0 ? -1 : 1) * 1.5;
        } else {
          x += (((i * 3) % 5) - 2) * Math.min(0.1, slot * 0.04);
        }
        const target = new Target({
          kind: item.kind,
          x,
          z: tz,
          hp: item.hp,
          points: item.points,
          speed: item.speed,
          popupUp: item.popupUp,
          popupDown: item.popupDown,
          range,
        });
        this.targets.push(target);
        this.scene.add(target.group);
      });
    }

    this.remaining = this.targets.filter((t) => t.required).length;
  }
}
