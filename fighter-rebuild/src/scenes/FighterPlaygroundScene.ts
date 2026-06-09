import Phaser from 'phaser';
import { consumeFixedTimestep, createCombatState, stepCombat } from '../game/combat';
import type { CombatEvent, CombatState } from '../game/combat';
import {
  FIGHTER_FRAME_HEIGHT,
  FIGHTER_FRAME_WIDTH,
  clampHealth,
  fighterAnimationName,
  getWorldAttackBox,
  getWorldCollisionBox,
  getWorldGuardBoxes,
  getWorldHurtBoxes,
  createFighterState,
} from '../game/fighter';
import type { AttackKind, FighterInput, FighterState } from '../game/fighter';
import type { AssetManifestAnimation, CharacterDefinition, GameConfig, InputBindingConfig, Rect, StageDefinition } from '../game/types';
import {
  type DebugPanelMount,
  type FighterPlaygroundOverlayKey,
  type FighterPlaygroundPanelState,
  mountFighterPlaygroundPanel,
} from '../shell/debugPanel';
import { BaseScene } from './BaseScene';
import { SceneKey } from './sceneKeys';

const OVERLAY_COLORS: Readonly<Record<FighterPlaygroundOverlayKey, number>> = {
  visual: 0xffffff,
  collision: 0x40b6ff,
  hurt: 0xff4d70,
  attack: 0xffcf3c,
  guard: 0x62e06f,
};

const ATTACK_LABELS: Readonly<Record<AttackKind, string>> = {
  light: 'Light Punch',
  heavy: 'Heavy Kick',
  special: 'Special Combo',
};

type PlaygroundDebugState = {
  readonly scene: 'FighterPlayground';
  readonly frame: number;
  readonly player: ReturnType<typeof fighterSnapshot>;
  readonly dummy: ReturnType<typeof fighterSnapshot>;
  readonly fillMeter: boolean;
  readonly dummyGuard: boolean;
  readonly latestEvents: readonly CombatEvent[];
};

export class FighterPlaygroundScene extends BaseScene {
  private gameConfig: GameConfig | null = null;
  private stageDefinition: StageDefinition | null = null;
  private combatState: CombatState | null = null;
  private playerSprite: Phaser.GameObjects.Sprite | null = null;
  private dummySprite: Phaser.GameObjects.Sprite | null = null;
  private overlayGraphics: Phaser.GameObjects.Graphics | null = null;
  private hudGraphics: Phaser.GameObjects.Graphics | null = null;
  private titleText: Phaser.GameObjects.Text | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;
  private tuningText: Phaser.GameObjects.Text | null = null;
  private eventText: Phaser.GameObjects.Text | null = null;
  private panel: DebugPanelMount<FighterPlaygroundPanelState> | null = null;
  private accumulatedSeconds = 0;
  private reviveFrames = 0;
  private inputByCode: Partial<Record<string, keyof FighterInput>> = {};
  private readonly heldInput: Partial<Record<keyof FighterInput, boolean>> = {};
  private readonly pulseInput = new Set<keyof FighterInput>();
  private readonly state: {
    fillMeter: boolean;
    dummyGuard: boolean;
    overlays: Record<FighterPlaygroundOverlayKey, boolean>;
  } = {
    fillMeter: false,
    dummyGuard: false,
    overlays: {
      visual: true,
      collision: true,
      hurt: true,
      attack: true,
      guard: true,
    },
  };

  public constructor() {
    super(SceneKey.FighterPlayground);
  }

  public create(): void {
    this.events.once('shutdown', this.dispose, this);
    this.events.once('destroy', this.dispose, this);
    this.input.keyboard?.on('keydown', this.handleKeyDown, this);
    this.input.keyboard?.on('keyup', this.handleKeyUp, this);

    void this.renderWithConfig((config) => this.renderPlayground(config));
  }

  public override update(_time: number, delta: number): void {
    if (!this.combatState || !this.stageDefinition) {
      return;
    }

    this.accumulatedSeconds = Math.min(this.accumulatedSeconds + delta / 1000, 0.15);
    const timestep = consumeFixedTimestep(this.accumulatedSeconds);
    const steps = Math.min(timestep.steps, 8);
    this.accumulatedSeconds = timestep.remainderSeconds;

    for (let index = 0; index < steps; index += 1) {
      this.stepSimulation(index === 0);
    }

    this.syncSprites();
    this.drawHud();
    this.drawOverlays();
    this.refreshReadouts();
    this.syncPanel();
    this.publishPlaygroundState();
  }

  private renderPlayground(config: GameConfig): void {
    const stage = config.stagesById[config.settings.defaultStageId] ?? config.stages[0];
    const player = config.charactersById[config.settings.defaultPlayerId] ?? config.charactersById.sama ?? config.characters[0];
    const dummy =
      config.characters.find((character) => character.id !== player?.id) ??
      config.charactersById[config.settings.defaultCpuId] ??
      config.characters[1] ??
      config.characters[0];

    if (!stage || !player || !dummy) {
      this.addBodyText(this.scale.width / 2, this.scale.height / 2, 'Playground config is missing stage or fighter data.', 560, '#ffb4a8');
      return;
    }

    this.gameConfig = config;
    this.stageDefinition = stage;
    this.inputByCode = createInputCodeMap(config.input);

    this.combatState = createCombatState({
      seed: config.settings.seed,
      stage,
      fighters: {
        player: {
          character: player,
          tuning: config.tuning[player.tuningId],
          x: stage.playerSpawnX,
        },
        cpu: {
          character: dummy,
          tuning: config.tuning[dummy.tuningId],
          x: stage.cpuSpawnX,
        },
      },
    });

    this.drawStage(stage);
    this.createSprites();
    this.createHudText();
    this.createPointerControls();
    this.overlayGraphics = this.add.graphics().setDepth(50);
    this.hudGraphics = this.add.graphics().setDepth(70);
    this.mountPanel();
    this.syncSprites();
    this.drawHud();
    this.drawOverlays();
    this.refreshReadouts();
    this.syncPanel();
    this.publishMenuState(SceneKey.FighterPlayground, {
      labels: ['Fighter Playground', 'Light Punch', 'Heavy Kick', 'Special Combo'],
      selectedStageId: stage.id,
      selectedPlayerId: player.id,
      selectedCpuId: dummy.id,
    });
  }

  private drawStage(stage: StageDefinition): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#090b10');

    for (const [index, layer] of stage.layers.entries()) {
      this.add
        .image(width / 2, height / 2, layer.assetKey)
        .setDisplaySize(width, height)
        .setDepth(index)
        .setAlpha(index === stage.layers.length - 1 ? 1 : 0.94);
    }

    this.add.rectangle(width / 2, 50, width, 100, 0x05070b, 0.62).setDepth(20);
    this.add.rectangle(width / 2, height - 46, width, 92, 0x05070b, 0.66).setDepth(20);
    this.add
      .line(0, 0, this.worldOffsetX, this.worldToScreenY(stage.floorY), this.worldOffsetX + stage.width, this.worldToScreenY(stage.floorY), 0xf4d063, 0.78)
      .setOrigin(0, 0)
      .setDepth(21);
  }

  private createSprites(): void {
    if (!this.combatState) {
      return;
    }

    const playerAsset = this.getAnimationAsset(this.combatState.player.character, fighterAnimationName(this.combatState.player));
    const dummyAsset = this.getAnimationAsset(this.combatState.cpu.character, fighterAnimationName(this.combatState.cpu));

    if (playerAsset) {
      this.playerSprite = this.add.sprite(0, 0, playerAsset.key, 0).setOrigin(0.5, 1).setDepth(30);
    }

    if (dummyAsset) {
      this.dummySprite = this.add.sprite(0, 0, dummyAsset.key, 0).setOrigin(0.5, 1).setDepth(31);
    }
  }

  private createHudText(): void {
    this.titleText = this.add
      .text(28, 18, 'Fighter Playground', {
        color: '#fff4d6',
        fontFamily: 'monospace',
        fontSize: '22px',
        fontStyle: '700',
      })
      .setDepth(80);

    this.statusText = this.add
      .text(28, 64, '', {
        color: '#d8e6e1',
        fontFamily: 'monospace',
        fontSize: '12px',
        lineSpacing: 4,
      })
      .setDepth(80);

    this.tuningText = this.add
      .text(706, 18, '', {
        color: '#d8e6e1',
        fixedWidth: 226,
        fontFamily: 'monospace',
        fontSize: '12px',
        lineSpacing: 4,
        wordWrap: { width: 226 },
      })
      .setDepth(80);

    this.eventText = this.add
      .text(706, 126, '', {
        color: '#ffd483',
        fixedWidth: 226,
        fontFamily: 'monospace',
        fontSize: '11px',
        lineSpacing: 4,
        wordWrap: { width: 226 },
      })
      .setDepth(80);
  }

  private createPointerControls(): void {
    const y = this.scale.height - 43;
    this.createHoldButton(40, y, 58, 42, 'Left', 'left');
    this.createHoldButton(106, y, 58, 42, 'Right', 'right');
    this.createHoldButton(172, y, 58, 42, 'Jump', 'jump');
    this.createHoldButton(238, y, 58, 42, 'Duck', 'crouch');
    this.createHoldButton(304, y, 58, 42, 'Guard', 'block');
    this.createActionButton(430, y, 112, 42, ATTACK_LABELS.light, 'light');
    this.createActionButton(558, y, 112, 42, ATTACK_LABELS.heavy, 'heavy');
    this.createActionButton(700, y, 128, 42, ATTACK_LABELS.special, 'special');
    this.createActionButton(818, y, 96, 42, 'Reset Dummy', 'reset');
  }

  private createHoldButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    action: keyof FighterInput,
  ): void {
    const background = this.add.rectangle(x, y, width, height, 0x13211f, 0.86).setStrokeStyle(1, 0x5bd7cb, 0.58).setDepth(82);
    this.add
      .text(x, y, label, {
        align: 'center',
        color: '#f5fbf9',
        fixedWidth: width - 8,
        fontFamily: 'monospace',
        fontSize: '11px',
        fontStyle: '700',
      })
      .setOrigin(0.5)
      .setDepth(83);
    const zone = this.add.zone(x, y, width, height).setOrigin(0.5).setInteractive().setDepth(84);
    const press = (): void => {
      this.heldInput[action] = true;
      background.setFillStyle(0x2e5147, 0.96);
    };
    const release = (): void => {
      this.heldInput[action] = false;
      background.setFillStyle(0x13211f, 0.86);
    };

    zone.on('pointerdown', press);
    zone.on('pointerup', release);
    zone.on('pointerout', release);
    zone.on('pointerupoutside', release);
  }

  private createActionButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    action: AttackKind | 'reset',
  ): void {
    const background = this.add.rectangle(x, y, width, height, 0x2b2517, 0.88).setStrokeStyle(1, 0xffd36a, 0.62).setDepth(82);
    this.add
      .text(x, y, label, {
        align: 'center',
        color: '#fff8dd',
        fixedWidth: width - 8,
        fontFamily: 'monospace',
        fontSize: '11px',
        fontStyle: '700',
      })
      .setOrigin(0.5)
      .setDepth(83);
    const zone = this.add.zone(x, y, width, height).setOrigin(0.5).setInteractive().setDepth(84);

    zone.on('pointerdown', () => {
      background.setFillStyle(0x5b4821, 0.98);

      if (action === 'reset') {
        this.resetDummy();
      } else {
        this.pulseInput.add(action);
      }
    });
    zone.on('pointerup', () => background.setFillStyle(0x2b2517, 0.88));
    zone.on('pointerout', () => background.setFillStyle(0x2b2517, 0.88));
  }

  private mountPanel(): void {
    this.panel = mountFighterPlaygroundPanel(
      document.querySelector<HTMLElement>('#debug-sidebar'),
      this.createPanelState(),
      {
        onAction: (action) => {
          if (action === 'reset') {
            this.resetDummy();
            return;
          }

          this.pulseInput.add(action);
        },
        onFillMeterChange: (enabled) => {
          this.state.fillMeter = enabled;
          if (this.combatState) {
            this.combatState = this.applyForcedMeter(this.combatState);
          }
          this.syncPanel();
        },
        onDummyGuardChange: (enabled) => {
          this.state.dummyGuard = enabled;
          this.syncPanel();
        },
        onOverlayChange: (overlay, enabled) => {
          this.state.overlays[overlay] = enabled;
          this.drawOverlays();
          this.syncPanel();
        },
      },
    );
  }

  private stepSimulation(allowPulse: boolean): void {
    if (!this.combatState) {
      return;
    }

    const playerInput = this.createPlayerInput(allowPulse);
    const cpuInput: FighterInput = this.state.dummyGuard ? { block: true } : {};
    const previousEventCount = this.combatState.events.length;
    const before = this.applyForcedMeter(this.combatState);
    const stepped = stepCombat(before, {
      player: playerInput,
      cpu: cpuInput,
    });
    const after = this.applyForcedMeter(stepped);
    const newEvents = after.events.slice(previousEventCount);

    for (const event of newEvents) {
      this.spawnHitSpark(event);
    }

    this.combatState = this.regenerateDummy({
      ...after,
      events: after.events.slice(-64),
    });

    if (allowPulse) {
      this.pulseInput.clear();
    }
  }

  private createPlayerInput(allowPulse: boolean): FighterInput {
    return {
      left: Boolean(this.heldInput.left),
      right: Boolean(this.heldInput.right),
      jump: Boolean(this.heldInput.jump),
      crouch: Boolean(this.heldInput.crouch),
      block: Boolean(this.heldInput.block),
      light: allowPulse && this.pulseInput.has('light'),
      heavy: allowPulse && this.pulseInput.has('heavy'),
      special: allowPulse && this.pulseInput.has('special'),
    };
  }

  private applyForcedMeter(state: CombatState): CombatState {
    if (!this.state.fillMeter) {
      return state;
    }

    return {
      ...state,
      player: {
        ...state.player,
        meter: state.player.tuning.meterMax,
      },
    };
  }

  private regenerateDummy(state: CombatState): CombatState {
    if (state.cpu.isFinished) {
      this.reviveFrames = this.reviveFrames > 0 ? this.reviveFrames - 1 : 45;

      if (this.reviveFrames === 0) {
        return this.withFreshDummy(state);
      }

      return state;
    }

    this.reviveFrames = 0;

    if (state.frame % 12 !== 0 || state.cpu.health >= state.cpu.tuning.maxHealth || state.cpu.status === 'hitstun') {
      return state;
    }

    return {
      ...state,
      cpu: clampHealth(state.cpu, state.cpu.health + 1),
    };
  }

  private withFreshDummy(state: CombatState): CombatState {
    if (!this.stageDefinition) {
      return state;
    }

    return {
      ...state,
      cpu: createFighterState({
        slot: 'cpu',
        character: state.cpu.character,
        tuning: state.cpu.tuning,
        x: this.stageDefinition.cpuSpawnX,
        floorY: this.stageDefinition.floorY,
        facing: 'left',
      }),
    };
  }

  private resetDummy(): void {
    if (!this.combatState) {
      return;
    }

    this.reviveFrames = 0;
    this.combatState = this.withFreshDummy(this.combatState);
    this.syncSprites();
    this.drawHud();
    this.drawOverlays();
    this.refreshReadouts();
    this.syncPanel();
  }

  private syncSprites(): void {
    if (!this.combatState) {
      return;
    }

    this.syncSprite(this.playerSprite, this.combatState.player);
    this.syncSprite(this.dummySprite, this.combatState.cpu);
  }

  private syncSprite(sprite: Phaser.GameObjects.Sprite | null, fighter: FighterState): void {
    if (!sprite) {
      return;
    }

    const animationName = fighterAnimationName(fighter);
    const animationAsset = this.getAnimationAsset(fighter.character, animationName);

    if (animationAsset) {
      sprite.setTexture(animationAsset.key);
      sprite.setFrame(Phaser.Math.Clamp(fighter.animationFrame, 0, Math.max(0, animationAsset.frameCount - 1)));
    }

    const originX = animationAsset ? Phaser.Math.Clamp(160 / animationAsset.frameWidth, 0.2, 0.5) : 0.5;

    sprite
      .setPosition(this.worldToScreenX(fighter.position.x), this.worldToScreenY(fighter.position.y))
      .setOrigin(originX, 1)
      .setFlipX(fighter.facing === 'left')
      .setAlpha(fighter.isFinished ? 0.82 : 1);
  }

  private drawHud(): void {
    if (!this.combatState || !this.hudGraphics) {
      return;
    }

    const graphics = this.hudGraphics;
    graphics.clear();
    graphics.fillStyle(0x030507, 0.74).fillRoundedRect(20, 14, 318, 86, 6);
    graphics.fillStyle(0x030507, 0.74).fillRoundedRect(686, 14, 254, 180, 6);
    this.drawFighterBars(graphics, this.combatState.player, 28, 102, 296, false);
    this.drawFighterBars(graphics, this.combatState.cpu, 630, 102, 296, true);
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
    const meterWidth = width * meterPercent;
    const healthX = alignRight ? x + width - healthWidth : x;
    const meterX = alignRight ? x + width - meterWidth : x;

    graphics.fillStyle(0x14191d, 0.94).fillRoundedRect(x, y, width, 18, 4);
    graphics.fillStyle(0xb83e52, 0.96).fillRoundedRect(healthX, y, healthWidth, 18, 4);
    graphics.lineStyle(1, 0xffffff, 0.34).strokeRoundedRect(x, y, width, 18, 4);
    graphics.fillStyle(0x14191d, 0.94).fillRoundedRect(x, y + 24, width, 10, 3);
    graphics.fillStyle(0x46b8ff, 0.96).fillRoundedRect(meterX, y + 24, meterWidth, 10, 3);
    graphics.lineStyle(1, 0xffffff, 0.28).strokeRoundedRect(x, y + 24, width, 10, 3);
  }

  private drawOverlays(): void {
    if (!this.combatState || !this.overlayGraphics || !this.stageDefinition) {
      return;
    }

    const graphics = this.overlayGraphics;
    graphics.clear();
    graphics.lineStyle(2, 0xffd36a, 0.78).strokeRect(this.worldOffsetX, this.worldOffsetY, this.stageDefinition.width, this.stageDefinition.height);
    graphics.lineStyle(3, 0xffd36a, 0.85).lineBetween(
      this.worldOffsetX,
      this.worldToScreenY(this.stageDefinition.floorY),
      this.worldOffsetX + this.stageDefinition.width,
      this.worldToScreenY(this.stageDefinition.floorY),
    );

    this.drawFighterOverlays(this.combatState.player);
    this.drawFighterOverlays(this.combatState.cpu);
  }

  private drawFighterOverlays(fighter: FighterState): void {
    if (!this.overlayGraphics) {
      return;
    }

    if (this.state.overlays.visual) {
      this.drawWorldRect(
        {
          x: fighter.position.x - FIGHTER_FRAME_WIDTH / 2,
          y: fighter.position.y - FIGHTER_FRAME_HEIGHT,
          width: FIGHTER_FRAME_WIDTH,
          height: FIGHTER_FRAME_HEIGHT,
        },
        OVERLAY_COLORS.visual,
        0,
        0.55,
        1,
      );
    }

    if (this.state.overlays.collision) {
      this.drawWorldRect(getWorldCollisionBox(fighter), OVERLAY_COLORS.collision, 0.08, 0.95, 2);
    }

    if (this.state.overlays.hurt) {
      for (const rect of getWorldHurtBoxes(fighter)) {
        this.drawWorldRect(rect, OVERLAY_COLORS.hurt, 0.09, 0.95, 2);
      }
    }

    if (this.state.overlays.guard) {
      for (const rect of getWorldGuardBoxes(fighter)) {
        this.drawWorldRect(rect, OVERLAY_COLORS.guard, 0.11, 1, 2);
      }
    }

    if (this.state.overlays.attack && fighter.activeAttack) {
      for (const attackWindow of fighter.activeAttack.profile.windows) {
        if (
          fighter.activeAttack.actionFrame >= attackWindow.startFrame &&
          fighter.activeAttack.actionFrame <= attackWindow.endFrame
        ) {
          this.drawWorldRect(getWorldAttackBox(fighter, attackWindow.hitbox), OVERLAY_COLORS.attack, 0.16, 1, 3);
        }
      }
    }
  }

  private drawWorldRect(rect: Rect, color: number, fillAlpha: number, lineAlpha: number, lineWidth: number): void {
    this.overlayGraphics
      ?.fillStyle(color, fillAlpha)
      .fillRect(this.worldToScreenX(rect.x), this.worldToScreenY(rect.y), rect.width, rect.height)
      .lineStyle(lineWidth, color, lineAlpha)
      .strokeRect(this.worldToScreenX(rect.x), this.worldToScreenY(rect.y), rect.width, rect.height);
  }

  private refreshReadouts(): void {
    if (!this.combatState || !this.stageDefinition) {
      return;
    }

    const player = this.combatState.player;
    const dummy = this.combatState.cpu;
    this.titleText?.setText(`Fighter Playground: ${player.character.displayName} v ${dummy.character.displayName}`);
    this.statusText?.setText(
      [
        `Player ${player.health}/${player.tuning.maxHealth} HP  ${player.meter}/${player.tuning.meterMax} meter  ${player.status}`,
        `Dummy  ${dummy.health}/${dummy.tuning.maxHealth} HP  ${dummy.meter}/${dummy.tuning.meterMax} meter  ${dummy.status}${this.state.dummyGuard ? ' guarding' : ''}`,
        `Keys: A/D move, W or Space jump, S duck, E guard, J/K/L attacks, Esc menu`,
      ].join('\n'),
    );
    this.tuningText?.setText(
      [
        'Live tuning',
        `P speed ${player.tuning.walkSpeed} jump ${player.tuning.jumpVelocity}`,
        `P gravity ${player.tuning.gravity} friction ${player.tuning.groundFriction}`,
        `D speed ${dummy.tuning.walkSpeed} jump ${dummy.tuning.jumpVelocity}`,
        `Stage ${this.stageDefinition.displayName} ${this.stageDefinition.width}x${this.stageDefinition.height}`,
      ].join('\n'),
    );
    this.eventText?.setText(
      this.combatState.events
        .slice(-7)
        .map((event) => `${event.frame}: ${event.sourceId} ${event.type} ${event.attackId} -${event.damage}`)
        .join('\n') || 'No combat events yet.',
    );
  }

  private syncPanel(): void {
    this.panel?.update(this.createPanelState());
  }

  private createPanelState(): FighterPlaygroundPanelState {
    const player = this.combatState?.player;
    const dummy = this.combatState?.cpu;

    return {
      playerLabel: player?.character.displayName ?? 'Player',
      dummyLabel: dummy?.character.displayName ?? 'Dummy',
      playerHealth: player ? `${Math.round(player.health)}/${player.tuning.maxHealth}` : '-',
      dummyHealth: dummy ? `${Math.round(dummy.health)}/${dummy.tuning.maxHealth}` : '-',
      playerMeter: player ? `${Math.round(player.meter)}/${player.tuning.meterMax}` : '-',
      dummyMeter: dummy ? `${Math.round(dummy.meter)}/${dummy.tuning.meterMax}` : '-',
      playerStatus: player?.status ?? '-',
      dummyStatus: dummy?.status ?? '-',
      fillMeter: this.state.fillMeter,
      dummyGuard: this.state.dummyGuard,
      overlays: { ...this.state.overlays },
      exportText: this.createJsonExport(),
      warnings: this.gameConfig?.warnings ?? [],
    };
  }

  private createJsonExport(): string {
    if (!this.combatState || !this.stageDefinition) {
      return '{}';
    }

    return JSON.stringify(
      {
        tool: 'fighter-playground',
        frame: this.combatState.frame,
        stage: {
          id: this.stageDefinition.id,
          floorY: this.stageDefinition.floorY,
          width: this.stageDefinition.width,
        },
        controls: this.gameConfig?.input,
        toggles: {
          fillMeter: this.state.fillMeter,
          dummyGuard: this.state.dummyGuard,
          overlays: this.state.overlays,
        },
        fighters: {
          player: fighterSnapshot(this.combatState.player),
          dummy: fighterSnapshot(this.combatState.cpu),
        },
        tuning: {
          player: this.combatState.player.tuning,
          dummy: this.combatState.cpu.tuning,
        },
        attacks: {
          light: ATTACK_LABELS.light,
          heavy: ATTACK_LABELS.heavy,
          special: ATTACK_LABELS.special,
          player: this.combatState.player.character.attacks,
          dummy: this.combatState.cpu.character.attacks,
        },
        latestEvents: this.combatState.events.slice(-12),
      },
      null,
      2,
    );
  }

  private spawnHitSpark(event: CombatEvent): void {
    if (!this.combatState || event.type === 'finisher') {
      return;
    }

    const source = event.sourceId === 'player' ? this.combatState.player : this.combatState.cpu;
    const target = event.targetId === 'player' ? this.combatState.player : this.combatState.cpu;
    const x = this.worldToScreenX((source.position.x + target.position.x) / 2);
    const y = this.worldToScreenY(Math.min(source.position.y, target.position.y) - 170);
    const spark = this.add.sprite(x, y, 'vfx-hit-spark', 0).setDepth(65).setScale(event.type === 'blocked' ? 1.35 : 1.7);
    spark.play('hit-spark-burst');
    spark.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => spark.destroy());
  }

  private getAnimationAsset(character: CharacterDefinition, animationName: string): AssetManifestAnimation | null {
    const manifestCharacter = this.gameConfig?.manifest.characters.find((entry) => entry.id === character.assetId);
    return manifestCharacter?.animations.find((animation) => animation.name === animationName) ?? null;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (isDomEditingKeyboardTarget(event.target)) {
      return;
    }

    if (event.code === 'Escape') {
      event.preventDefault();
      this.scene.start(SceneKey.MainMenu);
      return;
    }

    const action = this.inputByCode[event.code];

    if (!action) {
      return;
    }

    event.preventDefault();

    if (action === 'light' || action === 'heavy' || action === 'special') {
      this.pulseInput.add(action);
      return;
    }

    this.heldInput[action] = true;
  }

  private handleKeyUp(event: KeyboardEvent): void {
    const action = this.inputByCode[event.code];

    if (!action) {
      return;
    }

    event.preventDefault();
    this.heldInput[action] = false;
  }

  private get worldOffsetX(): number {
    return Math.round((this.scale.width - (this.stageDefinition?.width ?? 640)) / 2);
  }

  private get worldOffsetY(): number {
    const stageFloorY = this.stageDefinition?.floorY ?? 220;
    return Math.round(this.scale.height - 105 - stageFloorY);
  }

  private worldToScreenX(worldX: number): number {
    return this.worldOffsetX + worldX;
  }

  private worldToScreenY(worldY: number): number {
    return this.worldOffsetY + worldY;
  }

  private publishPlaygroundState(): void {
    if (!this.combatState) {
      return;
    }

    const host = globalThis as typeof globalThis & { __SAMA_V_AMODI_PLAYGROUND__?: PlaygroundDebugState };
    host.__SAMA_V_AMODI_PLAYGROUND__ = {
      scene: 'FighterPlayground',
      frame: this.combatState.frame,
      player: fighterSnapshot(this.combatState.player),
      dummy: fighterSnapshot(this.combatState.cpu),
      fillMeter: this.state.fillMeter,
      dummyGuard: this.state.dummyGuard,
      latestEvents: this.combatState.events.slice(-8),
    };
  }

  private dispose(): void {
    this.input.keyboard?.off('keydown', this.handleKeyDown, this);
    this.input.keyboard?.off('keyup', this.handleKeyUp, this);
    this.panel?.dispose();
    this.panel = null;
  }
}

function fighterSnapshot(fighter: FighterState): {
  readonly id: string;
  readonly health: number;
  readonly meter: number;
  readonly status: string;
  readonly animation: string;
  readonly frame: number;
  readonly x: number;
  readonly y: number;
} {
  return {
    id: fighter.character.id,
    health: Math.round(fighter.health * 100) / 100,
    meter: Math.round(fighter.meter * 100) / 100,
    status: fighter.status,
    animation: fighterAnimationName(fighter),
    frame: fighter.animationFrame,
    x: Math.round(fighter.position.x * 100) / 100,
    y: Math.round(fighter.position.y * 100) / 100,
  };
}

function createInputCodeMap(input: InputBindingConfig): Partial<Record<string, keyof FighterInput>> {
  return {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'jump',
    ArrowDown: 'crouch',
    Space: 'jump',
    KeyA: 'left',
    KeyD: 'right',
    KeyW: 'jump',
    KeyS: 'crouch',
    KeyE: 'block',
    KeyJ: 'light',
    KeyK: 'heavy',
    KeyL: 'special',
    [input.left]: 'left',
    [input.right]: 'right',
    [input.jump]: 'jump',
    [input.crouch]: 'crouch',
    [input.block]: 'block',
    [input.light]: 'light',
    [input.heavy]: 'heavy',
    [input.special]: 'special',
  };
}

function isDomEditingKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'select' || tagName === 'textarea' || target.isContentEditable;
}
