import './style.css'
import { Game } from './Game'

const app = document.querySelector<HTMLElement>('#app')

if (!app) {
  throw new Error('Missing #app root.')
}

const game = new Game(app)
game.start().catch((error) => {
  console.error(error)
  app.innerHTML = '<main class="boot-error">Flamethrow failed to start.</main>'
})

window.addEventListener('beforeunload', () => game.dispose())

// When embedded in the Codex Arcade cabinet, ESC returns to the game-select
// menu. Opened standalone, the parent is the window itself, so this is a no-op.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && window.parent !== window) {
    event.preventDefault()
    window.parent.postMessage({ type: 'codex-arcade:exit' }, '*')
  }
})
