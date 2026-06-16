# Drift Mechanics Spec

## Design Pillar

The car should be easy to throw into a slide on any meaningful corner. The hop is not a platforming move. It is a setup gesture for drifting.

## Driving States

### Normal

- Full forward grip.
- Moderate steering response.
- Stable acceleration and braking.
- Mild traction loss only at very high speed or on sharp steering.

### Hop

- Triggered when the player presses `Space` while grounded.
- Height should be tiny: enough to visually lift the car, not enough to clear hazards.
- Recommended first pass:
  - Air time: `180ms` to `280ms`
  - Vertical lift: `0.18m` to `0.35m`
  - Forward speed preserved
  - Steering still accepted, but weaker than grounded steering
- Cooldown should be short so the player can set up frequent corners.

### Drift Entry

- If `Space` is still held when the car lands from a hop, enter drift mode.
- Drift entry should also allow a small forgiveness window:
  - If `Space` is pressed within `100ms` before landing, drift still starts.
  - If the player releases `Space` before landing, the car lands normally.

### Drift

- While `Space` is held and the car is grounded, the car behaves like the emergency brake is held.
- Steering becomes stronger and can rotate the car faster than normal grip driving.
- The velocity vector should lag behind the car facing direction, creating a visible sideways slide.
- Speed should decay slowly enough that drifting through a turn can be faster than braking hard.
- The player should feel in control, not like the car is randomly spinning.

Recommended first pass:

- Normal steering strength: `1.0x`
- Drift steering strength: `1.6x` to `2.2x`
- Drift lateral grip: `35%` to `55%` of normal
- Drift forward traction: `70%` to `85%` of normal
- Drift speed bleed: `3%` to `8%` per second while sliding
- Max drift yaw rate: capped so the car cannot instantly rotate 180 degrees

### Drift Exit

- Releasing `Space` exits drift mode.
- Grip should return over `150ms` to `300ms`, not instantly, to avoid a harsh snap.
- If the car is still at a sharp slip angle, it should smoothly recover rather than flip direction.

## Feel Rules

- A tap of `Space` should always feel like a tiny hop, not a jump button.
- Holding `Space` should not start a slide while already grounded unless it follows a hop landing. This keeps the hop-to-drift rhythm important.
- The best racing line should involve setting up drifts before corners, not holding drift forever.
- The car should remain readable from the camera even while sliding sideways.

## Tuning Metrics

Track these values in debug UI from the first prototype:

- Grounded or airborne
- Hop timer
- Drift active
- Current speed
- Slip angle
- Current checkpoint
- Lap or run time
- Best time

## Acceptance Tests

- Pressing and releasing `Space` quickly produces a tiny hop and normal landing.
- Pressing and holding `Space` through landing starts a drift.
- Releasing `Space` exits drift and restores normal steering.
- A 90-degree turn is faster with hop-to-drift than with only braking and normal steering after tuning.
- The car cannot gain time by hopping repeatedly on a straight.
