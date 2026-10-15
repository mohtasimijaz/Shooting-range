# Range — Arcade Pistol Shooting Hall

A first-person 3D shooting range that runs in the browser. Clear eight waves of targets with three pistols, chain hits for combo multipliers, and beat the clock.

**Play online:** [https://mohtasimijaz.github.io/Shooting-range/](https://mohtasimijaz.github.io/Shooting-range/)

## Features

- First-person view with a detailed, procedurally built pistol, gloved hand and sleeve
- Three pistols with distinct looks and handling: **9mm**, **Compact** and **Magnum**
- Slide recoil, muzzle flash, idle breathing and strafe sway
- Lit indoor range with glowing ceiling panels
- Eight waves with rising difficulty (see below)
- Combo scoring, a shared match timer with a time bonus per wave, and ammo restocks between waves
- Stylised start menu with keycap controls

## Play locally

```bash
npm install
npm run dev

```

Open the URL Vite prints, click **Play**, then click the hall to lock the mouse.

## Controls


| Input                          | Action                       |
| ------------------------------ | ---------------------------- |
| Mouse                          | Aim                          |
| Left click                     | Fire                         |
| `R`                            | Reload                       |
| `1` / `2` / `3` or mouse wheel | Switch pistol                |
| `A` / `D`                      | Strafe along the firing line |
| `Esc`                          | Pause / unlock mouse         |


## How to play

You start with 60 seconds. Every wave you clear adds 15 seconds to the clock and restocks the reserve ammo of all three pistols. Clear all eight waves before time runs out to win.


| Wave | Name        | Targets                                 |
| ---- | ----------- | --------------------------------------- |
| 1    | Paper       | 6 static                                |
| 2    | Movers      | 8 sliding, 2 HP                         |
| 3    | Pop-up      | 8 pop-up                                |
| 4    | Mixed       | 4 static, 4 movers, 4 pop-up            |
| 5    | Fast Movers | 8 fast sliding, 2 HP                    |
| 6    | Quick Draw  | 10 pop-up, short exposure               |
| 7    | Armored     | 6 movers and 4 static, 3 HP each        |
| 8    | Gauntlet    | 3 static, 5 fast movers, 4 quick pop-up |


**Scoring:** a hit that does not kill a target gives 25 points; a kill gives the target's full value. Hits within one second of each other build a combo, and each combo step adds 0.25 to the score multiplier. A miss resets the combo.

**Pistols**


| Pistol  | Magazine | Reserve | Fire rate | Damage |
| ------- | -------- | ------- | --------- | ------ |
| 9mm     | 15       | 45      | Medium    | 1      |
| Compact | 12       | 48      | Fast      | 1      |
| Magnum  | 8        | 24      | Slow      | 3      |


## Project structure

```
src/
  main.ts            entry point
  style.css          menu, HUD and page styling
  game/
    Game.ts          main loop, input, shooting, waves and timer
    Player.ts        camera, mouse look, weapon animation
    Weapon.ts        pistol definitions, ammo, procedural pistol models
    Target.ts        target behaviour (static, mover, pop-up)
    WaveManager.ts   wave definitions and spawning
    Score.ts         points and combo
  world/Hall.ts      the shooting hall and lighting
  ui/HUD.ts          HUD, menus and wave banners
  audio/Sound.ts     generated sound effects

```

To change the difficulty, edit the `WAVES` list in `src/game/WaveManager.ts`, or `WAVE_TIME_BONUS` and `MATCH_TIME` in `src/game/Game.ts`.

## Build

```bash
npm run build     # type-check and build into dist/
npm run preview   # serve the production build locally

```

## Deploy (GitHub Pages)

The site is deployed automatically by GitHub Actions on every push to `main` (see `.github/workflows/deploy.yml`).

1. Push your changes to `main`.
2. Wait for the **Deploy GitHub Pages** run in the **Actions** tab to show a green tick.
3. Hard-refresh the live page (Ctrl+Shift+R) to see the update.

In the repo, **Settings → Pages → Source** must be set to **GitHub Actions**. The Vite `base` path in `vite.config.ts` is `/Shooting-range/` and must match the repository name.

## Tech

Three.js, TypeScript and Vite. All models, textures and sounds are generated in code, so there are no asset downloads.

