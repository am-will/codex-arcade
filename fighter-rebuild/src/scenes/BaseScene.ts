import Phaser from 'phaser';
import { loadGameConfig } from '../game/config';
import type { CharacterId, GameConfig, MatchConfig, StageDefinition, StageId } from '../game/types';

type ButtonTheme = 'primary' | 'secondary';

type MenuDebugState = {
  readonly scene: string;
  readonly playableModes: readonly ['Play vs CPU'];
  readonly hasOneVsOneOption: false;
  readonly labels: readonly string[];
  readonly selectedStageId?: StageId;
  readonly selectedPlayerId?: CharacterId;
  readonly selectedCpuId?: CharacterId;
  readonly matchConfig?: MatchConfig;
};

export type MenuSettingsSelection = {
  readonly roundsToWin: number;
  readonly roundTimeSeconds: number;
  readonly cpuDifficulty: 'easy' | 'normal' | 'hard';
  readonly seed: number;
  readonly debugEnabled: boolean;
};

export type MenuFlowData = {
  readonly stageId?: StageId;
  readonly playerCharacterId?: CharacterId;
  readonly cpuCharacterId?: CharacterId;
  readonly settings?: MenuSettingsSelection;
};

export type MatchLaunchData = {
  readonly matchConfig?: MatchConfig;
  readonly settings?: MenuSettingsSelection;
};

export type SelectableItem = {
  readonly activate: () => void;
  readonly setFocused: (focused: boolean) => void;
};

let cachedConfigPromise: Promise<GameConfig> | null = null;

export abstract class BaseScene extends Phaser.Scene {
  protected loadSharedConfig(): Promise<GameConfig> {
    cachedConfigPromise ??= loadGameConfig();
    return cachedConfigPromise;
  }

  protected async renderWithConfig(render: (config: GameConfig) => void): Promise<void> {
    this.showLoading();

    try {
      const config = await this.loadSharedConfig();

      if (!this.scene.isActive(this.scene.key)) {
        return;
      }

      this.children.removeAll();
      render(config);
    } catch (error) {
      this.children.removeAll();
      this.drawBackdrop();
      this.addTitle('Menu unavailable', 'Config failed to load');
      this.addBodyText(480, 320, error instanceof Error ? error.message : 'Unknown config error', 560, '#ffb4a8');
    }
  }

  protected resolveSettings(config: GameConfig, data?: MenuFlowData): MenuSettingsSelection {
    return {
      roundsToWin: data?.settings?.roundsToWin ?? config.settings.roundsToWin,
      roundTimeSeconds: data?.settings?.roundTimeSeconds ?? config.settings.roundTimeSeconds,
      cpuDifficulty: data?.settings?.cpuDifficulty ?? config.settings.cpuDifficulty,
      seed: data?.settings?.seed ?? config.settings.seed,
      debugEnabled: data?.settings?.debugEnabled ?? config.settings.debugEnabled,
    };
  }

  protected createMatchConfig(config: GameConfig, data: MenuFlowData, playerCharacterId: CharacterId): MatchConfig {
    const stageId = data.stageId && config.stagesById[data.stageId] ? data.stageId : config.settings.defaultStageId;
    const cpuCharacterId =
      config.characters.find((character) => character.id !== playerCharacterId)?.id ??
      data.cpuCharacterId ??
      config.settings.defaultCpuId;
    const settings = this.resolveSettings(config, data);

    return {
      stageId,
      playerCharacterId,
      cpuCharacterId,
      roundsToWin: settings.roundsToWin,
      roundTimeSeconds: settings.roundTimeSeconds,
      seed: settings.seed,
    };
  }

  protected drawBackdrop(stage?: StageDefinition): void {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x111217);

    if (stage) {
      for (const [index, layer] of stage.layers.entries()) {
        this.add
          .image(width / 2, height / 2, layer.assetKey)
          .setDisplaySize(width, height)
          .setAlpha(index === stage.layers.length - 1 ? 0.34 : 0.42);
      }
    }

    this.add.rectangle(width / 2, height / 2, width, height, 0x07080b, 0.34);
    this.add.rectangle(width / 2, 52, width, 104, 0x050608, 0.64);
    this.add.rectangle(width / 2, height - 34, width, 68, 0x050608, 0.72);

    for (let x = 0; x < width; x += 32) {
      this.add.rectangle(x, height / 2, 1, height, 0xffffff, 0.025);
    }

    for (let y = 0; y < height; y += 32) {
      this.add.rectangle(width / 2, y, width, 1, 0xffffff, 0.018);
    }
  }

  protected addTitle(title: string, subtitle?: string): void {
    this.add
      .text(48, 34, title, {
        color: '#fff4d6',
        fontFamily: 'Georgia, Times, serif',
        fontSize: '42px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);

    if (subtitle) {
      this.add
        .text(51, 76, subtitle, {
          color: '#96e1d4',
          fontFamily: 'monospace',
          fontSize: '16px',
        })
        .setOrigin(0, 0.5);
    }
  }

  protected addFooter(text = 'Arrow keys navigate   Enter selects   Esc goes back'): void {
    this.add
      .text(this.scale.width / 2, this.scale.height - 34, text, {
        align: 'center',
        color: '#b7c1c8',
        fontFamily: 'monospace',
        fontSize: '14px',
      })
      .setOrigin(0.5);
  }

  protected addBodyText(x: number, y: number, text: string, width: number, color = '#f8fafc'): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, {
        align: 'center',
        color,
        fixedWidth: width,
        fontFamily: 'monospace',
        fontSize: '16px',
        lineSpacing: 8,
        wordWrap: { width },
      })
      .setOrigin(0.5);
  }

  protected createButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    hint: string,
    onPress: () => void,
    theme: ButtonTheme = 'secondary',
  ): SelectableItem {
    const container = this.add.container(x, y);
    const fill = theme === 'primary' ? 0x273133 : 0x151923;
    const selectedFill = theme === 'primary' ? 0xd5a642 : 0x26313b;
    const stroke = theme === 'primary' ? 0xffe19a : 0x5bd7cb;
    const background = this.add.rectangle(0, 0, width, height, fill, 0.9).setStrokeStyle(2, stroke, 0.42);
    const labelText = this.add
      .text(0, -9, label, {
        align: 'center',
        color: '#f8fafc',
        fixedWidth: width - 24,
        fontFamily: 'monospace',
        fontSize: '20px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const hintText = this.add
      .text(0, 19, hint, {
        align: 'center',
        color: '#9fb6bc',
        fixedWidth: width - 24,
        fontFamily: 'monospace',
        fontSize: '12px',
      })
      .setOrigin(0.5);
    const zone = this.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive();

    zone.on('pointerover', () => item.setFocused(true));
    zone.on('pointerout', () => item.setFocused(false));
    zone.on('pointerup', onPress);
    container.add([background, labelText, hintText, zone]);

    const item: SelectableItem = {
      activate: onPress,
      setFocused: (focused) => {
        background.setFillStyle(focused ? selectedFill : fill, focused ? 1 : 0.9);
        background.setStrokeStyle(focused ? 4 : 2, stroke, focused ? 0.95 : 0.42);
        labelText.setColor(focused ? '#fff3c4' : '#f8fafc');
      },
    };

    return item;
  }

  protected bindSelection(items: readonly SelectableItem[], selectedIndex: number, onCancel?: () => void): () => number {
    let currentIndex = Phaser.Math.Clamp(selectedIndex, 0, Math.max(0, items.length - 1));
    const keyboard = this.input.keyboard;

    const focus = (nextIndex: number): void => {
      if (items.length === 0) {
        return;
      }

      items[currentIndex]?.setFocused(false);
      currentIndex = Phaser.Math.Wrap(nextIndex, 0, items.length);
      items[currentIndex]?.setFocused(true);
    };
    const moveLeft = (): void => focus(currentIndex - 1);
    const moveRight = (): void => focus(currentIndex + 1);
    const activate = (): void => items[currentIndex]?.activate();
    const cancel = (): void => onCancel?.();

    focus(currentIndex);

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

    return () => currentIndex;
  }

  protected publishMenuState(scene: string, details: Partial<MenuDebugState> = {}): void {
    const host = globalThis as typeof globalThis & { __SAMA_V_AMODI_MENU_FLOW__?: MenuDebugState };
    host.__SAMA_V_AMODI_MENU_FLOW__ = {
      scene,
      playableModes: ['Play vs CPU'],
      hasOneVsOneOption: false,
      labels: details.labels ?? [],
      selectedStageId: details.selectedStageId,
      selectedPlayerId: details.selectedPlayerId,
      selectedCpuId: details.selectedCpuId,
      matchConfig: details.matchConfig,
    };
  }

  private showLoading(): void {
    this.children.removeAll();
    this.drawBackdrop();
    this.addBodyText(480, 280, 'Loading config...', 420, '#96e1d4');
  }
}
