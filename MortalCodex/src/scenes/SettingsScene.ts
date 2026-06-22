import type { GameConfig } from '../game/types';
import { BaseScene, type MenuFlowData, type SelectableItem } from './BaseScene';
import { SceneKey } from './sceneKeys';

const ROUND_OPTIONS = [1, 2, 3] as const;
const TIMER_OPTIONS = [45, 60, 90] as const;
const CPU_OPTIONS = ['easy', 'normal', 'hard'] as const;

export class SettingsScene extends BaseScene {
  public constructor() {
    super(SceneKey.Settings);
  }

  public create(data?: MenuFlowData): void {
    void this.renderWithConfig((config) => this.renderSettings(config, data));
  }

  private renderSettings(config: GameConfig, data?: MenuFlowData): void {
    let settings = this.resolveSettings(config, data);
    const stage = config.stagesById[data?.stageId ?? config.settings.defaultStageId] ?? config.stages[0];
    const refresh = (): void => {
      this.scene.restart({ ...data, settings });
    };
    const back = (): void => {
      this.scene.start(SceneKey.MainMenu, { ...data, settings });
    };

    this.drawBackdrop(stage);
    this.addTitle('Settings', 'Applies to Play vs CPU');

    const rows: SelectableItem[] = [
      this.createSettingRow(480, 162, 'Rounds', `First to ${settings.roundsToWin}`, () => {
        settings = { ...settings, roundsToWin: nextValue(ROUND_OPTIONS, settings.roundsToWin) };
        refresh();
      }),
      this.createSettingRow(480, 234, 'Timer', `${settings.roundTimeSeconds}s`, () => {
        settings = { ...settings, roundTimeSeconds: nextValue(TIMER_OPTIONS, settings.roundTimeSeconds) };
        refresh();
      }),
      this.createSettingRow(480, 306, 'CPU', settings.cpuDifficulty, () => {
        settings = { ...settings, cpuDifficulty: nextValue(CPU_OPTIONS, settings.cpuDifficulty) };
        refresh();
      }),
      this.createToggleRow(480, 378, 'Debug overlay', settings.debugEnabled, () => {
        settings = { ...settings, debugEnabled: !settings.debugEnabled };
        refresh();
      }),
      this.createButton(480, 456, 320, 58, 'Back', 'Return to main menu', back, 'primary'),
    ];

    this.bindSelection(rows, 0, back);
    this.addFooter('Arrow keys choose setting   Enter changes   Esc main menu');
    this.publishMenuState(SceneKey.Settings, {
      labels: ['Rounds', 'Timer', 'CPU', 'Debug overlay', 'Back'],
      selectedStageId: stage?.id,
    });
  }

  private createSettingRow(x: number, y: number, label: string, value: string, onPress: () => void): SelectableItem {
    const width = 430;
    const height = 58;
    const container = this.add.container(x, y);
    const frame = this.add.rectangle(0, 0, width, height, 0x111821, 0.92).setStrokeStyle(2, 0x5bd7cb, 0.42);
    const labelText = this.add
      .text(-width / 2 + 28, 0, label, {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontSize: '18px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    const valueText = this.add
      .text(width / 2 - 28, 0, value, {
        align: 'right',
        color: '#96e1d4',
        fixedWidth: 180,
        fontFamily: 'monospace',
        fontSize: '18px',
      })
      .setOrigin(1, 0.5);
    const zone = this.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive();

    container.add([frame, labelText, valueText, zone]);

    const item: SelectableItem = {
      activate: onPress,
      setFocused: (focused) => {
        frame.setFillStyle(focused ? 0x222834 : 0x111821, focused ? 1 : 0.92);
        frame.setStrokeStyle(focused ? 4 : 2, focused ? 0xffd36f : 0x5bd7cb, focused ? 0.95 : 0.42);
        valueText.setColor(focused ? '#fff3c4' : '#96e1d4');
      },
    };

    zone.on('pointerover', () => item.setFocused(true));
    zone.on('pointerout', () => item.setFocused(false));
    zone.on('pointerup', onPress);

    return item;
  }

  private createToggleRow(x: number, y: number, label: string, enabled: boolean, onPress: () => void): SelectableItem {
    const width = 430;
    const height = 58;
    const container = this.add.container(x, y);
    const frame = this.add.rectangle(0, 0, width, height, 0x111821, 0.92).setStrokeStyle(2, 0x5bd7cb, 0.42);
    const labelText = this.add
      .text(-width / 2 + 28, 0, label, {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontSize: '18px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    const checkbox = this.add.rectangle(width / 2 - 94, 0, 22, 22, enabled ? 0x5bd7cb : 0x0b1015, enabled ? 0.96 : 0.92).setStrokeStyle(2, 0x96e1d4, 0.7);
    const check = this.add.rectangle(width / 2 - 94, 0, 10, 10, 0xfff3c4, enabled ? 0.95 : 0);
    const valueText = this.add
      .text(width / 2 - 28, 0, enabled ? 'On' : 'Off', {
        align: 'right',
        color: '#96e1d4',
        fixedWidth: 70,
        fontFamily: 'monospace',
        fontSize: '18px',
      })
      .setOrigin(1, 0.5);
    const zone = this.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive();

    container.add([frame, labelText, checkbox, check, valueText, zone]);

    const item: SelectableItem = {
      activate: onPress,
      setFocused: (focused) => {
        frame.setFillStyle(focused ? 0x222834 : 0x111821, focused ? 1 : 0.92);
        frame.setStrokeStyle(focused ? 4 : 2, focused ? 0xffd36f : 0x5bd7cb, focused ? 0.95 : 0.42);
        valueText.setColor(focused ? '#fff3c4' : '#96e1d4');
      },
    };

    zone.on('pointerover', () => item.setFocused(true));
    zone.on('pointerout', () => item.setFocused(false));
    zone.on('pointerup', onPress);

    return item;
  }
}

function nextValue<T>(values: readonly T[], current: T): T {
  const index = values.findIndex((value) => value === current);
  return values[(index + 1) % values.length] ?? values[0] ?? current;
}
