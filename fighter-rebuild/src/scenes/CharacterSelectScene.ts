import Phaser from 'phaser';
import type { CharacterDefinition, GameConfig } from '../game/types';
import { BaseScene, type MenuFlowData } from './BaseScene';
import { SceneKey } from './sceneKeys';

type SelectPhase = 'player' | 'opponent';

type CharacterCardState = {
  readonly phase: SelectPhase;
  readonly focused: boolean;
  readonly disabled: boolean;
  readonly selected: boolean;
};

type CharacterCard = {
  readonly setState: (state: CharacterCardState) => void;
};

const SELECT_PORTRAIT_ZOOM: Partial<Record<CharacterDefinition['id'], number>> = {
  tibo: 1.12,
};

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
    let phase: SelectPhase = 'player';
    let playerIndex: number | null = null;
    let autoPickTimeout: number | null = null;
    let countdownInterval: number | null = null;
    let autoPickDeadline = 0;
    const settings = this.resolveSettings(config, data);

    this.drawBackdrop(stage);
    this.addTitle('Character Select', 'Choose your fighter');
    const phaseLabel = this.add
      .text(this.scale.width / 2, 112, 'PLAYER SELECT', {
        align: 'center',
        color: '#96e1d4',
        fontFamily: 'monospace',
        fontSize: '22px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const countdownLabel = this.add
      .text(this.scale.width / 2, 142, '', {
        align: 'center',
        color: '#ffb4a8',
        fontFamily: 'monospace',
        fontSize: '15px',
      })
      .setOrigin(0.5);

    const isCompact = config.characters.length > 2;
    const columns = Math.min(4, Math.max(1, config.characters.length));
    const spacingX = isCompact ? 220 : 360;
    const spacingY = isCompact ? 250 : 0;
    const startX = this.scale.width / 2 - ((columns - 1) * spacingX) / 2;
    const rows = Math.ceil(config.characters.length / columns);
    const startY = rows > 1 ? 232 : 286;

    const cards = config.characters.map((character, index) =>
      this.createCharacterCard(
        character,
        startX + (index % columns) * spacingX,
        startY + Math.floor(index / columns) * spacingY,
        index % 2 === 1,
        isCompact,
        () => focusIndex(index),
        () => {
          focusIndex(index);
          chooseIndex(index);
        },
      ),
    );

    const selectableIndexes = (): number[] =>
      config.characters.map((_, index) => index).filter((index) => phase === 'player' || index !== playerIndex);
    const fallbackOpponentIndex = (): number => selectableIndexes()[0] ?? Math.max(0, selectedIndex);
    const selectedPlayerId = () => (playerIndex === null ? config.characters[selectedIndex]?.id : config.characters[playerIndex]?.id);
    const selectedCpuId = () =>
      phase === 'opponent'
        ? config.characters[selectedIndex]?.id
        : config.characters.find((character) => character.id !== selectedPlayerId())?.id;
    const remainingCountdownSeconds = () =>
      autoPickTimeout === null ? undefined : Math.max(0, Math.ceil((autoPickDeadline - performance.now()) / 1_000));
    const publishState = (): void => {
      this.publishMenuState(SceneKey.CharacterSelect, {
        labels: config.characters.map((character) => character.displayName),
        selectPhase: phase,
        opponentAutoPickSeconds: remainingCountdownSeconds(),
        selectedStageId: stage?.id,
        selectedPlayerId: selectedPlayerId(),
        selectedCpuId: selectedCpuId(),
      });
    };
    const updateCards = (): void => {
      cards.forEach((card, index) => {
        const disabled = phase === 'opponent' && index === playerIndex;
        card.setState({
          phase,
          disabled,
          focused: index === selectedIndex && !disabled,
          selected: index === playerIndex,
        });
      });
      phaseLabel.setText(phase === 'player' ? 'PLAYER SELECT' : 'OPPONENT SELECT');
      phaseLabel.setColor(phase === 'player' ? '#96e1d4' : '#ff6b6b');
      countdownLabel.setText(phase === 'opponent' ? `Auto-picks in ${remainingCountdownSeconds() ?? 5}s` : '');
      publishState();
    };
    const moveFocus = (direction: 1 | -1): void => {
      const indexes = selectableIndexes();
      const position = Math.max(0, indexes.indexOf(selectedIndex));
      selectedIndex = indexes[Phaser.Math.Wrap(position + direction, 0, indexes.length)] ?? selectedIndex;
      updateCards();
    };
    const stopAutoPick = (): void => {
      if (autoPickTimeout !== null) {
        globalThis.clearTimeout(autoPickTimeout);
      }

      if (countdownInterval !== null) {
        globalThis.clearInterval(countdownInterval);
      }

      autoPickTimeout = null;
      countdownInterval = null;
      autoPickDeadline = 0;
    };
    const launchOpponent = (opponentIndex: number): void => {
      if (playerIndex === null || opponentIndex === playerIndex) {
        return;
      }

      stopAutoPick();
      this.launchMatch(config, {
        ...data,
        playerCharacterId: config.characters[playerIndex]?.id,
        cpuCharacterId: config.characters[opponentIndex]?.id,
        stageId: stage?.id,
        settings,
      });
    };
    const startOpponentTimer = (): void => {
      stopAutoPick();
      autoPickDeadline = performance.now() + 5_000;
      autoPickTimeout = globalThis.setTimeout(() => {
        const indexes = selectableIndexes();
        const opponentIndex = indexes[Phaser.Math.Between(0, Math.max(0, indexes.length - 1))] ?? fallbackOpponentIndex();
        launchOpponent(opponentIndex);
      }, 5_000);
      countdownInterval = globalThis.setInterval(updateCards, 250);
    };
    const enterOpponentSelect = (index: number): void => {
      phase = 'opponent';
      playerIndex = index;
      selectedIndex = config.characters.findIndex((_, candidateIndex) => candidateIndex !== playerIndex);
      selectedIndex = selectedIndex >= 0 ? selectedIndex : index;
      startOpponentTimer();
      updateCards();
    };
    const chooseIndex = (index: number): void => {
      if (phase === 'player') {
        enterOpponentSelect(index);
        return;
      }

      launchOpponent(index);
    };
    const focusIndex = (index: number): void => {
      if (phase === 'opponent' && index === playerIndex) {
        return;
      }

      selectedIndex = index;
      updateCards();
    };
    const cancel = (): void => {
      if (phase === 'opponent') {
        stopAutoPick();
        phase = 'player';
        selectedIndex = playerIndex ?? selectedIndex;
        playerIndex = null;
        updateCards();
        return;
      }

      this.scene.start(SceneKey.MainMenu, { ...data, settings });
    };
    const keyboard = this.input.keyboard;
    const moveLeft = (): void => moveFocus(-1);
    const moveRight = (): void => moveFocus(1);
    const activate = (): void => chooseIndex(selectedIndex);

    keyboard?.on('keydown-UP', moveLeft);
    keyboard?.on('keydown-LEFT', moveLeft);
    keyboard?.on('keydown-W', moveLeft);
    keyboard?.on('keydown-A', moveLeft);
    keyboard?.on('keydown-DOWN', moveRight);
    keyboard?.on('keydown-RIGHT', moveRight);
    keyboard?.on('keydown-S', moveRight);
    keyboard?.on('keydown-D', moveRight);
    keyboard?.on('keydown-ENTER', activate);
    keyboard?.on('keydown-SPACE', activate);
    keyboard?.on('keydown-ESC', cancel);
    this.events.once('shutdown', () => {
      stopAutoPick();
      keyboard?.off('keydown-UP', moveLeft);
      keyboard?.off('keydown-LEFT', moveLeft);
      keyboard?.off('keydown-W', moveLeft);
      keyboard?.off('keydown-A', moveLeft);
      keyboard?.off('keydown-DOWN', moveRight);
      keyboard?.off('keydown-RIGHT', moveRight);
      keyboard?.off('keydown-S', moveRight);
      keyboard?.off('keydown-D', moveRight);
      keyboard?.off('keydown-ENTER', activate);
      keyboard?.off('keydown-SPACE', activate);
      keyboard?.off('keydown-ESC', cancel);
    });

    updateCards();
    this.addFooter('Arrow keys choose   Enter selects   Esc back');
  }

  private createCharacterCard(
    character: CharacterDefinition,
    x: number,
    y: number,
    flipPortrait: boolean,
    compact: boolean,
    onFocus: () => void,
    onPress: () => void,
  ): CharacterCard {
    const width = compact ? 200 : 300;
    const height = compact ? 300 : 330;
    const portraitFrameSize = compact ? 168 : 212;
    const portraitSize = compact ? 154 : 198;
    const portraitY = compact ? -48 : -52;
    const nameY = compact ? 112 : 118;
    const container = this.add.container(x, y);
    const frame = this.add.rectangle(0, 0, width, height, 0x10141a, 0.94).setStrokeStyle(2, 0x5bd7cb, 0.5);
    const portraitFrame = this.add
      .rectangle(0, portraitY, portraitFrameSize, portraitFrameSize, 0x06070a, 0.96)
      .setStrokeStyle(2, 0xffffff, 0.12);
    const portraitDisplaySize = Math.round(portraitSize * (SELECT_PORTRAIT_ZOOM[character.id] ?? 1));
    const portrait = this.add.image(0, portraitY, character.portraitKey).setDisplaySize(portraitDisplaySize, portraitDisplaySize).setFlipX(flipPortrait);
    const name = this.add
      .text(0, nameY, character.displayName, {
        align: 'center',
        color: '#f8fafc',
        fixedWidth: width - 32,
        fontFamily: 'monospace',
        fontSize: compact ? '22px' : '28px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const zone = this.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive();

    container.add([frame, portraitFrame, portrait, name, zone]);

    const item: CharacterCard = {
      setState: ({ phase, focused, disabled, selected }) => {
        const focusStroke = phase === 'opponent' ? 0xff4040 : 0xffd36f;
        const baseStroke = phase === 'opponent' ? 0xa83a3a : 0x5bd7cb;
        const baseFill = disabled ? 0x151719 : selected ? 0x20242a : 0x10141a;
        frame.setFillStyle(focused ? (phase === 'opponent' ? 0x3a1719 : 0x222834) : baseFill, disabled ? 0.72 : focused ? 1 : 0.94);
        frame.setStrokeStyle(focused ? 4 : selected ? 3 : 2, focused ? focusStroke : baseStroke, disabled ? 0.22 : focused ? 0.95 : selected ? 0.7 : 0.5);
        portraitFrame.setStrokeStyle(focused ? 4 : 2, focused ? focusStroke : 0xffffff, disabled ? 0.08 : focused ? 0.9 : 0.12);
        portrait.setAlpha(disabled ? 0.28 : 1);
        name.setColor(disabled ? '#6f7880' : focused ? (phase === 'opponent' ? '#ffd6d6' : '#fff3c4') : '#f8fafc');
        if (zone.input) {
          zone.input.enabled = !disabled;
        }
      },
    };

    zone.on('pointerover', onFocus);
    zone.on('pointerup', onPress);

    return item;
  }

  private launchMatch(config: GameConfig, data: MenuFlowData): void {
    const playerId = data.playerCharacterId ?? config.settings.defaultPlayerId;
    const matchConfig = this.createMatchConfig(config, data, playerId);

    this.publishMenuState(SceneKey.Match, {
      labels: ['Match'],
      selectedStageId: matchConfig.stageId,
      selectedPlayerId: matchConfig.playerCharacterId,
      selectedCpuId: matchConfig.cpuCharacterId,
      matchConfig,
    });
    this.game.events.emit('match:launch', matchConfig);
    this.scene.start(SceneKey.Match, { matchConfig, settings: data.settings });
  }
}
