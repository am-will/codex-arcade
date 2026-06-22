# Codex Arcade Agent Notes

- Treat the root project as the playable Codex Arcade launcher.
- The shipped cabinet has exactly two selectable games: Mortal Codex (`MortalCodex/`) and Flamethrow (`flamethrow/`).
- Do not add `drift/` to the launcher, README, deployment output, or validation path unless the user explicitly asks to restore it.
- Local play uses `npm run build` followed by `NO_OPEN=1 npm start`; the launcher serves the two games on separate local ports.
- Vercel play uses `npm run build:vercel`; it emits `vercel-static/` with the launcher and both games mounted under `/games/...`.
- Before deploying, verify the launcher loads and both game cards can launch into a nonblank iframe.
