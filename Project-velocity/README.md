# PROJECT VELOCITY — Milestone 01

A browser-based 3D hybrid racing prototype built with **Vite**, **React**, **TypeScript**, **Three.js / React Three Fiber**, **React Three Drei**, **Rapier Physics**, and **Zustand**.

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
| `H` | Toggle Control Legend |

## Architecture Overview

```text
src/
├── components/
│   ├── hud/
│   │   ├── RacingHUD.tsx         # Glassmorphic race timer, lap counter, action bar, live key legend
│   │   └── SpeedometerGauge.tsx  # Ref-driven SVG tachometer, speed (km/h), gear & driving state pills
│   └── menus/
│       ├── PauseOverlay.tsx      # Pause dialog (Resume, Reset, Restart, Camera switch)
│       └── ErrorFallback.tsx     # React ErrorBoundary & WebGL diagnostics
├── game/
│   ├── core/
│   │   ├── GameCanvas.tsx        # R3F Canvas, WebGL check, Rapier fixed-timestep <Physics timeStep={1/60}>
│   │   └── types.ts              # Shared domain types & Milestone 02+ expansion contracts
│   ├── physics/
│   │   ├── VehiclePhysics.ts     # 4-wheel raycast suspension, anti-roll, Pacejka-inspired grip & gearbox
│   │   └── CollisionHandler.ts   # Surface classification, impact severity & debounce cooldown
│   ├── vehicles/
│   │   ├── CarConfigs.ts         # Vehicle physics specs & asset registry
│   │   ├── VehicleAssetRegistry.ts # Replaceable visual model contract (procedural or GLB/GLTF)
│   │   ├── SportsCarModel.tsx    # Detailed procedural GT sports car with cockpit & reactive LED lights
│   │   └── VehicleController.tsx # Fixed-step physics force application & interpolated visual sync
│   ├── cameras/
│   │   └── CameraController.tsx  # Smooth Chase (FOV/drift-reactive), Cockpit & Hood cameras
│   ├── tracks/
│   │   ├── CircuitData.ts        # Closed GP spline, track projection, checkpoints & barrier segments
│   │   ├── TrackBuilder.ts       # Procedural asphalt/curb/grass/signage textures & ribbon geometries
│   │   └── TrackEnvironment.tsx  # Circuit meshes, Rapier colliders, grandstand, pit complex & trees
│   ├── racing/
│   │   └── RaceManager.tsx       # Fixed-clock race & lap timer with 3-sector lap validation
│   ├── world/
│   │   └── WorldEnvironment.tsx  # Local procedural IBL reflections, sky, fog & car-following shadow light
│   └── input/
│       └── InputManager.ts       # Focus-safe keyboard handling & scroll prevention
└── state/
    └── gameStore.ts              # Zustand stores (discrete GameState + zero-rerender TelemetryState)
```

## Replacing the Procedural Vehicle Asset

`src/game/vehicles/VehicleAssetRegistry.ts` and `CarConfigs.ts` decouple vehicle physics from 3D visuals. Place future `.glb`/`.gltf` models under `public/models/cars/` and configure `assetModelPath` in a vehicle specification without modifying physics or input code.

