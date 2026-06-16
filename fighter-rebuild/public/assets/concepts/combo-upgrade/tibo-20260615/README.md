# Tibo Combo Upgrade Review Assets

Review-only assets for the Tibo combo prototype. These files are not installed in the runtime manifest.

## Contents

- `raw/tibo-combo-source-imagegen-v2.png`: selected imagegen source sheet on magenta background.
- `raw/*-raw-strip-magenta.png`: exact-frame action strips before transparency removal.
- `rows/sprites/*.png`: transparent 320x320 frame strips.
- `rows/masks/*-alpha-mask.png`: alpha masks for each strip.
- `rows/color-layers/*-color.png`: color layers for each strip.
- `cells/sprites/*.png`: individual transparent 320x320 frames.
- `cells/masks/*-alpha-mask.png`: individual alpha masks.
- `cells/color-layers/*-color.png`: individual color layers.
- `reviews/tibo-combo-upgrade-contact-sheet.png`: labeled review contact sheet.

## Frame Counts

- `light`: 8 frames
- `light2`: 8 frames
- `target`: 10 frames
- `sweep`: 10 frames
- `heavy`: 10 frames
- `special`: 12 frames

## Generation Prompt

Use case: stylized-concept
Asset type: review-only 2D fighting-game sprite sheet for a browser fighting game
Primary request: Generate a precise arcade pixel-art sprite sheet for Tibo combo prototype actions. Tibo is an adult male fighter with brown hair and light stubble, black leather jacket with subtle green accents, plain white shirt, dark jeans, black-and-white sneakers, fingerless gloves. Match the reference style: crisp black outline, high-detail 1990s fighting game pixel art, sharp shading, no blur. Use a flat pure magenta (#ff00ff) background.
Composition/framing: EXACT GRID. Six horizontal rows. Fighter faces right / three-quarter right in EVERY SINGLE FRAME. No back view, no rear view, no turned-away torso, no wrong-facing feet. Frame cells are implied 320x320 with generous magenta padding and consistent floor baseline. Row 1 LIGHT JAB has exactly 8 frames. Row 2 LIGHT2 CROSS has exactly 8 frames, opposite-hand cross but still facing right in every frame. Row 3 TARGET COMBO has exactly 10 frames. Row 4 SWEEP has exactly 10 frames with a low forward trip/sweep leg extension, body/head scale consistent with idle. Row 5 HEAVY KICK has exactly 10 frames, smoother side kick. Row 6 SPECIAL has exactly 12 frames, green circuit-energy punch/beam special matching Tibo style.
Character consistency: same face, same body proportions, same apparent height for standing frames, same head scale; crouch/sweep can lower the pose but must not shrink the character. White shirt visible in every frame where torso is visible. Feet always face right/three-quarter right. Each frame should show clear motion variation.
Constraints: row labels may appear at left outside frame area only. No runtime UI. No transparent-looking holes. No missing shirt. No duplicated limbs. No cutoff sprites. No watermark. No scenery.
Avoid: scale drift, wrong-facing feet, rear/back-facing frames, tiny special frames, oversized crouch head, blur, low detail, duplicated arms or legs, extra hands, blank frames.

## Processing Notes

The source sheet did not perfectly honor exact counts. The installed review files were sliced from usable generated poses into exact-count 320x320 cells, with the bad back-facing cross pose and one duplicated-body special pose excluded. A few clean neighboring frames are repeated to satisfy the requested review counts without installing runtime sprites.
