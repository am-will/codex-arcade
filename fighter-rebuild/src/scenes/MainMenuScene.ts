import Phaser from 'phaser';
import { SceneKey } from './sceneKeys';

export class MainMenuScene extends Phaser.Scene {
  public constructor() {
    super(SceneKey.MainMenu);
  }

  public create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2 - 36, 'Sama v Amodi', {
        color: '#f6f1dd',
        fontFamily: 'monospace',
        fontSize: '42px',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 24, '1P CPU fighter scaffold', {
        color: '#98d2c0',
        fontFamily: 'monospace',
        fontSize: '18px',
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-ENTER', () => {
      this.scene.start(SceneKey.Placeholder);
    });
  }
}
