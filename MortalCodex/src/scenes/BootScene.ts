import Phaser from 'phaser';
import {
  createGeneratedAnimations,
  getGeneratedAssetManifest,
  queueGeneratedAssetManifest,
  queueGeneratedAssets,
} from '../game/assets';
import { SceneKey } from './sceneKeys';
import { addNeonLogo, drawArenaBackdrop } from './titleFx';

export class BootScene extends Phaser.Scene {
  public constructor() {
    super(SceneKey.Boot);
  }

  public preload(): void {
    queueGeneratedAssetManifest(this);
  }

  public create(): void {
    const manifest = getGeneratedAssetManifest(this);
    const startMainMenu = (): void => {
      createGeneratedAnimations(this, manifest);
      this.scene.start(SceneKey.MainMenu);
    };

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(`Failed to load generated asset "${file.key}" from ${file.src}`);
    });

    const queuedAssets = queueGeneratedAssets(this, manifest);

    if (queuedAssets.textureKeys.length === 0 && queuedAssets.audioKeys.length === 0) {
      startMainMenu();
      return;
    }

    const updateProgress = this.drawLoadingScreen(manifest.title);
    this.load.on('progress', updateProgress);
    this.load.once('complete', () => {
      updateProgress(1);
      this.time.delayedCall(180, startMainMenu);
    });
    this.load.start();
  }

  /** Renders the attract loading screen and returns a progress (0..1) setter. */
  private drawLoadingScreen(title: string): (progress: number) => void {
    const { width, height } = this.scale;

    drawArenaBackdrop(this, { dim: 0.05 });
    addNeonLogo(this, width / 2, height * 0.4, title, { fontSize: 74, animate: true });
    this.add
      .text(width / 2, height * 0.4 + 52, 'A R C A D E   F I G H T E R', {
        color: '#8fe9dc',
        fontFamily: 'monospace',
        fontSize: '14px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const barWidth = 420;
    const barHeight = 14;
    const barX = (width - barWidth) / 2;
    const barY = height * 0.66;

    this.add.rectangle(width / 2, barY, barWidth + 8, barHeight + 8, 0x05080f, 0.85).setStrokeStyle(2, 0x39c5e0, 0.55);
    const fill = this.add.rectangle(barX, barY, 1, barHeight, 0x3ce07a, 1).setOrigin(0, 0.5);
    const percent = this.add
      .text(width / 2, barY + 30, '0%', { color: '#cdfbf3', fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold' })
      .setOrigin(0.5);

    const loading = this.add
      .text(width / 2, barY - 30, 'NOW LOADING', {
        color: '#cdfbf3',
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 0, '#39e0c8', 10, false, true);
    this.tweens.add({ targets: loading, alpha: 0.3, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    return (progress: number) => {
      const clamped = Phaser.Math.Clamp(progress, 0, 1);
      fill.width = Math.max(1, barWidth * clamped);
      const blend = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(0x39c5e0),
        Phaser.Display.Color.IntegerToColor(0x3ce07a),
        100,
        Math.round(clamped * 100),
      );
      fill.fillColor = Phaser.Display.Color.GetColor(blend.r, blend.g, blend.b);
      percent.setText(`${Math.round(clamped * 100)}%`);
    };
  }
}
