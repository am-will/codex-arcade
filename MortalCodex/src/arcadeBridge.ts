/**
 * Cooperation with the Codex Arcade shell.
 *
 * When this game runs embedded in the arcade cabinet (inside an iframe), it can
 * ask the shell to return to the game-select menu by posting a message to the
 * parent window. When the game is opened standalone these helpers are no-ops,
 * so the game still behaves exactly as it does on its own.
 */

const ARCADE_EXIT_MESSAGE = 'codex-arcade:exit';

export function isEmbeddedInArcade(): boolean {
  try {
    return window.parent !== window;
  } catch {
    // Cross-origin access can throw; if so we are definitely embedded.
    return true;
  }
}

/** Ask the arcade shell to leave this game. Returns false when standalone. */
export function requestArcadeExit(): boolean {
  if (!isEmbeddedInArcade()) {
    return false;
  }
  window.parent.postMessage({ type: ARCADE_EXIT_MESSAGE }, '*');
  return true;
}
