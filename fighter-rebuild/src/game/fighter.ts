import { resolveCharacterFrameBoxes } from './config';
import type {
  AttackCancelRule,
  AttackInput,
  AttackProfile,
  CharacterDefinition,
  FighterTuning,
  Rect,
  ResolvedFrameBoxes,
  StageDefinition,
} from './types';

export const FIGHTER_FRAME_WIDTH = 320;
export const FIGHTER_FRAME_HEIGHT = 320;

export type FighterSlot = 'player' | 'cpu';
export type Facing = 'left' | 'right';
export type AttackKind = string;
export type FighterStatus = 'idle' | 'walk' | 'jump' | 'crouch' | 'block' | 'attack' | 'hitstun' | 'blockstun' | 'knockdown';

export interface FighterInput {
  readonly left?: boolean;
  readonly right?: boolean;
  readonly jump?: boolean;
  readonly crouch?: boolean;
  readonly block?: boolean;
  readonly light?: boolean;
  readonly heavy?: boolean;
  readonly special?: boolean;
  readonly specialMeterPaid?: boolean;
}

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

export interface ActiveAttackState {
  readonly kind: AttackKind;
  readonly profile: AttackProfile;
  readonly actionFrame: number;
  readonly actionTick: number;
  readonly totalFrames: number;
  readonly connectedWindowIndexes: readonly number[];
  readonly hasConnected: boolean;
}

export interface FighterState {
  readonly slot: FighterSlot;
  readonly character: CharacterDefinition;
  readonly tuning: FighterTuning;
  /**
   * World position is the fighter sprite's bottom-center anchor in stage pixels.
   * Authored frame boxes remain in 320x320 frame space and are mirrored from this anchor.
   */
  readonly position: Vector2;
  readonly velocity: Vector2;
  readonly facing: Facing;
  readonly status: FighterStatus;
  readonly animationFrame: number;
  readonly animationTick: number;
  readonly health: number;
  readonly meter: number;
  readonly stunFrames: number;
  readonly isGrounded: boolean;
  readonly isFinished: boolean;
  readonly activeAttack?: ActiveAttackState;
}

export interface CreateFighterOptions {
  readonly slot: FighterSlot;
  readonly character: CharacterDefinition;
  readonly tuning?: FighterTuning;
  readonly x: number;
  readonly floorY: number;
  readonly facing?: Facing;
}

export function createFighterState(options: CreateFighterOptions): FighterState {
  if (!options.tuning) {
    throw new Error(`Missing fighter tuning for ${options.character.id}.`);
  }

  return {
    slot: options.slot,
    character: options.character,
    tuning: options.tuning,
    position: {
      x: options.x,
      y: options.floorY,
    },
    velocity: {
      x: 0,
      y: 0,
    },
    facing: options.facing ?? 'right',
    status: 'idle',
    animationFrame: 0,
    animationTick: 0,
    health: options.tuning.maxHealth,
    meter: options.tuning.meterStart,
    stunFrames: 0,
    isGrounded: true,
    isFinished: false,
  };
}

export function chooseAttackKind(input: FighterInput, character: CharacterDefinition): AttackKind | undefined {
  if (input.special) {
    return character.attacks.special ? 'special' : undefined;
  }

  if (input.heavy && input.crouch && character.attacks.sweep) {
    return 'sweep';
  }

  if (input.heavy) {
    return character.attacks.heavy ? 'heavy' : undefined;
  }

  if (input.light) {
    return character.attacks.light ? 'light' : undefined;
  }

  return undefined;
}

export function createActiveAttack(kind: AttackKind, character: CharacterDefinition): ActiveAttackState {
  const profile = character.attacks[kind];

  if (!profile) {
    throw new Error(`Character "${character.id}" is missing attack profile "${kind}".`);
  }

  const lastWindowFrame = profile.windows.reduce((max, window) => Math.max(max, window.endFrame), 0);

  return {
    kind,
    profile,
    actionFrame: 0,
    actionTick: 0,
    totalFrames: Math.max(lastWindowFrame + profile.recoveryFrames, 1),
    connectedWindowIndexes: [],
    hasConnected: false,
  };
}

export function findAttackCancel(fighter: FighterState, input: FighterInput): AttackCancelRule | undefined {
  if (!fighter.activeAttack || fighter.isFinished || fighter.stunFrames > 0) {
    return undefined;
  }

  const requestedInput = attackInputFromFighterInput(input);

  if (!requestedInput) {
    return undefined;
  }

  return fighter.activeAttack.profile.cancels.find((cancel) => {
    return (
      cancel.input === requestedInput &&
      fighter.activeAttack !== undefined &&
      fighter.activeAttack.actionFrame >= cancel.startFrame &&
      fighter.activeAttack.actionFrame <= cancel.endFrame &&
      Boolean(fighter.character.attacks[cancel.nextAttack]) &&
      (!cancel.requiresConnection || fighter.activeAttack.hasConnected) &&
      (!cancel.requiresMeter || input.specialMeterPaid || fighter.meter >= fighter.tuning.meterMax)
    );
  });
}

export function canCancelWithInput(fighter: FighterState, input: FighterInput): boolean {
  return findAttackCancel(fighter, input) !== undefined;
}

export function getResolvedFighterBoxes(fighter: FighterState): ResolvedFrameBoxes {
  return resolveCharacterFrameBoxes(fighter.character, fighterAnimationName(fighter), fighter.animationFrame);
}

export function fighterAnimationName(fighter: FighterState): string {
  if (fighter.activeAttack) {
    return fighter.activeAttack.profile.animation;
  }

  if (fighter.status === 'block' || fighter.status === 'blockstun') {
    return 'block';
  }

  if (fighter.status === 'crouch') {
    return 'crouch';
  }

  if (fighter.status === 'knockdown') {
    return 'knockdown';
  }

  if (!fighter.isGrounded || fighter.status === 'jump') {
    return 'jump';
  }

  if (fighter.status === 'walk') {
    return 'walk';
  }

  return 'idle';
}

export function finalAnimationFrameFor(fighter: FighterState, animationName: string): number {
  const boxes = fighter.character.frameBoxes[animationName] ?? fighter.character.frameBoxes.idle;
  return Math.max(0, (boxes?.length ?? 1) - 1);
}

export function beginDefeatFall(fighter: FighterState, sourceX: number, launch?: Vector2): FighterState {
  const direction = sourceX <= fighter.position.x ? 1 : -1;

  return {
    ...clampHealth(fighter, 0),
    status: 'knockdown',
    animationFrame: 0,
    animationTick: 0,
    stunFrames: 0,
    isFinished: true,
    activeAttack: undefined,
    velocity: launch ?? {
      x: direction * 120,
      y: -180,
    },
  };
}

export function getWorldHurtBoxes(fighter: FighterState): readonly Rect[] {
  return getResolvedFighterBoxes(fighter).hurt.map((box) => frameRectToWorld(fighter, box));
}

export function getWorldGuardBoxes(fighter: FighterState): readonly Rect[] {
  return getResolvedFighterBoxes(fighter).guard.map((box) => frameRectToWorld(fighter, box));
}

export function getWorldCollisionBox(fighter: FighterState): Rect {
  return frameRectToWorld(fighter, getResolvedFighterBoxes(fighter).collision);
}

export function getWorldAttackBox(fighter: FighterState, hitbox: Rect): Rect {
  return frameRectToWorld(fighter, hitbox);
}

export function frameRectToWorld(fighter: FighterState, rect: Rect): Rect {
  const frameLeft = fighter.position.x - FIGHTER_FRAME_WIDTH / 2;
  const frameTop = fighter.position.y - FIGHTER_FRAME_HEIGHT;
  const x =
    fighter.facing === 'right'
      ? frameLeft + rect.x
      : frameLeft + FIGHTER_FRAME_WIDTH - rect.x - rect.width;

  return {
    x,
    y: frameTop + rect.y,
    width: rect.width,
    height: rect.height,
  };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function anyRectOverlaps(source: Rect, targets: readonly Rect[]): boolean {
  return targets.some((target) => rectsOverlap(source, target));
}

export function faceToward(fighter: FighterState, opponentX: number): FighterState {
  const facing: Facing = fighter.position.x <= opponentX ? 'right' : 'left';

  if (fighter.facing === facing) {
    return fighter;
  }

  return {
    ...fighter,
    facing,
  };
}

export function advanceFighterForFrame(
  fighter: FighterState,
  input: FighterInput,
  stage: Pick<StageDefinition, 'width' | 'floorY'>,
  deltaSeconds: number,
): FighterState {
  if (fighter.isFinished) {
    return advanceFinishedFighter(fighter, stage, deltaSeconds);
  }

  if (fighter.stunFrames > 0) {
    return advanceStunnedFighter(fighter, stage, deltaSeconds);
  }

  if (fighter.activeAttack) {
    const cancel = findAttackCancel(fighter, input);

    if (cancel) {
      const attackingFighter = cancel.requiresMeter && !input.specialMeterPaid ? clampMeter(stopGroundedDrift(fighter), fighter.meter - fighter.tuning.meterMax) : stopGroundedDrift(fighter);
      return advancePhysics(
        {
          ...attackingFighter,
          status: 'attack',
          animationFrame: 0,
          animationTick: 0,
          activeAttack: createActiveAttack(cancel.nextAttack, attackingFighter.character),
        },
        stage,
        deltaSeconds,
      );
    }

    const attackingFighter = stopGroundedDrift(fighter);
    return advancePhysics(
      {
        ...attackingFighter,
        status: 'attack',
      },
      stage,
      deltaSeconds,
    );
  }

  if (fighter.health <= 0) {
    return advancePhysics(
      {
        ...stopGroundedDrift(fighter),
        status: fighter.isGrounded ? 'idle' : 'jump',
      },
      stage,
      deltaSeconds,
    );
  }

  const attackKind = chooseAttackKind(input, fighter.character);

  if (attackKind) {
    const attackingFighter = stopGroundedDrift(fighter);
    return advancePhysics(
      {
        ...attackingFighter,
        status: 'attack',
        animationFrame: 0,
        animationTick: 0,
        activeAttack: createActiveAttack(attackKind, attackingFighter.character),
      },
      stage,
      deltaSeconds,
    );
  }

  if (input.block && fighter.isGrounded) {
    return applyStatus(
      advancePhysics(
        {
          ...fighter,
          velocity: {
            x: fighter.velocity.x * fighter.tuning.groundFriction,
            y: fighter.velocity.y,
          },
        },
        stage,
        deltaSeconds,
      ),
      'block',
      fighter.status,
    );
  }

  if (input.crouch && fighter.isGrounded) {
    return applyStatus(
      advancePhysics(
        {
          ...fighter,
          velocity: {
            x: fighter.velocity.x * fighter.tuning.groundFriction,
            y: fighter.velocity.y,
          },
        },
        stage,
        deltaSeconds,
      ),
      'crouch',
      fighter.status,
    );
  }

  return advanceMobileFighter(fighter, input, stage, deltaSeconds);
}

function stopGroundedDrift(fighter: FighterState): FighterState {
  if (!fighter.isGrounded || fighter.velocity.x === 0) {
    return fighter;
  }

  return {
    ...fighter,
    velocity: {
      ...fighter.velocity,
      x: 0,
    },
  };
}

export function finalizeFighterFrame(fighter: FighterState): FighterState {
  if (fighter.isFinished) {
    return advanceAmbientAnimation(fighter);
  }

  if (!fighter.activeAttack) {
    return advanceAmbientAnimation(fighter);
  }

  const nextActionTick = fighter.activeAttack.actionTick + 1;
  const actionFrameInterval = fighter.activeAttack.profile.frameInterval;
  if (nextActionTick < actionFrameInterval) {
    return {
      ...fighter,
      animationTick: nextActionTick,
      activeAttack: {
        ...fighter.activeAttack,
        actionTick: nextActionTick,
      },
    };
  }

  const nextActionFrame = fighter.activeAttack.actionFrame + 1;

  if (nextActionFrame > fighter.activeAttack.totalFrames) {
    return {
      ...fighter,
      status: fighter.isGrounded ? 'idle' : 'jump',
      animationFrame: 0,
      animationTick: 0,
      activeAttack: undefined,
    };
  }

  return {
    ...fighter,
    animationFrame: attackAnimationFrame(fighter.activeAttack, fighter.character, nextActionFrame),
    animationTick: 0,
    activeAttack: {
      ...fighter.activeAttack,
      actionFrame: nextActionFrame,
      actionTick: 0,
    },
  };
}

function attackAnimationFrame(activeAttack: ActiveAttackState, character: CharacterDefinition, actionFrame: number): number {
  const boxes = character.frameBoxes[activeAttack.profile.animation] ?? character.frameBoxes.idle;
  const frameCount = Math.max(boxes?.length ?? 1, 1);

  if (activeAttack.profile.animationMode === 'hold-final') {
    return lightAttackAnimationFrame(activeAttack, actionFrame, frameCount);
  }

  if (activeAttack.profile.animationMode === 'spread') {
    return spreadAttackAnimationFrame(activeAttack, actionFrame, frameCount);
  }

  return Math.min(actionFrame, frameCount - 1);
}

function lightAttackAnimationFrame(activeAttack: ActiveAttackState, actionFrame: number, frameCount: number): number {
  if (frameCount <= 1 || actionFrame <= 0) {
    return 0;
  }

  if (actionFrame >= activeAttack.totalFrames) {
    return frameCount - 1;
  }

  return Math.min(Math.max(1, actionFrame), Math.max(1, frameCount - 2));
}

function spreadAttackAnimationFrame(activeAttack: ActiveAttackState, actionFrame: number, frameCount: number): number {
  if (frameCount <= 1 || actionFrame <= 0) {
    return 0;
  }

  const progress = actionFrame / Math.max(activeAttack.totalFrames, 1);
  return clamp(Math.floor(progress * frameCount), 0, frameCount - 1);
}

export function clampMeter(fighter: FighterState, nextMeter: number): FighterState {
  return {
    ...fighter,
    meter: clamp(nextMeter, 0, fighter.tuning.meterMax),
  };
}

export function clampHealth(fighter: FighterState, nextHealth: number): FighterState {
  return {
    ...fighter,
    health: clamp(nextHealth, 0, fighter.tuning.maxHealth),
  };
}

function advanceMobileFighter(
  fighter: FighterState,
  input: FighterInput,
  stage: Pick<StageDefinition, 'width' | 'floorY'>,
  deltaSeconds: number,
): FighterState {
  const movement = Number(Boolean(input.right)) - Number(Boolean(input.left));
  const control = fighter.isGrounded ? 1 : fighter.tuning.airControl;
  let velocityX = fighter.velocity.x;
  let velocityY = fighter.velocity.y;

  if (movement !== 0) {
    velocityX = movement * fighter.tuning.walkSpeed * control;
  } else if (fighter.isGrounded) {
    velocityX *= fighter.tuning.groundFriction;
  }

  if (input.jump && fighter.isGrounded) {
    velocityY = -fighter.tuning.jumpVelocity;
  }

  const next = advancePhysics(
    {
      ...fighter,
      velocity: {
        x: velocityX,
        y: velocityY,
      },
    },
    stage,
    deltaSeconds,
  );

  const nextStatus: FighterStatus = next.isGrounded ? (Math.abs(next.velocity.x) > 0.1 ? 'walk' : 'idle') : 'jump';
  return applyStatus(next, nextStatus, fighter.status);
}

function advanceStunnedFighter(
  fighter: FighterState,
  stage: Pick<StageDefinition, 'width' | 'floorY'>,
  deltaSeconds: number,
): FighterState {
  const next = advancePhysics(
    {
      ...fighter,
      stunFrames: Math.max(0, fighter.stunFrames - 1),
    },
    stage,
    deltaSeconds,
  );

  if (next.stunFrames > 0) {
    return next;
  }

  return {
    ...next,
    status: next.isGrounded ? 'idle' : 'jump',
    animationFrame: 0,
    animationTick: 0,
  };
}

function advanceFinishedFighter(
  fighter: FighterState,
  stage: Pick<StageDefinition, 'width' | 'floorY'>,
  deltaSeconds: number,
): FighterState {
  return advancePhysics(
    {
      ...fighter,
      status: 'knockdown',
    },
    stage,
    deltaSeconds,
  );
}

function advancePhysics(
  fighter: FighterState,
  stage: Pick<StageDefinition, 'width' | 'floorY'>,
  deltaSeconds: number,
): FighterState {
  let velocityY = fighter.velocity.y;

  if (!fighter.isGrounded || velocityY < 0) {
    velocityY += fighter.tuning.gravity * deltaSeconds;
  }

  const nextX = clamp(fighter.position.x + fighter.velocity.x * deltaSeconds, FIGHTER_FRAME_WIDTH / 2, stage.width - FIGHTER_FRAME_WIDTH / 2);
  let nextY = fighter.position.y + velocityY * deltaSeconds;
  let isGrounded = false;

  if (nextY >= stage.floorY) {
    nextY = stage.floorY;
    velocityY = 0;
    isGrounded = true;
  }

  return {
    ...fighter,
    position: {
      x: nextX,
      y: nextY,
    },
    velocity: {
      x: fighter.velocity.x,
      y: velocityY,
    },
    isGrounded,
  };
}

function nextAnimationFrame(fighter: FighterState): number {
  const animationName = fighterAnimationName(fighter);
  const boxes = fighter.character.frameBoxes[animationName] ?? fighter.character.frameBoxes.idle;
  const frameCount = Math.max(boxes?.length ?? 1, 1);

  if (fighter.activeAttack) {
    return Math.min(fighter.activeAttack.actionFrame, frameCount - 1);
  }

  if (animationName === 'block' || animationName === 'knockdown') {
    return Math.min(fighter.animationFrame + 1, frameCount - 1);
  }

  return (fighter.animationFrame + 1) % frameCount;
}

function advanceAmbientAnimation(fighter: FighterState): FighterState {
  const frameInterval = animationFrameInterval(fighterAnimationName(fighter));
  const nextTick = fighter.animationTick + 1;

  if (nextTick < frameInterval) {
    return {
      ...fighter,
      animationTick: nextTick,
    };
  }

  return {
    ...fighter,
    animationFrame: nextAnimationFrame(fighter),
    animationTick: 0,
  };
}

function animationFrameInterval(animationName: string): number {
  switch (animationName) {
    case 'idle':
      return 12;
    case 'walk':
      return 8;
    case 'jump':
    case 'crouch':
    case 'block':
    case 'knockdown':
      return 8;
    default:
      return 6;
  }
}

function applyStatus(fighter: FighterState, nextStatus: FighterStatus, previousStatus: FighterStatus): FighterState {
  if (nextStatus === previousStatus) {
    return {
      ...fighter,
      status: nextStatus,
    };
  }

  const animationFrame = nextStatus === 'block' || nextStatus === 'blockstun' ? finalAnimationFrameFor(fighter, 'block') : 0;

  return {
    ...fighter,
    status: nextStatus,
    animationFrame,
    animationTick: 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function attackInputFromFighterInput(input: FighterInput): AttackInput | undefined {
  if (input.special) {
    return 'special';
  }

  if (input.heavy) {
    return 'heavy';
  }

  if (input.light) {
    return 'light';
  }

  return undefined;
}
