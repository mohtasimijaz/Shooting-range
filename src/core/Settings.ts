import { defaultLayout, sanitizeLayout, type TouchLayout } from "../input/Layout";
import type { QualitySetting } from "./Device";

/**
 * Player preferences and progress, persisted in localStorage.
 * Every storage access is wrapped: private mode or blocked storage simply
 * falls back to defaults instead of breaking the game.
 */

export interface SettingsData {
  /** Look sensitivity multiplier (1 = default). */
  sensitivity: number;
  /** Master volume 0..1. */
  volume: number;
  quality: QualitySetting;
  /** Slows aim slightly while the crosshair is over a target (touch only). */
  aimAssist: boolean;
  bestScore: number;
  bestWave: number;
  /** Highest checkpoint wave unlocked (1, 11, 21, 31 or 41). */
  checkpoint: number;
  /** Custom positions / sizes of the on-screen touch controls. */
  touchLayout: TouchLayout;
}

const KEY = "range.settings.v2";

const DEFAULTS: SettingsData = {
  sensitivity: 1,
  volume: 0.8,
  quality: "auto",
  aimAssist: true,
  bestScore: 0,
  bestWave: 0,
  checkpoint: 1,
  touchLayout: defaultLayout(),
};

const QUALITIES: QualitySetting[] = ["auto", "low", "medium", "high"];

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export class Settings {
  data: SettingsData = { ...DEFAULTS, touchLayout: defaultLayout() };

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SettingsData>;
      this.data = {
        sensitivity: clamp(parsed.sensitivity, 0.3, 2.5, DEFAULTS.sensitivity),
        volume: clamp(parsed.volume, 0, 1, DEFAULTS.volume),
        quality: QUALITIES.includes(parsed.quality as QualitySetting)
          ? (parsed.quality as QualitySetting)
          : DEFAULTS.quality,
        aimAssist: typeof parsed.aimAssist === "boolean" ? parsed.aimAssist : DEFAULTS.aimAssist,
        bestScore: clamp(parsed.bestScore, 0, Number.MAX_SAFE_INTEGER, 0),
        bestWave: clamp(parsed.bestWave, 0, 50, 0),
        checkpoint: clamp(parsed.checkpoint, 1, 41, 1),
        touchLayout: sanitizeLayout(parsed.touchLayout),
      };
    } catch {
      this.data = { ...DEFAULTS, touchLayout: defaultLayout() };
    }
  }

  save(): void {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Storage unavailable: settings last for this session only.
    }
  }

  update(patch: Partial<SettingsData>): void {
    this.data = { ...this.data, ...patch };
    this.save();
  }

  /** Records a finished run. Returns true when it is a new best score. */
  recordRun(score: number, wave: number): boolean {
    const isBest = score > this.data.bestScore;
    this.update({
      bestScore: Math.max(this.data.bestScore, score),
      bestWave: Math.max(this.data.bestWave, wave),
    });
    return isBest;
  }

  unlockCheckpoint(wave: number): boolean {
    if (wave <= this.data.checkpoint) return false;
    this.update({ checkpoint: wave });
    return true;
  }
}