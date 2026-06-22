import type { CharacterId } from './types';

export type RoundEndReason = 'ko' | 'doubleKo' | 'timeout' | 'timeoutTie';
export type RoundWinner = 'player' | 'cpu' | 'draw';
export type MatchWinner = 'player' | 'cpu';

export interface RoundScore {
  readonly player: number;
  readonly cpu: number;
}

export interface RoundResolutionInput {
  readonly playerHealth: number;
  readonly cpuHealth: number;
  readonly timerSeconds: number;
}

export interface RoundResolution {
  readonly isRoundOver: boolean;
  readonly reason?: RoundEndReason;
  readonly winner?: RoundWinner;
}

export interface ApplyRoundResultInput {
  readonly score: RoundScore;
  readonly resolution: RoundResolution;
  readonly roundsToWin: number;
}

export interface AppliedRoundResult {
  readonly score: RoundScore;
  readonly roundWinner: RoundWinner;
  readonly matchWinner?: MatchWinner;
}

export interface RoundPolicy {
  readonly simultaneousKo: 'draw-no-point';
  readonly timeoutTie: 'draw-no-point';
  readonly roundTransitionInputLockoutFrames: number;
  readonly superCutInInputPauseFrames: number;
  readonly rematchReset: 'score-round-timer-health-position-meter';
  readonly wallCollision: 'clamp-to-stage-bounds';
  readonly facingFlip: 'face-nearest-opponent-every-frame';
  readonly perRoundMeter: 'carry-until-rematch';
}

export const ROUND_POLICY: RoundPolicy = {
  simultaneousKo: 'draw-no-point',
  timeoutTie: 'draw-no-point',
  roundTransitionInputLockoutFrames: 90,
  superCutInInputPauseFrames: 24,
  rematchReset: 'score-round-timer-health-position-meter',
  wallCollision: 'clamp-to-stage-bounds',
  facingFlip: 'face-nearest-opponent-every-frame',
  perRoundMeter: 'carry-until-rematch',
};

export function createInitialRoundScore(): RoundScore {
  return {
    player: 0,
    cpu: 0,
  };
}

export function resolveRound(input: RoundResolutionInput): RoundResolution {
  const playerHealth = sanitizeHealth(input.playerHealth);
  const cpuHealth = sanitizeHealth(input.cpuHealth);
  const timerExpired = sanitizeTimer(input.timerSeconds) <= 0;
  const playerDefeated = playerHealth <= 0;
  const cpuDefeated = cpuHealth <= 0;

  if (playerDefeated && cpuDefeated) {
    return {
      isRoundOver: true,
      reason: 'doubleKo',
      winner: 'draw',
    };
  }

  if (cpuDefeated) {
    return {
      isRoundOver: true,
      reason: 'ko',
      winner: 'player',
    };
  }

  if (playerDefeated) {
    return {
      isRoundOver: true,
      reason: 'ko',
      winner: 'cpu',
    };
  }

  if (!timerExpired) {
    return {
      isRoundOver: false,
    };
  }

  if (playerHealth === cpuHealth) {
    return {
      isRoundOver: true,
      reason: 'timeoutTie',
      winner: 'draw',
    };
  }

  return {
    isRoundOver: true,
    reason: 'timeout',
    winner: playerHealth > cpuHealth ? 'player' : 'cpu',
  };
}

export function applyRoundResult(input: ApplyRoundResultInput): AppliedRoundResult {
  if (!input.resolution.isRoundOver) {
    return {
      score: input.score,
      roundWinner: 'draw',
    };
  }

  const roundWinner = input.resolution.winner ?? 'draw';
  const score = {
    player: input.score.player + (roundWinner === 'player' ? 1 : 0),
    cpu: input.score.cpu + (roundWinner === 'cpu' ? 1 : 0),
  };
  const roundsToWin = Math.max(1, Math.floor(input.roundsToWin));
  const matchWinner = score.player >= roundsToWin ? 'player' : score.cpu >= roundsToWin ? 'cpu' : undefined;

  return {
    score,
    roundWinner,
    matchWinner,
  };
}

export function resolveMatchWinnerId(
  winner: MatchWinner | undefined,
  characterIds: { readonly player: CharacterId; readonly cpu: CharacterId },
): CharacterId | undefined {
  if (winner === 'player') {
    return characterIds.player;
  }

  if (winner === 'cpu') {
    return characterIds.cpu;
  }

  return undefined;
}

function sanitizeHealth(health: number): number {
  return Number.isFinite(health) ? Math.max(0, Math.round(health * 1000) / 1000) : 0;
}

function sanitizeTimer(timerSeconds: number): number {
  return Number.isFinite(timerSeconds) ? Math.max(0, timerSeconds) : 0;
}
