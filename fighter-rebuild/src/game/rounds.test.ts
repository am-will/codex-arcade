import { describe, expect, it } from 'vitest';
import {
  ROUND_POLICY,
  applyRoundResult,
  createInitialRoundScore,
  resolveMatchWinnerId,
  resolveRound,
} from './rounds';

describe('round resolution', () => {
  it('keeps the round active while health remains and timer has time', () => {
    expect(resolveRound({ playerHealth: 32, cpuHealth: 18, timerSeconds: 12 })).toEqual({
      isRoundOver: false,
    });
  });

  it('awards a KO round to the standing fighter', () => {
    expect(resolveRound({ playerHealth: 24, cpuHealth: 0, timerSeconds: 30 })).toEqual({
      isRoundOver: true,
      reason: 'ko',
      winner: 'player',
    });
    expect(resolveRound({ playerHealth: 0, cpuHealth: 11, timerSeconds: 30 })).toEqual({
      isRoundOver: true,
      reason: 'ko',
      winner: 'cpu',
    });
  });

  it('treats simultaneous KO as a draw with no point', () => {
    const result = resolveRound({ playerHealth: 0, cpuHealth: 0, timerSeconds: 30 });

    expect(result).toEqual({
      isRoundOver: true,
      reason: 'doubleKo',
      winner: 'draw',
    });
    expect(applyRoundResult({ score: createInitialRoundScore(), resolution: result, roundsToWin: 2 })).toEqual({
      score: { player: 0, cpu: 0 },
      roundWinner: 'draw',
    });
  });

  it('resolves timeout by higher health', () => {
    expect(resolveRound({ playerHealth: 43, cpuHealth: 42, timerSeconds: 0 })).toEqual({
      isRoundOver: true,
      reason: 'timeout',
      winner: 'player',
    });
    expect(resolveRound({ playerHealth: 9, cpuHealth: 10, timerSeconds: -1 })).toEqual({
      isRoundOver: true,
      reason: 'timeout',
      winner: 'cpu',
    });
  });

  it('treats timeout ties as a draw with no point', () => {
    const result = resolveRound({ playerHealth: 25, cpuHealth: 25, timerSeconds: 0 });

    expect(result).toEqual({
      isRoundOver: true,
      reason: 'timeoutTie',
      winner: 'draw',
    });
    expect(applyRoundResult({ score: { player: 1, cpu: 1 }, resolution: result, roundsToWin: 2 })).toEqual({
      score: { player: 1, cpu: 1 },
      roundWinner: 'draw',
    });
  });

  it('tracks best-of-three match victory after two scored rounds', () => {
    const first = applyRoundResult({
      score: createInitialRoundScore(),
      resolution: { isRoundOver: true, reason: 'ko', winner: 'player' },
      roundsToWin: 2,
    });
    const second = applyRoundResult({
      score: first.score,
      resolution: { isRoundOver: true, reason: 'timeout', winner: 'player' },
      roundsToWin: 2,
    });

    expect(first).toEqual({
      score: { player: 1, cpu: 0 },
      roundWinner: 'player',
    });
    expect(second).toEqual({
      score: { player: 2, cpu: 0 },
      roundWinner: 'player',
      matchWinner: 'player',
    });
    expect(resolveMatchWinnerId(second.matchWinner, { player: 'sama', cpu: 'amodi' })).toBe('sama');
  });

  it('documents transition, super pause, wall, facing, rematch, and meter policies', () => {
    expect(ROUND_POLICY).toEqual({
      simultaneousKo: 'draw-no-point',
      timeoutTie: 'draw-no-point',
      roundTransitionInputLockoutFrames: 90,
      superCutInInputPauseFrames: 24,
      rematchReset: 'score-round-timer-health-position-meter',
      wallCollision: 'clamp-to-stage-bounds',
      facingFlip: 'face-nearest-opponent-every-frame',
      perRoundMeter: 'carry-until-rematch',
    });
  });
});
