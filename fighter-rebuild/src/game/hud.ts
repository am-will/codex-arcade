import Phaser from 'phaser';
import { fighterAnimationName, type FighterState } from './fighter';
import type { MatchWinner, RoundScore, RoundWinner } from './rounds';

export interface MatchHudState {
  readonly player: FighterState;
  readonly cpu: FighterState;
  readonly playerName: string;
  readonly cpuName: string;
  readonly playerPortraitKey: string;
  readonly cpuPortraitKey: string;
  readonly score: RoundScore;
  readonly roundsToWin: number;
  readonly roundIndex: number;
  readonly timerSeconds: number;
  readonly phaseLabel: string;
  readonly debugEnabled: boolean;
}

export class MatchHud {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly playerPortrait: Phaser.GameObjects.Image;
  private readonly cpuPortrait: Phaser.GameObjects.Image;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly bannerText: Phaser.GameObjects.Text;
  private readonly subText: Phaser.GameObjects.Text;
  private readonly debugText: Phaser.GameObjects.Text;
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];

  public constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(100).setScrollFactor(0);
    this.playerPortrait = scene.add.image(42, 44, '').setDisplaySize(58, 58).setDepth(101).setScrollFactor(0);
    this.cpuPortrait = scene.add.image(918, 44, '').setDisplaySize(58, 58).setDepth(101).setScrollFactor(0);
    this.timerText = scene.add
      .text(480, 34, '60', {
        align: 'center',
        color: '#fff4d6',
        fixedWidth: 92,
        fontFamily: 'monospace',
        fontSize: '34px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(102)
      .setScrollFactor(0);
    this.bannerText = scene.add
      .text(480, 184, '', {
        align: 'center',
        color: '#fff4d6',
        fixedWidth: 760,
        fontFamily: 'Georgia, Times, serif',
        fontSize: '48px',
        fontStyle: 'bold',
        stroke: '#050608',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(106)
      .setScrollFactor(0);
    this.subText = scene.add
      .text(480, 232, '', {
        align: 'center',
        color: '#96e1d4',
        fixedWidth: 760,
        fontFamily: 'monospace',
        fontSize: '16px',
        stroke: '#050608',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(106)
      .setScrollFactor(0);
    this.debugText = scene.add
      .text(20, 112, '', {
        color: '#d9f8ee',
        fixedWidth: 320,
        fontFamily: 'monospace',
        fontSize: '11px',
        lineSpacing: 3,
      })
      .setDepth(107)
      .setScrollFactor(0);
  }

  public update(state: MatchHudState): void {
    this.playerPortrait.setTexture(state.playerPortraitKey);
    this.cpuPortrait.setTexture(state.cpuPortraitKey);
    this.timerText.setText(String(Math.max(0, Math.ceil(state.timerSeconds))).padStart(2, '0'));
    this.drawBars(state);
    this.debugText
      .setVisible(state.debugEnabled)
      .setText(
        [
          `Phase ${state.phaseLabel}  Round ${state.roundIndex}`,
          `P ${state.player.health}/${state.player.tuning.maxHealth} ${state.player.meter}/${state.player.tuning.meterMax}m ${state.player.status} ${fighterAnimationName(state.player)}:${state.player.animationFrame}`,
          `C ${state.cpu.health}/${state.cpu.tuning.maxHealth} ${state.cpu.meter}/${state.cpu.tuning.meterMax}m ${state.cpu.status} ${fighterAnimationName(state.cpu)}:${state.cpu.animationFrame}`,
          `X ${Math.round(state.player.position.x)} / ${Math.round(state.cpu.position.x)}  Facing ${state.player.facing}/${state.cpu.facing}`,
        ].join('\n'),
      );
  }

  public showBanner(title: string, subtitle = ''): void {
    this.bannerText.setText(title);
    this.subText.setText(subtitle);
  }

  public clearBanner(): void {
    this.bannerText.setText('');
    this.subText.setText('');
  }

  public showSuperCutIn(fighterName: string): void {
    this.clearMatchOverlay();
    const width = this.scene.scale.width;
    const stripe = this.scene.add.rectangle(width / 2, 236, width, 116, 0x050608, 0.86).setDepth(104).setScrollFactor(0);
    const accent = this.scene.add.rectangle(width / 2, 294, width, 5, 0xffd36a, 0.95).setDepth(105).setScrollFactor(0);
    const text = this.scene.add
      .text(width / 2, 232, `${fighterName} SPECIAL COMBO`, {
        align: 'center',
        color: '#fff8dd',
        fixedWidth: width - 80,
        fontFamily: 'Georgia, Times, serif',
        fontSize: '42px',
        fontStyle: 'bold',
        stroke: '#050608',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(106)
      .setScrollFactor(0);

    this.overlayObjects = [stripe, accent, text];
  }

  public showMatchOverlay(options: {
    readonly title: string;
    readonly subtitle: string;
    readonly winner: MatchWinner;
  }): void {
    this.clearMatchOverlay();
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const panel = this.scene.add.rectangle(width / 2, height / 2, 520, 228, 0x080b0f, 0.92).setDepth(120).setScrollFactor(0);
    panel.setStrokeStyle(3, options.winner === 'player' ? 0xffd36a : 0x8ce7ff, 0.92);
    const title = this.scene.add
      .text(width / 2, height / 2 - 64, options.title, {
        align: 'center',
        color: '#fff4d6',
        fixedWidth: 480,
        fontFamily: 'Georgia, Times, serif',
        fontSize: '34px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(121)
      .setScrollFactor(0);
    const subtitle = this.scene.add
      .text(width / 2, height / 2 - 12, options.subtitle, {
        align: 'center',
        color: '#c9d9dc',
        fixedWidth: 450,
        fontFamily: 'monospace',
        fontSize: '16px',
        lineSpacing: 8,
      })
      .setOrigin(0.5)
      .setDepth(121)
      .setScrollFactor(0);
    const prompt = this.scene.add
      .text(width / 2, height / 2 + 68, 'Enter / R rematch     Esc menu', {
        align: 'center',
        color: '#96e1d4',
        fixedWidth: 450,
        fontFamily: 'monospace',
        fontSize: '15px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(121)
      .setScrollFactor(0);

    this.overlayObjects = [panel, title, subtitle, prompt];
  }

  public clearMatchOverlay(): void {
    for (const object of this.overlayObjects) {
      object.destroy();
    }
    this.overlayObjects = [];
  }

  public destroy(): void {
    this.clearMatchOverlay();
    this.graphics.destroy();
    this.playerPortrait.destroy();
    this.cpuPortrait.destroy();
    this.timerText.destroy();
    this.bannerText.destroy();
    this.subText.destroy();
    this.debugText.destroy();
  }

  private drawBars(state: MatchHudState): void {
    const graphics = this.graphics;
    graphics.clear();
    graphics.fillStyle(0x040608, 0.78).fillRect(0, 0, this.scene.scale.width, 92);
    graphics.fillStyle(0x0b1015, 0.92).fillRoundedRect(76, 18, 330, 24, 4);
    graphics.fillStyle(0x0b1015, 0.92).fillRoundedRect(554, 18, 330, 24, 4);
    graphics.fillStyle(0x111821, 0.96).fillRoundedRect(76, 50, 214, 12, 3);
    graphics.fillStyle(0x111821, 0.96).fillRoundedRect(670, 50, 214, 12, 3);
    this.drawFighterBars(graphics, state.player, 76, 18, 330, false);
    this.drawFighterBars(graphics, state.cpu, 554, 18, 330, true);
    this.drawRoundPips(graphics, 302, 55, state.score.player, state.roundsToWin, false);
    this.drawRoundPips(graphics, 658, 55, state.score.cpu, state.roundsToWin, true);
    graphics.lineStyle(1, 0xffffff, 0.18).strokeRect(0, 91, this.scene.scale.width, 1);

    this.drawLabel(state.playerName, 76, 68, false);
    this.drawLabel(state.cpuName, 884, 68, true);
    this.drawLabel(`ROUND ${state.roundIndex}`, 480, 74, false, true);
  }

  private drawFighterBars(
    graphics: Phaser.GameObjects.Graphics,
    fighter: FighterState,
    x: number,
    y: number,
    width: number,
    alignRight: boolean,
  ): void {
    const healthPercent = Phaser.Math.Clamp(fighter.health / fighter.tuning.maxHealth, 0, 1);
    const meterPercent = Phaser.Math.Clamp(fighter.meter / fighter.tuning.meterMax, 0, 1);
    const healthWidth = width * healthPercent;
    const meterWidth = 214 * meterPercent;
    const healthX = alignRight ? x + width - healthWidth : x;
    const meterBaseX = alignRight ? x + width - 214 : x;
    const meterX = alignRight ? meterBaseX + 214 - meterWidth : meterBaseX;

    graphics.fillStyle(0xb9354d, 0.96).fillRoundedRect(healthX, y, healthWidth, 24, 4);
    graphics.lineStyle(2, 0xffffff, 0.36).strokeRoundedRect(x, y, width, 24, 4);
    graphics.fillStyle(0x4aa8ff, 0.96).fillRoundedRect(meterX, y + 32, meterWidth, 12, 3);
    graphics.lineStyle(1, 0xffffff, 0.28).strokeRoundedRect(meterBaseX, y + 32, 214, 12, 3);
  }

  private drawRoundPips(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    score: number,
    roundsToWin: number,
    alignRight: boolean,
  ): void {
    for (let index = 0; index < roundsToWin; index += 1) {
      const pipX = alignRight ? x - index * 18 : x + index * 18;
      graphics.fillStyle(index < score ? 0xffd36a : 0x222933, 0.96).fillCircle(pipX, y, 6);
      graphics.lineStyle(1, 0xffffff, 0.35).strokeCircle(pipX, y, 6);
    }
  }

  private drawLabel(label: string, x: number, y: number, alignRight: boolean, centered = false): void {
    const existing = this.scene.children
      .getAll()
      .find((object) => object instanceof Phaser.GameObjects.Text && object.getData('matchHudLabel') === `${x}:${y}`);
    const text =
      existing instanceof Phaser.GameObjects.Text
        ? existing
        : this.scene.add
            .text(x, y, '', {
              align: centered ? 'center' : alignRight ? 'right' : 'left',
              color: '#f8fafc',
              fixedWidth: centered ? 160 : 170,
              fontFamily: 'monospace',
              fontSize: '13px',
              fontStyle: 'bold',
            })
            .setOrigin(centered ? 0.5 : alignRight ? 1 : 0, 0.5)
            .setDepth(102)
            .setScrollFactor(0)
            .setData('matchHudLabel', `${x}:${y}`);

    text.setText(label);
  }
}

export function formatRoundWinner(winner: RoundWinner): string {
  if (winner === 'player') {
    return 'Player takes the round';
  }

  if (winner === 'cpu') {
    return 'CPU takes the round';
  }

  return 'Draw round';
}
