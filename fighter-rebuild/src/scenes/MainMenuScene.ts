import type { GameConfig } from '../game/types';
import { BaseScene, type MenuFlowData, type MenuSettingsSelection, type SelectableItem } from './BaseScene';
import { SceneKey } from './sceneKeys';

const PLAY_STAGE_IDS = ['neon-metropolis', 'tropic-cove'] as const;

export class MainMenuScene extends BaseScene {
  public constructor() {
    super(SceneKey.MainMenu);
  }

  public create(data?: MenuFlowData): void {
    void this.renderWithConfig((config) => this.renderMenu(config, data));
  }

  private renderMenu(config: GameConfig, data?: MenuFlowData): void {
    const settings = this.resolveSettings(config, data);
    const stage = config.stagesById[data?.stageId ?? config.settings.defaultStageId] ?? config.stages[0];
    const characters = config.characters.slice(0, 2);
    this.drawBackdrop(stage);
    this.addTitle('Mortal Codex', 'Play vs CPU', 'brand');

    this.add
      .text(52, 126, 'Pick a fighter, the CPU takes the other side.', {
        color: '#d7dee0',
        fontFamily: 'monospace',
        fontSize: '17px',
      })
      .setOrigin(0, 0.5);

    for (const [index, character] of characters.entries()) {
      const x = 625 + index * 132;
      this.add.rectangle(x, 168, 108, 108, 0x0a0b0f, 0.72).setStrokeStyle(2, index === 0 ? 0xf0a83a : 0x70e2db, 0.78);
      this.add.image(x, 168, character.portraitKey).setDisplaySize(94, 94).setFlipX(index === 1);
      this.add
        .text(x, 236, character.displayName, {
          align: 'center',
          color: '#f8fafc',
          fixedWidth: 120,
          fontFamily: 'monospace',
          fontSize: '14px',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
    }

    this.add
      .text(626, 308, this.settingsSummary(settings), {
        color: '#b8ced2',
        fixedWidth: 260,
        fontFamily: 'monospace',
        fontSize: '14px',
        lineSpacing: 7,
      })
      .setOrigin(0.5, 0);

    const items: SelectableItem[] = [
      this.createButton(246, 248, 340, 78, 'Play vs CPU', 'Random arena -> fighter select', () => {
        this.scene.start(SceneKey.CharacterSelect, {
          ...data,
          stageId: this.randomStageId(config),
          settings,
        });
      }, 'primary'),
      this.createButton(246, 346, 340, 68, 'Settings', 'Rounds, time, CPU', () => {
        this.scene.start(SceneKey.Settings, { ...data, settings });
      }),
    ];

    this.bindSelection(items, 0);
    this.addFooter('Arrow keys navigate   Enter selects');
    this.publishMenuState(SceneKey.MainMenu, {
      labels: ['Play vs CPU', 'Settings'],
      selectedStageId: stage?.id,
    });
  }

  private settingsSummary(settings: MenuSettingsSelection): string {
    return [
      `Rounds: first to ${settings.roundsToWin}`,
      `Timer: ${settings.roundTimeSeconds}s`,
      `CPU: ${settings.cpuDifficulty}`,
    ].join('\n');
  }

  private randomStageId(config: GameConfig): string {
    const stages = PLAY_STAGE_IDS.map((stageId) => config.stagesById[stageId]).filter((stage) => stage !== undefined);
    const index = Math.floor(Math.random() * Math.max(stages.length, 1));
    return stages[index]?.id ?? config.settings.defaultStageId;
  }
}
