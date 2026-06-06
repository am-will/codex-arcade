import Phaser from 'phaser';

export const GENERATED_ASSET_MANIFEST_KEY = 'generated-asset-manifest';
export const GENERATED_ASSET_MANIFEST_PATH = '/assets/manifest.json';

export type GeneratedImageAsset = {
  key: string;
  path: string;
  width: number;
  height: number;
};

export type GeneratedSpriteSheetAsset = {
  key: string;
  path: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  columns: number;
  rows: number;
  fps: number;
  loop: boolean;
};

export type GeneratedCharacterAnimation = GeneratedSpriteSheetAsset & {
  name: string;
};

export type GeneratedCharacterAsset = {
  id: string;
  displayName: string;
  description: string;
  visualCue: string;
  portrait: GeneratedImageAsset;
  animations: GeneratedCharacterAnimation[];
};

export type GeneratedStageLayerAsset = GeneratedImageAsset & {
  id: string;
  parallax: number;
};

export type GeneratedStageAsset = {
  id: string;
  displayName: string;
  width: number;
  height: number;
  floorY: number;
  spawn: {
    playerX: number;
    cpuX: number;
  };
  layers: GeneratedStageLayerAsset[];
};

export type GeneratedVfxAsset = GeneratedSpriteSheetAsset & {
  animationName: string;
};

export type GeneratedAudioAsset = {
  key: string;
  path: string;
  type: string;
  format: string;
  durationMs: number;
};

export type GeneratedAssetManifest = {
  schemaVersion: number;
  generatedAt: string;
  title: string;
  style: string;
  characters: GeneratedCharacterAsset[];
  stages: GeneratedStageAsset[];
  hud: GeneratedImageAsset[];
  vfx: GeneratedVfxAsset[];
  audio: GeneratedAudioAsset[];
};

type QueueResult = {
  textureKeys: string[];
  audioKeys: string[];
};

export function queueGeneratedAssetManifest(scene: Phaser.Scene): void {
  if (!scene.cache.json.exists(GENERATED_ASSET_MANIFEST_KEY)) {
    scene.load.json(GENERATED_ASSET_MANIFEST_KEY, GENERATED_ASSET_MANIFEST_PATH);
  }
}

export function getGeneratedAssetManifest(scene: Phaser.Scene): GeneratedAssetManifest {
  const manifest = scene.cache.json.get(GENERATED_ASSET_MANIFEST_KEY);

  if (!isGeneratedAssetManifest(manifest)) {
    throw new Error(`Invalid generated asset manifest at ${GENERATED_ASSET_MANIFEST_PATH}`);
  }

  return manifest;
}

export function queueGeneratedAssets(scene: Phaser.Scene, manifest: GeneratedAssetManifest): QueueResult {
  const queuedTextures = new Set<string>();
  const queuedAudio = new Set<string>();

  for (const character of manifest.characters) {
    queueImage(scene, character.portrait, queuedTextures);

    for (const animation of character.animations) {
      queueSpriteSheet(scene, animation, queuedTextures);
    }
  }

  for (const stage of manifest.stages) {
    for (const layer of stage.layers) {
      queueImage(scene, layer, queuedTextures);
    }
  }

  for (const hudAsset of manifest.hud) {
    queueImage(scene, hudAsset, queuedTextures);
  }

  for (const effect of manifest.vfx) {
    queueSpriteSheet(scene, effect, queuedTextures);
  }

  for (const audioAsset of manifest.audio) {
    queueAudio(scene, audioAsset, queuedAudio);
  }

  return {
    textureKeys: [...queuedTextures],
    audioKeys: [...queuedAudio],
  };
}

export function createGeneratedAnimations(scene: Phaser.Scene, manifest: GeneratedAssetManifest): void {
  for (const character of manifest.characters) {
    for (const animation of character.animations) {
      createSpriteSheetAnimation(scene, {
        animationKey: animation.key,
        textureKey: animation.key,
        frameCount: animation.frameCount,
        fps: animation.fps,
        loop: animation.loop,
      });
    }
  }

  for (const effect of manifest.vfx) {
    createSpriteSheetAnimation(scene, {
      animationKey: effect.animationName,
      textureKey: effect.key,
      frameCount: effect.frameCount,
      fps: effect.fps,
      loop: effect.loop,
    });
  }
}

function queueImage(
  scene: Phaser.Scene,
  asset: Pick<GeneratedImageAsset, 'key' | 'path'>,
  queuedTextures: Set<string>,
): void {
  if (scene.textures.exists(asset.key) || queuedTextures.has(asset.key)) {
    return;
  }

  scene.load.image(asset.key, asset.path);
  queuedTextures.add(asset.key);
}

function queueSpriteSheet(
  scene: Phaser.Scene,
  asset: Pick<GeneratedSpriteSheetAsset, 'key' | 'path' | 'frameWidth' | 'frameHeight' | 'frameCount'>,
  queuedTextures: Set<string>,
): void {
  if (scene.textures.exists(asset.key) || queuedTextures.has(asset.key)) {
    return;
  }

  scene.load.spritesheet(asset.key, asset.path, {
    frameWidth: asset.frameWidth,
    frameHeight: asset.frameHeight,
    startFrame: 0,
    endFrame: Math.max(0, asset.frameCount - 1),
  });
  queuedTextures.add(asset.key);
}

function queueAudio(scene: Phaser.Scene, asset: GeneratedAudioAsset, queuedAudio: Set<string>): void {
  if (scene.cache.audio.exists(asset.key) || queuedAudio.has(asset.key)) {
    return;
  }

  scene.load.audio(asset.key, asset.path);
  queuedAudio.add(asset.key);
}

function createSpriteSheetAnimation(
  scene: Phaser.Scene,
  config: {
    animationKey: string;
    textureKey: string;
    frameCount: number;
    fps: number;
    loop: boolean;
  },
): void {
  const existingAnimation = scene.anims.get(config.animationKey) as Phaser.Animations.Animation | undefined;

  if (existingAnimation) {
    return;
  }

  scene.anims.create({
    key: config.animationKey,
    frames: scene.anims.generateFrameNumbers(config.textureKey, {
      start: 0,
      end: Math.max(0, config.frameCount - 1),
    }),
    frameRate: config.fps,
    repeat: config.loop ? -1 : 0,
  });
}

function isGeneratedAssetManifest(value: unknown): value is GeneratedAssetManifest {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.schemaVersion === 'number' &&
    typeof value.generatedAt === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.characters) &&
    Array.isArray(value.stages) &&
    Array.isArray(value.hud) &&
    Array.isArray(value.vfx) &&
    Array.isArray(value.audio)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
