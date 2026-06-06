import type { GameConfig, StageDefinition } from '../game/types';
import { BaseScene, type MenuFlowData, type SelectableItem } from './BaseScene';
import { SceneKey } from './sceneKeys';

export class StageSelectScene extends BaseScene {
  public constructor() {
    super(SceneKey.StageSelect);
  }

  public create(data?: MenuFlowData): void {
    void this.renderWithConfig((config) => this.renderStageSelect(config, data));
  }

  private renderStageSelect(config: GameConfig, data?: MenuFlowData): void {
    const selectedStageId = data?.stageId ?? config.settings.defaultStageId;
    let selectedIndex = Math.max(
      0,
      config.stages.findIndex((stage) => stage.id === selectedStageId),
    );
    const settings = this.resolveSettings(config, data);
    this.drawBackdrop(config.stages[selectedIndex]);
    this.addTitle('Stage Select', 'Choose an arena');

    const cards = config.stages.map((stage, index) =>
      this.createStageCard(stage, 480 + (index - (config.stages.length - 1) / 2) * 292, 278, () => {
        selectedIndex = index;
        this.scene.start(SceneKey.CharacterSelect, {
          ...data,
          stageId: stage.id,
          settings,
        });
      }),
    );

    this.bindSelection(cards, selectedIndex, () => this.scene.start(SceneKey.MainMenu, { ...data, settings }));
    this.addFooter('Arrow keys choose stage   Enter continues   Esc main menu');
    this.publishMenuState(SceneKey.StageSelect, {
      labels: config.stages.map((stage) => stage.displayName),
      selectedStageId: config.stages[selectedIndex]?.id,
    });
  }

  private createStageCard(stage: StageDefinition, x: number, y: number, onPress: () => void): SelectableItem {
    const width = 430;
    const height = 276;
    const container = this.add.container(x, y);
    const frame = this.add.rectangle(0, 0, width, height, 0x10141a, 0.94).setStrokeStyle(2, 0x5bd7cb, 0.5);
    const previewMask = this.add.rectangle(0, -38, width - 32, 164, 0x050608, 0.88);
    container.add([frame, previewMask]);

    for (const [index, layer] of stage.layers.entries()) {
      container.add(
        this.add
          .image(0, -38, layer.assetKey)
          .setDisplaySize(width - 32, 164)
          .setAlpha(index === stage.layers.length - 1 ? 0.9 : 0.74),
      );
    }

    const title = this.add
      .text(0, 86, stage.displayName, {
        align: 'center',
        color: '#f8fafc',
        fixedWidth: width - 40,
        fontFamily: 'monospace',
        fontSize: '22px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const zone = this.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive();

    container.add([title, zone]);

    const item: SelectableItem = {
      activate: onPress,
      setFocused: (focused) => {
        frame.setFillStyle(focused ? 0x1d2730 : 0x10141a, focused ? 1 : 0.94);
        frame.setStrokeStyle(focused ? 4 : 2, focused ? 0xffd36f : 0x5bd7cb, focused ? 0.95 : 0.5);
        title.setColor(focused ? '#fff3c4' : '#f8fafc');
      },
    };

    zone.on('pointerover', () => item.setFocused(true));
    zone.on('pointerout', () => item.setFocused(false));
    zone.on('pointerup', onPress);

    return item;
  }
}
