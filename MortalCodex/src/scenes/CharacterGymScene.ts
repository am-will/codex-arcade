import Phaser from 'phaser';
import { loadGameConfig, resolveCharacterFrameBoxes } from '../game/config';
import type {
  AnimationName,
  AssetManifestAnimation,
  CharacterDefinition,
  GameConfig,
  Rect,
} from '../game/types';
import {
  type CharacterGymOverlayKey,
  type CharacterGymPanelState,
  type DebugPanelMount,
  mountCharacterGymPanel,
} from '../shell/debugPanel';
import { SceneKey } from './sceneKeys';

const FRAME_SIZE = 320;
const PREVIEW_X = 420;
const PREVIEW_Y = 290;
const FRAME_TOP_LEFT = {
  x: PREVIEW_X - FRAME_SIZE / 2,
  y: PREVIEW_Y - FRAME_SIZE / 2,
};

const OVERLAY_COLORS: Readonly<Record<CharacterGymOverlayKey, number>> = {
  visual: 0xffffff,
  collision: 0x40b6ff,
  hurt: 0xff4d70,
  attack: 0xffcf3c,
  guard: 0x62e06f,
};

const ATTACK_LABELS: Readonly<Record<'light' | 'heavy' | 'special', string>> = {
  light: 'Light Punch',
  heavy: 'Heavy Kick',
  special: 'Special Combo',
};

type GymState = {
  characterId: string;
  animation: AnimationName;
  frameIndex: number;
  isPlaying: boolean;
  overlays: Record<CharacterGymOverlayKey, boolean>;
};

export class CharacterGymScene extends Phaser.Scene {
  private gameConfig: GameConfig | null = null;
  private previewSprite: Phaser.GameObjects.Sprite | null = null;
  private overlayGraphics: Phaser.GameObjects.Graphics | null = null;
  private titleText: Phaser.GameObjects.Text | null = null;
  private frameText: Phaser.GameObjects.Text | null = null;
  private detailsText: Phaser.GameObjects.Text | null = null;
  private loadingText: Phaser.GameObjects.Text | null = null;
  private panel: DebugPanelMount | null = null;
  private readonly state: GymState = {
    characterId: 'sama',
    animation: 'idle',
    frameIndex: 0,
    isPlaying: false,
    overlays: {
      visual: true,
      collision: true,
      hurt: true,
      attack: true,
      guard: true,
    },
  };

  public constructor() {
    super(SceneKey.CharacterGym);
  }

  public create(): void {
    this.createBackdrop();

    this.loadingText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Loading Character Gym...', {
        color: '#f6f1dd',
        fontFamily: 'monospace',
        fontSize: '18px',
      })
      .setOrigin(0.5);

    this.overlayGraphics = this.add.graphics().setDepth(20);

    this.input.keyboard?.on('keydown', this.handleKeyDown, this);
    this.events.once('shutdown', this.dispose, this);
    this.events.once('destroy', this.dispose, this);

    void this.loadAndMountConfig();
  }

  public override update(): void {
    if (!this.state.isPlaying || !this.previewSprite) {
      return;
    }

    const activeFrameIndex = Number(this.previewSprite.frame.name);
    if (Number.isInteger(activeFrameIndex) && activeFrameIndex !== this.state.frameIndex) {
      this.state.frameIndex = activeFrameIndex;
      this.refreshReadouts();
      this.drawOverlays();
      this.syncPanel();
    }
  }

  private async loadAndMountConfig(): Promise<void> {
    try {
      this.gameConfig = await loadGameConfig();
    } catch (error) {
      this.loadingText?.setText(error instanceof Error ? error.message : 'Failed to load Character Gym config.');
      return;
    }

    const defaultCharacter = this.gameConfig.charactersById[this.gameConfig.settings.defaultPlayerId] ?? this.gameConfig.characters[0];
    if (!defaultCharacter) {
      this.loadingText?.setText('No character config is available.');
      return;
    }

    this.state.characterId = defaultCharacter.id;
    this.state.animation = this.getAnimationOptions(defaultCharacter)[0]?.value ?? 'idle';
    this.state.frameIndex = 0;
    this.loadingText?.destroy();
    this.loadingText = null;

    this.createHudText();
    this.createPreviewSprite();
    this.mountPanel();
    this.refreshPreview();
  }

  private createBackdrop(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#101116');

    this.add.rectangle(width / 2, height / 2, width, height, 0x151a20);
    this.add.rectangle(width / 2, height - 92, width, 120, 0x1b2a2b);
    this.add.line(0, 0, 80, height - 150, width - 80, height - 150, 0x4b625f, 1).setOrigin(0, 0);

    for (let x = 80; x < width; x += 80) {
      this.add.line(0, 0, x, height - 150, x + 28, height, 0x263438, 0.55).setOrigin(0, 0);
    }

    for (let y = height - 130; y < height; y += 26) {
      this.add.line(0, 0, 0, y, width, y, 0x263438, 0.5).setOrigin(0, 0);
    }
  }

  private createHudText(): void {
    this.titleText = this.add.text(28, 24, '', {
      color: '#f6f1dd',
      fontFamily: 'monospace',
      fontSize: '24px',
      fontStyle: '700',
    });

    this.frameText = this.add.text(28, 60, '', {
      color: '#95d7c5',
      fontFamily: 'monospace',
      fontSize: '14px',
    });

    this.detailsText = this.add.text(28, 398, '', {
      color: '#d8e6e1',
      fontFamily: 'monospace',
      fontSize: '12px',
      lineSpacing: 4,
      wordWrap: { width: 230 },
    });
  }

  private createPreviewSprite(): void {
    const animationAsset = this.getSelectedAnimationAsset();
    if (!animationAsset) {
      return;
    }

    this.previewSprite = this.add
      .sprite(PREVIEW_X, PREVIEW_Y, animationAsset.key, this.state.frameIndex)
      .setOrigin(0.5)
      .setDepth(10);

    this.previewSprite.on('animationcomplete', () => {
      this.state.isPlaying = false;
      this.refreshReadouts();
      this.drawOverlays();
      this.syncPanel();
    });
  }

  private mountPanel(): void {
    this.panel = mountCharacterGymPanel(
      document.querySelector<HTMLElement>('#debug-sidebar'),
      this.createPanelState(),
      {
        onCharacterChange: (characterId) => {
          this.setCharacter(characterId);
        },
        onAnimationChange: (animationName) => {
          this.setAnimation(animationName);
        },
        onFrameChange: (frameIndex) => {
          this.setFrame(frameIndex, false);
        },
        onStepFrame: (direction) => {
          this.stepFrame(direction);
        },
        onTogglePlayback: () => {
          this.togglePlayback();
        },
        onOverlayChange: (overlay, enabled) => {
          this.state.overlays[overlay] = enabled;
          this.drawOverlays();
          this.syncPanel();
        },
      },
    );
  }

  private setCharacter(characterId: string): void {
    const nextCharacter = this.gameConfig?.charactersById[characterId];
    if (!nextCharacter) {
      return;
    }

    this.state.characterId = nextCharacter.id;
    this.state.animation = this.getAnimationOptions(nextCharacter)[0]?.value ?? 'idle';
    this.state.frameIndex = 0;
    this.state.isPlaying = false;
    this.refreshPreview();
  }

  private setAnimation(animationName: string): void {
    this.state.animation = animationName;
    this.state.frameIndex = 0;
    this.state.isPlaying = false;
    this.refreshPreview();
  }

  private setFrame(frameIndex: number, keepPlaying: boolean): void {
    const frameCount = this.getSelectedFrameCount();
    this.state.frameIndex = Phaser.Math.Clamp(Math.trunc(frameIndex), 0, Math.max(0, frameCount - 1));
    this.state.isPlaying = keepPlaying;
    this.refreshPreview();
  }

  private stepFrame(direction: -1 | 1): void {
    const frameCount = this.getSelectedFrameCount();
    const nextFrame = (this.state.frameIndex + direction + frameCount) % frameCount;
    this.setFrame(nextFrame, false);
  }

  private togglePlayback(): void {
    this.state.isPlaying = !this.state.isPlaying;

    if (this.state.isPlaying) {
      const animationAsset = this.getSelectedAnimationAsset();
      if (!animationAsset) {
        this.state.isPlaying = false;
        return;
      }

      if (!animationAsset.loop && this.state.frameIndex >= animationAsset.frameCount - 1) {
        this.state.frameIndex = 0;
      }
    }

    this.refreshPreview();
  }

  private refreshPreview(): void {
    const animationAsset = this.getSelectedAnimationAsset();

    if (!animationAsset) {
      return;
    }

    if (!this.previewSprite) {
      this.createPreviewSprite();
    }

    this.previewSprite?.setTexture(animationAsset.key);

    if (this.state.isPlaying) {
      this.previewSprite?.play(animationAsset.key, true);
    } else {
      this.previewSprite?.stop();
      this.previewSprite?.setFrame(this.state.frameIndex);
    }

    this.refreshReadouts();
    this.drawOverlays();
    this.syncPanel();
  }

  private refreshReadouts(): void {
    const character = this.getSelectedCharacter();
    const animationAsset = this.getSelectedAnimationAsset();
    const activeAttackBoxes = character ? this.getActiveAttackBoxes(character) : [];
    const resolvedBoxes = character
      ? resolveCharacterFrameBoxes(character, this.state.animation, this.state.frameIndex)
      : null;

    this.titleText?.setText(`Character Gym: ${character?.displayName ?? 'Unknown'} / ${this.getAnimationLabel(this.state.animation)}`);
    this.frameText?.setText(
      `Frame ${this.state.frameIndex + 1}/${animationAsset?.frameCount ?? 1}  ${this.state.isPlaying ? 'Playing' : 'Paused'}  ` +
        `Texture ${animationAsset?.key ?? 'missing'}  Native ${FRAME_SIZE}x${FRAME_SIZE}`,
    );
    this.detailsText?.setText(
      [
        'Keys: Left/Right frame, Space play, Esc menu',
        `Counts: hurt ${resolvedBoxes?.hurt.length ?? 0}, guard ${resolvedBoxes?.guard.length ?? 0}, attack ${activeAttackBoxes.length}`,
      ].join('\n'),
    );
  }

  private drawOverlays(): void {
    const character = this.getSelectedCharacter();
    const graphics = this.overlayGraphics;

    if (!character || !graphics) {
      return;
    }

    const resolvedBoxes = resolveCharacterFrameBoxes(character, this.state.animation, this.state.frameIndex);
    graphics.clear();

    if (this.state.overlays.visual) {
      this.drawRect({ x: 0, y: 0, width: FRAME_SIZE, height: FRAME_SIZE }, OVERLAY_COLORS.visual, 0.9, 2, 0);
    }

    if (this.state.overlays.collision) {
      this.drawRect(resolvedBoxes.collision, OVERLAY_COLORS.collision, 1, 3, 0.08);
    }

    if (this.state.overlays.hurt) {
      for (const rect of resolvedBoxes.hurt) {
        this.drawRect(rect, OVERLAY_COLORS.hurt, 1, 2, 0.11);
      }
    }

    if (this.state.overlays.guard) {
      for (const rect of resolvedBoxes.guard) {
        this.drawRect(rect, OVERLAY_COLORS.guard, 1, 2, 0.13);
      }
    }

    if (this.state.overlays.attack) {
      for (const rect of this.getActiveAttackBoxes(character)) {
        this.drawRect(rect, OVERLAY_COLORS.attack, 1, 3, 0.15);
      }
    }
  }

  private drawRect(rect: Rect, color: number, alpha: number, lineWidth: number, fillAlpha: number): void {
    this.overlayGraphics
      ?.fillStyle(color, fillAlpha)
      .fillRect(FRAME_TOP_LEFT.x + rect.x, FRAME_TOP_LEFT.y + rect.y, rect.width, rect.height)
      .lineStyle(lineWidth, color, alpha)
      .strokeRect(FRAME_TOP_LEFT.x + rect.x, FRAME_TOP_LEFT.y + rect.y, rect.width, rect.height);
  }

  private syncPanel(): void {
    this.panel?.update(this.createPanelState());
  }

  private createPanelState(): CharacterGymPanelState {
    const selectedCharacter = this.getSelectedCharacter();

    return {
      characters:
        this.gameConfig?.characters.map((character) => ({
          value: character.id,
          label: character.displayName,
        })) ?? [],
      selectedCharacterId: this.state.characterId,
      animations: selectedCharacter ? this.getAnimationOptions(selectedCharacter) : [],
      selectedAnimation: this.state.animation,
      frameIndex: this.state.frameIndex,
      frameCount: this.getSelectedFrameCount(),
      isPlaying: this.state.isPlaying,
      overlays: { ...this.state.overlays },
      exportText: this.createJsonExport(),
      warnings: this.gameConfig?.warnings ?? [],
    };
  }

  private createJsonExport(): string {
    const character = this.getSelectedCharacter();
    const animationAsset = this.getSelectedAnimationAsset();

    if (!character || !animationAsset) {
      return '{}';
    }

    const attacks = Object.values(character.attacks).filter((attack) => attack.animation === this.state.animation);

    return JSON.stringify(
      {
        characterId: character.id,
        displayName: character.displayName,
        animation: this.state.animation,
        label: this.getAnimationLabel(this.state.animation),
        frameSize: {
          width: animationAsset.frameWidth,
          height: animationAsset.frameHeight,
        },
        frames: character.frameBoxes[this.state.animation] ?? [],
        attacks,
      },
      null,
      2,
    );
  }

  private getSelectedCharacter(): CharacterDefinition | null {
    return this.gameConfig?.charactersById[this.state.characterId] ?? this.gameConfig?.characters[0] ?? null;
  }

  private getSelectedAnimationAsset(): AssetManifestAnimation | null {
    const character = this.getSelectedCharacter();
    const manifestCharacter = this.gameConfig?.manifest.characters.find((entry) => entry.id === character?.assetId);

    return manifestCharacter?.animations.find((animation) => animation.name === this.state.animation) ?? null;
  }

  private getSelectedFrameCount(): number {
    return Math.max(1, this.getSelectedAnimationAsset()?.frameCount ?? 1);
  }

  private getAnimationOptions(character: CharacterDefinition): readonly { value: string; label: string }[] {
    const manifestCharacter = this.gameConfig?.manifest.characters.find((entry) => entry.id === character.assetId);
    const animationNames = manifestCharacter?.animations.map((animation) => animation.name) ?? Object.keys(character.frameBoxes);

    return animationNames.map((animationName) => ({
      value: animationName,
      label: this.getAnimationLabel(animationName),
    }));
  }

  private getAnimationLabel(animationName: string): string {
    if (animationName === 'light') {
      return ATTACK_LABELS.light;
    }

    if (animationName === 'heavy') {
      return ATTACK_LABELS.heavy;
    }

    if (animationName === 'special') {
      return ATTACK_LABELS.special;
    }

    return animationName.charAt(0).toUpperCase() + animationName.slice(1);
  }

  private getActiveAttackBoxes(character: CharacterDefinition): Rect[] {
    return Object.values(character.attacks)
      .filter((attack) => attack.animation === this.state.animation)
      .flatMap((attack) =>
        attack.windows
          .filter((window) => this.state.frameIndex >= window.startFrame && this.state.frameIndex <= window.endFrame)
          .map((window) => window.hitbox),
      );
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (isDomEditingKeyboardTarget(event.target)) {
      return;
    }

    if (event.code === 'ArrowLeft') {
      event.preventDefault();
      this.stepFrame(-1);
      return;
    }

    if (event.code === 'ArrowRight') {
      event.preventDefault();
      this.stepFrame(1);
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      this.togglePlayback();
      return;
    }

    if (event.code === 'Escape') {
      event.preventDefault();
      this.scene.start(SceneKey.MainMenu);
    }
  }

  private dispose(): void {
    this.input.keyboard?.off('keydown', this.handleKeyDown, this);
    this.panel?.dispose();
    this.panel = null;
  }
}

function isDomEditingKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'select' || tagName === 'textarea' || target.isContentEditable;
}
