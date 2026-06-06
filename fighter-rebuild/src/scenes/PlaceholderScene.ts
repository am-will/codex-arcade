import Phaser from 'phaser';
import { SceneKey } from './sceneKeys';

export class PlaceholderScene extends Phaser.Scene {
  public constructor() {
    super(SceneKey.Placeholder);
  }

  public create(): void {
    const { width, height } = this.scale;

    this.add
      .rectangle(width / 2, height / 2, width * 0.72, height * 0.48, 0x1f2933, 0.92)
      .setStrokeStyle(2, 0x4fd1c5, 0.8);

    this.add
      .text(width / 2, height / 2, 'Match scene placeholder', {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontSize: '22px',
      })
      .setOrigin(0.5);
  }
}
