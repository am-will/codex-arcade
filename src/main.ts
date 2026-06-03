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
