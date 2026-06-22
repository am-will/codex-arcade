import Phaser from 'phaser';

/**
 * Shared cinematic flourishes for the boot/loading screen and the main menu:
 * procedurally generated CRT/vignette/glow textures plus a layered neon logo.
 * Keeping it here lets the loading screen and the title screen feel like one
 * continuous arcade attract sequence.
 */

const TX = {
  glow: 'fx-soft-glow',
  scanlines: 'fx-scanlines',
  vignette: 'fx-vignette',
} as const;

const INK = {
  logoGold: '#ffd23f',
  logoRed: '#e11d2a',
  logoEdge: '#5c0c0f',
} as const;

const LOGO_FONT = 'Copperplate, "Copperplate Gothic Bold", "Times New Roman", Georgia, serif';

/** Build the one-time canvas textures the attract screens reuse. Safe to call repeatedly. */
export function ensureTitleFxTextures(scene: Phaser.Scene): void {
  makeCanvasTexture(scene, TX.glow, 256, 256, (ctx) => {
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
  });

  makeCanvasTexture(scene, TX.scanlines, 4, 4, (ctx) => {
    ctx.clearRect(0, 0, 4, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(0, 3, 4, 1);
  });

  makeCanvasTexture(scene, TX.vignette, 960, 540, (ctx) => {
    const gradient = ctx.createRadialGradient(480, 250, 150, 480, 300, 600);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.55, 'rgba(2,3,8,0.30)');
    gradient.addColorStop(1, 'rgba(0,1,4,0.92)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 960, 540);
  });
}

type BackdropOptions = {
  /** Optional loaded stage texture key painted full-bleed behind the gradients. */
  readonly imageKey?: string;
  /** Extra darkening for screens that carry a lot of foreground UI. */
  readonly dim?: number;
};

/** Paint the layered arena backdrop (image + gradients + vignette + scanlines). */
export function drawArenaBackdrop(scene: Phaser.Scene, options: BackdropOptions = {}): void {
  const { width, height } = scene.scale;
  const dim = options.dim ?? 0;
  ensureTitleFxTextures(scene);

  scene.add.rectangle(width / 2, height / 2, width, height, 0x03040a);

  if (options.imageKey && scene.textures.exists(options.imageKey)) {
    const image = scene.add.image(width / 2, height / 2, options.imageKey);
    const scale = Math.max(width / image.width, height / image.height);
    image.setScale(scale).setAlpha(0.92);
  }

  const wash = scene.add.graphics();
  wash.fillGradientStyle(0x0a1230, 0x140a2a, 0x05060f, 0x05060f, 0.5, 0.5, 0.96, 0.96);
  wash.fillRect(0, 0, width, height);

  const floorShade = scene.add.graphics();
  floorShade.fillGradientStyle(0x000000, 0x000000, 0x01030a, 0x01030a, 0, 0, 0.82 + dim, 0.82 + dim);
  floorShade.fillRect(0, height * 0.5, width, height * 0.5);

  scene.add.image(width / 2, height / 2, TX.vignette).setDisplaySize(width, height).setAlpha(0.95 + dim * 0.05);
  scene.add
    .tileSprite(width / 2, height / 2, width, height, TX.scanlines)
    .setAlpha(0.5)
    .setBlendMode(Phaser.BlendModes.MULTIPLY);
}

/** Drifting neon embers rising from the arena floor — pure ambience. */
export function addEmberField(scene: Phaser.Scene): Phaser.GameObjects.Particles.ParticleEmitter {
  ensureTitleFxTextures(scene);
  const { width, height } = scene.scale;

  return scene.add
    .particles(0, 0, TX.glow, {
      x: { min: 0, max: width },
      y: height + 12,
      quantity: 1,
      frequency: 220,
      lifespan: { min: 4200, max: 8200 },
      speedY: { min: -42, max: -16 },
      speedX: { min: -10, max: 10 },
      scale: { start: 0.16, end: 0 },
      alpha: { start: 0.55, end: 0 },
      tint: [0x6fd6ff, 0xff6ad5, 0xffd36f],
      blendMode: Phaser.BlendModes.ADD,
    })
    .setDepth(-1);
}

/** Additive soft glow sprite — used for rim light behind fighters and the logo. */
export function addSoftGlow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha: number,
): Phaser.GameObjects.Image {
  ensureTitleFxTextures(scene);

  return scene.add
    .image(x, y, TX.glow)
    .setDisplaySize(size, size)
    .setTint(color)
    .setAlpha(alpha)
    .setBlendMode(Phaser.BlendModes.ADD);
}

type LogoOptions = {
  readonly fontSize?: number;
  readonly animate?: boolean;
};

/** Layered gold-on-blood logo with a red glow. Returns the container so callers can tween it. */
export function addNeonLogo(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  options: LogoOptions = {},
): Phaser.GameObjects.Container {
  const fontSize = options.fontSize ?? 78;
  const label = text.toUpperCase();
  const container = scene.add.container(x, y);

  const glow = scene.add
    .text(0, 0, label, {
      color: INK.logoRed,
      fontFamily: LOGO_FONT,
      fontSize: `${fontSize}px`,
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setAlpha(0.85)
    .setShadow(0, 0, '#ff2d20', 26, true, true);

  const base = scene.add
    .text(0, 0, label, {
      color: INK.logoGold,
      fontFamily: LOGO_FONT,
      fontSize: `${fontSize}px`,
      fontStyle: 'bold',
      stroke: INK.logoEdge,
      strokeThickness: Math.max(4, Math.round(fontSize * 0.12)),
    })
    .setOrigin(0.5)
    .setShadow(0, Math.round(fontSize * 0.06), '#150103', 8, false, true);

  container.add([glow, base]);

  if (options.animate) {
    container.setScale(1.35).setAlpha(0);
    scene.tweens.add({
      targets: container,
      scale: 1,
      alpha: 1,
      duration: 620,
      ease: 'Back.out',
    });
    scene.tweens.add({
      targets: glow,
      alpha: 0.45,
      duration: 1600,
      delay: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  return container;
}

type DrawFn = (ctx: CanvasRenderingContext2D) => void;

function makeCanvasTexture(scene: Phaser.Scene, key: string, width: number, height: number, draw: DrawFn): void {
  if (scene.textures.exists(key)) {
    return;
  }

  const texture = scene.textures.createCanvas(key, width, height);

  if (!texture) {
    return;
  }

  draw(texture.context);
  texture.refresh();
}
