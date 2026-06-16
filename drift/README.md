# Drift

Drift is a 3D time-trial racing game for Codex Arcade. The player races twisty roads for the best possible time, using a short space-bar hop to enter controlled slides through turns.

## Core Fantasy

Every track should feel like a fast arcade time attack: read the corner, tap space for a tiny hop, keep space held as the car lands, then carve the turn sideways with sharper steering than normal driving allows.

## Core Controls

- `W` / `Up`: accelerate
- `S` / `Down`: brake and reverse at low speed
- `A` / `Left`: steer left
- `D` / `Right`: steer right
- `Space tap`: short hop, similar to Mario Kart
- `Space hold through landing`: enter drift/slide mode
- `Space release`: exit drift and regain normal tire grip
- `R`: restart current run

## Game Loop

1. Pick a level.
2. Race laps through ordered checkpoint gates.
3. Collect turbo rings, clock bonuses, and shields.
4. Hit boost pads and ramps while dodging traffic, cones, crates, and oil.
5. Improve the final time and medal.

## Levels

- `Harbor Hairpins`: tight docks with frequent linked drift corners.
- `Skyline Sprint`: faster rooftop sweepers with multiple ramp and boost lines.
- `Canyon Switchbacks`: winding canyon roads with back-to-back turns and traffic gaps.

## Play

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:5175/`.

## Verification

```sh
npm run build
npm run test:smoke
```

The smoke test builds the app, launches a local preview, starts a race, verifies nonblank desktop and mobile canvas rendering, exercises driving and hop/drift input, and checks mobile layout overflow.

## Design Docs

- [Mechanics spec](design/mechanics-spec.md)
- [Implementation plan](design/implementation-plan.md)
- [Level plan](design/level-plan.md)
