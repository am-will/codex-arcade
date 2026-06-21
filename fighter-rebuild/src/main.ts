import Phaser from 'phaser';
import './styles.css';
import { SCENE_REGISTRY } from './scenes/sceneRegistry';

const DESIGN_WIDTH = 960;
const DESIGN_HEIGHT = 540;

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#101014',
    pixelArt: false,
    roundPixels: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
      expandParent: false,
    },
    scene: SCENE_REGISTRY,
  });
}

function boot(): void {
  const gameRoot = document.querySelector<HTMLElement>('#game-root');

  if (!gameRoot) {
    throw new Error('Missing #game-root mount point');
  }

  createGame(gameRoot);
}

boot();
