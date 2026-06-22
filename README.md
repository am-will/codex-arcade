# Codex Arcade

A neon arcade cabinet that boots straight into a **pick-your-game** menu. Choose
a game, play it full-screen, and press **Esc** (or the on-screen **EXIT**) to
return to the cabinet.

## Play

Live URL: <https://codex-arcade-henna.vercel.app/>

## Games on the cabinet

- **Mortal Codex** (`MortalCodex/`) — a Phaser neon-dojo fighting game.
- **Flamethrow** (`flamethrow/`) — a Three.js arcade basketball game about
  chaining made shots into a firestorm of multipliers.

## Install and launch

**Requirements:** [Node.js](https://nodejs.org) 18 or newer (includes `npm`).

```sh
git clone https://github.com/am-will/codex-arcade.git
cd codex-arcade

npm run build   # build every game — installs each game's deps on first run
npm start       # serve the cabinet and open it in your browser
```

- The launcher itself has **no dependencies** (it uses Node's built-in HTTP
  server), so there is nothing to `npm install` at the repo root.
- The first `npm run build` can take a couple of minutes — Mortal Codex ships a
  large set of sprite frames.
- `npm start` prints the URL (default <http://127.0.0.1:4321>) and opens it.
  - `PORT=4000 npm start` — use a different base port (games take the next ports).
  - `NO_OPEN=1 npm start` — don't auto-open a browser.

Already built once? Just `npm start`.

### Controls

| Where | Keys |
| --- | --- |
| Menu | **← →** / **A D** select · **Enter / Space** play · **1–2** jump straight in |
| In a game | **Esc** or **EXIT** button → back to the menu |
| Gamepad | D-pad/stick to select · **A**/Start to play · **B** to exit |

## How it works

Each game is a standalone Vite app that loads its assets from absolute paths, so
every game is served from **its own origin (port)** and embedded in the cabinet
via an `<iframe>` — running exactly as it does on its own. A single Node process
([`server.mjs`](server.mjs)) serves the picker plus each game's built `dist/`.
When you press Esc inside a game it posts a `codex-arcade:exit` message to the
shell, which powers the screen down and returns you to the menu.

The list of games (and their ports) lives in one place:
[`arcade.config.mjs`](arcade.config.mjs).

## Develop a single game

The games are untouched as standalone projects — work on one directly with hot
reload:

```sh
cd MortalCodex && npm install && npm run dev
cd flamethrow  && npm install && npm run dev
```

## Layout

```
index.html          arcade picker shell (the repo's front door)
arcade/             shell styles, logic, art, and generated runtime config
server.mjs          launcher: serves the picker + each game on its own port
arcade.config.mjs   single source of truth for which games ship
scripts/            build-games.mjs and build-vercel.mjs
MortalCodex/        fighting game (Phaser)
flamethrow/         basketball game (Three.js)
```
