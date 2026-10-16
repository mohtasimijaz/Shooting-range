import type { QualitySetting } from "../core/Device";
import type { SettingsData } from "../core/Settings";
import { WEAPONS, type FireMode, type WeaponDef } from "../game/Weapon";

/**
 * All DOM UI: HUD, crosshair, hit markers, score popups, banners, menus,
 * settings, pause and end screens.
 *
 * Per-frame updates only touch the DOM when a value actually changes, which
 * keeps layout work negligible even on phones.
 */

export interface HudState {
  wave: number;
  totalWaves: number;
  tierName: string;
  remaining: number;
  required: number;
  time: number;
  score: number;
  combo: number;
  multiplier: number;
  comboLeft: number;
  weaponIndex: number;
  weapon: WeaponDef;
  mode: FireMode;
  mag: number;
  reserve: number;
  reloadProgress: number;
}

export interface EndStats {
  win: boolean;
  score: number;
  wave: number;
  kills: number;
  accuracy: number;
  bestCombo: number;
  bullseyes: number;
  newBest: boolean;
  checkpoint: number;
}

export type PopupKind = "normal" | "gold" | "bad" | "good";
export type ToastKind = "bad" | "good" | "info";

type Screen = "main" | "weapons" | "settings" | "help";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
}

function restartAnimation(node: HTMLElement, cls: string): void {
  node.classList.remove(cls);
  void node.offsetWidth; // reflow so the animation restarts
  node.classList.add(cls);
}

export class HUD {
  private readonly hud = el("hud");
  private readonly menu = el("menu");
  private readonly pause = el("pause");
  private readonly end = el("end");
  private readonly countdown = el("countdown");
  private readonly crosshair = el("crosshair");
  private readonly hitmarker = el("hitmarker");
  private readonly lowTime = el("low-time");
  private readonly banner = el("banner");
  private readonly toastEl = el("toast");

  private readonly score = el("hud-score");
  private readonly comboWrap = el("hud-combo");
  private readonly mult = el("hud-mult");
  private readonly comboFill = el("hud-combo-fill");
  private readonly wave = el("hud-wave");
  private readonly tier = el("hud-tier");
  private readonly waveFill = el("hud-wave-fill");
  private readonly left = el("hud-left");
  private readonly timePanel = el("hud-time-panel");
  private readonly time = el("hud-time");
  private readonly gun = el("hud-gun");
  private readonly mode = el("hud-mode");
  private readonly tMode = el("t-mode-label");
  private readonly mag = el("hud-mag");
  private readonly reserve = el("hud-reserve");
  private readonly bullets = el("hud-bullets");
  private readonly reload = el("hud-reload");
  private readonly reloadFill = el("hud-reload-fill");
  private readonly slots = Array.from(document.querySelectorAll<HTMLElement>("#weapon-slots .slot"));

  private readonly popups: HTMLDivElement[] = [];
  private popupNext = 0;
  private bulletIcons: HTMLElement[] = [];
  private last = new Map<string, string | number | boolean>();
  private screen: Screen = "main";
  private settingsReturn: "menu" | "pause" = "menu";

  private settingsHandler: ((patch: Partial<SettingsData>) => void) | null = null;

  constructor() {
    const host = el("popups");
    for (let i = 0; i < 10; i++) {
      const div = document.createElement("div");
      div.className = "popup";
      host.appendChild(div);
      this.popups.push(div);
    }

    for (const button of Array.from(document.querySelectorAll<HTMLElement>("[data-goto]"))) {
      button.addEventListener("click", () => this.showScreen(button.dataset.goto as Screen));
    }
    el("btn-settings-back").addEventListener("click", () => {
      if (this.settingsReturn === "pause") {
        this.menu.classList.add("hidden");
        this.pause.classList.remove("hidden");
      } else {
        this.showScreen("main");
      }
    });
    el("btn-pause-settings").addEventListener("click", () => {
      this.settingsReturn = "pause";
      this.pause.classList.add("hidden");
      this.menu.classList.remove("hidden");
      this.showScreen("settings", false);
    });

    this.buildWeaponCards();
    this.bindSettings();
  }

  // ----- Screens -----

  showMenu(best: number, bestWave: number, checkpoint: number): void {
    this.hideAll();
    this.settingsReturn = "menu";
    this.menu.classList.remove("hidden");
    this.showScreen("main");
    el("menu-best").innerHTML =
      best > 0 ? `Best score <b>${best.toLocaleString()}</b> · Best wave <b>${bestWave}</b>` : "";
    const cont = el("btn-continue");
    cont.classList.toggle("hidden", checkpoint <= 1);
    cont.textContent = `Continue · Wave ${checkpoint}`;
  }

  private showScreen(screen: Screen, resetReturn = true): void {
    if (resetReturn && screen === "settings") this.settingsReturn = "menu";
    this.screen = screen;
    for (const node of Array.from(this.menu.querySelectorAll<HTMLElement>(".screen"))) {
      node.classList.toggle("hidden", node.dataset.screen !== this.screen);
    }
  }

  showCountdown(n: number, sub: string): void {
    this.hideAll();
    this.countdown.classList.remove("hidden");
    this.hud.classList.remove("hidden");
    this.crosshair.classList.remove("hidden");
    const num = el("countdown-num");
    const text = n > 0 ? String(n) : "GO";
    if (num.textContent !== text) {
      num.textContent = text;
      restartAnimation(num, "tick");
    }
    el("countdown-sub").textContent = sub;
  }

  showPlaying(): void {
    this.hideAll();
    this.hud.classList.remove("hidden");
    this.crosshair.classList.remove("hidden");
  }

  showPause(message: string): void {
    this.menu.classList.add("hidden");
    this.pause.classList.remove("hidden");
    this.crosshair.classList.add("hidden");
    el("pause-msg").textContent = message;
  }

  setPauseMessage(message: string): void {
    el("pause-msg").textContent = message;
  }

  showEnd(stats: EndStats): void {
    this.hideAll();
    this.end.classList.remove("hidden");
    el("end-title").textContent = stats.win ? "Range Clear" : "Time Up";
    el("end-eyebrow").innerHTML = stats.win
      ? "<span></span>All 50 waves cleared<span></span>"
      : "<span></span>Run complete<span></span>";
    el("end-best").classList.toggle("hidden", !stats.newBest);
    el("st-score").textContent = stats.score.toLocaleString();
    el("st-wave").textContent = String(stats.wave);
    el("st-kills").textContent = String(stats.kills);
    el("st-acc").textContent = `${stats.accuracy}%`;
    el("st-combo").textContent = String(stats.bestCombo);
    el("st-bulls").textContent = String(stats.bullseyes);
    const cont = el("btn-end-continue");
    cont.classList.toggle("hidden", stats.checkpoint <= 1);
    cont.textContent = `Continue · Wave ${stats.checkpoint}`;
  }

  // ----- Per-frame HUD -----

  update(s: HudState): void {
    this.set("score", s.score, () => (this.score.textContent = s.score.toLocaleString()));
    this.set("wave", s.wave, () => (this.wave.textContent = String(s.wave)));
    this.set("tier", s.tierName, () => (this.tier.textContent = s.tierName));
    const cleared = s.required > 0 ? (s.required - s.remaining) / s.required : 0;
    this.set("waveFill", Math.round(cleared * 100), () => (this.waveFill.style.width = `${cleared * 100}%`));
    this.set("left", s.remaining, () => {
      this.left.textContent = s.remaining === 1 ? "1 target left" : `${s.remaining} targets left`;
    });

    const secs = Math.max(0, Math.ceil(s.time));
    this.set("time", secs, () => (this.time.textContent = String(secs)));
    const low = s.time <= 10;
    this.set("low", low, () => {
      this.timePanel.classList.toggle("low", low);
      this.lowTime.classList.toggle("on", low);
    });

    const comboOn = s.combo > 1;
    this.set("comboOn", comboOn, () => this.comboWrap.classList.toggle("on", comboOn));
    if (comboOn) {
      this.set("mult", s.multiplier, () => (this.mult.textContent = `x${s.multiplier.toFixed(2)}`));
      this.comboFill.style.width = `${Math.round(s.comboLeft * 100)}%`;
    }

    this.set("weapon", s.weapon.id, () => {
      this.gun.textContent = s.weapon.name;
      this.buildBullets(s.weapon);
      this.slots.forEach((slot, i) => slot.classList.toggle("active", i === s.weaponIndex));
    });
    this.set("mode", `${s.weapon.id}:${s.mode}`, () => {
      const label = s.mode === "auto" ? "AUTO" : s.weapon.cls === "pistol" ? "SEMI" : "SINGLE";
      this.mode.textContent = label;
      this.mode.classList.toggle("semi", s.mode !== "auto");
      this.tMode.textContent = label;
    });
    this.set("mag", `${s.weapon.id}:${s.mag}`, () => {
      this.mag.textContent = String(s.mag);
      this.mag.classList.toggle("empty", s.mag === 0);
      this.mag.classList.toggle("low", s.mag > 0 && s.mag <= Math.ceil(s.weapon.magSize * 0.25));
      this.bulletIcons.forEach((icon, i) => icon.classList.toggle("spent", i >= s.mag));
    });
    this.set("reserve", s.reserve, () => (this.reserve.textContent = String(s.reserve)));

    const reloading = s.reloadProgress > 0;
    this.set("reloading", reloading, () => this.reload.classList.toggle("hidden", !reloading));
    if (reloading) this.reloadFill.style.width = `${Math.round(s.reloadProgress * 100)}%`;
  }

  /** Crosshair gap in pixels (grows with weapon spread). */
  setSpread(gapPx: number, onTarget: boolean): void {
    const gap = Math.round(gapPx);
    this.set("gap", gap, () => this.crosshair.style.setProperty("--gap", `${gap}px`));
    this.set("onTarget", onTarget, () => this.crosshair.classList.toggle("on-target", onTarget));
  }

  hitMarker(kill: boolean): void {
    this.hitmarker.classList.toggle("kill", kill);
    restartAnimation(this.hitmarker, "show");
  }

  popup(x: number, y: number, text: string, kind: PopupKind = "normal"): void {
    const div = this.popups[this.popupNext];
    this.popupNext = (this.popupNext + 1) % this.popups.length;
    div.textContent = text;
    div.className = `popup ${kind === "normal" ? "" : kind}`;
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    restartAnimation(div, "show");
  }

  showBanner(title: string, sub = ""): void {
    el("banner-title").textContent = title;
    el("banner-sub").textContent = sub;
    restartAnimation(this.banner, "show");
  }

  toast(text: string, kind: ToastKind): void {
    this.toastEl.textContent = text;
    this.toastEl.className = kind;
    restartAnimation(this.toastEl, "show");
  }

  // ----- Settings -----

  onSettingsChange(fn: (patch: Partial<SettingsData>) => void): void {
    this.settingsHandler = fn;
  }

  loadSettings(data: SettingsData): void {
    const sens = el<HTMLInputElement>("set-sens");
    const vol = el<HTMLInputElement>("set-vol");
    sens.value = String(data.sensitivity);
    vol.value = String(data.volume);
    el<HTMLSelectElement>("set-quality").value = data.quality;
    el<HTMLInputElement>("set-assist").checked = data.aimAssist;
    el("out-sens").textContent = data.sensitivity.toFixed(2);
    el("out-vol").textContent = `${Math.round(data.volume * 100)}%`;
  }

  showQualityNote(show: boolean): void {
    el("quality-note").classList.toggle("hidden", !show);
  }

  private bindSettings(): void {
    const sens = el<HTMLInputElement>("set-sens");
    sens.addEventListener("input", () => {
      const v = Number(sens.value);
      el("out-sens").textContent = v.toFixed(2);
      this.settingsHandler?.({ sensitivity: v });
    });
    const vol = el<HTMLInputElement>("set-vol");
    vol.addEventListener("input", () => {
      const v = Number(vol.value);
      el("out-vol").textContent = `${Math.round(v * 100)}%`;
      this.settingsHandler?.({ volume: v });
    });
    const quality = el<HTMLSelectElement>("set-quality");
    quality.addEventListener("change", () => {
      this.settingsHandler?.({ quality: quality.value as QualitySetting });
    });
    const assist = el<HTMLInputElement>("set-assist");
    assist.addEventListener("change", () => this.settingsHandler?.({ aimAssist: assist.checked }));
  }

  // ----- Buttons -----

  onPlay(fn: () => void): void {
    el("btn-play").addEventListener("click", fn);
    el("btn-again").addEventListener("click", fn);
    el("btn-restart").addEventListener("click", fn);
  }

  onContinue(fn: () => void): void {
    el("btn-continue").addEventListener("click", fn);
    el("btn-end-continue").addEventListener("click", fn);
  }

  onCustomize(fn: () => void): void {
    el("btn-customize").addEventListener("click", fn);
  }

  onResume(fn: () => void): void {
    el("btn-resume").addEventListener("click", fn);
  }

  onQuit(fn: () => void): void {
    el("btn-quit").addEventListener("click", fn);
    el("btn-end-menu").addEventListener("click", fn);
  }

  // ----- Internals -----

  private set(key: string, value: string | number | boolean, apply: () => void): void {
    if (this.last.get(key) === value) return;
    this.last.set(key, value);
    apply();
  }

  /** Forces every HUD field to be rewritten on the next update. */
  invalidate(): void {
    this.last.clear();
  }

  private buildBullets(def: WeaponDef): void {
    this.bullets.replaceChildren();
    this.bullets.classList.toggle("rifle", def.cls === "rifle");
    this.bulletIcons = [];
    for (let i = 0; i < def.magSize; i++) {
      const icon = document.createElement("i");
      this.bullets.appendChild(icon);
      this.bulletIcons.push(icon);
    }
    this.last.delete("mag");
  }

  private buildWeaponCards(): void {
    const host = el("weapon-cards");
    const maxDamage = Math.max(...WEAPONS.map((w) => w.damage));
    const maxRate = Math.max(...WEAPONS.map((w) => 1 / w.fireInterval));
    const maxMag = Math.max(...WEAPONS.map((w) => w.magSize));
    const maxRecoil = Math.max(...WEAPONS.map((w) => w.recoil));
    for (const w of WEAPONS) {
      const card = document.createElement("div");
      card.className = "wcard";
      const stats: [string, number][] = [
        ["Damage", w.damage / maxDamage],
        ["Rate", 1 / w.fireInterval / maxRate],
        ["Mag", w.magSize / maxMag],
        ["Control", 1 - (w.recoil / maxRecoil) * 0.85],
      ];
      const rpm = Math.round(60 / w.fireInterval);
      card.innerHTML = `
        <h4>${w.name}<small>${w.caliber}</small></h4>
        <p>${w.label} · ${rpm} rpm</p>
        ${stats
          .map(([label, v]) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div></div>`)
          .join("")}
        <div class="modes">${w.modes.map((m) => (m === "auto" ? "AUTO" : w.cls === "pistol" ? "SEMI-AUTO" : "SINGLE")).join(" · ")}</div>`;
      host.appendChild(card);
    }
  }

  private hideAll(): void {
    this.hud.classList.add("hidden");
    this.menu.classList.add("hidden");
    this.pause.classList.add("hidden");
    this.end.classList.add("hidden");
    this.countdown.classList.add("hidden");
    this.crosshair.classList.add("hidden");
    this.lowTime.classList.remove("on");
    this.banner.classList.remove("show");
    this.toastEl.classList.remove("show");
    this.last.delete("low");
  }
}