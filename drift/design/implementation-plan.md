# Drift Implementation Plan

## Recommended Tech

Use the same general stack as `flamethrow`: Vite, TypeScript, Three.js, and Rapier 3D. Rapier gives us a reliable rigid body, raycast suspension, and collision foundation without hand-rolling every physics edge case.

## Folder Shape

```text
drift/
  README.md
  design/
    implementation-plan.md
    level-plan.md
    mechanics-spec.md
  package.json
  index.html
  src/
    main.ts
    Game.ts
    World.ts
    CarController.ts
    Track.ts
    Hud.ts
    Input.ts
    TimeTrial.ts
    config.ts
    types.ts
    style.css
  scripts/
    smoke.mjs
```

The current implementation follows this shape and keeps track behavior data-driven through `src/tracks.ts`.

## Phase 1: Driving Feel Prototype

Goal: one car on a flat test pad with the hop-to-drift loop working.

- Create Three.js scene, camera, lights, and ground plane.
- Add Rapier physics world.
- Build a simple car body with four visual wheels.
- Implement keyboard input.
- Implement normal acceleration, braking, and steering.
- Implement tiny hop on `Space`.
- Implement drift entry when `Space` is held on landing.
- Add debug HUD for speed, grounded, hop, drift, and slip angle.

Done when: the player can repeatedly hop into controlled slides around test cones.

## Phase 2: First Time-Trial Track

Goal: turn the driving prototype into a complete one-level game loop.

- Add a compact closed-loop test track.
- Add start line, ordered checkpoints, and finish/lap validation.
- Add timer, best time, restart, and medal targets.
- Add basic track boundaries.
- Add wrong-way or missed-checkpoint feedback.

Done when: a player can complete valid timed laps and restart quickly.

## Phase 3: Level Select and Multiple Courses

Goal: support different levels with distinct corner patterns.

- Store track definitions as data.
- Add level select screen.
- Add at least three courses:
  - `Harbor Hairpins`: tight turns for frequent hop-to-drift use.
  - `Skyline Sprint`: point-to-point run with fast sweepers.
  - `Canyon Switchbacks`: elevation changes and linked drifts.
- Save best times per level.
- Show medal targets per level.

Done when: each level has independent timing, checkpoint order, and saved best time.

## Phase 4: Polish and Replayability

Goal: make time chasing satisfying.

- Add ghost replay from the player's best run.
- Add countdown start.
- Add tire marks and drift particles.
- Add speed lines or camera shake at high speed.
- Add audio for engine, hop, landing, drift, checkpoint, and new best time.
- Add mobile or gamepad controls only after keyboard feel is solid.

Done when: replaying the same track to shave time feels rewarding.

## Physics Strategy

Start with an arcade controller layered on top of physics rather than a full vehicle simulator. The game needs expressive drift control more than realism.

- Use a rigid body for the car.
- Use raycasts or simplified ground checks for grounded state.
- Apply forward acceleration along car facing.
- Apply steering torque or yaw rotation based on speed.
- During drift, reduce lateral grip and increase yaw authority.
- Keep all tuning values in `config.ts`.

## Camera Strategy

- Third-person chase camera.
- Camera follows behind the car facing direction, but should smooth toward velocity during bigger slides.
- Keep the car and upcoming corner visible.
- Avoid excessive camera lag during quick drift transitions.

## Verification Plan

- `npm run build` must pass.
- Smoke test should open the game, verify the canvas renders, press controls, restart, and confirm HUD timer/checkpoint changes.
- Add unit tests for time trial checkpoint validation once track data is formalized.
- Use visual browser checks for desktop and mobile viewport layout after the first UI pass.
