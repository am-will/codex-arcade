import Phaser from 'phaser';
import { consumeFixedTimestep, createCombatState, stepCombat, toSimulationFrames, type CombatEvent, type CombatState } from '../game/combat';
import { createCpuController, type CpuController } from '../game/cpu';
import {
  FIGHTER_FRAME_WIDTH,
  beginDefeatFall,
  clampMeter,
  finalAnimationFrameFor,
  fighterAnimationName,
  type AttackKind,
  type FighterInput,
  type FighterSlot,
  type FighterState,
} from '../game/fighter';
import { MatchHud, formatRoundWinner } from '../game/hud';
import {
  ROUND_POLICY,
  applyRoundResult,
  createInitialRoundScore,
  resolveMatchWinnerId,
  resolveRound,
  type MatchWinner,
  type RoundResolution,
  type RoundScore,
  type RoundWinner,
} from '../game/rounds';
import {
  installTestHooks,
  removeTestHooks,
  type SamaAmodiTestHooks,
  type TestHookFighterState,
  type TestHookHost,
  type TestHookInputAction,
  type TestHookMatchState,
  type TestHookStartMatchOptions,
} from '../game/testHooks';
import type {
  AssetManifestAnimation,
  CharacterDefinition,
  GameConfig,
  InputBindingConfig,
  MatchConfig,
  StageDefinition,
} from '../game/types';
import { BaseScene, type MatchLaunchData } from './BaseScene';
import { SceneKey } from './sceneKeys';

type MatchPhase = 'roundIntro' | 'fighting' | 'roundOver' | 'matchOver';

type RuntimeStage = StageDefinition & {
  readonly sourceStageId: string;
};

const ATTACK_LABELS: Readonly<Record<AttackKind, string>> = {
  light: 'Light Punch',
  heavy: 'Heavy Kick',
  special: 'Special Combo',
};

const INTRO_FRAMES = 96;
const FIGHT_BANNER_FRAMES = 42;

export class MatchScene extends BaseScene {
  private gameConfig: GameConfig | null = null;
  private matchConfig: MatchConfig | null = null;
  private stageDefinition: RuntimeStage | null = null;
  private combatState: CombatState | null = null;
  private cpuController: CpuController | null = null;
  private hud: MatchHud | null = null;
  private playerSprite: Phaser.GameObjects.Sprite | null = null;
  private cpuSprite: Phaser.GameObjects.Sprite | null = null;
  private stageObjects: Phaser.GameObjects.GameObject[] = [];
  private pointerObjects: Phaser.GameObjects.GameObject[] = [];
  private phase: MatchPhase = 'roundIntro';
  private score: RoundScore = createInitialRoundScore();
  private roundIndex = 1;
  private timerFrames = 0;
  private phaseFramesRemaining = 0;
  private fightBannerFrames = 0;
  private accumulatedSeconds = 0;
  private inputByCode: Partial<Record<string, TestHookInputAction>> = {};
  private readonly heldInput: Partial<Record<TestHookInputAction, boolean>> = {};
  private readonly pulseInput = new Set<AttackKind>();
  private readonly scriptedInputFrames: Partial<Record<TestHookInputAction, number>> = {};
  private debugOverlay = false;
  private cpuEnabled = true;
  private winner: MatchWinner | undefined;
  private roundWinner: RoundWinner = 'draw';
  private meterCarry = {
    player: 0,
    cpu: 0,
  };
  private superPauseFrames = 0;
  private pendingSuperSlot: FighterSlot | null = null;

  public constructor() {
    super(SceneKey.Match);
  }

  public create(data?: MatchLaunchData): void {
    this.events.once('shutdown', this.dispose, this);
    this.events.once('destroy', this.dispose, this);
    this.input.keyboard?.on('keydown', this.handleKeyDown, this);
    this.input.keyboard?.on('keyup', this.handleKeyUp, this);

    void this.renderWithConfig((config) => this.renderMatch(config, data));
  }

  public override update(_time: number, delta: number): void {
    if (!this.combatState || !this.stageDefinition || !this.matchConfig) {
      return;
    }

    this.accumulatedSeconds = Math.min(this.accumulatedSeconds + delta / 1000, 0.15);
    const timestep = consumeFixedTimestep(this.accumulatedSeconds);
    const steps = Math.min(timestep.steps, 8);
    this.accumulatedSeconds = timestep.remainderSeconds;

    for (let index = 0; index < steps; index += 1) {
      this.stepMatchFrame(index === 0);
    }

    this.syncSprites();
    this.updateCamera();
    this.updateHud();
  }

  private renderMatch(config: GameConfig, data?: MatchLaunchData): void {
    this.gameConfig = config;
    const matchConfig = this.resolveMatchConfig(config, data?.matchConfig);
    const sourceStage = config.stagesById[matchConfig.stageId] ?? config.stages[0];
    const player = config.charactersById[matchConfig.playerCharacterId] ?? config.characters[0];
    const cpu = config.charactersById[matchConfig.cpuCharacterId] ?? config.characters.find((character) => character.id !== player?.id) ?? config.characters[1];

    if (!sourceStage || !player || !cpu) {
      this.addBodyText(this.scale.width / 2, this.scale.height / 2, 'Match config is missing stage or fighter data.', 560, '#ffb4a8');
      return;
    }

    this.matchConfig = {
      ...matchConfig,
      playerCharacterId: player.id,
      cpuCharacterId: cpu.id,
      stageId: sourceStage.id,
    };
    const settings = this.resolveSettings(config, data);
    this.stageDefinition = createRuntimeStage(sourceStage, this.scale.width, this.scale.height);
    this.inputByCode = createInputCodeMap(config.input);
    this.cpuEnabled = settings.cpuDifficulty !== 'easy' || true;
    this.debugOverlay = settings.debugEnabled;
    this.cpuController = createCpuController({
      seed: this.matchConfig.seed,
      difficulty: settings.cpuDifficulty,
      enabled: this.cpuEnabled,
    });

    this.drawStage(this.stageDefinition);
    this.hud = new MatchHud(this);
    this.createPointerControls();
    this.installRuntimeHooks();
    this.resetMatchState(this.matchConfig.seed, true);
    this.publishMenuState(SceneKey.Match, {
      labels: ['Match', ATTACK_LABELS.light, ATTACK_LABELS.heavy, ATTACK_LABELS.special],
      selectedStageId: this.matchConfig.stageId,
      selectedPlayerId: this.matchConfig.playerCharacterId,
      selectedCpuId: this.matchConfig.cpuCharacterId,
      matchConfig: this.matchConfig,
    });
  }

  private resolveMatchConfig(config: GameConfig, launchConfig?: MatchConfig): MatchConfig {
    const source = launchConfig ?? config.match;
    const playerCharacterId = config.charactersById[source.playerCharacterId]
      ? source.playerCharacterId
      : config.settings.defaultPlayerId;
    const fallbackCpuId =
      config.characters.find((character) => character.id !== playerCharacterId)?.id ?? config.settings.defaultCpuId;

    return {
      stageId: config.stagesById[source.stageId] ? source.stageId : config.settings.defaultStageId,
      playerCharacterId,
      cpuCharacterId: config.charactersById[source.cpuCharacterId] && source.cpuCharacterId !== playerCharacterId ? source.cpuCharacterId : fallbackCpuId,
      roundsToWin: Phaser.Math.Clamp(Math.floor(source.roundsToWin), 1, 3),
      roundTimeSeconds: Phaser.Math.Clamp(Math.floor(source.roundTimeSeconds), 15, 99),
      seed: Number.isFinite(source.seed) ? source.seed : config.settings.seed,
    };
  }

  private resetMatchState(seed: number, resetMeter: boolean): void {
    if (!this.gameConfig || !this.stageDefinition || !this.matchConfig) {
      return;
    }

    const player = this.gameConfig.charactersById[this.matchConfig.playerCharacterId] ?? this.gameConfig.characters[0];
    const cpu = this.gameConfig.charactersById[this.matchConfig.cpuCharacterId] ?? this.gameConfig.characters[1] ?? this.gameConfig.characters[0];

    if (!player || !cpu) {
      return;
    }

    this.winner = undefined;
    this.roundWinner = 'draw';
    this.roundIndex = 1;
    this.score = createInitialRoundScore();
    this.cpuController?.reset(seed);
    this.hud?.clearMatchOverlay();

    if (resetMeter) {
      this.meterCarry = {
        player: this.gameConfig.tuning[player.tuningId]?.meterStart ?? 0,
        cpu: this.gameConfig.tuning[cpu.tuningId]?.meterStart ?? 0,
      };
    }

    this.startRound();
  }

  private startRound(): void {
    if (!this.gameConfig || !this.stageDefinition || !this.matchConfig) {
      return;
    }

    const player = this.gameConfig.charactersById[this.matchConfig.playerCharacterId] ?? this.gameConfig.characters[0];
    const cpu = this.gameConfig.charactersById[this.matchConfig.cpuCharacterId] ?? this.gameConfig.characters[1] ?? this.gameConfig.characters[0];

    if (!player || !cpu) {
      return;
    }

    const combat = createCombatState({
      seed: this.matchConfig.seed + this.roundIndex,
      stage: this.stageDefinition,
      fighters: {
        player: {
          character: player,
          tuning: this.gameConfig.tuning[player.tuningId],
          x: this.stageDefinition.playerSpawnX,
        },
        cpu: {
          character: cpu,
          tuning: this.gameConfig.tuning[cpu.tuningId],
          x: this.stageDefinition.cpuSpawnX,
        },
      },
    });

    this.combatState = {
      ...combat,
      player: clampMeter(combat.player, this.meterCarry.player),
      cpu: clampMeter(combat.cpu, this.meterCarry.cpu),
      events: [],
    };
    this.phase = 'roundIntro';
    this.timerFrames = toSimulationFrames(this.matchConfig.roundTimeSeconds);
    this.phaseFramesRemaining = INTRO_FRAMES;
    this.fightBannerFrames = 0;
    this.superPauseFrames = 0;
    this.pendingSuperSlot = null;
    this.clearInputs();
    this.hud?.clearMatchOverlay();
    this.hud?.showBanner('MORTAL CODEX', `Round ${this.roundIndex}`);
    this.syncSprites();
    this.updateCamera(true);
    this.updateHud();
  }

  private stepMatchFrame(allowPulse: boolean): void {
    this.tickScriptedInputs();

    if (this.phase === 'roundIntro') {
      this.phaseFramesRemaining -= 1;

      if (this.phaseFramesRemaining <= 0) {
        this.phase = 'fighting';
        this.fightBannerFrames = FIGHT_BANNER_FRAMES;
        this.hud?.showBanner('FIGHT', `${ATTACK_LABELS.light} / ${ATTACK_LABELS.heavy} / ${ATTACK_LABELS.special}`);
      }

      return;
    }

    if (this.phase === 'roundOver') {
      this.advancePostRoundAnimation();
      this.phaseFramesRemaining -= 1;

      if (this.phaseFramesRemaining <= 0) {
        if (this.winner) {
          this.phase = 'matchOver';
          this.showMatchOverOverlay();
        } else {
          this.roundIndex += 1;
          this.startRound();
        }
      }

      return;
    }

    if (this.phase === 'matchOver') {
      return;
    }

    if (this.fightBannerFrames > 0) {
      this.fightBannerFrames -= 1;

      if (this.fightBannerFrames === 0) {
        this.hud?.clearBanner();
      }
    }

    if (this.superPauseFrames > 0) {
      this.superPauseFrames -= 1;

      if (this.superPauseFrames === 0) {
        this.hud?.clearMatchOverlay();
      }

      return;
    }

    this.stepCombatFrame(allowPulse);
  }

  private stepCombatFrame(allowPulse: boolean): void {
    if (!this.combatState || !this.matchConfig) {
      return;
    }

    let state = this.combatState;
    const previousEventCount = state.events.length;
    const cpuInput = this.cpuController?.decide(state) ?? {};
    let playerInput = this.createPlayerInput(allowPulse);
    let resolvedCpuInput = this.cpuEnabled ? cpuInput : {};
    const pendingSuperInput = this.createPendingSuperInput();

    if (pendingSuperInput) {
      playerInput = pendingSuperInput.player ?? playerInput;
      resolvedCpuInput = pendingSuperInput.cpu ?? resolvedCpuInput;
    } else if (this.beginRequestedSuper(playerInput, resolvedCpuInput)) {
      if (allowPulse) {
        this.pulseInput.clear();
      }
      return;
    } else {
      playerInput = this.withDeniedSpecialRemoved(playerInput);
      resolvedCpuInput = this.withDeniedSpecialRemoved(resolvedCpuInput);
    }

    this.timerFrames = Math.max(0, this.timerFrames - 1);
    state = stepCombat(state, {
      player: playerInput,
      cpu: resolvedCpuInput,
    });

    const newEvents = state.events.slice(previousEventCount);

    for (const event of newEvents) {
      this.spawnHitSpark(event, state);
    }

    this.combatState = {
      ...state,
      events: state.events.slice(-96),
    };

    if (allowPulse) {
      this.pulseInput.clear();
    }

    this.resolveRoundIfNeeded();
  }

  private beginRequestedSuper(playerInput: FighterInput, cpuInput: FighterInput): boolean {
    if (!this.combatState) {
      return false;
    }

    const playerWantsSuper = Boolean(playerInput.special);
    const cpuWantsSuper = Boolean(cpuInput.special);

    if (playerWantsSuper && this.canStartSuper(this.combatState.player)) {
      this.beginSuperPause('player');
      return true;
    }

    if (cpuWantsSuper && this.canStartSuper(this.combatState.cpu)) {
      this.beginSuperPause('cpu');
      return true;
    }

    return false;
  }

  private beginSuperPause(slot: FighterSlot): void {
    if (!this.combatState) {
      return;
    }

    const fighter = slot === 'player' ? this.combatState.player : this.combatState.cpu;
    this.combatState = {
      ...this.combatState,
      [slot]: clampMeter(fighter, fighter.meter - fighter.tuning.meterMax),
    };
    this.pendingSuperSlot = slot;
    this.superPauseFrames = ROUND_POLICY.superCutInInputPauseFrames;
    this.hud?.showSuperCutIn(fighter.character.displayName);
    this.cameras.main.shake(ROUND_POLICY.superCutInInputPauseFrames * 16, 0.004);
  }

  private createPendingSuperInput(): { readonly player?: FighterInput; readonly cpu?: FighterInput } | null {
    if (!this.pendingSuperSlot || this.superPauseFrames > 0) {
      return null;
    }

    const slot = this.pendingSuperSlot;
    this.pendingSuperSlot = null;

    return slot === 'player'
      ? { player: { special: true } }
      : { cpu: { special: true } };
  }

  private canStartSuper(fighter: FighterState): boolean {
    return (
      !fighter.isFinished &&
      !fighter.activeAttack &&
      fighter.stunFrames <= 0 &&
      fighter.meter >= fighter.tuning.meterMax
    );
  }

  private withDeniedSpecialRemoved(input: FighterInput): FighterInput {
    if (!input.special) {
      return input;
    }

    return {
      ...input,
      special: false,
    };
  }

  private resolveRoundIfNeeded(): void {
    if (!this.combatState || !this.matchConfig || this.phase !== 'fighting') {
      return;
    }

    if (this.hasActiveSpecialCombo(this.combatState)) {
      return;
    }

    this.combatState = this.markZeroHealthDefeats(this.combatState);

    const resolution = resolveRound({
      playerHealth: this.combatState.player.health,
      cpuHealth: this.combatState.cpu.health,
      timerSeconds: this.timerFrames / 60,
    });

    if (!resolution.isRoundOver) {
      return;
    }

    const applied = applyRoundResult({
      score: this.score,
      resolution,
      roundsToWin: this.matchConfig.roundsToWin,
    });

    this.phase = 'roundOver';
    this.phaseFramesRemaining = ROUND_POLICY.roundTransitionInputLockoutFrames;
    this.score = applied.score;
    this.roundWinner = applied.roundWinner;
    this.winner = applied.matchWinner;
    this.meterCarry = {
      player: this.combatState.player.meter,
      cpu: this.combatState.cpu.meter,
    };
    this.clearInputs();
    this.hud?.showBanner(formatRoundWinner(this.roundWinner), this.roundResultSubtitle(resolution));
  }

  private hasActiveSpecialCombo(state: CombatState): boolean {
    return state.player.activeAttack?.kind === 'special' || state.cpu.activeAttack?.kind === 'special';
  }

  private markZeroHealthDefeats(state: CombatState): CombatState {
    return {
      ...state,
      player:
        state.player.health <= 0 && !state.player.isFinished
          ? beginDefeatFall(state.player, state.cpu.position.x)
          : state.player,
      cpu:
        state.cpu.health <= 0 && !state.cpu.isFinished
          ? beginDefeatFall(state.cpu, state.player.position.x)
          : state.cpu,
    };
  }

  private advancePostRoundAnimation(): void {
    if (!this.combatState) {
      return;
    }

    const state = stepCombat(this.combatState);
    this.combatState = {
      ...state,
      events: state.events.slice(-96),
    };
  }

  private roundResultSubtitle(resolution: RoundResolution): string {
    if (resolution.reason === 'doubleKo') {
      return 'Simultaneous KO: no round point';
    }

    if (resolution.reason === 'timeoutTie') {
      return 'Timeout tie: no round point';
    }

    if (resolution.reason === 'timeout') {
      return 'Timeout decided by remaining health';
    }

    return 'KO';
  }

  private showMatchOverOverlay(): void {
    if (!this.combatState || !this.matchConfig) {
      return;
    }

    const winnerId = resolveMatchWinnerId(this.winner, {
      player: this.matchConfig.playerCharacterId,
      cpu: this.matchConfig.cpuCharacterId,
    });
    const winnerName =
      winnerId === this.matchConfig.playerCharacterId
        ? this.combatState.player.character.displayName
        : this.combatState.cpu.character.displayName;

    this.hud?.showMatchOverlay({
      title: `${winnerName} Wins`,
      subtitle: `Final score ${this.score.player}-${this.score.cpu}`,
      winner: this.winner ?? 'cpu',
    });
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

  private tickScriptedInputs(): void {
    for (const action of Object.keys(this.scriptedInputFrames) as TestHookInputAction[]) {
      const frames = this.scriptedInputFrames[action] ?? 0;

      if (frames <= 1) {
        delete this.scriptedInputFrames[action];
        if (action !== 'light' && action !== 'heavy' && action !== 'special' && action !== 'pause') {
          this.heldInput[action] = false;
        }
        continue;
      }

      this.scriptedInputFrames[action] = frames - 1;
    }
  }

  private clearInputs(): void {
    for (const action of Object.keys(this.heldInput) as TestHookInputAction[]) {
      this.heldInput[action] = false;
    }

    this.pulseInput.clear();

    for (const action of Object.keys(this.scriptedInputFrames) as TestHookInputAction[]) {
      delete this.scriptedInputFrames[action];
    }
  }

  private drawStage(stage: RuntimeStage): void {
    this.stageObjects.forEach((object) => object.destroy());
    this.stageObjects = [];
    this.cameras.main.setBackgroundColor('#080b10');
    this.cameras.main.setBounds(0, 0, stage.width, this.scale.height);

    for (const [index, layer] of stage.layers.entries()) {
      const image = this.add
        .image(stage.width / 2, this.scale.height / 2, layer.assetKey)
        .setDisplaySize(stage.width, this.scale.height)
        .setDepth(index)
        .setAlpha(index === stage.layers.length - 1 ? 1 : 0.92);
      this.stageObjects.push(image);
    }

    this.stageObjects.push(
      this.add.rectangle(stage.width / 2, 44, stage.width, 88, 0x030507, 0.42).setDepth(10),
      this.add.rectangle(stage.width / 2, this.scale.height - 36, stage.width, 72, 0x030507, 0.54).setDepth(10),
      this.add.line(0, 0, 0, stage.floorY, stage.width, stage.floorY, 0xf4d063, 0.82).setOrigin(0, 0).setDepth(11),
      this.add.rectangle(0, stage.floorY - 70, 8, 140, 0x5bd7cb, 0.28).setDepth(12),
      this.add.rectangle(stage.width, stage.floorY - 70, 8, 140, 0x5bd7cb, 0.28).setDepth(12),
    );
  }

  private createSprites(): void {
    if (!this.combatState) {
      return;
    }

    this.playerSprite?.destroy();
    this.cpuSprite?.destroy();
    this.playerSprite = null;
    this.cpuSprite = null;
    const playerAsset = this.getAnimationAsset(this.combatState.player.character, fighterAnimationName(this.combatState.player));
    const cpuAsset = this.getAnimationAsset(this.combatState.cpu.character, fighterAnimationName(this.combatState.cpu));

    if (playerAsset) {
      this.playerSprite = this.add.sprite(0, 0, playerAsset.key, 0).setOrigin(0.5, 1).setDepth(30);
    }

    if (cpuAsset) {
      this.cpuSprite = this.add.sprite(0, 0, cpuAsset.key, 0).setOrigin(0.5, 1).setDepth(31);
    }
  }

  private syncSprites(): void {
    if (!this.combatState) {
      return;
    }

    if (!isLiveSprite(this.playerSprite) || !isLiveSprite(this.cpuSprite)) {
      this.createSprites();
    }

    this.syncSprite(this.playerSprite, this.combatState.player);
    this.syncSprite(this.cpuSprite, this.combatState.cpu);
  }

  private syncSprite(sprite: Phaser.GameObjects.Sprite | null, fighter: FighterState): void {
    if (!sprite) {
      return;
    }

    const animationName = fighterAnimationName(fighter);
    const animationAsset = this.getAnimationAsset(fighter.character, animationName);

    if (animationAsset && this.textures.exists(animationAsset.key)) {
      sprite.setTexture(animationAsset.key);
      sprite.setFrame(Phaser.Math.Clamp(fighter.animationFrame, 0, Math.max(0, animationAsset.frameCount - 1)));
    }

    sprite
      .setPosition(fighter.position.x, fighter.position.y)
      .setFlipX(fighter.facing === 'left')
      .setAlpha(fighter.isFinished ? 0.82 : 1);
  }

  private updateCamera(immediate = false): void {
    if (!this.combatState || !this.stageDefinition) {
      return;
    }

    const width = this.scale.width;
    const centerX = (this.combatState.player.position.x + this.combatState.cpu.position.x) / 2;
    const targetScrollX = Phaser.Math.Clamp(centerX - width / 2, 0, Math.max(0, this.stageDefinition.width - width));
    const nextScrollX = immediate ? targetScrollX : Phaser.Math.Linear(this.cameras.main.scrollX, targetScrollX, 0.12);
    this.cameras.main.scrollX = nextScrollX;
    this.cameras.main.scrollY = 0;
  }

  private updateHud(): void {
    if (!this.combatState || !this.matchConfig) {
      return;
    }

    this.hud?.update({
      player: this.combatState.player,
      cpu: this.combatState.cpu,
      playerName: this.combatState.player.character.displayName,
      cpuName: this.combatState.cpu.character.displayName,
      playerPortraitKey: this.combatState.player.character.portraitKey,
      cpuPortraitKey: this.combatState.cpu.character.portraitKey,
      score: this.score,
      roundsToWin: this.matchConfig.roundsToWin,
      roundIndex: this.roundIndex,
      timerSeconds: this.timerFrames / 60,
      phaseLabel: this.phase,
      debugEnabled: this.debugOverlay,
    });
  }

  private spawnHitSpark(event: CombatEvent, state: CombatState): void {
    if (event.type === 'finisher') {
      return;
    }

    const source = event.sourceId === 'player' ? state.player : state.cpu;
    const target = event.targetId === 'player' ? state.player : state.cpu;
    const x = (source.position.x + target.position.x) / 2;
    const y = Math.min(source.position.y, target.position.y) - 172;
    const spark = this.add.sprite(x, y, 'vfx-hit-spark', 0).setDepth(75).setScale(event.type === 'blocked' ? 1.25 : 1.65);
    spark.play('hit-spark-burst');
    spark.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => spark.destroy());
    this.cameras.main.shake(event.type === 'blocked' ? 60 : 110, event.type === 'blocked' ? 0.002 : 0.004);
  }

  private createPointerControls(): void {
    this.pointerObjects.forEach((object) => object.destroy());
    this.pointerObjects = [];
    const y = this.scale.height - 34;
    this.createHoldButton(40, y, 58, 38, 'Left', 'left');
    this.createHoldButton(106, y, 58, 38, 'Right', 'right');
    this.createHoldButton(172, y, 58, 38, 'Jump', 'jump');
    this.createHoldButton(238, y, 58, 38, 'Duck', 'crouch');
    this.createHoldButton(304, y, 58, 38, 'Guard', 'block');
    this.createActionButton(430, y, 110, 38, ATTACK_LABELS.light, 'light');
    this.createActionButton(558, y, 110, 38, ATTACK_LABELS.heavy, 'heavy');
    this.createActionButton(700, y, 132, 38, ATTACK_LABELS.special, 'special');
  }

  private createHoldButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    action: Exclude<TestHookInputAction, 'light' | 'heavy' | 'special' | 'pause'>,
  ): void {
    const background = this.add.rectangle(x, y, width, height, 0x0e1d20, 0.9).setStrokeStyle(1, 0x5bd7cb, 0.58).setDepth(110).setScrollFactor(0);
    const text = this.add
      .text(x, y, label, {
        align: 'center',
        color: '#f5fbf9',
        fixedWidth: width - 6,
        fontFamily: 'monospace',
        fontSize: '10px',
        fontStyle: '700',
      })
      .setOrigin(0.5)
      .setDepth(111)
      .setScrollFactor(0);
    const zone = this.add.zone(x, y, width, height).setOrigin(0.5).setInteractive().setDepth(112).setScrollFactor(0);
    const press = (): void => {
      this.heldInput[action] = true;
      this.applyImmediateHeldPose(action);
      background.setFillStyle(0x21494d, 0.98);
    };
    const release = (): void => {
      this.heldInput[action] = false;
      background.setFillStyle(0x0e1d20, 0.9);
    };

    zone.on('pointerdown', press);
    zone.on('pointerup', release);
    zone.on('pointerout', release);
    zone.on('pointerupoutside', release);
    this.pointerObjects.push(background, text, zone);
  }

  private createActionButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    action: AttackKind,
  ): void {
    const background = this.add.rectangle(x, y, width, height, 0x2a2214, 0.9).setStrokeStyle(1, 0xffd36a, 0.64).setDepth(110).setScrollFactor(0);
    const text = this.add
      .text(x, y, label, {
        align: 'center',
        color: '#fff8dd',
        fixedWidth: width - 8,
        fontFamily: 'monospace',
        fontSize: '10px',
        fontStyle: '700',
      })
      .setOrigin(0.5)
      .setDepth(111)
      .setScrollFactor(0);
    const zone = this.add.zone(x, y, width, height).setOrigin(0.5).setInteractive().setDepth(112).setScrollFactor(0);

    zone.on('pointerdown', () => {
      this.pulseInput.add(action);
      background.setFillStyle(0x5b4821, 0.98);
    });
    zone.on('pointerup', () => background.setFillStyle(0x2a2214, 0.9));
    zone.on('pointerout', () => background.setFillStyle(0x2a2214, 0.9));
    this.pointerObjects.push(background, text, zone);
  }

  private installRuntimeHooks(): void {
    if (!this.gameConfig) {
      return;
    }

    const hooks: SamaAmodiTestHooks = {
      version: 1,
      getConfigSnapshot: () => {
        if (!this.gameConfig) {
          throw new Error('Match config is not loaded.');
        }
        return this.gameConfig;
      },
      getMatchState: () => this.createHookMatchState(),
      startMatch: (options?: TestHookStartMatchOptions) => this.startMatchFromHook(options),
      press: (action: TestHookInputAction, frames?: number) => this.pressHookInput(action, frames),
      release: (action: TestHookInputAction) => this.releaseHookInput(action),
      setCpuEnabled: (enabled: boolean) => {
        this.cpuEnabled = enabled;
        this.cpuController?.setEnabled(enabled);
      },
      setDebugOverlay: (enabled: boolean) => {
        this.debugOverlay = enabled;
      },
      forceRoundTimeout: () => {
        this.timerFrames = 0;
        this.resolveRoundIfNeeded();
      },
      forceMeter: (characterId: string, meter: number) => {
        this.forceMeter(characterId, meter);
      },
      forceHealth: (characterId: string, health: number) => {
        this.forceHealth(characterId, health);
      },
      resetMatch: (seed?: number) => {
        if (this.matchConfig) {
          this.matchConfig = {
            ...this.matchConfig,
            seed: seed ?? this.matchConfig.seed,
          };
          this.resetMatchState(this.matchConfig.seed, true);
        }
      },
    };

    installTestHooks(globalThis as TestHookHost, hooks);
  }

  private createHookMatchState(): TestHookMatchState | null {
    if (!this.combatState || !this.matchConfig) {
      return null;
    }

    return {
      phase: this.phase,
      stageId: this.matchConfig.stageId,
      roundIndex: this.roundIndex,
      timerSeconds: Math.max(0, Math.ceil(this.timerFrames / 60)),
      player: this.createHookFighterState(this.combatState.player),
      cpu: this.createHookFighterState(this.combatState.cpu),
      winnerId: resolveMatchWinnerId(this.winner, {
        player: this.matchConfig.playerCharacterId,
        cpu: this.matchConfig.cpuCharacterId,
      }),
    };
  }

  private createHookFighterState(fighter: FighterState): TestHookFighterState {
    return {
      id: fighter.character.id,
      health: Math.round(fighter.health * 100) / 100,
      meter: Math.round(fighter.meter * 100) / 100,
      x: Math.round(fighter.position.x * 100) / 100,
      y: Math.round(fighter.position.y * 100) / 100,
      facing: fighter.facing === 'right' ? 1 : -1,
      animation: fighterAnimationName(fighter),
      frame: fighter.animationFrame,
    };
  }

  private startMatchFromHook(options?: TestHookStartMatchOptions): void {
    if (!this.gameConfig) {
      return;
    }

    const current = this.matchConfig ?? this.gameConfig.match;
    const nextMatch = this.resolveMatchConfig(this.gameConfig, {
      ...current,
      ...options?.match,
      playerCharacterId: options?.playerCharacterId ?? options?.match?.playerCharacterId ?? current.playerCharacterId,
      cpuCharacterId: options?.cpuCharacterId ?? options?.match?.cpuCharacterId ?? current.cpuCharacterId,
      stageId: options?.stageId ?? options?.match?.stageId ?? current.stageId,
      seed: options?.seed ?? options?.match?.seed ?? current.seed,
    });
    const sourceStage = this.gameConfig.stagesById[nextMatch.stageId] ?? this.gameConfig.stages[0];

    if (!sourceStage) {
      return;
    }

    this.matchConfig = nextMatch;
    this.stageDefinition = createRuntimeStage(sourceStage, this.scale.width, this.scale.height);
    this.drawStage(this.stageDefinition);
    this.cpuController = createCpuController({
      seed: nextMatch.seed,
      difficulty: this.gameConfig.settings.cpuDifficulty,
      enabled: this.cpuEnabled,
    });
    this.resetMatchState(nextMatch.seed, true);
  }

  private pressHookInput(action: TestHookInputAction, frames?: number): void {
    if (action === 'pause') {
      return;
    }

    if (action === 'light' || action === 'heavy' || action === 'special') {
      this.pulseInput.add(action);
    } else {
      this.heldInput[action] = true;
      this.applyImmediateHeldPose(action);
    }

    if (frames && frames > 0) {
      this.scriptedInputFrames[action] = Math.floor(frames);
    }
  }

  private releaseHookInput(action: TestHookInputAction): void {
    if (action === 'light' || action === 'heavy' || action === 'special') {
      this.pulseInput.delete(action);
      return;
    }

    this.heldInput[action] = false;
    delete this.scriptedInputFrames[action];
  }

  private applyImmediateHeldPose(action: Exclude<TestHookInputAction, 'light' | 'heavy' | 'special' | 'pause'>): void {
    if (action !== 'block' || !this.combatState || this.phase !== 'fighting') {
      return;
    }

    const fighter = this.combatState.player;

    if (fighter.isFinished || fighter.activeAttack || fighter.stunFrames > 0 || !fighter.isGrounded) {
      return;
    }

    this.combatState = {
      ...this.combatState,
      player: {
        ...fighter,
        status: 'block',
        animationFrame: finalAnimationFrameFor(fighter, 'block'),
        animationTick: 0,
        velocity: {
          ...fighter.velocity,
          x: 0,
        },
      },
    };
    this.syncSprites();
  }

  private forceMeter(characterId: string, meter: number): void {
    if (!this.combatState) {
      return;
    }

    if (this.combatState.player.character.id === characterId) {
      this.combatState = {
        ...this.combatState,
        player: clampMeter(this.combatState.player, meter),
      };
    }

    if (this.combatState.cpu.character.id === characterId) {
      this.combatState = {
        ...this.combatState,
        cpu: clampMeter(this.combatState.cpu, meter),
      };
    }
  }

  private forceHealth(characterId: string, health: number): void {
    if (!this.combatState) {
      return;
    }

    if (this.combatState.player.character.id === characterId) {
      this.combatState = {
        ...this.combatState,
        player: {
          ...this.combatState.player,
          health: Phaser.Math.Clamp(health, 0, this.combatState.player.tuning.maxHealth),
        },
      };
    }

    if (this.combatState.cpu.character.id === characterId) {
      this.combatState = {
        ...this.combatState,
        cpu: {
          ...this.combatState.cpu,
          health: Phaser.Math.Clamp(health, 0, this.combatState.cpu.tuning.maxHealth),
        },
      };
    }
  }

  private getAnimationAsset(character: CharacterDefinition, animationName: string): AssetManifestAnimation | null {
    const manifestCharacter = this.gameConfig?.manifest.characters.find((entry) => entry.id === character.assetId);
    return manifestCharacter?.animations.find((animation) => animation.name === animationName) ?? null;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (isDomEditingKeyboardTarget(event.target)) {
      return;
    }

    if (this.phase === 'matchOver') {
      if (event.code === 'Enter' || event.code === 'KeyR') {
        event.preventDefault();
        this.resetMatchState(this.matchConfig?.seed ?? 1, true);
        return;
      }

      if (event.code === 'Escape') {
        event.preventDefault();
        this.scene.start(SceneKey.MainMenu);
        return;
      }
    }

    if (event.code === 'Escape') {
      event.preventDefault();
      this.scene.start(SceneKey.MainMenu);
      return;
    }

    const action = this.inputByCode[event.code];

    if (!action || action === 'pause') {
      return;
    }

    event.preventDefault();

    if (action === 'light' || action === 'heavy' || action === 'special') {
      this.pulseInput.add(action);
      return;
    }

    this.heldInput[action] = true;
    this.applyImmediateHeldPose(action);
  }

  private handleKeyUp(event: KeyboardEvent): void {
    const action = this.inputByCode[event.code];

    if (!action || action === 'pause') {
      return;
    }

    event.preventDefault();

    if (action === 'light' || action === 'heavy' || action === 'special') {
      return;
    }

    this.heldInput[action] = false;
  }

  private dispose(): void {
    this.input.keyboard?.off('keydown', this.handleKeyDown, this);
    this.input.keyboard?.off('keyup', this.handleKeyUp, this);
    removeTestHooks(globalThis as TestHookHost);
    this.hud?.destroy();
    this.hud = null;
    this.playerSprite?.destroy();
    this.cpuSprite?.destroy();
    this.playerSprite = null;
    this.cpuSprite = null;
    this.combatState = null;
    this.pointerObjects = [];
    this.stageObjects = [];
  }
}

function isLiveSprite(sprite: Phaser.GameObjects.Sprite | null): sprite is Phaser.GameObjects.Sprite {
  return Boolean(sprite?.scene && sprite.active && sprite.scene.children.list.includes(sprite));
}

function createRuntimeStage(source: StageDefinition, canvasWidth: number, canvasHeight: number): RuntimeStage {
  const width = Math.max(canvasWidth + 320, source.width * 2);
  const xScale = width / source.width;

  return {
    ...source,
    sourceStageId: source.id,
    width,
    height: canvasHeight,
    floorY: canvasHeight - 105,
    playerSpawnX: Phaser.Math.Clamp(source.playerSpawnX * xScale, FIGHTER_FRAME_WIDTH / 2, width - FIGHTER_FRAME_WIDTH / 2),
    cpuSpawnX: Phaser.Math.Clamp(source.cpuSpawnX * xScale, FIGHTER_FRAME_WIDTH / 2, width - FIGHTER_FRAME_WIDTH / 2),
  };
}

function createInputCodeMap(input: InputBindingConfig): Partial<Record<string, TestHookInputAction>> {
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
    [input.pause]: 'pause',
  };
}

function isDomEditingKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'select' || tagName === 'textarea' || target.isContentEditable;
}
