import Phaser from 'phaser';
import {
  createGeneratedAnimations,
  getGeneratedAssetManifest,
  queueGeneratedAssetManifest,
  queueGeneratedAssets,
} from '../game/assets';
import { SceneKey } from './sceneKeys';

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

    this.load.once('complete', startMainMenu);
    this.load.start();
  }
}
