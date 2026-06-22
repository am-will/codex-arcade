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

type Pt = Phaser.Math.Vector2;

const DECK_HEIGHT = 100;
const PORTRAIT_SIZE = 60;
const BAR_SKEW = 15;
const METER_SKEW = 9;

// Player-side geometry; the CPU side is mirrored about the screen center.
const PORTRAIT_CX = 46;
const BAR_X = 90;
const BAR_W = 318;
const BAR_Y = 27;
const BAR_H = 23;
const METER_X = 90;
const METER_W = 276;
const METER_Y = 58;
const METER_H = 9;
const NAME_Y = 14;

export class MatchHud {
  private readonly deck: Phaser.GameObjects.Graphics;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly playerPortrait: Phaser.GameObjects.Image;
  private readonly cpuPortrait: Phaser.GameObjects.Image;
  private readonly playerName: Phaser.GameObjects.Text;
  private readonly cpuName: Phaser.GameObjects.Text;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly roundText: Phaser.GameObjects.Text;
  private readonly playerMaxText: Phaser.GameObjects.Text;
  private readonly cpuMaxText: Phaser.GameObjects.Text;
  private readonly bannerText: Phaser.GameObjects.Text;
  private readonly subText: Phaser.GameObjects.Text;
  private readonly debugText: Phaser.GameObjects.Text;
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];
  private displayedHealth = { player: 1, cpu: 1 };
  private pulse = 0;

  public constructor(private readonly scene: Phaser.Scene) {
    const width = scene.scale.width;

    this.deck = scene.add.graphics().setDepth(98).setScrollFactor(0);
    this.drawDeck();

    this.graphics = scene.add.graphics().setDepth(100).setScrollFactor(0);

    this.playerPortrait = scene.add.image(PORTRAIT_CX, 41, '').setDepth(101).setScrollFactor(0);
    this.cpuPortrait = scene.add.image(width - PORTRAIT_CX, 41, '').setDepth(101).setScrollFactor(0);

    this.playerName = this.makeText(BAR_X + 6, NAME_Y, '', {
      color: '#eaf6ff',
      fontFamily: '"Arial Black", Impact, monospace',
      fontSize: '15px',
      fontStyle: 'bold',
    })
      .setOrigin(0, 0.5)
      .setShadow(0, 0, '#0a1a24', 6, false, true);
    this.cpuName = this.makeText(width - BAR_X - 6, NAME_Y, '', {
      color: '#ffece6',
      fontFamily: '"Arial Black", Impact, monospace',
      fontSize: '15px',
      fontStyle: 'bold',
    })
      .setOrigin(1, 0.5)
      .setShadow(0, 0, '#240d0a', 6, false, true);

    this.timerText = this.makeText(width / 2, 35, '60', {
      align: 'center',
      color: '#fff7e0',
      fixedWidth: 92,
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '38px',
      fontStyle: 'bold',
    })
      .setOrigin(0.5)
      .setDepth(103)
      .setShadow(0, 0, '#ffae3b', 14, true, true);
    this.roundText = this.makeText(width / 2, 72, '', {
      align: 'center',
      color: '#9fd8e6',
      fixedWidth: 160,
      fontFamily: 'monospace',
      fontSize: '11px',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.playerMaxText = this.makeText(METER_X + METER_W - 8, METER_Y + METER_H / 2, 'MAX', {
      color: '#1a1205',
      fontFamily: '"Arial Black", Impact, monospace',
      fontSize: '10px',
      fontStyle: 'bold',
    })
      .setOrigin(1, 0.5)
      .setVisible(false);
    this.cpuMaxText = this.makeText(width - METER_X - METER_W + 8, METER_Y + METER_H / 2, 'MAX', {
      color: '#1a1205',
      fontFamily: '"Arial Black", Impact, monospace',
      fontSize: '10px',
      fontStyle: 'bold',
    })
      .setOrigin(0, 0.5)
      .setVisible(false);

    this.bannerText = scene.add
      .text(width / 2, 188, '', {
        align: 'center',
        color: '#ffe9b0',
        fixedWidth: 820,
        fontFamily: 'Copperplate, "Copperplate Gothic Bold", Georgia, serif',
        fontSize: '54px',
        fontStyle: 'bold',
        stroke: '#2a0707',
        strokeThickness: 9,
      })
      .setOrigin(0.5)
      .setDepth(106)
      .setScrollFactor(0)
      .setShadow(0, 0, '#ff2d20', 18, true, true);
    this.subText = scene.add
      .text(480, 236, '', {
        align: 'center',
        color: '#9fe9dc',
        fixedWidth: 760,
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        stroke: '#050608',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(106)
      .setScrollFactor(0);
    this.debugText = scene.add
      .text(20, 116, '', {
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
    this.pulse += 1;
    this.playerPortrait.setTexture(state.playerPortraitKey).setDisplaySize(PORTRAIT_SIZE, PORTRAIT_SIZE).setFlipX(false);
    this.cpuPortrait.setTexture(state.cpuPortraitKey).setDisplaySize(PORTRAIT_SIZE, PORTRAIT_SIZE).setFlipX(true);
    this.playerName.setText(state.playerName.toUpperCase());
    this.cpuName.setText(state.cpuName.toUpperCase());
    this.timerText.setText(String(Math.max(0, Math.ceil(state.timerSeconds))).padStart(2, '0'));
    this.roundText.setText(`ROUND ${state.roundIndex}`);

    const playerHealth = Phaser.Math.Clamp(state.player.health / state.player.tuning.maxHealth, 0, 1);
    const cpuHealth = Phaser.Math.Clamp(state.cpu.health / state.cpu.tuning.maxHealth, 0, 1);
    this.displayedHealth.player = this.approach(this.displayedHealth.player, playerHealth);
    this.displayedHealth.cpu = this.approach(this.displayedHealth.cpu, cpuHealth);

    this.drawHud(state, playerHealth, cpuHealth);

    this.playerMaxText.setVisible(state.player.meter >= state.player.tuning.meterMax);
    this.cpuMaxText.setVisible(state.cpu.meter >= state.cpu.tuning.meterMax);

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
    const stripe = this.scene.add.rectangle(width / 2, 236, width, 116, 0x07040a, 0.88).setDepth(104).setScrollFactor(0);
    const accentTop = this.scene.add.rectangle(width / 2, 180, width, 3, 0xffd36a, 0.95).setDepth(105).setScrollFactor(0);
    const accent = this.scene.add.rectangle(width / 2, 292, width, 4, 0xff3b30, 0.95).setDepth(105).setScrollFactor(0);
    const text = this.scene.add
      .text(width / 2, 232, `${fighterName.toUpperCase()}  SUPER`, {
        align: 'center',
        color: '#fff8dd',
        fixedWidth: width - 80,
        fontFamily: 'Copperplate, "Copperplate Gothic Bold", Georgia, serif',
        fontSize: '46px',
        fontStyle: 'bold',
        stroke: '#2a0707',
        strokeThickness: 9,
      })
      .setOrigin(0.5)
      .setDepth(106)
      .setScrollFactor(0)
      .setShadow(0, 0, '#ff2d20', 18, true, true);

    this.overlayObjects = [stripe, accentTop, accent, text];
  }

  public showMatchOverlay(options: {
    readonly title: string;
    readonly subtitle: string;
    readonly winner: MatchWinner;
  }): void {
    this.clearMatchOverlay();
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const accent = options.winner === 'player' ? 0x39e0c8 : 0xff6b5a;
    const scrim = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x03040a, 0.55).setDepth(119).setScrollFactor(0);
    const panel = this.scene.add.rectangle(width / 2, height / 2, 540, 232, 0x080b12, 0.94).setDepth(120).setScrollFactor(0);
    panel.setStrokeStyle(3, accent, 0.95);
    const topBar = this.scene.add.rectangle(width / 2, height / 2 - 116, 540, 4, accent, 0.95).setDepth(121).setScrollFactor(0);
    const title = this.scene.add
      .text(width / 2, height / 2 - 64, options.title.toUpperCase(), {
        align: 'center',
        color: '#fff4d6',
        fixedWidth: 500,
        fontFamily: 'Copperplate, "Copperplate Gothic Bold", Georgia, serif',
        fontSize: '38px',
        fontStyle: 'bold',
        stroke: '#2a0707',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(121)
      .setScrollFactor(0)
      .setShadow(0, 0, '#ff2d20', 14, true, true);
    const subtitle = this.scene.add
      .text(width / 2, height / 2 - 8, options.subtitle, {
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
      .text(width / 2, height / 2 + 70, 'ENTER / R  REMATCH      ESC  MENU', {
        align: 'center',
        color: '#9fe9dc',
        fixedWidth: 460,
        fontFamily: 'monospace',
        fontSize: '15px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(121)
      .setScrollFactor(0);

    this.overlayObjects = [scrim, panel, topBar, title, subtitle, prompt];
  }

  public clearMatchOverlay(): void {
    for (const object of this.overlayObjects) {
      object.destroy();
    }
    this.overlayObjects = [];
  }

  public destroy(): void {
    this.clearMatchOverlay();
    this.deck.destroy();
    this.graphics.destroy();
    this.playerPortrait.destroy();
    this.cpuPortrait.destroy();
    this.playerName.destroy();
    this.cpuName.destroy();
    this.timerText.destroy();
    this.roundText.destroy();
    this.playerMaxText.destroy();
    this.cpuMaxText.destroy();
    this.bannerText.destroy();
    this.subText.destroy();
    this.debugText.destroy();
  }

  /** Static deck backdrop drawn once: gradient, neon edges, center riser, energy slashes. */
  private drawDeck(): void {
    const width = this.scene.scale.width;
    const g = this.deck;
    g.clear();
    g.fillStyle(0x05070d, 0.92).fillRect(0, 0, width, DECK_HEIGHT);
    g.fillGradientStyle(0x101d3a, 0x281236, 0x05060d, 0x05060d, 0.92, 0.92, 0.7, 0.7).fillRect(0, 0, width, DECK_HEIGHT);

    // Center riser behind the timer.
    g.fillStyle(0x0a0f1c, 0.85).fillPoints(this.skew(width / 2 - 92, 0, 184, DECK_HEIGHT - 8, 30), true);

    // Diagonal energy slashes for motion.
    for (let i = 0; i < 3; i += 1) {
      const baseX = width / 2 - 150 + i * 26;
      g.fillStyle(0x39c5e0, 0.06 + i * 0.02).fillPoints(this.skew(baseX, 0, 6, DECK_HEIGHT, 30), true);
      g.fillStyle(0xff5a7a, 0.06 + i * 0.02).fillPoints(this.skew(width - baseX - 6, 0, 6, DECK_HEIGHT, -30), true);
    }

    // Neon underline.
    g.fillStyle(0x39c5e0, 0.5).fillRect(0, DECK_HEIGHT - 3, width / 2, 3);
    g.fillStyle(0xff5a6e, 0.5).fillRect(width / 2, DECK_HEIGHT - 3, width / 2, 3);
    g.fillStyle(0xffe9b0, 0.85).fillRect(width / 2 - 60, DECK_HEIGHT - 3, 120, 3);
    g.fillStyle(0x000000, 0.45).fillRect(0, DECK_HEIGHT, width, 4);
  }

  private drawHud(state: MatchHudState, playerHealth: number, cpuHealth: number): void {
    const width = this.scene.scale.width;
    const g = this.graphics;
    g.clear();

    this.drawHealthBar(g, BAR_X, BAR_Y, BAR_W, BAR_H, BAR_SKEW, playerHealth, this.displayedHealth.player, false);
    this.drawHealthBar(g, width - BAR_X - BAR_W, BAR_Y, BAR_W, BAR_H, -BAR_SKEW, cpuHealth, this.displayedHealth.cpu, true);

    const playerMeter = Phaser.Math.Clamp(state.player.meter / state.player.tuning.meterMax, 0, 1);
    const cpuMeter = Phaser.Math.Clamp(state.cpu.meter / state.cpu.tuning.meterMax, 0, 1);
    this.drawMeter(g, METER_X, METER_Y, METER_W, METER_H, METER_SKEW, playerMeter, false);
    this.drawMeter(g, width - METER_X - METER_W, METER_Y, METER_W, METER_H, -METER_SKEW, cpuMeter, true);

    this.drawPortraitFrame(g, PORTRAIT_CX, 41, 0x39e0c8);
    this.drawPortraitFrame(g, width - PORTRAIT_CX, 41, 0xff6b5a);

    this.drawTimerPlate(g, width / 2, 35);
    this.drawRoundPips(g, width / 2, 88, state.score.player, state.roundsToWin, false);
    this.drawRoundPips(g, width / 2, 88, state.score.cpu, state.roundsToWin, true);
  }

  private drawHealthBar(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    skew: number,
    health: number,
    displayed: number,
    alignRight: boolean,
  ): void {
    // Track.
    g.fillStyle(0x07090f, 0.96).fillPoints(this.skew(x, y, width, height, skew), true);

    const realW = width * health;
    const ghostW = width * Math.max(displayed, health);
    const realX = alignRight ? x + width - realW : x;
    const ghostX = alignRight ? x + width - ghostW : x;

    // Trailing chip-damage ghost (pale flash that lags behind real health).
    if (ghostW > realW + 0.5) {
      g.fillStyle(0xffe7a8, 0.9).fillPoints(this.skew(ghostX, y, ghostW, height, skew), true);
    }

    // Main fill, coloured by remaining health.
    if (realW > 0.5) {
      g.fillStyle(this.healthColor(health), 0.98).fillPoints(this.skew(realX, y, realW, height, skew), true);
      // Glossy top sheen.
      g.fillStyle(0xffffff, 0.16).fillPoints(this.skew(realX, y, realW, height * 0.42, skew), true);
    }

    // Frame.
    g.lineStyle(2, 0xdfeaf2, 0.5).strokePoints(this.skew(x, y, width, height, skew), true, true);
    g.lineStyle(1, 0x000000, 0.4).strokePoints(this.skew(x - 1, y - 1, width + 2, height + 2, skew), true, true);
  }

  private drawMeter(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    skew: number,
    meter: number,
    alignRight: boolean,
  ): void {
    g.fillStyle(0x080b12, 0.96).fillPoints(this.skew(x, y, width, height, skew), true);

    const full = meter >= 1;
    const wobble = 0.7 + 0.3 * Math.abs(Math.sin(this.pulse * 0.12));
    const fillW = width * meter;
    const fillX = alignRight ? x + width - fillW : x;
    const color = full ? 0xffd23f : 0x35d6e6;

    if (fillW > 0.5) {
      g.fillStyle(color, full ? wobble : 0.98).fillPoints(this.skew(fillX, y, fillW, height, skew), true);
      g.fillStyle(0xffffff, 0.18).fillPoints(this.skew(fillX, y, fillW, height * 0.4, skew), true);
    }

    // Segment notches.
    for (let seg = 1; seg < 3; seg += 1) {
      const notchX = x + (width * seg) / 3;
      g.fillStyle(0x05070d, 0.95).fillPoints(this.skew(notchX - 1, y, 2, height, skew), true);
    }

    g.lineStyle(1.5, full ? 0xffe9a0 : 0x8fd8e6, full ? wobble : 0.6).strokePoints(this.skew(x, y, width, height, skew), true, true);
  }

  private drawPortraitFrame(g: Phaser.GameObjects.Graphics, cx: number, cy: number, accent: number): void {
    const half = PORTRAIT_SIZE / 2 + 5;
    g.fillStyle(0x05080f, 0.95).fillPoints(this.skew(cx - half, cy - half, half * 2, half * 2, 8), true);
    g.lineStyle(2.5, accent, 0.95).strokePoints(this.skew(cx - half, cy - half, half * 2, half * 2, 8), true, true);
    g.lineStyle(1, 0xffffff, 0.25).strokePoints(this.skew(cx - half + 2, cy - half + 2, half * 2 - 4, half * 2 - 4, 8), true, true);
  }

  private drawTimerPlate(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    const hw = 48;
    const hh = 31;
    const cut = 16;
    const hex: Pt[] = [
      new Phaser.Math.Vector2(cx - hw + cut, cy - hh),
      new Phaser.Math.Vector2(cx + hw - cut, cy - hh),
      new Phaser.Math.Vector2(cx + hw, cy),
      new Phaser.Math.Vector2(cx + hw - cut, cy + hh),
      new Phaser.Math.Vector2(cx - hw + cut, cy + hh),
      new Phaser.Math.Vector2(cx - hw, cy),
    ];
    g.fillStyle(0x06080f, 0.95).fillPoints(hex, true);
    g.fillStyle(0xffae3b, 0.1).fillPoints(hex, true);
    g.lineStyle(2.5, 0xffd36a, 0.95).strokePoints(hex, true, true);
    g.lineStyle(1, 0xffffff, 0.2).strokePoints(
      hex.map((p) => new Phaser.Math.Vector2(cx + (p.x - cx) * 0.86, cy + (p.y - cy) * 0.86)),
      true,
      true,
    );
  }

  /** Round-win diamonds laid out from the screen center outward, one cluster per side. */
  private drawRoundPips(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    y: number,
    score: number,
    roundsToWin: number,
    rightSide: boolean,
  ): void {
    const gap = 13;
    const step = 16;
    const r = 6;
    for (let index = 0; index < roundsToWin; index += 1) {
      const pipX = rightSide ? cx + gap + index * step : cx - gap - index * step;
      const won = index < score;
      if (won) {
        // Glow halo behind a won pip.
        g.fillStyle(0xffd36a, 0.28).fillPoints(this.diamond(pipX, y, r + 4), true);
      }
      g.fillStyle(won ? 0xffd36a : 0x2b3a4a, 0.96).fillPoints(this.diamond(pipX, y, r), true);
      g.fillStyle(0xffffff, won ? 0.4 : 0.12).fillPoints(this.diamond(pipX, y - 1, r * 0.5), true);
      g.lineStyle(1.5, won ? 0xffe9a0 : 0x6f8294, 0.95).strokePoints(this.diamond(pipX, y, r), true, true);
    }
  }

  private diamond(cx: number, cy: number, r: number): Pt[] {
    return [
      new Phaser.Math.Vector2(cx, cy - r),
      new Phaser.Math.Vector2(cx + r, cy),
      new Phaser.Math.Vector2(cx, cy + r),
      new Phaser.Math.Vector2(cx - r, cy),
    ];
  }

  /** Parallelogram whose top edge is shifted by `topShift` (signed) relative to the bottom. */
  private skew(x: number, y: number, width: number, height: number, topShift: number): Pt[] {
    return [
      new Phaser.Math.Vector2(x + topShift, y),
      new Phaser.Math.Vector2(x + width + topShift, y),
      new Phaser.Math.Vector2(x + width, y + height),
      new Phaser.Math.Vector2(x, y + height),
    ];
  }

  private healthColor(pct: number): number {
    return pct > 0.5 ? this.lerpColor(0xffd23f, 0x49e08a, (pct - 0.5) * 2) : this.lerpColor(0xff3636, 0xffd23f, pct * 2);
  }

  private lerpColor(from: number, to: number, t: number): number {
    const blend = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.IntegerToColor(from),
      Phaser.Display.Color.IntegerToColor(to),
      100,
      Math.round(Phaser.Math.Clamp(t, 0, 1) * 100),
    );
    return Phaser.Display.Color.GetColor(blend.r, blend.g, blend.b);
  }

  private approach(current: number, target: number): number {
    if (Math.abs(target - current) < 0.004) {
      return target;
    }
    return current + (target - current) * 0.14;
  }

  private makeText(x: number, y: number, value: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, value, style).setDepth(102).setScrollFactor(0);
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
