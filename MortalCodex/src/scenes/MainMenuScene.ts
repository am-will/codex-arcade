import Phaser from 'phaser';
import type { CharacterDefinition, GameConfig } from '../game/types';
import { BaseScene, type MenuFlowData, type MenuSettingsSelection, type SelectableItem } from './BaseScene';
import { SceneKey } from './sceneKeys';
import { addEmberField, addNeonLogo, addSoftGlow, drawArenaBackdrop } from './titleFx';
import { requestArcadeExit } from '../arcadeBridge';

const PLAY_STAGE_IDS = ['neon-metropolis', 'tropic-cove'] as const;
const TITLE_STAGE_ID = 'neon-metropolis';
/** Legacy first-generation sprites we no longer headline on the title screen. */
const RETIRED_FIGHTER_IDS = new Set(['sama', 'amodi']);

type ChipTheme = 'primary' | 'secondary';

type MenuChip = {
  readonly item: SelectableItem;
};

export class MainMenuScene extends BaseScene {
  public constructor() {
    super(SceneKey.MainMenu);
  }

  public create(data?: MenuFlowData): void {
    void this.renderWithConfig((config) => this.renderMenu(config, data));
  }

  private renderMenu(config: GameConfig, data?: MenuFlowData): void {
    const { width, height } = this.scale;
    const settings = this.resolveSettings(config, data);

    const titleStage =
      config.stagesById[TITLE_STAGE_ID] ?? config.stagesById[config.settings.defaultStageId] ?? config.stages[0];
    drawArenaBackdrop(this, { imageKey: titleStage?.layers[0]?.assetKey });
    addEmberField(this);

    const [leftFighter, rightFighter] = this.featuredFighters(config);
    if (leftFighter) {
      this.addHeroFighter(leftFighter, width * 0.205, height * 0.69, false, 0x3ce07a, -220, 40);
    }
    if (rightFighter) {
      this.addHeroFighter(rightFighter, width * 0.795, height * 0.69, true, 0xffb24a, 220, 160);
    }

    this.addVersusBadge(width / 2, height * 0.555);

    addNeonLogo(this, width / 2, 102, config.manifest.title, { fontSize: 82, animate: true });
    this.add
      .text(width / 2, 156, 'N E O N   C I T Y   S H O W D O W N', {
        color: '#8fe9dc',
        fontFamily: 'monospace',
        fontSize: '15px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 0, '#1a7d70', 8, false, true);

    this.addConfigReadout(width - 18, 18, settings);

    const chips: MenuChip[] = [
      this.createMenuChip(width / 2 - 134, 436, 250, 54, 'PLAY VS CPU', 'primary', () => {
        this.scene.start(SceneKey.CharacterSelect, {
          ...data,
          stageId: this.randomStageId(config),
          settings,
        });
      }),
      this.createMenuChip(width / 2 + 134, 436, 250, 54, 'SETTINGS', 'secondary', () => {
        this.scene.start(SceneKey.Settings, { ...data, settings });
      }),
    ];

    this.bindSelection(
      chips.map((chip) => chip.item),
      0,
    );
    this.addPressPrompt(width / 2, 392);
    this.addArcadeFooter();

    // From the top menu, ESC backs all the way out to the Codex Arcade picker
    // (when embedded). Deeper scenes already use ESC to return here first.
    this.input.keyboard?.on('keydown-ESC', () => {
      requestArcadeExit();
    });

    this.publishMenuState(SceneKey.MainMenu, {
      labels: ['Play vs CPU', 'Settings'],
      selectedStageId: titleStage?.id,
    });
  }

  /** Headline the current-generation fighters, never the retired first-gen sprites. */
  private featuredFighters(config: GameConfig): readonly [CharacterDefinition?, CharacterDefinition?] {
    const fresh = config.characters.filter((character) => !RETIRED_FIGHTER_IDS.has(character.id));
    const pool = fresh.length >= 2 ? fresh : config.characters;
    return [pool[0], pool[1]];
  }

  private addHeroFighter(
    character: CharacterDefinition,
    x: number,
    y: number,
    flip: boolean,
    glowColor: number,
    entranceDx: number,
    entranceDelay: number,
  ): void {
    const size = 392;

    this.add.ellipse(x, y + size * 0.42, size * 0.62, 34, 0x000308, 0.55);
    const glow = addSoftGlow(this, x, y - 8, size * 1.18, glowColor, 0.4);
    this.tweens.add({
      targets: glow,
      alpha: 0.62,
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    const portrait = this.add.image(x + entranceDx, y, character.selectPortraitKey).setFlipX(flip).setAlpha(0);
    portrait.setDisplaySize(size, size);
    this.tweens.add({
      targets: portrait,
      x,
      alpha: 1,
      duration: 680,
      delay: entranceDelay,
      ease: 'Back.out',
    });
    this.tweens.add({
      targets: portrait,
      y: y - 9,
      duration: 2600,
      delay: entranceDelay + 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    this.add
      .text(x, y + size * 0.46, character.displayName.toUpperCase(), {
        align: 'center',
        color: '#f4f8f7',
        fontFamily: '"Arial Black", Impact, monospace',
        fontSize: '18px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 0, Phaser.Display.Color.IntegerToColor(glowColor).rgba, 12, true, true)
      .setAlpha(0.92);
  }

  private addVersusBadge(x: number, y: number): void {
    const ring = this.add.rectangle(x, y, 86, 86).setStrokeStyle(2, 0xffd23f, 0.55).setAngle(45);
    const diamond = this.add.rectangle(x, y, 66, 66, 0x140509, 0.92).setStrokeStyle(3, 0xff3b30, 0.95).setAngle(45);
    const vs = this.add
      .text(x, y, 'VS', {
        color: '#ffd23f',
        fontFamily: '"Arial Black", Impact, sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 0, '#ff2d20', 14, true, true);

    this.tweens.add({
      targets: [ring, diamond, vs],
      scaleX: 1.09,
      scaleY: 1.09,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  private addConfigReadout(rightX: number, topY: number, settings: MenuSettingsSelection): void {
    const lines = [
      `ROUNDS   ${settings.roundsToWin}`,
      `TIMER    ${settings.roundTimeSeconds}s`,
      `CPU      ${settings.cpuDifficulty.toUpperCase()}`,
    ].join('\n');

    const panel = this.add.rectangle(rightX, topY, 168, 74, 0x070b14, 0.62).setOrigin(1, 0).setStrokeStyle(1, 0x39c5e0, 0.45);
    this.add.rectangle(rightX - panel.width, topY, panel.width, 3, 0x39c5e0, 0.8).setOrigin(0, 0);
    this.add
      .text(rightX - 12, topY + 13, lines, {
        align: 'right',
        color: '#a9c6cc',
        fontFamily: 'monospace',
        fontSize: '13px',
        lineSpacing: 6,
      })
      .setOrigin(1, 0);
  }

  private createMenuChip(
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    label: string,
    theme: ChipTheme,
    onPress: () => void,
  ): MenuChip {
    const isPrimary = theme === 'primary';
    const accent = isPrimary ? 0x3ce07a : 0x39c5e0;
    const accentInk = isPrimary ? '#9bffc4' : '#bdeeff';
    const baseFill = isPrimary ? 0x10231a : 0x0e1622;
    const focusFill = isPrimary ? 0x1d4a30 : 0x183245;

    const container = this.add.container(centerX, centerY);
    const background = this.add.rectangle(0, 0, width, height, baseFill, 0.88).setStrokeStyle(2, accent, 0.5);
    const accentBar = this.add.rectangle(-width / 2 + 3, 0, 4, height - 12, accent, 0.9);
    const labelText = this.add
      .text(6, 0, label, {
        color: '#eef6f4',
        fontFamily: '"Arial Black", Impact, monospace',
        fontSize: '21px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const cursor = this.add
      .text(-width / 2 + 18, 0, '▶', { color: accentInk, fontFamily: 'monospace', fontSize: '15px' })
      .setOrigin(0.5)
      .setAlpha(0);
    const zone = this.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive();

    container.add([background, accentBar, labelText, cursor, zone]);

    const item: SelectableItem = {
      activate: onPress,
      setFocused: (focused) => {
        background.setFillStyle(focused ? focusFill : baseFill, focused ? 0.96 : 0.88);
        background.setStrokeStyle(focused ? 3 : 2, accent, focused ? 1 : 0.5);
        labelText.setColor(focused ? accentInk : '#eef6f4');
        labelText.setShadow(0, 0, focused ? Phaser.Display.Color.IntegerToColor(accent).rgba : 'rgba(0,0,0,0)', focused ? 12 : 0, true, true);
        cursor.setAlpha(focused ? 1 : 0);
        container.setScale(focused ? 1.05 : 1);
      },
    };

    zone.on('pointerover', () => item.setFocused(true));
    zone.on('pointerup', onPress);

    return { item };
  }

  private addPressPrompt(x: number, y: number): void {
    const prompt = this.add
      .text(x, y, 'PRESS ENTER TO FIGHT', {
        color: '#cdfbf3',
        fontFamily: 'monospace',
        fontSize: '17px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 0, '#39e0c8', 10, false, true);

    this.tweens.add({
      targets: prompt,
      alpha: 0.22,
      duration: 760,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  private addArcadeFooter(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height - 18, 'ARROWS / WASD  MOVE      ENTER  SELECT      ESC  BACK', {
        align: 'center',
        color: '#7f9298',
        fontFamily: 'monospace',
        fontSize: '12px',
      })
      .setOrigin(0.5);
    this.add
      .text(16, height - 18, '© 2026 CODEX ARCADE', { color: '#5c6e74', fontFamily: 'monospace', fontSize: '11px' })
      .setOrigin(0, 0.5);
    this.add
      .text(width - 16, height - 18, 'INSERT COIN', { color: '#c7a24a', fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold' })
      .setOrigin(1, 0.5);
  }

  private randomStageId(config: GameConfig): string {
    const stages = PLAY_STAGE_IDS.map((stageId) => config.stagesById[stageId]).filter((stage) => stage !== undefined);
    const index = Math.floor(Math.random() * Math.max(stages.length, 1));
    return stages[index]?.id ?? config.settings.defaultStageId;
  }
}
