# PROJECT VELOCITY — Milestone 04 (Garage, Customization & Progression)

A browser-based 3D hybrid racing game built with **Vite**, **React**, **TypeScript**, **Three.js / React Three Fiber**, **React Three Drei**, **Rapier Physics**, and **Zustand**.

## Prerequisites

- **Node.js** `>= 20` (tested on `v24.14.0`)
- **npm** `>= 10`
- A modern desktop browser with **WebGL2** and **WebAssembly** enabled (Chrome, Edge, Firefox)

## How to Run

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```
   Open the local URL printed by Vite (typically `http://localhost:5173`).

3. Build and preview the production bundle:
   ```bash
   npm run build
   npm run preview
   ```

## Running Tests & Verification

- **Unit tests** (vehicle physics, steering sensitivity, collision handling, track spline, input/store):
  ```bash
  npm test
  ```
- **TypeScript type-check**:
  ```bash
  npm run typecheck
  ```
- **Browser end-to-end gameplay verification** (requires local Chrome or Edge and a running preview server):
  ```bash
  npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
  # In a second terminal:
  node tests/e2e/verifyGameplay.mjs
  ```

## Controls

| Key | Action |
| --- | --- |
| `W` / `Up` | Accelerate |
| `S` / `Down` | Brake / Reverse |
| `A` / `Left` | Steer Left |
| `D` / `Right` | Steer Right |
| `SPACE` | Handbrake / Drift |
| `C` | Switch Camera (`CHASE` → `COCKPIT` → `HOOD`) |
| `R` | Reset Vehicle to Track |
| `ESC` | Pause / Resume |
| `M` | Mute / Unmute Vehicle Audio |
| `H` | Toggle Control Legend |

## Features (Milestones 01–04)

- **Vehicle Physics & Drifting (M01–M02)**: 4-wheel raycast suspension, anti-roll bars, Pacejka-inspired lateral grip, speed-dependent steering sensitivity, handbrake drift with tire smoke particles, dynamic chase/cockpit/hood cameras, and Web Audio synthesis.
- **Racing System & AI Opponents (M03)**: 3–2–1–GO! grid countdown, sequential checkpoint & wrong-way validation, Quick Race / Time Trial / Circuit Race modes, 3–5 physics-driven AI opponents across Easy / Medium / Hard profiles, and race standings results.
- **3D Garage, Customization & Economy (M04)**:
  - Interactive 3D showroom turntable (`OrbitControls` rotation & zoom, studio `<Lightformer>` reflections).
  - 4 playable vehicles (`Veloce GT-R Concept`, `Stratos RS Coupe`, `Titan V8 Muscle GT`, `Valkyrie LM Prototype`) with distinct mass, aero, grip, and powertrain configs.
  - Real-time 3D customization (8 paints, 4 wheel styles, 3 spoilers, 3 body kits, 4 racing decal styles).
  - 5 performance upgrade categories (`Engine`, `Brakes`, `Tires`, `Suspension`, `Transmission`, Stages 1–3) applied directly to `VehiclePhysicsEngine`.
  - Race credit payouts, purchase confirmation modal, insufficient-funds & duplicate guards, and validated `localStorage` persistence (`pv_garage_save_v1`).

## Architecture Overview

```text
src/
├── components/
│   ├── garage/
│   │   └── GarageScreen.tsx      # Garage Home, Vehicle Roster, Customization, Upgrades & Purchase Modal
│   ├── hud/
│   │   ├── RacingHUD.tsx         # Glassmorphic race timer, lap counter, position, action bar
│   │   └── SpeedometerGauge.tsx  # Ref-driven SVG tachometer, speed (km/h), gear & driving state pills
│   └── menus/
│       ├── RaceMenuOverlay.tsx   # Pre-race setup (mode, difficulty, grid, laps, credits, garage entry)
│       ├── PauseOverlay.tsx      # Pause dialog (Resume, Reset, Restart, Camera switch)
│       ├── ResultsOverlay.tsx    # Standings, lap times, race credit payout & post-race navigation
│       └── ErrorFallback.tsx     # React ErrorBoundary & WebGL diagnostics
├── game/
│   ├── core/
│   │   ├── GameCanvas.tsx        # Single R3F Canvas switching Showroom vs Track + Rapier <Physics>
│   │   └── types.ts              # Shared domain types, customization & upgrade contracts
│   ├── ai/                       # AI driver steering, corner braking, overtaking & recovery
│   ├── physics/                  # 4-wheel raycast suspension, grip & collision classification
│   ├── vehicles/
│   │   ├── CarConfigs.ts         # 4 data-driven vehicle specs & default customizations
│   │   ├── CustomizationData.ts  # Paint, wheel, spoiler, body kit & decal catalogs
│   │   ├── SportsCarModel.tsx    # Modular 3D car body, cockpit, wheels, spoilers, kits & decals
│   │   └── VehicleController.tsx # Fixed-step physics force application & interpolated visual sync
│   ├── cameras/                  # Smooth Chase (FOV/drift-reactive), Cockpit & Hood cameras
│   ├── tracks/                   # GP spline, procedural asphalt/curb textures & Rapier colliders
│   ├── racing/                   # Countdown, lap/checkpoint tracking & finish detection
│   ├── world/
│   │   ├── WorldEnvironment.tsx  # Track sky, IBL reflections, fog & car-following shadow light
│   │   └── GarageShowroom.tsx    # 3D illuminated turntable showroom with OrbitControls
│   └── input/
│       └── InputManager.ts       # Focus-safe keyboard handling & scroll prevention
├── systems/
│   ├── audio/                    # Web Audio engine, brake & tire skid synthesis + hooks
│   ├── progression/
│   │   ├── EconomySystem.ts      # Race credit payouts & purchase validation guards
│   │   └── UpgradeSystem.ts      # Stage 1–3 upgrade modifiers & 4-bar vehicle ratings
│   └── save/
│       └── SaveSystem.ts         # Validated localStorage save/load for garage progression
└── state/
    └── gameStore.ts              # Zustand stores (Race, Garage, Economy + TelemetryState)
```

## Replacing the Procedural Vehicle Asset

`src/game/vehicles/VehicleAssetRegistry.ts` and `CarConfigs.ts` decouple vehicle physics from 3D visuals. Place future `.glb`/`.gltf` models under `public/models/cars/` and configure `assetModelPath` in a vehicle specification without modifying physics or input code.

