# Character Sprite Prompt Template

Use this template when generating new selectable fighters. The goal is not just
matching style; it is preserving animation contracts so every fighter can share
the same Phaser setup, timing, hitbox expectations, and visual scale.

## Runtime Contract

All finished runtime sheets are one-row transparent PNG strips. Each frame is
exactly 320x320.

| Animation | Source prompt layout | Runtime strip | Frames | FPS | Loop |
| --- | --- | --- | ---: | ---: | --- |
| `idle` | 4 columns x 3 rows | 3840x320 | 12 | 12 | yes |
| `walk` | 3 columns x 2 rows | 1920x320 | 6 | 8 | yes |
| `jump` | 2 columns x 2 rows | 1280x320 | 4 | 8 | no |
| `crouch` | 2 columns x 2 rows | 1280x320 | 4 | 8 | no |
| `block` | 3 columns x 1 row | 960x320 | 3 | 8 | no |
| `light` | 2 columns x 2 rows | 1280x320 | 4 | 12 | no |
| `heavy` | 3 columns x 2 rows, first 5 cells used | 1600x320 | 5 | 10 | no |
| `special` | 3 columns x 2 rows | 1920x320 | 6 | 12 | no |
| `knockdown` | 3 columns x 2 rows, first 5 cells used | 1600x320 | 5 | 8 | no |

Prefer the roomier 3x2 source layout for 5-frame sheets. It reduces clipping,
detached fragments, and unwanted scale changes compared with asking for five
frames in one long row.

## Character Variables

Replace these values for each new fighter:

```text
CHARACTER_NAME: <short display name>
CHARACTER_ARCHETYPE: <fighter type, e.g. boxer, dancer, engineer, monk>
IDENTITY_LOCK: <face, hair, age, build, posture, signature features>
OUTFIT_LOCK: <clothing, shoes, accessories, materials>
PALETTE: <primary colors and accent colors>
ENERGY_SIGNATURE: <special-attack color, shape, visual motif>
SPECIAL_MOVE: <what the special attack does>
```

Example:

```text
CHARACTER_NAME: Rook
CHARACTER_ARCHETYPE: tactical chess-boxer
IDENTITY_LOCK: tall athletic male, short silver hair, square jaw, focused eyes
OUTFIT_LOCK: black training vest, white compression sleeves, charcoal pants, white high-top sneakers, small rook emblem on shoulder
PALETTE: black, white, charcoal, electric blue accents
ENERGY_SIGNATURE: electric blue geometric sparks and rook-shaped impact flash
SPECIAL_MOVE: charged straight punch that releases a blue geometric shockwave toward screen-right
```

## Global Style Block

Append this block to every action prompt:

```text
Style/medium: crisp hand-drawn high-detail 16-bit arcade fighting game pixel art, saturated but disciplined colors, clean readable silhouette, visible pixel clusters, sharp edges, no blur, no antialias haze, no painterly softness.

Character consistency: The fighter must be the exact same character in every cell: same face, hair, body proportions, outfit, shoes, accessories, palette, and apparent height. Only the pose, limb positions, clothing motion, and action effects change.

Framing: one complete full-body fighter centered in each cell, generous empty margin around every pose, consistent scale, consistent shoe baseline for grounded frames, transparent or flat solid dark background. No pose may cross into another cell. No cropped feet, hands, hair, weapons, or effects.

Orientation: side-facing fighting-game view toward screen-right. Feet and torso must remain coherent with that orientation. Never rotate the feet front-facing or backward unless explicitly required by a knockdown pose.

Avoid: duplicate/copy frames, tiny stance changes only, shrink/grow between frames, detached limbs, ghost sprites, floating body fragments, extra characters, labels, text, numbers, grid lines, UI, watermarks, shadows connecting frames.
```

## Idle Prompt

```text
Use case: stylized-concept
Asset type: fighting game idle sprite sheet source for slicing into 320x320 frames
Primary request: Create a sharp pixel-art sprite sheet with exactly 12 sequential IDLE stance frames for CHARACTER_NAME.

Subject: CHARACTER_ARCHETYPE. IDENTITY_LOCK. OUTFIT_LOCK. Palette: PALETTE.

Action: idle fighting stance with real frame-to-frame movement: bouncing lightly on the toes, shoulders rising and falling, guard hands shifting, elbows and knees subtly changing, clothing and hair moving slightly. The fighter remains ready to attack in every frame. All 12 frames must be distinct, not copies.

Composition/framing: 4 columns by 3 rows, one complete full-body fighter centered in each cell, same scale and same grounded shoe baseline in every cell.

<Global Style Block>
```

## Walk Prompt

```text
Use case: stylized-concept
Asset type: fighting game walk sprite sheet source for slicing into 320x320 frames
Primary request: Create a sharp pixel-art sprite sheet with exactly 6 sequential WALK frames for CHARACTER_NAME.

Subject: CHARACTER_ARCHETYPE. IDENTITY_LOCK. OUTFIT_LOCK. Palette: PALETTE.

Action: walking forward while staying in a guarded fighting stance. Legs step clearly, weight shifts visibly, guard hands bob and adjust, clothing follows the motion. Feet and body remain side-facing toward screen-right. All 6 frames must be distinct, not copies.

Composition/framing: 3 columns by 2 rows, one complete full-body fighter centered in each cell, same scale and same grounded shoe baseline in every cell.

<Global Style Block>
```

## Jump Prompt

```text
Use case: stylized-concept
Asset type: fighting game jump sprite sheet source for slicing into 320x320 frames
Primary request: Create a sharp pixel-art sprite sheet with exactly 4 sequential JUMP frames for CHARACTER_NAME.

Subject: CHARACTER_ARCHETYPE. IDENTITY_LOCK. OUTFIT_LOCK. Palette: PALETTE.

Action: jump sequence in this order: crouched launch, rising knee-up guard, airborne tuck with guard maintained, landing recovery. Arms, legs, hair, and clothing must change clearly in every frame. Body stays side-facing toward screen-right.

Composition/framing: 2 columns by 2 rows, one complete full-body fighter centered in each cell, consistent scale, enough margin for raised knees and moving clothing.

<Global Style Block>
```

## Crouch Prompt

```text
Use case: stylized-concept
Asset type: fighting game crouch sprite sheet source for slicing into 320x320 frames
Primary request: Create a sharp pixel-art sprite sheet with exactly 4 sequential CROUCH frames for CHARACTER_NAME.

Subject: CHARACTER_ARCHETYPE. IDENTITY_LOCK. OUTFIT_LOCK. Palette: PALETTE.

Action: crouch sequence in this order: standing guard dropping down, low guarded crouch, deeper defensive crouch with one hand forward, rising back toward guard. This must be a real crouch with bent knees and lowered torso, not a shrunken standing pose.

Composition/framing: 2 columns by 2 rows, one complete full-body fighter centered in each cell, consistent scale and grounded baseline.

<Global Style Block>
```

## Block Prompt

```text
Use case: stylized-concept
Asset type: fighting game block sprite sheet source for slicing into 320x320 frames
Primary request: Create a sharp pixel-art sprite sheet with exactly 3 sequential BLOCK frames for CHARACTER_NAME.

Subject: CHARACTER_ARCHETYPE. IDENTITY_LOCK. OUTFIT_LOCK. Palette: PALETTE.

Action: defensive block sequence in this order: guard starts high, forearms cross or tighten to absorb impact, recoil brace with shoulders tucked. Arms move visibly in each frame. Legs stay planted in a fighting stance.

Composition/framing: 3 columns by 1 row, one complete full-body fighter centered in each cell, consistent scale and grounded baseline.

<Global Style Block>
```

## Light Attack Prompt

```text
Use case: stylized-concept
Asset type: fighting game light attack sprite sheet source for slicing into 320x320 frames
Primary request: Create a sharp pixel-art sprite sheet with exactly 4 sequential LIGHT PUNCH frames for CHARACTER_NAME.

Subject: CHARACTER_ARCHETYPE. IDENTITY_LOCK. OUTFIT_LOCK. Palette: PALETTE.

Action: fast jab sequence in this order: guarded wind-up, straight jab extension toward screen-right, full punch impact extension, recoil back to guard. Hand positions must change obviously in every frame. Legs remain in side-facing fighting stance.

Composition/framing: 2 columns by 2 rows, one complete full-body fighter centered in each cell, consistent scale and grounded baseline.

<Global Style Block>
```

## Heavy Attack Prompt

```text
Use case: stylized-concept
Asset type: fighting game heavy attack sprite sheet source for slicing into 320x320 frames
Primary request: Create a sharp pixel-art sprite sheet with exactly 5 sequential HEAVY ATTACK frames for CHARACTER_NAME.

Subject: CHARACTER_ARCHETYPE. IDENTITY_LOCK. OUTFIT_LOCK. Palette: PALETTE.

Action: powerful side kick sequence in this order: guard wind-up, knee chamber, full side kick extension toward screen-right, impact pose with a small ENERGY_SIGNATURE burst attached to the kicking foot, recovery to guard. Leg, hand, and clothing positions change dramatically in each frame.

Composition/framing: 3 columns by 2 rows, use only the first 5 cells and leave the sixth cell empty. One complete full-body fighter centered in each used cell, lots of empty margin around every pose, consistent scale and grounded baseline.

<Global Style Block>
```

## Special Attack Prompt

```text
Use case: stylized-concept
Asset type: fighting game special attack sprite sheet source for slicing into 320x320 frames
Primary request: Create a sharp pixel-art sprite sheet with exactly 6 sequential SPECIAL ABILITY frames for CHARACTER_NAME.

Subject: CHARACTER_ARCHETYPE. IDENTITY_LOCK. OUTFIT_LOCK. Palette: PALETTE.

Action: SPECIAL_MOVE sequence in this order: guarded wind-up, ENERGY_SIGNATURE charging around both hands, step forward, arm thrust, bright ENERGY_SIGNATURE burst or projectile from the striking hand toward screen-right, recovery guard. Big visible hand, stance, clothing, and energy-effect movement in every frame.

Composition/framing: 3 columns by 2 rows, one complete full-body fighter centered in each cell, consistent scale and grounded baseline, enough margin for the burst/projectile.

<Global Style Block>
```

## Knockdown Prompt

```text
Use case: stylized-concept
Asset type: fighting game knockdown sprite sheet source for slicing into 320x320 frames
Primary request: Create a sharp pixel-art sprite sheet with exactly 5 sequential KNOCKDOWN frames for CHARACTER_NAME.

Subject: CHARACTER_ARCHETYPE. IDENTITY_LOCK. OUTFIT_LOCK. Palette: PALETTE.

Action: hit reaction and knockdown sequence in this order: struck recoil with guard open, falling backward sideways, landing on side, lying on floor stunned, pushing up recovery. Body, hair, and clothing changes must be large and readable in every frame. Keep the same character and outfit throughout.

Composition/framing: 3 columns by 2 rows, use only the first 5 cells and leave the sixth cell empty. One complete full-body fighter centered in each used cell, lots of empty margin around every pose, no body part crosses a cell boundary.

<Global Style Block>
```

## Processing Rules After Generation

1. Save every raw generated sheet under `public/assets/concepts/action-generation/<character>/`.
2. Slice by the requested source layout, not by whatever whitespace the generator adds.
3. Remove the flat/dark background and emit transparent RGBA.
4. Normalize with one constant scale per animation strip, not per frame. This prevents the fighter from shrinking or growing mid-animation.
5. Preserve 320x320 cells and the exact runtime strip dimensions listed above.
6. Grounded frames should share a consistent shoe baseline. Jump and knockdown frames may move within the cell, but the apparent character scale should not change.
7. Sharpen after resize with a light unsharp mask or equivalent. Do not accept blurry strips.
8. Build a final contact sheet with all animations before committing. Reject sheets with wrong-facing feet, clipped limbs, duplicate frames, detached body fragments, or major costume drift.
