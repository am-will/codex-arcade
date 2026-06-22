// Single source of truth for which games the arcade ships, shared by the
// launcher (server.mjs) and the build script (scripts/build-games.mjs).

export const ARCADE_PORT = Number(process.env.PORT) || 4321;

/** Display order = menu order. Each game runs from `${dir}/dist` on its own port. */
export const GAMES = [
  { id: 'mortal-codex', title: 'Mortal Codex', dir: 'MortalCodex', portOffset: 1 },
  { id: 'flamethrow', title: 'Flamethrow', dir: 'flamethrow', portOffset: 2 },
  // Drift is built and ready — uncomment to add it to the cabinet:
  // { id: 'drift', title: 'Drift', dir: 'drift', portOffset: 3 },
];

export const gamePort = (g) => ARCADE_PORT + g.portOffset;
export const gameDist = (g) => `${g.dir}/dist`;
