export class HUD {
  private hud = el("hud");
  private menu = el("menu");
  private pause = el("pause");
  private end = el("end");
  private countdown = el("countdown");
  private crosshair = el("crosshair");
  private wave = el("hud-wave");
  private time = el("hud-time");
  private score = el("hud-score");
  private combo = el("hud-combo");
  private comboWrap = el("hud-combo-wrap");
  private gun = el("hud-gun");
  private ammo = el("hud-ammo");
  private endTitle = el("end-title");
  private endScore = el("end-score");

  showMenu(): void {
    this.hideAll();
    this.menu.classList.remove("hidden");
  }

  showCountdown(n: number): void {
    this.hideAll();
    this.countdown.classList.remove("hidden");
    this.countdown.textContent = n > 0 ? String(n) : "GO";
    this.crosshair.classList.remove("hidden");
  }

  showPlaying(): void {
    this.hideAll();
    this.hud.classList.remove("hidden");
    this.crosshair.classList.remove("hidden");
  }

  showPause(): void {
    this.pause.classList.remove("hidden");
    this.crosshair.classList.add("hidden");
  }

  hidePause(): void {
    this.pause.classList.add("hidden");
    this.crosshair.classList.remove("hidden");
  }

  showEnd(win: boolean, score: number): void {
    this.hideAll();
    this.end.classList.remove("hidden");
    this.endTitle.textContent = win ? "Range Clear" : "Game Over";
    this.endScore.textContent = `Score ${score}`;
  }

  update(data: {
    wave: number;
    totalWaves: number;
    time: number;
    score: number;
    combo: number;
    gun: string;
    mag: number;
    reserve: number;
    reloading: boolean;
  }): void {
    this.wave.textContent = `${data.wave}/${data.totalWaves}`;
    this.time.textContent = String(Math.max(0, Math.ceil(data.time)));
    this.score.textContent = String(data.score);
    if (data.combo > 1) {
      this.comboWrap.classList.remove("hidden");
      this.combo.textContent = `x${data.combo}`;
    } else {
      this.comboWrap.classList.add("hidden");
    }
    this.gun.textContent = data.reloading ? `${data.gun} · RELOAD` : data.gun;
    this.ammo.textContent = `${data.mag} / ${data.reserve}`;
  }

  onPlay(fn: () => void): void {
    el("btn-play").addEventListener("click", fn);
  }

  onRestart(fn: () => void): void {
    el("btn-restart").addEventListener("click", fn);
  }

  onResume(fn: () => void): void {
    el("btn-resume").addEventListener("click", fn);
  }

  private hideAll(): void {
    this.hud.classList.add("hidden");
    this.menu.classList.add("hidden");
    this.pause.classList.add("hidden");
    this.end.classList.add("hidden");
    this.countdown.classList.add("hidden");
    this.crosshair.classList.add("hidden");
  }
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node;
}
