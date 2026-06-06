import {
  advanceFighterForFrame,
  anyRectOverlaps,
  clampHealth,
  clampMeter,
  createFighterState,
  faceToward,
  finalizeFighterFrame,
  getWorldAttackBox,
  getWorldGuardBoxes,
  getWorldHurtBoxes,
} from './fighter';
import type { ActiveAttackState, FighterInput, FighterSlot, FighterState } from './fighter';
import type { StageDefinition } from './types';

export const SIMULATION_FPS = 60;
export const FIXED_TIMESTEP_SECONDS = 1 / SIMULATION_FPS;

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
}

export interface CombatInputFrame {
  readonly player?: FighterInput;
  readonly cpu?: FighterInput;
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
  const facedPlayer = faceToward(state.player, state.cpu.position.x);
  const facedCpu = faceToward(state.cpu, state.player.position.x);
  const advancedPlayer = advanceFighterForFrame(facedPlayer, inputs.player ?? {}, state.stage, FIXED_TIMESTEP_SECONDS);
  const advancedCpu = advanceFighterForFrame(facedCpu, inputs.cpu ?? {}, state.stage, FIXED_TIMESTEP_SECONDS);
  const resolved = resolveCombatFrame(advancedPlayer, advancedCpu, state.frame);

  return {
    ...state,
    frame: state.frame + 1,
    player: finalizeFighterFrame(resolved.player),
    cpu: finalizeFighterFrame(resolved.cpu),
    events: [...state.events, ...resolved.events],
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

    const damage = blocked ? activeAttack.profile.blockDamage : activeAttack.profile.damage;
    nextAttacker = markWindowConnected(clampMeter(nextAttacker, nextAttacker.meter + activeAttack.profile.meterGain), activeAttack, index);

    if (blocked) {
      nextTarget = applyBlock(nextTarget, nextAttacker, damage, activeAttack);
      events.push(createCombatEvent(frame, 'blocked', nextAttacker, nextTarget, activeAttack, index, damage));
      continue;
    }

    nextTarget = applyHit(nextTarget, nextAttacker, damage, activeAttack);
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

function applyHit(target: FighterState, attacker: FighterState, damage: number, attack: ActiveAttackState): FighterState {
  const nextHealth = Math.max(0, target.health - damage);
  const direction = attacker.position.x <= target.position.x ? 1 : -1;
  const defeated = nextHealth <= 0;

  if (defeated) {
    return {
      ...clampHealth(target, nextHealth),
      status: 'knockdown',
      animationFrame: 0,
      animationTick: 0,
      stunFrames: 0,
      isFinished: true,
      activeAttack: undefined,
      velocity: {
        x: direction * Math.max(Math.abs(attack.profile.knockbackX) * 1.45, 120),
        y: Math.min(attack.profile.knockbackY * 2, -180),
      },
    };
  }

  if (isUninterruptibleSpecial(target)) {
    return clampHealth(target, nextHealth);
  }

  return {
    ...clampHealth(target, nextHealth),
    status: 'hitstun',
    animationFrame: 0,
    animationTick: 0,
    stunFrames: attack.profile.hitstunFrames,
    activeAttack: undefined,
    velocity: {
      x: direction * Math.abs(attack.profile.knockbackX),
      y: attack.profile.knockbackY,
    },
  };
}

function isUninterruptibleSpecial(fighter: FighterState): boolean {
  return fighter.activeAttack?.kind === 'special';
}

function applyBlock(target: FighterState, attacker: FighterState, damage: number, attack: ActiveAttackState): FighterState {
  const direction = attacker.position.x <= target.position.x ? 1 : -1;

  return {
    ...clampHealth(target, target.health - damage),
    status: 'blockstun',
    animationFrame: 0,
    animationTick: 0,
    stunFrames: attack.profile.blockstunFrames,
    velocity: {
      x: direction * Math.abs(attack.profile.knockbackX) * 0.35,
      y: 0,
    },
  };
}

function markWindowConnected(attacker: FighterState, activeAttack: ActiveAttackState, windowIndex: number): FighterState {
  return {
    ...attacker,
    activeAttack: {
      ...activeAttack,
      connectedWindowIndexes: [...activeAttack.connectedWindowIndexes, windowIndex],
    },
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
