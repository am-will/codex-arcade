# Generated Asset Contract

Consumers should load `/assets/manifest.json` and avoid hard-coding generated paths.

## Character sheets

Each character has a `portrait` plus one PNG sheet for every animation. All current sheets are 1 row, with `columns === frameCount`.

Frame size: 320x320 for fighter animation strips. Portraits are 192x192.

Animations:

- `idle`: 12 frames, 12 fps, loop=true
- `walk`: 6 frames, 8 fps, loop=true
- `jump`: 4 frames, 8 fps, loop=false
- `crouch`: 4 frames, 8 fps, loop=false
- `block`: 3 frames, 8 fps, loop=false
- `light`: 4 frames, 12 fps, loop=false, punch/jab attack
- `heavy`: 5 frames, 10 fps, loop=false, side kick attack
- `special`: 6 frames, 12 fps, loop=false, character-specific energy attack
- `knockdown`: 5 frames, 8 fps, loop=false

## Stage

`byte-boardroom` is 640x360, with a floor line at y=220. Layers are ordered back to front and include a `parallax` value.

## HUD, VFX, audio

- HUD entries expose `key`, `path`, `width`, and `height`.
- VFX sheets expose the same frame-grid fields as character sheets.
- Audio entries are small mono WAV placeholders and can be replaced later without changing keys.
