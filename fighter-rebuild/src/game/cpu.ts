import { createSeededRng, type CombatState, type SeededRng } from './combat';
import type { FighterInput } from './fighter';

export type CpuDifficulty = 'easy' | 'normal' | 'hard';

export interface CpuController {
  decide(state: CombatState): FighterInput;
  reset(seed: number): void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  snapshotSeed(): number;
}

interface CpuPlan {
  readonly untilFrame: number;
  readonly movement?: 'left' | 'right' | 'hold';
  readonly guard: boolean;
  readonly attack?: 'light' | 'heavy' | 'special';
  readonly jump: boolean;
}

const DIFFICULTY = {
  easy: {
    decisionFrames: 34,
    attackChance: 0.28,
    guardChance: 0.12,
    jumpChance: 0.04,
    preferredDistance: 150,
  },
  normal: {
    decisionFrames: 24,
    attackChance: 0.42,
    guardChance: 0.18,
    jumpChance: 0.06,
    preferredDistance: 132,
  },
  hard: {
    decisionFrames: 16,
    attackChance: 0.58,
    guardChance: 0.26,
    jumpChance: 0.08,
    preferredDistance: 118,
  },
} as const;

export function createCpuController(options: {
  readonly seed: number;
  readonly difficulty?: CpuDifficulty;
  readonly enabled?: boolean;
}): CpuController {
  let rng = createSeededRng(options.seed);
  let enabled = options.enabled ?? true;
  let plan: CpuPlan = createIdlePlan(0);
  const tuning = DIFFICULTY[options.difficulty ?? 'normal'];

  return {
    decide(state: CombatState): FighterInput {
      if (!enabled || state.cpu.isFinished || state.player.isFinished) {
        return {};
      }

      if (state.frame >= plan.untilFrame || state.cpu.status === 'hitstun' || state.cpu.status === 'blockstun') {
        plan = choosePlan(state, rng, tuning);
      }

      const input: FighterInput = {
        left: plan.movement === 'left',
        right: plan.movement === 'right',
        block: plan.guard,
        jump: plan.jump,
        light: plan.attack === 'light',
        heavy: plan.attack === 'heavy',
        special: plan.attack === 'special',
      };

      if (plan.attack) {
        plan = {
          ...plan,
          attack: undefined,
        };
      }

      return input;
    },
    reset(seed: number): void {
      rng = createSeededRng(seed);
      plan = createIdlePlan(0);
    },
    setEnabled(nextEnabled: boolean): void {
      enabled = nextEnabled;
    },
    isEnabled(): boolean {
      return enabled;
    },
    snapshotSeed(): number {
      return rng.snapshot();
    },
  };
}

function choosePlan(
  state: CombatState,
  rng: SeededRng,
  tuning: (typeof DIFFICULTY)[CpuDifficulty],
): CpuPlan {
  const cpu = state.cpu;
  const player = state.player;
  const distance = Math.abs(player.position.x - cpu.position.x);
  const playerIsAttacking = Boolean(player.activeAttack);
  const directionToPlayer = player.position.x < cpu.position.x ? 'left' : 'right';
  const tooClose = distance < 84;
  const tooFar = distance > tuning.preferredDistance;
  const guard = playerIsAttacking && distance < 190 && rng.next() < tuning.guardChance * 2.6;
  const attackRoll = rng.next();
  const canSuper = cpu.meter >= cpu.tuning.meterMax;
  const attack =
    !guard && distance < 178 && attackRoll < tuning.attackChance
      ? chooseAttack(distance, canSuper, rng)
      : undefined;
  const movement =
    guard || attack
      ? 'hold'
      : tooClose
        ? opposite(directionToPlayer)
        : tooFar
          ? directionToPlayer
          : rng.nextInt(3) === 0
            ? directionToPlayer
            : 'hold';

  return {
    untilFrame: state.frame + tuning.decisionFrames + rng.nextInt(10),
    movement,
    guard,
    attack,
    jump: !guard && !attack && rng.next() < tuning.jumpChance,
  };
}

function chooseAttack(
  distance: number,
  canSuper: boolean,
  rng: SeededRng,
): CpuPlan['attack'] {
  if (canSuper && distance < 165 && rng.nextInt(5) === 0) {
    return 'special';
  }

  if (distance > 118) {
    return 'heavy';
  }

  return rng.nextInt(3) === 0 ? 'heavy' : 'light';
}

function opposite(direction: 'left' | 'right'): 'left' | 'right' {
  return direction === 'left' ? 'right' : 'left';
}

function createIdlePlan(frame: number): CpuPlan {
  return {
    untilFrame: frame,
    movement: 'hold',
    guard: false,
    jump: false,
  };
}
