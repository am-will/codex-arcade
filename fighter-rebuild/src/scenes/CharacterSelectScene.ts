import type { CharacterDefinition, GameConfig } from '../game/types';
import { BaseScene, type MenuFlowData, type SelectableItem } from './BaseScene';
import { SceneKey } from './sceneKeys';

export class CharacterSelectScene extends BaseScene {
  public constructor() {
    super(SceneKey.CharacterSelect);
  }

  public create(data?: MenuFlowData): void {
    void this.renderWithConfig((config) => this.renderCharacterSelect(config, data));
  }

  private renderCharacterSelect(config: GameConfig, data?: MenuFlowData): void {
    const stage = config.stagesById[data?.stageId ?? config.settings.defaultStageId] ?? config.stages[0];
    const defaultPlayerId = data?.playerCharacterId ?? config.settings.defaultPlayerId;
    let selectedIndex = Math.max(
      0,
      config.characters.findIndex((character) => character.id === defaultPlayerId),
    );
    const settings = this.resolveSettings(config, data);

    this.drawBackdrop(stage);
    this.addTitle('Character Select', 'CPU automatically takes the other fighter');

    const cards = config.characters.map((character, index) =>
      this.createCharacterCard(character, 300 + index * 360, 286, () => {
        selectedIndex = index;
        this.launchPlaceholder(config, {
          ...data,
          playerCharacterId: character.id,
          stageId: stage?.id,
          settings,
        });
      }),
    );

    this.bindSelection(cards, selectedIndex, () => this.scene.start(SceneKey.StageSelect, { ...data, settings }));
    this.addFooter('Arrow keys choose fighter   Enter plays 1vCPU   Esc stage select');
    this.publishMenuState(SceneKey.CharacterSelect, {
      labels: config.characters.map((character) => character.displayName),
      selectedStageId: stage?.id,
      selectedPlayerId: config.characters[selectedIndex]?.id,
      selectedCpuId: config.characters.find((character) => character.id !== config.characters[selectedIndex]?.id)?.id,
    });
  }

  private createCharacterCard(character: CharacterDefinition, x: number, y: number, onPress: () => void): SelectableItem {
    const width = 260;
    const height = 314;
    const container = this.add.container(x, y);
    const frame = this.add.rectangle(0, 0, width, height, 0x10141a, 0.94).setStrokeStyle(2, 0x5bd7cb, 0.5);
    const portraitFrame = this.add.rectangle(0, -48, 182, 182, 0x06070a, 0.96).setStrokeStyle(2, 0xffffff, 0.12);
    const portrait = this.add.image(0, -48, character.portraitKey).setDisplaySize(166, 166);
    const name = this.add
      .text(0, 78, character.displayName, {
        align: 'center',
        color: '#f8fafc',
        fixedWidth: width - 32,
        fontFamily: 'monospace',
        fontSize: '25px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const moveText = this.add
      .text(0, 128, 'Light: punch\nHeavy: kick\nSpecial: combo', {
        align: 'center',
        color: '#9fb6bc',
        fixedWidth: width - 40,
        fontFamily: 'monospace',
        fontSize: '13px',
        lineSpacing: 5,
      })
      .setOrigin(0.5);
    const zone = this.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive();

    container.add([frame, portraitFrame, portrait, name, moveText, zone]);

    const item: SelectableItem = {
      activate: onPress,
      setFocused: (focused) => {
        frame.setFillStyle(focused ? 0x222834 : 0x10141a, focused ? 1 : 0.94);
        frame.setStrokeStyle(focused ? 4 : 2, focused ? 0xffd36f : 0x5bd7cb, focused ? 0.95 : 0.5);
        portraitFrame.setStrokeStyle(focused ? 4 : 2, focused ? 0xffd36f : 0xffffff, focused ? 0.9 : 0.12);
        name.setColor(focused ? '#fff3c4' : '#f8fafc');
      },
    };

    zone.on('pointerover', () => item.setFocused(true));
    zone.on('pointerout', () => item.setFocused(false));
    zone.on('pointerup', onPress);

    return item;
  }

  private launchPlaceholder(config: GameConfig, data: MenuFlowData): void {
    const playerId = data.playerCharacterId ?? config.settings.defaultPlayerId;
    const matchConfig = this.createMatchConfig(config, data, playerId);

    this.publishMenuState(SceneKey.Placeholder, {
      labels: ['Placeholder Match'],
      selectedStageId: matchConfig.stageId,
      selectedPlayerId: matchConfig.playerCharacterId,
      selectedCpuId: matchConfig.cpuCharacterId,
      matchConfig,
    });
    this.game.events.emit('match:launch', matchConfig);
    this.scene.start(SceneKey.Placeholder, { matchConfig });
  }
}
