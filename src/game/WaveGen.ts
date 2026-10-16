/**
 * Procedural 50-wave campaign. Pure data, no three.js, so it is unit tested.
 *
 * Five tiers of ten waves. Base difficulty parameters (target count, HP,
 * movement speed, pop-up exposure, distance rows) only ever get harder from
 * one wave to the next. Each wave in a tier has a theme that changes the mix
 * of target types, and every 10th wave is a boss "Gauntlet" with extra targets.
 * Generation is deterministic: wave N is always the same.
 */

export type TargetKind =
  | "static"
  | "mover"
  | "zigzag"
  | "popup"
  | "swinger"
  | "steel"
  | "civilian"
  | "bonus";

export const TOTAL_WAVES = 50;
export const CHECKPOINTS = [1, 11, 21, 31, 41];
export const TIER_NAMES = ["Recruit", "Marksman", "Sharpshooter", "Elite", "Legend"];
export const START_TIME = 60;

/** First wave in which each target type can appear. */
export const UNLOCK_WAVE: Record<TargetKind, number> = {
  static: 1,
  mover: 2,
  popup: 3,
  zigzag: 11,
  steel: 21,
  civilian: 21,
  swinger: 31,
  bonus: 31,
};

export interface WaveEntry {
  kind: TargetKind;
  count: number;
  hp: number;
  points: number;
  speed?: number;
  popupUp?: number;
  popupDown?: number;
}

export interface WaveParams {
  /** Required targets before the boss bonus. */
  count: number;
  maxHp: number;
  speed: number;
  /** Seconds a pop-up target stays up. */
  exposure: number;
  /** Seconds a pop-up target stays down. */
  hidden: number;
  /** Number of distance rows in use (1 = nearest only). */
  rows: number;
}

export interface WaveSpec {
  number: number;
  name: string;
  tier: number;
  tierName: string;
  boss: boolean;
  params: WaveParams;
  entries: WaveEntry[];
  /** Targets that must be destroyed to clear the wave. */
  requiredCount: number;
  /** Seconds added to the clock when this wave starts. */
  timeBonus: number;
}

type Weights = Partial<Record<TargetKind, number>>;

interface Theme {
  name: string;
  weights: Weights;
  /** Optional fallback name/weights while the theme's main type is locked. */
  fallback?: { name: string; weights: Weights; until: number };
  speed?: number;
  exposure?: number;
  hpBonus?: number;
}

const THEMES: Theme[] = [
  { name: "Paper Line", weights: { static: 4, mover: 1, steel: 1 } },
  { name: "Sliders", weights: { mover: 4, static: 1, zigzag: 1 } },
  { name: "Pop-Up", weights: { popup: 4, static: 1 } },
  { name: "Mixed Bag", weights: { static: 1, mover: 1, popup: 1, zigzag: 1, steel: 1, swinger: 1 } },
  { name: "Fast Lane", weights: { mover: 3, zigzag: 2, popup: 1 }, speed: 1.15 },
  { name: "Quick Draw", weights: { popup: 4, mover: 1 }, exposure: 0.85 },
  { name: "Armor Up", weights: { static: 2, mover: 2, steel: 3 }, hpBonus: 1 },
  {
    name: "Zig-Zag",
    weights: { zigzag: 4, static: 1, popup: 1 },
    fallback: { name: "Crossfire", weights: { mover: 3, static: 2 }, until: UNLOCK_WAVE.zigzag },
  },
  {
    name: "Swing Set",
    weights: { swinger: 3, mover: 1, popup: 1, zigzag: 1 },
    fallback: { name: "Rapid Fire", weights: { popup: 2, mover: 2 }, until: UNLOCK_WAVE.swinger },
  },
  { name: "Gauntlet", weights: { static: 1, mover: 2, popup: 2, zigzag: 2, steel: 1, swinger: 1 } },
];

const BASE_POINTS: Record<TargetKind, number> = {
  static: 100,
  mover: 150,
  zigzag: 200,
  popup: 200,
  swinger: 220,
  steel: 250,
  civilian: 0,
  bonus: 300,
};

function clampWave(n: number): number {
  return Math.min(TOTAL_WAVES, Math.max(1, Math.floor(n)));
}

/** 0 at wave 1, 1 at wave 50. */
export function difficulty(n: number): number {
  return (clampWave(n) - 1) / (TOTAL_WAVES - 1);
}

export function tierOf(n: number): number {
  return Math.floor((clampWave(n) - 1) / 10);
}

export function waveParams(n: number): WaveParams {
  const w = clampWave(n);
  const d = difficulty(w);
  return {
    count: 6 + Math.floor(d * 10 + 1e-9),
    maxHp: Math.min(4, 1 + Math.floor(d * 3.6 + 1e-9)),
    speed: round2(1 + d * 1.8),
    exposure: round2(1.8 - d * 1.1),
    hidden: round2(1.1 - d * 0.4),
    rows: w <= 10 ? 1 : w <= 20 ? 2 : 3,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function unlocked(kind: TargetKind, n: number): boolean {
  return n >= UNLOCK_WAVE[kind];
}

/** Splits `total` across weighted kinds (largest remainder, deterministic). */
function allocate(total: number, weights: Weights, n: number): [TargetKind, number][] {
  const kinds = (Object.keys(weights) as TargetKind[]).filter((k) => unlocked(k, n) && (weights[k] ?? 0) > 0);
  if (kinds.length === 0) kinds.push("static");
  const sum = kinds.reduce((s, k) => s + (weights[k] ?? 1), 0);
  const raw = kinds.map((k) => (total * (weights[k] ?? 1)) / sum);
  const counts = raw.map(Math.floor);
  let left = total - counts.reduce((s, c) => s + c, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    counts[i] += 1;
    left -= 1;
  }
  return kinds.map((k, i) => [k, counts[i]] as [TargetKind, number]).filter(([, c]) => c > 0);
}

function hpFor(kind: TargetKind, maxHp: number, bonus: number): number {
  let hp: number;
  switch (kind) {
    case "static":
      hp = maxHp - 1;
      break;
    case "popup":
      hp = maxHp - 2;
      break;
    case "steel":
      hp = maxHp + 1;
      break;
    case "civilian":
    case "bonus":
      return 1;
    default:
      hp = maxHp;
  }
  return Math.min(5, Math.max(1, hp + bonus));
}

function pointsFor(kind: TargetKind, hp: number, d: number): number {
  const raw = BASE_POINTS[kind] * (1 + d * 1.5) * (1 + (hp - 1) * 0.25);
  return Math.round(raw / 10) * 10;
}

export function generateWave(n: number): WaveSpec {
  const number = clampWave(n);
  const d = difficulty(number);
  const params = waveParams(number);
  const tier = tierOf(number);
  const themeIndex = (number - 1) % 10;
  const boss = themeIndex === 9;
  const theme = THEMES[themeIndex];
  const useFallback = theme.fallback !== undefined && number < theme.fallback.until;
  const name = useFallback && theme.fallback ? theme.fallback.name : theme.name;
  const weights = useFallback && theme.fallback ? theme.fallback.weights : theme.weights;

  const required = params.count + (boss ? 2 : 0);
  const speed = round2(params.speed * (theme.speed ?? 1));
  const exposure = round2(params.exposure * (theme.exposure ?? 1));

  const entries: WaveEntry[] = allocate(required, weights, number).map(([kind, count]) => {
    const hp = hpFor(kind, params.maxHp, theme.hpBonus ?? 0);
    const entry: WaveEntry = { kind, count, hp, points: pointsFor(kind, hp, d) };
    if (kind === "mover" || kind === "zigzag" || kind === "swinger") entry.speed = speed;
    if (kind === "popup") {
      entry.popupUp = exposure;
      entry.popupDown = params.hidden;
    }
    return entry;
  });

  if (unlocked("civilian", number)) {
    entries.push({ kind: "civilian", count: 1 + Math.floor((number - UNLOCK_WAVE.civilian) / 10), hp: 1, points: 0 });
  }
  if (unlocked("bonus", number)) {
    entries.push({ kind: "bonus", count: boss ? 2 : 1, hp: 1, points: pointsFor("bonus", 1, d), speed });
  }

  return {
    number,
    name,
    tier,
    tierName: TIER_NAMES[tier],
    boss,
    params,
    entries,
    requiredCount: required,
    timeBonus: Math.round(required * (2.4 - d * 0.9)) + (boss ? 5 : 0),
  };
}

/** The checkpoint a run reaching `wave` unlocks (1 if none). */
export function checkpointFor(wave: number): number {
  let best = 1;
  for (const c of CHECKPOINTS) if (wave >= c) best = c;
  return best;
}
