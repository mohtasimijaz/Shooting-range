import * as THREE from "three";

/**
 * Procedural canvas textures (no image downloads).
 * Every texture is generated once and cached, so materials can share them.
 * A seeded random generator keeps the look identical on every load.
 */

const cache = new Map<string, THREE.CanvasTexture>();

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TexOptions {
  repeat?: [number, number];
  /** Colour textures are sRGB; data textures (roughness, alpha) are linear. */
  srgb?: boolean;
  anisotropy?: number;
}

export function canvasTexture(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  options: TexOptions = {},
): THREE.CanvasTexture {
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  if (options.repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(options.repeat[0], options.repeat[1]);
  }
  tex.colorSpace = options.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = options.anisotropy ?? 4;
  cache.set(key, tex);
  return tex;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, colors: string[], maxSize: number, seed: number): void {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = 0.5 + r() * maxSize;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
}

function blotches(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, rgb: string, maxR: number, maxA: number, seed: number): void {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * w;
    const y = r() * h;
    const radius = 8 + r() * maxR;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(${rgb},${(r() * maxA).toFixed(3)})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

// ---------------------------------------------------------------------------
// Hall surfaces
// ---------------------------------------------------------------------------

export function concreteTexture(): THREE.CanvasTexture {
  return canvasTexture("concrete", 512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#77746e";
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 90, "40,38,34", 70, 0.22, 11);
    blotches(ctx, w, h, 60, "160,156,148", 60, 0.16, 12);
    speckle(ctx, w, h, 5000, ["#5f5c57", "#8c8981", "#6a6761", "#9a978f"], 1.6, 13);
    // Hairline cracks.
    const r = rng(14);
    ctx.strokeStyle = "rgba(35,33,30,0.45)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      let x = r() * w;
      let y = r() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 8; j++) {
        x += (r() - 0.5) * 40;
        y += (r() - 0.5) * 40;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Expansion joint along one edge so the tiling reads as poured slabs.
    ctx.fillStyle = "rgba(30,28,26,0.55)";
    ctx.fillRect(0, 0, w, 3);
    ctx.fillRect(0, 0, 3, h);
  }, { repeat: [4, 6] });
}

export function acousticTexture(): THREE.CanvasTexture {
  return canvasTexture("acoustic", 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#3b4047";
    ctx.fillRect(0, 0, w, h);
    // Vertical foam ribs with soft shading.
    const ribs = 8;
    const rw = w / ribs;
    for (let i = 0; i < ribs; i++) {
      const g = ctx.createLinearGradient(i * rw, 0, (i + 1) * rw, 0);
      g.addColorStop(0, "#2a2e34");
      g.addColorStop(0.45, "#4c525a");
      g.addColorStop(1, "#2a2e34");
      ctx.fillStyle = g;
      ctx.fillRect(i * rw, 0, rw, h);
    }
    speckle(ctx, w, h, 2500, ["rgba(0,0,0,0.25)", "rgba(255,255,255,0.06)"], 1.4, 21);
    // Panel seam.
    ctx.fillStyle = "#1c1f23";
    ctx.fillRect(0, h - 4, w, 4);
    ctx.fillRect(w - 3, 0, 3, h);
  }, { repeat: [10, 2] });
}

export function rubberTexture(): THREE.CanvasTexture {
  return canvasTexture("rubber", 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#1d1d1f";
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 3500, ["#2a2a2d", "#151517", "#333337"], 3, 31);
  }, { repeat: [6, 2] });
}

export function steelPlateTexture(): THREE.CanvasTexture {
  return canvasTexture("steelplate", 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#5d6168";
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 40, "90,70,50", 40, 0.25, 41);
    speckle(ctx, w, h, 2500, ["#6b7078", "#50545a", "#777c84"], 1.4, 42);
    ctx.fillStyle = "#3a3d42";
    ctx.fillRect(0, 0, w, 4);
    ctx.fillStyle = "#8a8f97";
    for (const x of [14, w - 14]) {
      for (let y = 20; y < h; y += 46) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, { repeat: [6, 1] });
}

export function woodTexture(key: string, base: string, dark: string, repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  return canvasTexture(`wood-${key}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const r = rng(base.length * 97 + dark.length);
    ctx.strokeStyle = dark;
    for (let i = 0; i < 48; i++) {
      ctx.globalAlpha = 0.15 + r() * 0.35;
      ctx.lineWidth = 0.6 + r() * 1.8;
      const y0 = r() * h;
      const amp = 2 + r() * 6;
      const freq = 0.01 + r() * 0.03;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = y0 + Math.sin(x * freq + i) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, { repeat });
}

export function stippleTexture(): THREE.CanvasTexture {
  return canvasTexture("stipple", 64, 64, (ctx, w, h) => {
    ctx.fillStyle = "#b9b9b9";
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 260, ["#6a6a6a", "#6a6a6a", "#e6e6e6"], 1.5, 51);
  }, { repeat: [110, 110] });
}

/** Grayscale noise used as a roughness map on metal. */
export function metalRoughnessTexture(): THREE.CanvasTexture {
  return canvasTexture("metal-rough", 128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#8a8a8a";
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 3000, ["#6e6e6e", "#a8a8a8", "#7d7d7d"], 1.2, 61);
    // Fine brushing streaks.
    const r = rng(62);
    ctx.strokeStyle = "rgba(200,200,200,0.15)";
    for (let i = 0; i < 60; i++) {
      const y = r() * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + (r() - 0.5) * 3);
      ctx.stroke();
    }
  }, { repeat: [3, 3], srgb: false });
}

export function signTexture(key: string, lines: string[], bg: string, fg: string, accent?: string): THREE.CanvasTexture {
  return canvasTexture(`sign-${key}`, 512, 256, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (accent) {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, w, 36);
      ctx.fillRect(0, h - 14, w, 14);
    }
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const size = lines.length > 2 ? 46 : 60;
    ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (size + 8) + 8);
    });
  });
}

export function laneNumberTexture(n: number): THREE.CanvasTexture {
  return canvasTexture(`lane-${n}`, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#e3b13c";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#16171a";
    ctx.fillRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = "#f2efe6";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '900 76px Impact, "Arial Black", sans-serif';
    ctx.fillText(String(n), w / 2, h / 2 + 4);
  });
}

// ---------------------------------------------------------------------------
// Target faces. Zones are in metres relative to the zone centre (cx, cy in UV).
// ---------------------------------------------------------------------------

export type FaceId = "bullseye" | "silhouette" | "civilian" | "bonus";

export interface FaceInfo {
  width: number;
  height: number;
  /** UV of the scoring centre. */
  cx: number;
  cy: number;
  /** Radius of the X ring in metres. */
  xRadius: number;
  /** Radius of the inner (10/9) zone in metres. */
  innerRadius: number;
  /** UV v above which a hit counts as a head shot (silhouettes). */
  headV?: number;
}

export const FACES: Record<FaceId, FaceInfo> = {
  bullseye: { width: 0.62, height: 0.8, cx: 0.5, cy: 0.56, xRadius: 0.016, innerRadius: 0.055 },
  silhouette: { width: 0.6, height: 0.95, cx: 0.5, cy: 0.55, xRadius: 0.04, innerRadius: 0.1, headV: 0.78 },
  civilian: { width: 0.6, height: 0.95, cx: 0.5, cy: 0.55, xRadius: 0, innerRadius: 0 },
  bonus: { width: 0.36, height: 0.36, cx: 0.5, cy: 0.5, xRadius: 0.04, innerRadius: 0.09 },
};

const PX_PER_M = 820;

export function faceTexture(id: FaceId): THREE.CanvasTexture {
  const info = FACES[id];
  const w = Math.round(info.width * PX_PER_M);
  const h = Math.round(info.height * PX_PER_M);
  return canvasTexture(`face-${id}`, w, h, (ctx) => {
    const cx = info.cx * w;
    const cy = (1 - info.cy) * h;
    if (id === "bullseye") drawBullseye(ctx, w, h, cx, cy);
    else if (id === "silhouette") drawSilhouette(ctx, w, h, cx, cy);
    else if (id === "civilian") drawCivilian(ctx, w, h);
    else drawBonus(ctx, w, h);
  }, { anisotropy: 8 });
}

function paperBase(ctx: CanvasRenderingContext2D, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 1400, ["rgba(0,0,0,0.04)", "rgba(255,255,255,0.08)"], 1.2, 71);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
}

function drawBullseye(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number): void {
  paperBase(ctx, w, h, "#f1ece0");
  const ring = 0.026 * PX_PER_M;
  for (let i = 10; i >= 1; i--) {
    const r = i * ring;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = i <= 6 ? "#141414" : "#f1ece0";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = i <= 6 ? "#f1ece0" : "#141414";
    ctx.stroke();
  }
  // X ring.
  ctx.beginPath();
  ctx.arc(cx, cy, ring * 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = "#f1ece0";
  ctx.stroke();
  ctx.font = "bold 15px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 1; i <= 9; i++) {
    const value = 10 - i;
    const r = (i + 0.5) * ring;
    ctx.fillStyle = i <= 5 ? "#f1ece0" : "#141414";
    ctx.fillText(String(value), cx + r, cy);
    ctx.fillText(String(value), cx - r, cy);
  }
  ctx.fillStyle = "#c0392b";
  ctx.font = "bold 22px Arial, sans-serif";
  ctx.fillText("25 M PISTOL", w / 2, h - 26);
}

function silhouettePath(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const headR = 0.085 * PX_PER_M;
  const headY = h * 0.15;
  ctx.beginPath();
  ctx.arc(w / 2, headY, headR, 0, Math.PI * 2);
  ctx.moveTo(w / 2 - 0.06 * PX_PER_M, headY + headR * 0.85);
  ctx.lineTo(w / 2 + 0.06 * PX_PER_M, headY + headR * 0.85);
  ctx.lineTo(w / 2 + 0.07 * PX_PER_M, headY + headR * 1.35);
  ctx.quadraticCurveTo(w * 0.9, headY + headR * 1.5, w * 0.94, h * 0.42);
  ctx.lineTo(w * 0.97, h * 0.98);
  ctx.lineTo(w * 0.03, h * 0.98);
  ctx.lineTo(w * 0.06, h * 0.42);
  ctx.quadraticCurveTo(w * 0.1, headY + headR * 1.5, w / 2 - 0.07 * PX_PER_M, headY + headR * 1.35);
  ctx.closePath();
}

function drawSilhouette(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number): void {
  paperBase(ctx, w, h, "#e9e4d6");
  silhouettePath(ctx, w, h);
  ctx.fillStyle = "#1d2733";
  ctx.fill();
  ctx.strokeStyle = "rgba(240,236,226,0.8)";
  ctx.lineWidth = 2;
  const rings = [0.04, 0.1, 0.16, 0.22, 0.28];
  for (const r of rings) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * PX_PER_M * 0.82, r * PX_PER_M * 1.15, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(240,236,226,0.85)";
  ctx.font = "bold 18px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("X", cx, cy);
  ["10", "9", "8", "7"].forEach((label, i) => {
    ctx.fillText(label, cx, cy - (rings[i] + 0.03) * PX_PER_M * 1.15);
  });
}

function drawCivilian(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  paperBase(ctx, w, h, "#eef2f5");
  ctx.fillStyle = "#9cb6c9";
  silhouettePath(ctx, w, h);
  ctx.fill();
  // Raised open hands.
  ctx.fillStyle = "#d9b38c";
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(w / 2 + side * w * 0.36, h * 0.12);
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.035 * PX_PER_M, 0.05 * PX_PER_M, side * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#9cb6c9";
    ctx.lineWidth = 0.05 * PX_PER_M;
    ctx.beginPath();
    ctx.moveTo(w / 2 + side * w * 0.28, h * 0.42);
    ctx.lineTo(w / 2 + side * w * 0.36, h * 0.17);
    ctx.stroke();
  }
  ctx.fillStyle = "#c62828";
  ctx.fillRect(0, h * 0.5, w, h * 0.13);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '900 54px Impact, "Arial Black", sans-serif';
  ctx.fillText("NO SHOOT", w / 2, h * 0.565);
}

function drawBonus(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const r = w / 2 - 3;
  const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.2, w / 2, h / 2, r);
  g.addColorStop(0, "#ffd15c");
  g.addColorStop(1, "#f08a12");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#fff4d6";
  ctx.stroke();
  ctx.fillStyle = "#3a1d00";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '900 92px Impact, "Arial Black", sans-serif';
  ctx.fillText("+3s", w / 2, h / 2 + 6);
}

export function cardboardTexture(): THREE.CanvasTexture {
  return canvasTexture("cardboard", 128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#a88a62";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(80,60,35,0.35)";
    for (let x = 0; x < w; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  });
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export function bulletHoleTexture(): THREE.CanvasTexture {
  return canvasTexture("bullet-hole", 64, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    g.addColorStop(0, "rgba(5,5,5,1)");
    g.addColorStop(0.22, "rgba(10,10,10,1)");
    g.addColorStop(0.32, "rgba(60,55,50,0.85)");
    g.addColorStop(0.6, "rgba(40,36,32,0.25)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Torn edge flecks.
    const r = rng(81);
    ctx.fillStyle = "rgba(15,15,15,0.8)";
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2;
      const d = w * (0.12 + r() * 0.12);
      ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 2);
    }
  });
}

export function muzzleFlashTexture(): THREE.CanvasTexture {
  return canvasTexture("muzzle-flash", 128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    ctx.globalCompositeOperation = "lighter";
    const r = rng(91);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.3;
      const len = w * (0.25 + r() * 0.25);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, "rgba(255,240,200,0.95)");
      g.addColorStop(0.5, "rgba(255,170,60,0.6)");
      g.addColorStop(1, "rgba(255,120,20,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -w * 0.03);
      ctx.lineTo(len, 0);
      ctx.lineTo(0, w * 0.03);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.22);
    core.addColorStop(0, "rgba(255,255,240,1)");
    core.addColorStop(0.5, "rgba(255,200,110,0.7)");
    core.addColorStop(1, "rgba(255,140,40,0)");
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, w, h);
  });
}
