import Phaser from 'phaser';
import type { CharacterDefinition, GameConfig } from '../game/types';
import { BaseScene, type MenuFlowData } from './BaseScene';
import { SceneKey } from './sceneKeys';
import { addEmberField, addSoftGlow, drawArenaBackdrop } from './titleFx';

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

export class CharacterSelectScene extends BaseScene {
  public constructor() {
    super(SceneKey.CharacterSelect);
  }

  public create(data?: MenuFlowData): void {
    void this.renderWithConfig((config) => this.renderCharacterSelect(config, data));
  }

  private renderCharacterSelect(config: GameConfig, data?: MenuFlowData): void {
    const { width } = this.scale;
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

    drawArenaBackdrop(this, { imageKey: stage?.layers[0]?.assetKey, dim: 0.04 });
    addEmberField(this);

    this.add.rectangle(width / 2, 30, width, 60, 0x05070f, 0.55).setOrigin(0.5);
    this.add
      .text(width / 2, 40, 'SELECT YOUR FIGHTER', {
        align: 'center',
        color: '#ffd23f',
        fontFamily: 'Copperplate, "Copperplate Gothic Bold", Georgia, serif',
        fontSize: '38px',
        fontStyle: 'bold',
        stroke: '#3a0709',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, '#ff2d20', 16, true, true);
    this.add.rectangle(width / 2, 66, 360, 3, 0xffd23f, 0.7).setOrigin(0.5);

    const phaseLabel = this.add
      .text(width / 2, 96, 'PLAYER SELECT', {
        align: 'center',
        color: '#8fe9dc',
        fontFamily: '"Arial Black", Impact, monospace',
        fontSize: '22px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 0, '#1a7d70', 10, false, true);
    const countdownLabel = this.add
      .text(width / 2, 122, '', {
        align: 'center',
        color: '#ffb4a8',
        fontFamily: 'monospace',
        fontSize: '14px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const isCompact = config.characters.length > 2;
    const columns = Math.min(4, Math.max(1, config.characters.length));
    const spacingX = isCompact ? 216 : 360;
    const spacingY = isCompact ? 250 : 0;
    const startX = width / 2 - ((columns - 1) * spacingX) / 2;
    const rows = Math.ceil(config.characters.length / columns);
    const startY = rows > 1 ? 232 : 300;

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
      phaseLabel.setText(phase === 'player' ? 'PLAYER  SELECT' : 'OPPONENT  SELECT');
      phaseLabel.setColor(phase === 'player' ? '#8fe9dc' : '#ff6b6b');
      phaseLabel.setShadow(0, 0, phase === 'player' ? '#1a7d70' : '#7d1a1a', 10, false, true);
      countdownLabel.setText(phase === 'opponent' ? `OPPONENT AUTO-PICKS IN ${remainingCountdownSeconds() ?? 5}s` : '');
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
    this.addFooter('ARROWS / A D  CHOOSE      ENTER  CONFIRM      ESC  BACK');
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
    const width = compact ? 198 : 300;
    const height = compact ? 300 : 330;
    const portraitFrameSize = compact ? 168 : 212;
    const portraitSize = compact ? 168 : 212;
    const portraitY = compact ? -42 : -50;
    const nameY = compact ? 100 : 106;

    const container = this.add.container(x, y);
    const glow = addSoftGlow(this, 0, portraitY, width * 1.7, 0x39e0c8, 0);
    const frame = this.add.rectangle(0, 0, width, height, 0x0b1018, 0.82).setStrokeStyle(2, 0x5bd7cb, 0.5);
    const portraitFrame = this.add
      .rectangle(0, portraitY, portraitFrameSize, portraitFrameSize, 0x05070c, 0.96)
      .setStrokeStyle(2, 0xffffff, 0.1);
    const portrait = this.add
      .image(0, portraitY, character.selectPortraitKey)
      .setDisplaySize(portraitSize, portraitSize)
      .setFlipX(flipPortrait);
    const namePlate = this.add.rectangle(0, nameY, width - 14, 36, 0x0a0f17, 0.92).setStrokeStyle(1, 0x5bd7cb, 0.4);
    const name = this.add
      .text(0, nameY, character.displayName.toUpperCase(), {
        align: 'center',
        color: '#f8fafc',
        fixedWidth: width - 28,
        fontFamily: '"Arial Black", Impact, monospace',
        fontSize: compact ? '21px' : '26px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const tag = this.add
      .text(-width / 2 + 8, -height / 2 + 8, 'P1', {
        color: '#08110c',
        fontFamily: '"Arial Black", Impact, monospace',
        fontSize: '13px',
        fontStyle: 'bold',
        backgroundColor: '#3ce07a',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0, 0)
      .setAlpha(0);
    const cursor = this.add
      .text(0, height / 2 - 18, '▼ CHOOSE', { color: '#fff3c4', fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setAlpha(0);
    const zone = this.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive();

    container.add([glow, frame, portraitFrame, portrait, namePlate, name, tag, cursor, zone]);

    const item: CharacterCard = {
      setState: ({ phase, focused, disabled, selected }) => {
        const isOpponent = phase === 'opponent';
        const focusStroke = isOpponent ? 0xff4040 : 0xffd36f;
        const baseStroke = isOpponent ? 0xa83a3a : 0x5bd7cb;
        const baseFill = disabled ? 0x10131a : selected ? 0x16221b : 0x0b1018;

        glow.setTint(isOpponent ? 0xff5a5a : 0x39e0c8).setAlpha(focused ? 0.5 : selected ? 0.28 : 0);
        frame.setFillStyle(focused ? (isOpponent ? 0x2a1416 : 0x16252e) : baseFill, disabled ? 0.7 : focused ? 1 : 0.86);
        frame.setStrokeStyle(focused ? 4 : selected ? 3 : 2, focused ? focusStroke : baseStroke, disabled ? 0.25 : focused ? 0.95 : selected ? 0.75 : 0.5);
        portraitFrame.setStrokeStyle(focused ? 3 : 2, focused ? focusStroke : 0xffffff, disabled ? 0.08 : focused ? 0.9 : 0.12);
        portrait.setAlpha(disabled ? 0.26 : 1);
        namePlate.setStrokeStyle(1, focused ? focusStroke : baseStroke, disabled ? 0.2 : 0.5);
        name.setColor(disabled ? '#6f7880' : focused ? (isOpponent ? '#ffd6d6' : '#fff3c4') : '#f8fafc');
        tag.setAlpha(selected ? 1 : 0);
        cursor.setText(isOpponent ? '▼ FIGHT' : '▼ CHOOSE').setColor(isOpponent ? '#ffd6d6' : '#fff3c4').setAlpha(focused ? 1 : 0);
        container.setScale(focused ? 1.06 : 1).setDepth(focused ? 5 : 0);

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
