import {
  advanceFighterForFrame,
  anyRectOverlaps,
  beginDefeatFall,
  canCancelWithInput,
  chooseAttackKind,
  clampHealth,
  clampMeter,
  createFighterState,
  faceToward,
  finalizeFighterFrame,
  finalAnimationFrameFor,
  getWorldAttackBox,
  getWorldGuardBoxes,
  getWorldHurtBoxes,
} from './fighter';
import type { ActiveAttackState, FighterInput, FighterSlot, FighterState } from './fighter';
import type { AttackInput } from './types';
import type { StageDefinition } from './types';

export const SIMULATION_FPS = 60;
export const FIXED_TIMESTEP_SECONDS = 1 / SIMULATION_FPS;
export const ATTACK_INPUT_BUFFER_FRAMES = 12;

export type CombatEventType = 'hit' | 'blocked' | 'finisher';

export interface CombatEvent {
  readonly frame: number;
  readonly type: CombatEventType;
  readonly sourceId: FighterSlot;
  readonly targetId: FighterSlot;
  readonly attackId: string;
  readonly windowIndex: number;
  readonly damage: number;
}

export interface CombatState {
  readonly frame: number;
  readonly seed: number;
  readonly stage: Pick<StageDefinition, 'width' | 'floorY'>;
  readonly player: FighterState;
  readonly cpu: FighterState;
  readonly events: readonly CombatEvent[];
  readonly inputBuffers: CombatInputBuffers;
  readonly previousAttackInputs: CombatPreviousInputs;
}

export interface CombatInputFrame {
  readonly player?: FighterInput;
  readonly cpu?: FighterInput;
}

interface BufferedAttackCommand {
  readonly input: AttackInput;
  readonly crouch: boolean;
  readonly specialMeterPaid: boolean;
  readonly framesRemaining: number;
}

interface AttackButtonSnapshot {
  readonly light: boolean;
  readonly heavy: boolean;
  readonly special: boolean;
}

interface CombatInputBuffers {
  readonly player: readonly BufferedAttackCommand[];
  readonly cpu: readonly BufferedAttackCommand[];
}

interface CombatPreviousInputs {
  readonly player: AttackButtonSnapshot;
  readonly cpu: AttackButtonSnapshot;
}

export interface CreateCombatStateOptions {
  readonly seed?: number;
  readonly stage: StageDefinition;
  readonly fighters: {
    readonly player: Omit<Parameters<typeof createFighterState>[0], 'slot' | 'floorY' | 'facing'>;
    readonly cpu: Omit<Parameters<typeof createFighterState>[0], 'slot' | 'floorY' | 'facing'>;
  };
}

export interface SeededRng {
  readonly seed: number;
  next(): number;
  nextInt(maxExclusive: number): number;
  snapshot(): number;
}

export function createCombatState(options: CreateCombatStateOptions): CombatState {
  return {
    frame: 0,
    seed: normalizeSeed(options.seed ?? 1),
    stage: {
      width: options.stage.width,
      floorY: options.stage.floorY,
    },
    player: createFighterState({
      ...options.fighters.player,
      slot: 'player',
      floorY: options.stage.floorY,
      facing: 'right',
    }),
    cpu: createFighterState({
      ...options.fighters.cpu,
      slot: 'cpu',
      floorY: options.stage.floorY,
      facing: 'left',
    }),
    events: [],
    inputBuffers: emptyInputBuffers(),
    previousAttackInputs: emptyPreviousAttackInputs(),
  };
}

export function stepCombatFrames(state: CombatState, frames: number, inputs: CombatInputFrame = {}): CombatState {
  let next = state;

  for (let frame = 0; frame < frames; frame += 1) {
    next = stepCombat(next, inputs);
  }

  return next;
}

export function stepCombat(state: CombatState, inputs: CombatInputFrame = {}): CombatState {
  const rawPlayerInput = inputs.player ?? {};
  const rawCpuInput = inputs.cpu ?? {};
  const inputBuffers = state.inputBuffers ?? emptyInputBuffers();
  const previousAttackInputs = state.previousAttackInputs ?? emptyPreviousAttackInputs();
  const facedPlayer = faceToward(state.player, state.cpu.position.x);
  const facedCpu = faceToward(state.cpu, state.player.position.x);
  const playerBuffer = enqueueAttackInputs(inputBuffers.player, rawPlayerInput, previousAttackInputs.player);
  const cpuBuffer = enqueueAttackInputs(inputBuffers.cpu, rawCpuInput, previousAttackInputs.cpu);
  const playerSelection = selectBufferedCommand(facedPlayer, playerBuffer);
  const cpuSelection = selectBufferedCommand(facedCpu, cpuBuffer);
  const advancedPlayer = advanceFighterForFrame(
    facedPlayer,
    composeBufferedInput(rawPlayerInput, playerSelection.command),
    state.stage,
    FIXED_TIMESTEP_SECONDS,
  );
  const advancedCpu = advanceFighterForFrame(
    facedCpu,
    composeBufferedInput(rawCpuInput, cpuSelection.command),
    state.stage,
    FIXED_TIMESTEP_SECONDS,
  );
  const resolved = resolveCombatFrame(advancedPlayer, advancedCpu, state.frame);

  return {
    ...state,
    frame: state.frame + 1,
    player: finalizeFighterFrame(resolved.player),
    cpu: finalizeFighterFrame(resolved.cpu),
    events: [...state.events, ...resolved.events],
    inputBuffers: {
      player: ageBufferedCommands(playerBuffer, playerSelection.consumedIndex),
      cpu: ageBufferedCommands(cpuBuffer, cpuSelection.consumedIndex),
    },
    previousAttackInputs: {
      player: attackButtonSnapshot(rawPlayerInput),
      cpu: attackButtonSnapshot(rawCpuInput),
    },
  };
}

export function toSimulationFrames(seconds: number): number {
  return Math.max(0, Math.round(seconds * SIMULATION_FPS));
}

export function consumeFixedTimestep(accumulatedSeconds: number): { readonly steps: number; readonly remainderSeconds: number } {
  const safeSeconds = Number.isFinite(accumulatedSeconds) ? Math.max(0, accumulatedSeconds) : 0;
  const steps = Math.floor(safeSeconds / FIXED_TIMESTEP_SECONDS);

  return {
    steps,
    remainderSeconds: safeSeconds - steps * FIXED_TIMESTEP_SECONDS,
  };
}

export function createSeededRng(seed: number): SeededRng {
  let state = normalizeSeed(seed);

  return {
    seed: state,
    next(): number {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 0x100000000;
    },
    nextInt(maxExclusive: number): number {
      const max = Math.max(1, Math.floor(maxExclusive));
      return Math.floor(this.next() * max);
    },
    snapshot(): number {
      return state;
    },
  };
}

function resolveCombatFrame(player: FighterState, cpu: FighterState, frame: number): {
  readonly player: FighterState;
  readonly cpu: FighterState;
  readonly events: readonly CombatEvent[];
} {
  const firstPass = resolveAttackAgainstTarget(player, cpu, frame);
  const secondPass = resolveAttackAgainstTarget(firstPass.target, firstPass.attacker, frame);

  return {
    player: secondPass.target,
    cpu: secondPass.attacker,
    events: [...firstPass.events, ...secondPass.events],
  };
}

function resolveAttackAgainstTarget(attacker: FighterState, target: FighterState, frame: number): {
  readonly attacker: FighterState;
  readonly target: FighterState;
  readonly events: readonly CombatEvent[];
} {
  if (!attacker.activeAttack || attacker.isFinished || target.isFinished) {
    return { attacker, target, events: [] };
  }

  const activeAttack = attacker.activeAttack;
  const activeWindows = activeAttack.profile.windows
    .map((window, index) => ({ window, index }))
    .filter(({ window, index }) => {
      return (
        activeAttack.actionFrame >= window.startFrame &&
        activeAttack.actionFrame <= window.endFrame &&
        !activeAttack.connectedWindowIndexes.includes(index)
      );
    });

  if (activeWindows.length === 0) {
    return { attacker, target, events: [] };
  }

  let nextAttacker = attacker;
  let nextTarget = target;
  const events: CombatEvent[] = [];

  for (const { window, index } of activeWindows) {
    const attackBox = getWorldAttackBox(nextAttacker, window.hitbox);
    const canBlock = nextTarget.status === 'block' || nextTarget.status === 'blockstun';
    const blocked = canBlock && anyRectOverlaps(attackBox, getWorldGuardBoxes(nextTarget));
    const hit = blocked || anyRectOverlaps(attackBox, getWorldHurtBoxes(nextTarget));

    if (!hit) {
      continue;
    }

    const damage = damageForAttackWindow(activeAttack, index, blocked);
    nextAttacker = markWindowConnected(clampMeter(nextAttacker, nextAttacker.meter + activeAttack.profile.meterGain), index);

    if (blocked) {
      nextTarget = applyBlock(nextTarget, nextAttacker, damage, activeAttack);
      events.push(createCombatEvent(frame, 'blocked', nextAttacker, nextTarget, activeAttack, index, damage));
      continue;
    }

    nextTarget = applyHit(nextTarget, nextAttacker, damage, activeAttack, index);
    events.push(createCombatEvent(frame, 'hit', nextAttacker, nextTarget, activeAttack, index, damage));

    if (nextTarget.isFinished) {
      events.push(createCombatEvent(frame, 'finisher', nextAttacker, nextTarget, activeAttack, index, damage));
      break;
    }
  }

  return {
    attacker: nextAttacker,
    target: nextTarget,
    events,
  };
}

function applyHit(target: FighterState, attacker: FighterState, damage: number, attack: ActiveAttackState, windowIndex: number): FighterState {
  const nextHealth = Math.max(0, target.health - damage);
  const direction = attacker.position.x <= target.position.x ? 1 : -1;
  const defeated = nextHealth <= 0;
  const knockback = getHitKnockback(attack, windowIndex);

  if (defeated) {
    if (isUninterruptibleSpecial(target)) {
      return clampHealth(target, nextHealth);
    }

    if (attack.kind === 'special' && !isFinalAttackWindow(attack, windowIndex)) {
      return {
        ...clampHealth(target, nextHealth),
        status: 'hitstun',
        animationFrame: 0,
        animationTick: 0,
        stunFrames: attack.profile.hitstunFrames,
        activeAttack: undefined,
        velocity: {
          x: direction * knockback.x,
          y: knockback.y,
        },
      };
    }

    return beginDefeatFall(target, attacker.position.x, {
      x: direction * Math.max(Math.abs(attack.profile.knockbackX) * 1.45, 120),
      y: Math.min(attack.profile.knockbackY * 2, -180),
    });
  }

  if (isUninterruptibleSpecial(target)) {
    return clampHealth(target, nextHealth);
  }

  if (attack.profile.hitResult === 'knockdown') {
    return {
      ...clampHealth(target, nextHealth),
      status: 'knockdown',
      animationFrame: 0,
      animationTick: 0,
      stunFrames: attack.profile.hitstunFrames,
      activeAttack: undefined,
      velocity: {
        x: direction * knockback.x,
        y: knockback.y,
      },
    };
  }

  return {
    ...clampHealth(target, nextHealth),
    status: 'hitstun',
    animationFrame: 0,
    animationTick: 0,
    stunFrames: attack.profile.hitstunFrames,
    activeAttack: undefined,
    velocity: {
      x: direction * knockback.x,
      y: knockback.y,
    },
  };
}

function damageForAttackWindow(attack: ActiveAttackState, windowIndex: number, blocked: boolean): number {
  const damage = blocked ? attack.profile.blockDamage : attack.profile.damage;

  if (attack.kind !== 'special') {
    return damage;
  }

  const windowCount = Math.max(attack.profile.windows.length, 1);
  const finalWindowIndex = windowCount - 1;

  if (windowIndex >= finalWindowIndex) {
    return finalSpecialWindowDamage(damage, windowCount);
  }

  return splitDamageAcrossWindows(damage - finalSpecialWindowDamage(damage, windowCount), windowIndex, finalWindowIndex);
}

function finalSpecialWindowDamage(damage: number, windowCount: number): number {
  if (windowCount <= 1) {
    return damage;
  }

  const evenShare = Math.ceil(damage / windowCount);
  return Math.min(damage, evenShare + Math.max(1, Math.floor(evenShare / 2)));
}

function splitDamageAcrossWindows(damage: number, windowIndex: number, windowCount: number): number {
  const safeWindowCount = Math.max(windowCount, 1);
  const baseDamage = Math.floor(damage / safeWindowCount);
  const remainder = damage % safeWindowCount;
  const remainderStart = safeWindowCount - remainder;

  return baseDamage + (remainder > 0 && windowIndex >= remainderStart ? 1 : 0);
}

function isUninterruptibleSpecial(fighter: FighterState): boolean {
  return fighter.activeAttack?.kind === 'special';
}

function getHitKnockback(attack: ActiveAttackState, windowIndex: number): { readonly x: number; readonly y: number } {
  if (attack.kind !== 'special' || isFinalAttackWindow(attack, windowIndex)) {
    return {
      x: Math.abs(attack.profile.knockbackX),
      y: attack.profile.knockbackY,
    };
  }

  return {
    x: Math.max(12, Math.abs(attack.profile.knockbackX) * 0.14),
    y: Math.min(0, attack.profile.knockbackY * 0.15),
  };
}

function isFinalAttackWindow(attack: ActiveAttackState, windowIndex: number): boolean {
  return windowIndex >= attack.profile.windows.length - 1;
}

function applyBlock(target: FighterState, attacker: FighterState, damage: number, attack: ActiveAttackState): FighterState {
  const direction = attacker.position.x <= target.position.x ? 1 : -1;

  return {
    ...clampHealth(target, target.health - damage),
    status: 'blockstun',
    animationFrame: finalAnimationFrameFor(target, 'block'),
    animationTick: 0,
    stunFrames: attack.profile.blockstunFrames,
    velocity: {
      x: direction * Math.abs(attack.profile.knockbackX) * 0.35,
      y: 0,
    },
  };
}

function markWindowConnected(attacker: FighterState, windowIndex: number): FighterState {
  if (!attacker.activeAttack) {
    return attacker;
  }

  return {
    ...attacker,
    activeAttack: {
      ...attacker.activeAttack,
      connectedWindowIndexes: [...attacker.activeAttack.connectedWindowIndexes, windowIndex],
      hasConnected: true,
    },
  };
}

function emptyInputBuffers(): CombatInputBuffers {
  return {
    player: [],
    cpu: [],
  };
}

function emptyPreviousAttackInputs(): CombatPreviousInputs {
  const emptySnapshot = attackButtonSnapshot({});

  return {
    player: emptySnapshot,
    cpu: emptySnapshot,
  };
}

function enqueueAttackInputs(
  buffer: readonly BufferedAttackCommand[],
  input: FighterInput,
  previous: AttackButtonSnapshot,
): readonly BufferedAttackCommand[] {
  const next = [...buffer];

  if (input.special && !previous.special) {
    next.push(createBufferedCommand('special', input));
  }

  if (input.heavy && !previous.heavy) {
    next.push(createBufferedCommand('heavy', input));
  }

  if (input.light && !previous.light) {
    next.push(createBufferedCommand('light', input));
  }

  return next.slice(-8);
}

function createBufferedCommand(inputName: AttackInput, input: FighterInput): BufferedAttackCommand {
  return {
    input: inputName,
    crouch: Boolean(input.crouch),
    specialMeterPaid: Boolean(input.specialMeterPaid),
    framesRemaining: ATTACK_INPUT_BUFFER_FRAMES,
  };
}

function selectBufferedCommand(
  fighter: FighterState,
  buffer: readonly BufferedAttackCommand[],
): { readonly command?: BufferedAttackCommand; readonly consumedIndex: number | null } {
  for (let index = 0; index < buffer.length; index += 1) {
    const command = buffer[index];

    if (command && canUseBufferedCommand(fighter, command)) {
      return { command, consumedIndex: index };
    }
  }

  return { consumedIndex: null };
}

function canUseBufferedCommand(fighter: FighterState, command: BufferedAttackCommand): boolean {
  if (fighter.isFinished || fighter.stunFrames > 0) {
    return false;
  }

  const input = fighterInputFromCommand(command);

  if (fighter.activeAttack) {
    return canCancelWithInput(fighter, input);
  }

  return chooseAttackKind(input, fighter.character) !== undefined;
}

function composeBufferedInput(input: FighterInput, command?: BufferedAttackCommand): FighterInput {
  const baseInput = {
    ...input,
    light: false,
    heavy: false,
    special: false,
    specialMeterPaid: false,
  };

  if (!command) {
    return baseInput;
  }

  return {
    ...baseInput,
    crouch: baseInput.crouch || command.crouch,
    light: command.input === 'light',
    heavy: command.input === 'heavy',
    special: command.input === 'special',
    specialMeterPaid: command.specialMeterPaid,
  };
}

function fighterInputFromCommand(command: BufferedAttackCommand): FighterInput {
  return {
    crouch: command.crouch,
    light: command.input === 'light',
    heavy: command.input === 'heavy',
    special: command.input === 'special',
    specialMeterPaid: command.specialMeterPaid,
  };
}

function ageBufferedCommands(
  buffer: readonly BufferedAttackCommand[],
  consumedIndex: number | null,
): readonly BufferedAttackCommand[] {
  return buffer
    .filter((_, index) => index !== consumedIndex)
    .map((command) => ({
      ...command,
      framesRemaining: command.framesRemaining - 1,
    }))
    .filter((command) => command.framesRemaining > 0);
}

function attackButtonSnapshot(input: FighterInput): AttackButtonSnapshot {
  return {
    light: Boolean(input.light),
    heavy: Boolean(input.heavy),
    special: Boolean(input.special),
  };
}

function createCombatEvent(
  frame: number,
  type: CombatEventType,
  attacker: FighterState,
  target: FighterState,
  attack: ActiveAttackState,
  windowIndex: number,
  damage: number,
): CombatEvent {
  return {
    frame,
    type,
    sourceId: attacker.slot,
    targetId: target.slot,
    attackId: attack.profile.id,
    windowIndex,
    damage,
  };
}

function normalizeSeed(seed: number): number {
  const normalized = Number.isFinite(seed) ? seed >>> 0 : 1;
  return normalized === 0 ? 1 : normalized;
}
