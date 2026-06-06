# Plan: Sama v Amodi Clean-Room Phaser Fighter

**Generated**: 2026-06-06

## Overview

Build a new clean-room Vite/TypeScript/Phaser 4 app at `fighter-rebuild/`. The game is a one-player CPU fighter, "Sama v Amodi", with original 8-bit inspired assets for Sam Altman and Dario Amodei, authored/debuggable combat data, deterministic hit/guard-box fighting, rounds, HUD, specials, tests, and browser verification.

Reference `MortalCodex` only for behavior and workflow. Do not copy its source, assets, sprites, configs, or atlas data.

## Documentation Notes

- Phaser official docs confirm `new Phaser.Game(config)` supports class scene arrays and scene lifecycle callbacks, and scale config belongs in the game config.
- Vite official docs confirm `dev`, `build`, and `preview` scripts, `index.html` as app entry, and root-absolute references for assets in `public/`.
- Vitest official docs confirm Vite-native TypeScript tests and that typechecking should run separately.
- Playwright official docs confirm TypeScript tests work out of the box, but should be paired with TypeScript compilation.

## Prerequisites

- Node/npm available locally.
- Use Phaser 4, Vite, TypeScript, Vitest, and Playwright.
- Generate original assets programmatically or with image generation; keep prompt/process notes in `fighter-rebuild/concepts/`.
- Use the in-app Browser for final runtime inspection.

## Dependency Graph

```text
T1 ──┬── T3 ──┬── T5 ───────┬── T8 ── T9 ── T10
T2 ──┘        ├── T6 ───────┤
              └── T7 ── T7a ┘
T4 ─────────────────────────┘
```

## Tasks

### T1: Scaffold Vite Phaser App
- **depends_on**: []
- **location**: `fighter-rebuild/package.json`, `fighter-rebuild/index.html`, `fighter-rebuild/tsconfig.json`, `fighter-rebuild/vite.config.ts`, `fighter-rebuild/src/`
- **description**: Create the new app shell, Phaser boot path, scene registry stubs, responsive landscape canvas, dev-only debug sidebar host, root styles, scripts for `dev`, `build`, `typecheck`, `test`, `test:e2e`, and Playwright smoke testing. Install and lock `phaser@4`, `vite`, `typescript`, `vitest`, `playwright`, and `@playwright/test`; create `package-lock.json`.
- **validation**: `npm install`, `npm run typecheck`, and `npm run build` complete with scaffold/stub scenes.
- **status**: Completed
- **log**: Created a clean-room Vite/TypeScript/Phaser 4 scaffold with Phaser boot, Boot/MainMenu/Placeholder scene stubs, responsive 16:9 canvas shell, dev-only debug sidebar host, Vitest scene-key smoke test, and Playwright desktop/mobile canvas smoke test. Installed and locked npm dependencies. Validation passed: `npm install`, `npm run typecheck`, `npm run build`, `npm run test`, and `npm run test:e2e`.
- **files edited/created**: `fighter-rebuild/.gitignore`, `fighter-rebuild/package.json`, `fighter-rebuild/package-lock.json`, `fighter-rebuild/index.html`, `fighter-rebuild/tsconfig.json`, `fighter-rebuild/vite.config.ts`, `fighter-rebuild/playwright.config.ts`, `fighter-rebuild/src/main.ts`, `fighter-rebuild/src/styles.css`, `fighter-rebuild/src/shell/debugSidebar.ts`, `fighter-rebuild/src/scenes/sceneKeys.ts`, `fighter-rebuild/src/scenes/sceneKeys.test.ts`, `fighter-rebuild/src/scenes/BootScene.ts`, `fighter-rebuild/src/scenes/MainMenuScene.ts`, `fighter-rebuild/src/scenes/PlaceholderScene.ts`, `fighter-rebuild/src/scenes/sceneRegistry.ts`, `fighter-rebuild/tests/smoke.spec.ts`

### T2: Generate Original Assets and Prompts
- **depends_on**: []
- **location**: `fighter-rebuild/scripts/generate-assets.mjs`, `fighter-rebuild/public/assets/`, `fighter-rebuild/public/assets/manifest.json`, `fighter-rebuild/concepts/`
- **description**: Generate all unique non-MortalCodex assets: 8-bit Sam Altman and Dario Amodei portraits, sprite sheets for idle/walk/jump/block/light/heavy/special/knockdown, stage layers, HUD pieces, hit spark, and simple SFX placeholders. Emit an asset manifest with character ids, asset keys, paths, frame dimensions, frame counts, animation names, stage ids, HUD keys, and audio keys. Make the art visually distinct from MortalCodex and visibly suggest the two public figures without using copied source images.
- **validation**: Asset files and `public/assets/manifest.json` exist, sprite sheets match manifest frame grids, prompt/process notes are saved, and visual inspection confirms readable 8-bit characters and original style.
- **status**: Completed
- **log**: Added the original asset generator, then replaced the rejected low-detail character sprites with high-detail GPT Image 2 fighting sprite sheets sliced into 320px Phaser strips. The accepted assets now use detailed 16-bit arcade fighter styling, Sama/Amodi visual semblance, light=punch, heavy=kick, and special=combo semantics. Validation passed via `node fighter-rebuild/scripts/generate-assets.mjs` and `python3 fighter-rebuild/scripts/slice-high-detail-sheets.py`; visual inspection passed on `public/assets/concepts/contact-sheet.png`, `characters/sama/heavy.png`, and `characters/amodi/special.png`.
- **files edited/created**: `fighter-rebuild/scripts/generate-assets.mjs`, `fighter-rebuild/scripts/slice-high-detail-sheets.py`, `fighter-rebuild/public/assets/**`, `fighter-rebuild/concepts/asset-generation-notes.md`, `fighter-rebuild/concepts/asset-contract.md`, `fighter-rebuild/concepts/high-detail-sprite-sheets/**`

### T3: Data Model and Config Loading
- **depends_on**: [T1, T2]
- **location**: `fighter-rebuild/src/game/types.ts`, `fighter-rebuild/src/game/config.ts`, `fighter-rebuild/src/game/testHooks.ts`, `fighter-rebuild/public/configs/`, `fighter-rebuild/src/game/config.test.ts`
- **description**: Define `SceneKey`, `MatchConfig`, `CharacterDefinition`, `FrameBoxes`, `FighterTuning`, `AttackProfile`, stage/input/settings/asset-manifest types, a test-hook contract, JSON config loaders, normalization/clamping, frame-box resolution, and tests. Consume the asset manifest as the shared key contract.
- **validation**: `npm run test -- config` passes and proves malformed config falls back safely for missing character assets, bad frame indexes, empty attack windows, inverted boxes, negative damage, zero/NaN movement values, duplicate ids, invalid stage ids, and missing defaults.
- **status**: Completed
- **log**: Added shared game data contracts, a browser-loadable/pure-testable JSON config loader, manifest-backed normalization with warnings, 320px high-detail fighter frame boxes, jab/kick/combo attack profiles, stage/input/settings/tuning configs, runtime test-hook contract, frame-box resolution helpers, and malformed-config fallback tests. Validation passed: `npm run test -- config`, `npm run typecheck`, and `npm run build`.
- **files edited/created**: `fighter-rebuild/src/game/types.ts`, `fighter-rebuild/src/game/config.ts`, `fighter-rebuild/src/game/testHooks.ts`, `fighter-rebuild/src/game/config.test.ts`, `fighter-rebuild/public/configs/characters.json`, `fighter-rebuild/public/configs/tuning.json`, `fighter-rebuild/public/configs/stages.json`, `fighter-rebuild/public/configs/input.json`, `fighter-rebuild/public/configs/settings.json`

### T4: Asset Registry and Preload
- **depends_on**: [T1, T2]
- **location**: `fighter-rebuild/src/game/assets.ts`, `fighter-rebuild/src/scenes/BootScene.ts`
- **description**: Register generated images, sprite sheets, audio, and animation definitions from `public/assets/manifest.json` without importing MortalCodex data. Boot should preload assets and start the scaffolded main menu stub from T1.
- **validation**: Dev build loads without missing-asset console errors; assets can be referenced by declared keys.
- **status**: Completed
- **log**: Added a clean-room generated asset registry that loads `/assets/manifest.json`, queues all manifest-declared character portraits, sprite sheets, stage layers, HUD images, VFX sheets, and WAV SFX, then creates character and hit-spark animations from manifest frame definitions before entering the scaffolded main menu.
- **files edited/created**: `fighter-rebuild/src/game/assets.ts`, `fighter-rebuild/src/scenes/BootScene.ts`

### T5: Character Gym
- **depends_on**: [T3, T4]
- **location**: `fighter-rebuild/src/scenes/CharacterGymScene.ts`, `fighter-rebuild/src/shell/debugPanel.ts`
- **description**: Add Character Gym for animation/frame-box preview, frame stepping, bounds overlays, and JSON export text. Keep editing UI keyboard-safe.
- **validation**: Browser can navigate to the gym in dev; toggles show visual/collision/hurt/attack/guard boxes from config.
- **status**: Not Completed
- **log**:
- **files edited/created**:

### T6: Menu Flow for 1vCPU Only
- **depends_on**: [T3, T4]
- **location**: `fighter-rebuild/src/scenes/MainMenuScene.ts`, `fighter-rebuild/src/scenes/StageSelectScene.ts`, `fighter-rebuild/src/scenes/CharacterSelectScene.ts`, `fighter-rebuild/src/scenes/SettingsScene.ts`, `fighter-rebuild/src/scenes/BaseScene.ts`
- **description**: Implement splash/main menu, stage select, character select, and settings. The only playable mode is 1vCPU. The player chooses Sama or Amodi; CPU automatically chooses the other. Use portraits and keyboard/pointer navigation.
- **validation**: Browser smoke flow reaches a placeholder match launch event/config from Play without any 1v1 option.
- **status**: Completed
- **log**: Added a polished 1vCPU-only menu flow with shared scene UI helpers, manifest/config-backed portraits and stage cards, keyboard and pointer navigation, settings for rounds/timer/CPU, automatic CPU-opponent selection, and a placeholder match launch config/event. Added Playwright coverage that drives Main Menu -> Stage Select -> Character Select -> Placeholder and asserts no 1v1 option is exposed. Validation passed: `npm run typecheck`, `npm run build`, `npm run test`, `npm run test:e2e`, and browser smoke on `http://127.0.0.1:5174/`.
- **files edited/created**: `fighter-rebuild/src/scenes/BaseScene.ts`, `fighter-rebuild/src/scenes/MainMenuScene.ts`, `fighter-rebuild/src/scenes/StageSelectScene.ts`, `fighter-rebuild/src/scenes/CharacterSelectScene.ts`, `fighter-rebuild/src/scenes/SettingsScene.ts`, `fighter-rebuild/src/scenes/PlaceholderScene.ts`, `fighter-rebuild/src/scenes/sceneKeys.ts`, `fighter-rebuild/src/scenes/sceneKeys.test.ts`, `fighter-rebuild/src/scenes/sceneRegistry.ts`, `fighter-rebuild/tests/smoke.spec.ts`

### T7: Fighter Actor and Combat Core
- **depends_on**: [T3, T4]
- **location**: `fighter-rebuild/src/game/fighter.ts`, `fighter-rebuild/src/game/combat.ts`, `fighter-rebuild/src/game/combat.test.ts`
- **description**: Implement deterministic fighter state machine, fixed simulation timestep helpers, seedable RNG, movement, gravity, facing, per-frame attack-vs-hurt overlap, independent guard-box blocking, damage/block damage, hitstun, knockback, meter gain, multi-hit special windows, and finisher behavior. Combat/CPU must not call `Math.random()` directly.
- **validation**: Unit tests prove hits, whiffs, blocked hits, meter gain, multi-hit specials, finisher launch behavior, and same seed/input transcript produces the same result.
- **status**: Completed
- **log**: Added a pure TypeScript fighter actor and deterministic combat core with 60 Hz fixed-step helpers, seeded LCG RNG, bottom-center world anchors for 320x320 frame-space boxes, movement/gravity/jump/facing, frame-indexed attack-vs-hurt resolution, independent guard-box blocking, damage/block damage, hitstun/blockstun, knockback, meter gain, multi-hit special windows, and finisher knockdown launch behavior. TDD RED captured missing combat module, then GREEN passed `npm run test -- combat`. Validation also passed `npm run build`; `npm run typecheck` is currently blocked by unrelated `src/scenes/SettingsScene.ts` errors outside T7 ownership.
- **files edited/created**: `fighter-rebuild/src/game/fighter.ts`, `fighter-rebuild/src/game/combat.ts`, `fighter-rebuild/src/game/combat.test.ts`

### T7a: Fighter Playground
- **depends_on**: [T5, T7]
- **location**: `fighter-rebuild/src/scenes/FighterPlaygroundScene.ts`, `fighter-rebuild/src/shell/debugPanel.ts`
- **description**: Add Fighter Playground for movement, dummy combat, live tuning display, bounds overlays, forced meter fill, and JSON export text using the combat core from T7.
- **validation**: Browser can navigate to playground in dev; player can exercise attacks/specials against a regenerating dummy and overlays remain readable.
- **status**: Not Completed
- **log**:
- **files edited/created**:

### T8: Match Scene, CPU, Rounds, Camera, HUD
- **depends_on**: [T6, T7, T7a]
- **location**: `fighter-rebuild/src/scenes/MatchScene.ts`, `fighter-rebuild/src/game/cpu.ts`, `fighter-rebuild/src/game/hud.ts`, `fighter-rebuild/src/game/rounds.ts`, `fighter-rebuild/src/game/rounds.test.ts`
- **description**: Build the 1vCPU match: Sama v Amodi intro, round start/fight banners, simple seedable CPU, best-of-3 rounds, 60s timer, timeout by health, rematch/menu overlay, group camera clamped to wide stage, HUD portraits/health/meter/round pips/timer, hit sparks, camera shake, super cut-in, and runtime test hooks. Specify simultaneous KO, timeout ties, round-transition input lockout, super cut-in input pause, rematch reset, wall collision, facing flip/cross-up, and per-round meter behavior.
- **validation**: Unit tests cover round resolution and edge cases; browser confirms playable match, CPU attacks, HUD updates, specials trigger, test hooks work, and rematch resets state.
- **status**: Not Completed
- **log**:
- **files edited/created**:

### T9: End-to-End Tests and Test Hooks
- **depends_on**: [T6, T7, T8]
- **location**: `fighter-rebuild/playwright.config.ts`, `fighter-rebuild/tests/smoke.spec.ts`, `fighter-rebuild/src/game/testHooks.ts`
- **description**: Add Playwright smoke tests that use the T3/T8 runtime test hook contract for deterministic browser checks: desktop/mobile render, menu flow, no 1v1 option, character lock-in, match start, damage/block, special, timeout/round-over, and rematch.
- **validation**: `npm run test:e2e` passes after `npm run build`; screenshots show nonblank game canvas and readable HUD.
- **status**: Not Completed
- **log**:
- **files edited/created**:

### T10: Final Browser Verification and Polish
- **depends_on**: [T8, T9]
- **location**: `fighter-rebuild/`, Browser runtime
- **description**: Run full validation, inspect assets visually, start `npm run dev -- --host 127.0.0.1` on an available port, capture the URL, use the in-app Browser for manual gameplay checks on desktop and mobile-sized viewports, fix issues, stop the server, run clean-room audits, and ensure the plan logs are complete.
- **validation**: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, Browser inspection, and `rg 'MortalCodex|red-brawler|green-boxer|jiujitsu|fighting-ui-atlas|rooftop' fighter-rebuild` clean-room audit all pass with only allowed documentation/log hits; final game satisfies 1vCPU Sama v Amodi scope with unique assets.
- **status**: Not Completed
- **log**:
- **files edited/created**:

## Parallel Execution Groups

| Wave | Tasks | Can Start When |
|------|-------|----------------|
| 1 | T1, T2 | Immediately |
| 2 | T3, T4 | T1 and T2 complete |
| 3 | T5, T6, T7 | T3 and T4 complete |
| 4 | T7a | T5 and T7 complete |
| 5 | T8 | T6, T7, and T7a complete |
| 6 | T9 | T6, T7, and T8 complete |
| 7 | T10 | T8 and T9 complete |

## Testing Strategy

- Keep pure combat/config/round logic covered by Vitest.
- Use Playwright for integrated menu and match behavior.
- Use Browser for visual/manual verification after automated checks.
- Treat visual asset quality as an explicit acceptance gate: inspect generated sprite sheets and in-game portraits before completion.
- Pair Playwright with `npm run typecheck` because Playwright executes TypeScript but does not typecheck the app.

## Risks & Mitigations

- **Scope size**: Execute in dependency waves and keep each worker’s write scope disjoint.
- **Clean-room risk**: Do not copy `MortalCodex` files; use new modules, generated assets, and original data.
- **Public-figure resemblance**: Use 8-bit caricature cues only: Sama with dark hair, navy/black jacket, compact founder silhouette; Amodi with glasses/beard cues and purple/teal lab-jacket-inspired palette.
- **Phaser/API drift**: Use official docs and compile/typecheck before runtime inspection.
- **Parallel conflicts**: Workers must avoid reverting others’ work and only edit assigned locations.
- **Shared-file ownership**: T1 owns package/build/scaffold files, T2 owns assets/manifest, T3 owns shared data contracts/config/test hook types, T4 owns asset preload registry, T8 owns final scene registry integration. Other tasks should export local modules and avoid changing shared registries unless their task explicitly owns them.
