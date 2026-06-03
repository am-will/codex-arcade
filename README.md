# Flamethrow

Flamethrow is a neon Three.js arcade basketball game about chaining made shots into escalating fire multipliers. The hoop moves left and right, levels increase distance and obstacles, and the player can shoot with either pullback or flick controls.

## Play

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Controls

- `Pullback`: drag backward from the ball, then release to launch.
- `Flick`: switch modes, then flick forward/up to shoot.
- Make shots to build streak tiers at 3, 5, 10, and 20 in a row.
- Misses reset the streak and multiplier, but the score remains.

## Verification

```sh
npm run build
npm run test:smoke
```

The smoke test builds the production app, launches a local preview, verifies desktop and mobile rendering, exercises both shot modes, checks multiplier/level progression, validates miss reset behavior, and confirms round-over restart.
