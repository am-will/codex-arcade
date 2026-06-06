import Phaser from 'phaser';
import type { MatchConfig } from '../game/types';
import type { MatchLaunchData } from './BaseScene';
import { SceneKey } from './sceneKeys';

export class PlaceholderScene extends Phaser.Scene {
  public constructor() {
    super(SceneKey.Placeholder);
  }

  public create(data?: MatchLaunchData): void {
    const { width, height } = this.scale;
    const matchConfig = data?.matchConfig;

    this.add
      .rectangle(width / 2, height / 2, width * 0.78, height * 0.56, 0x1f2933, 0.92)
      .setStrokeStyle(2, 0x4fd1c5, 0.8);

    this.add
      .text(width / 2, height / 2 - 108, 'Placeholder Match Launch', {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontSize: '26px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 - 58, this.formatMatchConfig(matchConfig), {
        align: 'center',
        color: '#d7dee0',
        fixedWidth: width * 0.66,
        fontFamily: 'monospace',
        fontSize: '18px',
        lineSpacing: 9,
      })
      .setOrigin(0.5, 0);

    this.add
      .text(width / 2, height - 42, 'T8 will replace this with the playable match scene', {
        align: 'center',
        color: '#96e1d4',
        fontFamily: 'monospace',
        fontSize: '14px',
      })
      .setOrigin(0.5);
  }

  private formatMatchConfig(matchConfig: MatchConfig | undefined): string {
    if (!matchConfig) {
      return 'No match config supplied.';
    }

    return [
      `Mode: 1vCPU`,
      `Stage: ${matchConfig.stageId}`,
      `Player: ${matchConfig.playerCharacterId}`,
      `CPU: ${matchConfig.cpuCharacterId}`,
      `Rounds: first to ${matchConfig.roundsToWin}`,
      `Timer: ${matchConfig.roundTimeSeconds}s`,
      `Seed: ${matchConfig.seed}`,
    ].join('\n');
  }
}
