import { describe, expect, it } from 'vitest';
import { normalizeGameConfig } from './config';
import {
  FIXED_TIMESTEP_SECONDS,
  createCombatState,
  createSeededRng,
  stepCombat,
  stepCombatFrames,
  toSimulationFrames,
} from './combat';
import type { CombatState } from './combat';
import type { FighterInput } from './fighter';
import type { GameConfigSources } from './config';

import charactersRaw from '../../public/configs/characters.json?raw';
import inputRaw from '../../public/configs/input.json?raw';
import manifestRaw from '../../public/assets/manifest.json?raw';
import settingsRaw from '../../public/configs/settings.json?raw';
import stagesRaw from '../../public/configs/stages.json?raw';
import tuningRaw from '../../public/configs/tuning.json?raw';

describe('fighter combat core', () => {
  it('resolves a light hit with damage, hitstun, knockback, and meter gain', () => {
    const state = makeCombatState({ playerX: 220, cpuX: 330 });

    const afterContact = runFrames(state, 4, { player: { light: true } });

    expect(afterContact.cpu.health).toBe(98);
    expect(afterContact.cpu.status).toBe('hitstun');
    expect(afterContact.cpu.stunFrames).toBeGreaterThan(0);
    expect(afterContact.cpu.velocity.x).toBeGreaterThan(0);
    expect(afterContact.player.meter).toBe(6);
    expect(afterContact.events.some((event) => event.type === 'hit' && event.attackId === 'sama-jab')).toBe(true);
  });

  it('leaves health and meter unchanged when an attack whiffs', () => {
    const state = makeCombatState({ playerX: 120, cpuX: 560 });

    const afterWhiff = runFrames(state, 8, { player: { light: true } });

    expect(afterWhiff.cpu.health).toBe(104);
    expect(afterWhiff.player.meter).toBe(0);
    expect(afterWhiff.events.some((event) => event.type === 'hit' || event.type === 'blocked')).toBe(false);
  });

  it('uses guard-box overlap for blocked hits and applies block damage/blockstun', () => {
    const state = makeCombatState({ playerX: 220, cpuX: 330 });

    const afterBlock = runFrames(state, 4, {
      player: { light: true },
      cpu: { block: true },
    });

    expect(afterBlock.cpu.health).toBe(103);
    expect(afterBlock.cpu.status).toBe('blockstun');
    expect(afterBlock.cpu.stunFrames).toBeGreaterThan(0);
    expect(afterBlock.player.meter).toBe(6);
    expect(afterBlock.events.some((event) => event.type === 'blocked' && event.attackId === 'sama-jab')).toBe(true);
  });

  it('allows multi-hit special windows to connect independently', () => {
    const state = makeCombatState({ playerX: 220, cpuX: 330 });

    const afterSpecial = runFrames(state, 18, { player: { special: true } });
    const specialHits = afterSpecial.events.filter((event) => event.type === 'hit' && event.attackId === 'sama-combo');

    expect(specialHits).toHaveLength(3);
    expect(specialHits.map((event) => event.windowIndex)).toEqual([0, 1, 2]);
    expect(afterSpecial.cpu.health).toBe(44);
  });

  it('launches a defeated fighter into knockdown on a finishing hit', () => {
    const state = makeCombatState({ playerX: 220, cpuX: 330 });
    const nearlyDone: CombatState = {
      ...state,
      cpu: {
        ...state.cpu,
        health: 5,
      },
    };

    const finished = runFrames(nearlyDone, 10, { player: { heavy: true } });

    expect(finished.cpu.health).toBe(0);
    expect(finished.cpu.status).toBe('knockdown');
    expect(finished.cpu.isFinished).toBe(true);
    expect(finished.cpu.velocity.x).toBeGreaterThan(100);
    expect(finished.cpu.velocity.y).toBeLessThan(-120);
    expect(finished.events.some((event) => event.type === 'finisher')).toBe(true);
  });

  it('moves, jumps, applies gravity, and keeps fighters facing one another', () => {
    const state = makeCombatState({ playerX: 220, cpuX: 420 });
    const moved = runFrames(state, 5, { player: { right: true } });
    const launched = runFrames(moved, 1, { player: { jump: true } });
    const airborne = runFrames(launched, 10);
    const crossed = runFrames(
      {
        ...airborne,
        player: { ...airborne.player, position: { ...airborne.player.position, x: 430 } },
        cpu: { ...airborne.cpu, position: { ...airborne.cpu.position, x: 340 } },
      },
      1,
    );

    expect(moved.player.position.x).toBeGreaterThan(state.player.position.x);
    expect(airborne.player.position.y).toBeLessThan(state.player.position.y);
    expect(airborne.player.velocity.y).toBeGreaterThan(launched.player.velocity.y);
    expect(crossed.player.facing).toBe('left');
    expect(crossed.cpu.facing).toBe('right');
  });

  it('is deterministic for the same seed and input transcript', () => {
    const transcript: readonly FighterInput[] = [
      { right: true },
      { right: true },
      { light: true },
      {},
      {},
      { block: true },
      { heavy: true },
      {},
      {},
      {},
      { special: true },
      {},
      {},
      {},
      {},
      {},
    ];

    const first = runTranscript(makeCombatState({ seed: 12345 }), transcript, 12345);
    const second = runTranscript(makeCombatState({ seed: 12345 }), transcript, 12345);
    const differentSeed = runTranscript(makeCombatState({ seed: 999 }), transcript, 999);

    expect(snapshotForDeterminism(first)).toEqual(snapshotForDeterminism(second));
    expect(snapshotForDeterminism(first)).not.toEqual(snapshotForDeterminism(differentSeed));
  });

  it('exposes fixed timestep helpers for 60 Hz simulation wrappers', () => {
    expect(FIXED_TIMESTEP_SECONDS).toBeCloseTo(1 / 60);
    expect(toSimulationFrames(0.5)).toBe(30);
    expect(stepCombatFrames(makeCombatState(), 0).frame).toBe(0);
  });
});

function makeCombatState(options: { readonly playerX?: number; readonly cpuX?: number; readonly seed?: number } = {}): CombatState {
  const config = normalizeGameConfig(readFixtureSources());
  const stage = config.stagesById[config.match.stageId] ?? config.stages[0];
  const player = config.charactersById.sama ?? config.characters[0];
  const cpu = config.charactersById.amodi ?? config.characters[1] ?? config.characters[0];

  if (!stage || !player || !cpu) {
    throw new Error('Combat fixture config did not normalize required stage and characters.');
  }

  return createCombatState({
    seed: options.seed ?? 7,
    stage,
    fighters: {
      player: {
        character: player,
        tuning: config.tuning[player.tuningId],
        x: options.playerX ?? stage.playerSpawnX,
      },
      cpu: {
        character: cpu,
        tuning: config.tuning[cpu.tuningId],
        x: options.cpuX ?? stage.cpuSpawnX,
      },
    },
  });
}

function runFrames(
  state: CombatState,
  frames: number,
  inputs: { readonly player?: FighterInput; readonly cpu?: FighterInput } = {},
): CombatState {
  let next = state;

  for (let frame = 0; frame < frames; frame += 1) {
    next = stepCombat(next, {
      player: inputs.player ?? {},
      cpu: inputs.cpu ?? {},
    });
  }

  return next;
}

function runTranscript(state: CombatState, transcript: readonly FighterInput[], seed: number): CombatState {
  const rng = createSeededRng(seed);
  let next = state;

  for (const playerInput of transcript) {
    const cpuInput = rng.next() > 0.55 ? { block: true } : rng.next() > 0.35 ? { left: true } : {};
    next = stepCombat(next, { player: playerInput, cpu: cpuInput });
  }

  return next;
}

function snapshotForDeterminism(state: CombatState): unknown {
  return {
    frame: state.frame,
    player: {
      x: round(state.player.position.x),
      y: round(state.player.position.y),
      vx: round(state.player.velocity.x),
      vy: round(state.player.velocity.y),
      facing: state.player.facing,
      health: state.player.health,
      meter: state.player.meter,
      status: state.player.status,
    },
    cpu: {
      x: round(state.cpu.position.x),
      y: round(state.cpu.position.y),
      vx: round(state.cpu.velocity.x),
      vy: round(state.cpu.velocity.y),
      facing: state.cpu.facing,
      health: state.cpu.health,
      meter: state.cpu.meter,
      status: state.cpu.status,
    },
    events: state.events.map((event) => ({
      frame: event.frame,
      type: event.type,
      sourceId: event.sourceId,
      targetId: event.targetId,
      attackId: event.attackId,
      windowIndex: event.windowIndex,
    })),
  };
}

function readFixtureSources(): GameConfigSources {
  return {
    manifest: readJson(manifestRaw),
    characters: readJson(charactersRaw),
    tuning: readJson(tuningRaw),
    stages: readJson(stagesRaw),
    input: readJson(inputRaw),
    settings: readJson(settingsRaw),
  };
}

function readJson(raw: string): unknown {
  return JSON.parse(raw);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
