/**
 * Device detection and graphics quality profiles.
 *
 * Touch devices get on-screen controls instead of pointer lock, and a lighter
 * rendering profile. `?touch=1` / `?touch=0` in the URL forces the mode, which
 * is handy for testing touch controls on a desktop browser.
 */

export type QualityLevel = "low" | "medium" | "high";
export type QualitySetting = "auto" | QualityLevel;

export interface QualityProfile {
  level: QualityLevel;
  /** Upper bound for the renderer pixel ratio. */
  maxPixelRatio: number;
  /** Lower bound the adaptive resolution may drop to. */
  minPixelRatio: number;
  antialias: boolean;
  /** Number of shadow-casting key lights (0 disables shadows). */
  shadowLights: number;
  shadowMapSize: number;
  bloom: boolean;
  /** Extra non-shadow fill lights in the hall. */
  fillLights: boolean;
  casingPool: number;
  particlePool: number;
}

const PROFILES: Record<QualityLevel, QualityProfile> = {
  low: {
    level: "low",
    maxPixelRatio: 1.25,
    minPixelRatio: 0.7,
    antialias: false,
    shadowLights: 0,
    shadowMapSize: 512,
    bloom: false,
    fillLights: false,
    casingPool: 16,
    particlePool: 220,
  },
  medium: {
    level: "medium",
    maxPixelRatio: 1.6,
    minPixelRatio: 0.8,
    antialias: true,
    shadowLights: 1,
    shadowMapSize: 1024,
    bloom: false,
    fillLights: true,
    casingPool: 28,
    particlePool: 360,
  },
  high: {
    level: "high",
    maxPixelRatio: 2,
    minPixelRatio: 1,
    antialias: true,
    shadowLights: 2,
    shadowMapSize: 1024,
    bloom: true,
    fillLights: true,
    casingPool: 40,
    particlePool: 520,
  },
};

function queryFlag(name: string): boolean | null {
  try {
    const value = new URLSearchParams(window.location.search).get(name);
    if (value === "1" || value === "true") return true;
    if (value === "0" || value === "false") return false;
  } catch {
    // Ignore malformed URLs.
  }
  return null;
}

function media(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** True on phones and tablets (primary input is a finger, no hover). */
export const IS_TOUCH: boolean = (() => {
  const forced = queryFlag("touch");
  if (forced !== null) return forced;
  const coarse = media("(pointer: coarse)") && media("(hover: none)");
  return coarse || (navigator.maxTouchPoints > 1 && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
})();

/** iPadOS reports itself as a Mac; treat any touch Mac as iOS. */
export const IS_IOS: boolean =
  /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** Picks a quality level for this device when the setting is "auto". */
export function detectQuality(): QualityLevel {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = navigator.hardwareConcurrency || 4;
  const memory = nav.deviceMemory ?? 4;
  if (IS_TOUCH) {
    return cores >= 8 && memory >= 6 ? "medium" : "low";
  }
  return cores <= 2 ? "medium" : "high";
}

export function qualityProfile(setting: QualitySetting): QualityProfile {
  const level = setting === "auto" ? detectQuality() : setting;
  return { ...PROFILES[level] };
}

export function supportsPointerLock(): boolean {
  return !IS_TOUCH && typeof HTMLElement.prototype.requestPointerLock === "function";
}
