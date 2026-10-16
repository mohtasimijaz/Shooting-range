# Range — Tactical Shooting Range

A first-person 3D indoor shooting range that runs in the browser on **desktop and mobile**. Clear **50 waves** of targets with three pistols and two assault rifles, chain hits for combo multipliers, go for bullseyes, and beat the clock.

**Play online:** [https://mohtasimijaz.github.io/Shooting-range/](https://mohtasimijaz.github.io/Shooting-range/)

## Features

- **5 weapons**: 9mm, Compact, Magnum, **AK-47** and **M416**. The rifles switch between **single** and **full-auto** fire.
- Detailed procedural weapon models with PBR materials and environment reflections. The M416 has a red-dot sight, quad rail, foregrip and a tan magazine; the AK-47 has wood furniture and a curved steel magazine.
- **Shell casings eject** from the port, bounce on the bench and floor, and tinkle.
- Muzzle flash, smoke, tracers, sparks on steel, dust on concrete, paper bits, and **bullet holes** in targets and walls.
- Recoil with muzzle climb, a spread that grows during bursts, a dynamic crosshair, slide/bolt cycling, magazine-drop reloads and weapon-raise animations.
- A realistic range:
  - concrete floor with lane lines and distance marks
  - acoustic foam walls over steel panels
  - angled ceiling baffles and fluorescent tube fixtures (with bloom on desktop)
  - a steel bullet trap with a rubber berm
  - overhead target carriers
  - a wooden bench with rubber mats
- Paper bullseye, silhouette, steel plate, NO SHOOT and bonus targets. Targets react to hits and fall when destroyed.
- Targets are closer than before: about **9 m, 11.5 m and 14 m**.
- **50 waves in 5 tiers** with steadily rising difficulty, boss waves every 10th wave, and checkpoints.
- Professional HUD:
  - score with a combo meter
  - wave progress
  - timer that warns when time is low
  - weapon card with fire mode, round counter and reload bar
  - hit markers and floating score popups
- Menus for Weapons (stats), Settings (sensitivity, volume, graphics quality, aim assist) and How to Play. The end screen shows stats, and best score and checkpoints are saved.
- **Mobile**:
  - touch controls: strafe stick, swipe to aim, fire button (hold for auto; drag on it to aim), reload, fire mode, weapon slots, pause
  - full screen and landscape lock where supported, plus a "rotate your phone" screen
  - safe-area support for notches
  - automatic graphics quality and adaptive resolution

## Play locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (it ends in `/Shooting-range/`). `npm run dev` also listens on your local network, so you can open the **Network** URL on a phone on the same Wi-Fi to test touch controls.

On a desktop browser, add `?touch=1` to the URL to force the touch controls (or `?touch=0` to force mouse and keyboard).

## Controls

| Desktop                  | Mobile                           | Action                 |
| ------------------------ | -------------------------------- | ---------------------- |
| Mouse                    | Drag on the right side           | Aim                    |
| Left click (hold = auto) | FIRE button (hold = auto)        | Fire                   |
| `R`                      | ⟳ button                         | Reload                 |
| `B` or `X`               | MODE button                      | Single / Auto (rifles) |
| `1`–`5`, `Q`/`E`, wheel  | Weapon slots                     | Switch weapon          |
| `A` / `D`, arrow keys    | Left-thumb stick                 | Strafe                 |
| `Esc` / `P`              | ❚❚ button                        | Pause                  |

## How to play

You start with 60 seconds. Clearing a wave restocks all reserve ammo, and the next wave adds time to the clock. Clear all 50 waves to win.

| Tier | Waves | Name         | What changes                                                  |
| ---- | ----- | ------------ | ------------------------------------------------------------- |
| 1    | 1–10  | Recruit      | Paper, sliders and pop-ups at the near row (about 9 m)       |
| 2    | 11–20 | Marksman     | Zig-zag movers, second row (about 11.5 m)                    |
| 3    | 21–30 | Sharpshooter | Steel plates, NO SHOOT targets, all three rows (up to 14 m)  |
| 4    | 31–40 | Elite        | Swinging targets, bonus +3 s targets                          |
| 5    | 41–50 | Legend       | Everything mixed, fastest and toughest                        |

Every wave, the base difficulty goes up or stays the same: more targets (6 → 16), more HP (1 → 4), faster movement (×1 → ×2.8), and shorter pop-up exposure (1.8 s → 0.7 s). Every 10th wave is a **Gauntlet** boss wave with extra targets.

Checkpoints unlock at waves 11, 21, 31 and 41 (**Continue** in the menu).

**Scoring**

- A hit that does not destroy a target scores 25 points; a kill scores the target's full value.
- Hits within one second of each other build a combo: each step adds 0.25 to the multiplier, up to ×4. A miss resets it.
- Bullseye (X ring) and head shots score ×1.5; the inner ring scores ×1.25.
- Shooting a NO SHOOT target costs 250 points and 3 seconds.
- Steel plates take half damage from 9mm and Compact rounds.

**Weapons**

| Weapon  | Calibre    | Magazine | Reserve | Rate     | Damage | Modes       |
| ------- | ---------- | -------- | ------- | -------- | ------ | ----------- |
| 9mm     | 9×19mm     | 15       | 60      | 375 rpm  | 1      | Semi        |
| Compact | 9×19mm     | 12       | 60      | 600 rpm  | 1      | Semi        |
| Magnum  | .44 Magnum | 8        | 32      | 143 rpm  | 3      | Semi        |
| AK-47   | 7.62×39mm  | 30       | 120     | 600 rpm  | 2      | Auto/Single |
| M416    | 5.56×45mm  | 30       | 150     | 750 rpm  | 1.5    | Auto/Single |

## Project structure

```
src/
  main.ts                 entry point (shows a message if WebGL is unavailable)
  style.css               HUD, menus, touch controls, responsive layout
  core/
    Device.ts             touch detection, graphics quality profiles
    Settings.ts           saved preferences, best score, checkpoints
  input/
    Input.ts              one input layer for mouse/keyboard and touch
    TouchControls.ts      on-screen stick, aim area and buttons
  game/
    Game.ts               main loop, phases, shooting, waves, timer, rendering
    Player.ts             camera, recoil, weapon view-model and animations
    Weapon.ts             weapon definitions, ammo, fire modes, spread
    WaveGen.ts            procedural 50-wave campaign (pure data)
    WaveManager.ts        spawns and lays out each wave's targets
    Target.ts             target types, movement, hit zones
    Score.ts              points, combo and run statistics
    Effects.ts            casings, particles, tracers, bullet holes (pooled)
    models/
      Materials.ts        shared PBR materials and geometry helpers
      PistolModel.ts      9mm, Compact, Magnum
      RifleModel.ts       AK-47, M416
  world/
    Hall.ts               the shooting range and its lighting
    Textures.ts           procedural canvas textures and target faces
  ui/HUD.ts               HUD, menus, settings, popups, end screen
  audio/Sound.ts          synthesised weapon, impact and UI sounds
tests/                    unit tests (weapons, waves, score)
```

To tune difficulty, edit `waveParams()` and `THEMES` in `src/game/WaveGen.ts`. Weapon handling lives in `WEAPONS` in `src/game/Weapon.ts`.

## Test and build

```bash
npm test          # unit tests (Vitest)
npm run build     # type-check and build into dist/
npm run check     # type-check + tests + build
npm run preview   # serve the production build locally
```

## Deploy (GitHub Pages)

The site is deployed automatically by GitHub Actions on every push to `main` (see `.github/workflows/deploy.yml`).

1. Push your changes to `main`, including the updated `package-lock.json`.
2. Wait for the **Deploy GitHub Pages** run in the **Actions** tab to show a green tick.
3. Hard-refresh the live page (Ctrl+Shift+R) to see the update.

In the repo, **Settings → Pages → Source** must be set to **GitHub Actions**. The Vite `base` path in `vite.config.ts` is `/Shooting-range/` and must match the repository name.

## Tech

Three.js, TypeScript and Vite. All models, textures and sounds are generated in code, so there are no asset downloads. The two UI fonts load from Google Fonts, with system-font fallbacks when offline.
