import './style.css';
import { Game } from './Game';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app root');
}

const game = new Game(app);
game.start().catch((error) => {
  console.error(error);
  app.innerHTML = '<p class="boot-error">Drift failed to start.</p>';
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
