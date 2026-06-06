import { describe, expect, it } from 'vitest';
import { normalizeGameConfig, REQUIRED_ANIMATIONS, resolveFrameBoxes } from './config';
import type { GameConfigSources } from './config';
import type { CharacterDefinition } from './types';

import charactersRaw from '../../public/configs/characters.json?raw';
import inputRaw from '../../public/configs/input.json?raw';
import manifestRaw from '../../public/assets/manifest.json?raw';
import settingsRaw from '../../public/configs/settings.json?raw';
import stagesRaw from '../../public/configs/stages.json?raw';
import tuningRaw from '../../public/configs/tuning.json?raw';

describe('game config loading and normalization', () => {
  it('normalizes the authored high-detail config against the asset manifest', () => {
    const config = normalizeGameConfig(readFixtureSources());

    expect(config.warnings).toEqual([]);
    expect(config.characters.map((character) => character.id)).toEqual(['sama', 'amodi']);
    expect(config.stages.map((stage) => stage.id)).toEqual(['byte-boardroom']);
    expect(config.match).toMatchObject({
      stageId: 'byte-boardroom',
      playerCharacterId: 'sama',
      cpuCharacterId: 'amodi',
      roundsToWin: 2,
      roundTimeSeconds: 60,
    });

    for (const character of config.characters) {
      expect(character.portraitKey).toBe(`${character.assetId}-portrait`);
      expect(character.attacks.light.windows[0]?.hitbox.x).toBeGreaterThan(190);
      expect(character.attacks.heavy.windows[0]?.hitbox.width).toBeGreaterThan(100);
      expect(character.attacks.special.windows).toHaveLength(3);
      expectAllRequiredBoxesAreAuthored(character);
    }

    const samaSpecialFrame = resolveFrameBoxes(config, 'sama', 'special', 5);
    expect(samaSpecialFrame.frame).toBe(5);
    expect(samaSpecialFrame.hurt[0]?.width).toBeGreaterThan(100);
    expect(samaSpecialFrame.collision.height).toBeGreaterThan(140);
  });

  it('falls back safely for malformed character, stage, tuning, and settings data', () => {
    const sources = makeMalformedSources();
    const config = normalizeGameConfig(sources);
    const sama = config.charactersById.sama;

    expect(sama).toBeDefined();
    expect(config.characters).toHaveLength(2);
    expect(config.warnings.join('\n')).toContain('duplicate character id "sama"');
    expect(config.warnings.join('\n')).toContain('references missing asset');
    expect(config.warnings.join('\n')).toContain('invalid frame index');
    expect(config.warnings.join('\n')).toContain('attack windows were empty or invalid');
    expect(config.warnings.join('\n')).toContain('Normalized inverted idle.0.hurt.0 rectangle width');
    expect(config.warnings.join('\n')).toContain('damage was not greater than 0');
    expect(config.warnings.join('\n')).toContain('walkSpeed was not greater than 0');
    expect(config.warnings.join('\n')).toContain('Default stage "missing-stage" is invalid');

    expect(sama?.assetId).toBe('sama');
    expect(sama?.attacks.light.damage).toBeGreaterThan(0);
    expect(sama?.attacks.light.windows).toHaveLength(1);
    expect(sama?.attacks.heavy.windows[0]).toMatchObject({ startFrame: 0, endFrame: 4 });
    expect(sama?.attacks.heavy.windows[0]?.hitbox).toMatchObject({
      x: 200,
      y: 100,
      width: 80,
      height: 60,
    });
    expect(sama?.frameBoxes.idle?.some((box) => box.frame === 99)).toBe(false);
    expect(sama?.frameBoxes.idle?.[0]?.hurt[0]).toMatchObject({
      x: 140,
      y: 100,
      width: 40,
      height: 60,
    });
    expect(sama?.frameBoxes.idle?.[0]?.collision).toMatchObject({
      x: 120,
      y: 120,
      width: 80,
      height: 80,
    });
    expect(config.tuning['sama-balanced']?.walkSpeed).toBeGreaterThan(0);
    expect(config.tuning['sama-balanced']?.jumpVelocity).toBeGreaterThan(0);
    expect(config.tuning['sama-balanced']?.gravity).toBeGreaterThan(0);
    expect(config.tuning['sama-balanced']?.pushboxWidth).toBeGreaterThan(90);
    expect(config.match.stageId).toBe('byte-boardroom');
    expect(config.input.light).toBe('KeyZ');
    expect(config.settings.roundsToWin).toBe(2);
  });

  it('clamps frame-box resolution to a valid frame and falls back to idle for unknown animations', () => {
    const config = normalizeGameConfig(readFixtureSources());

    expect(resolveFrameBoxes(config, 'sama', 'heavy', 500).frame).toBe(4);
    expect(resolveFrameBoxes(config, 'sama', 'missing-animation', 2).frame).toBe(2);
    expect(resolveFrameBoxes(config, 'missing-character', 'idle', -10).frame).toBe(0);
  });
});

function expectAllRequiredBoxesAreAuthored(character: CharacterDefinition): void {
  for (const animation of REQUIRED_ANIMATIONS) {
    const boxes = character.frameBoxes[animation];

    expect(boxes, `${character.id}.${animation}`).toBeDefined();
    expect(boxes?.length, `${character.id}.${animation}`).toBeGreaterThan(0);

    for (const box of boxes ?? []) {
      expect(box.collision.width, `${character.id}.${animation}.${box.frame}.collision.width`).toBeGreaterThan(64);
      expect(box.collision.height, `${character.id}.${animation}.${box.frame}.collision.height`).toBeGreaterThan(20);
      expect(box.hurt[0]?.width, `${character.id}.${animation}.${box.frame}.hurt.width`).toBeGreaterThan(80);
    }
  }
}

function makeMalformedSources(): GameConfigSources {
  const sources = readFixtureSources();
  const characters = sources.characters as Record<string, unknown>;
  const characterList = characters.characters as Record<string, unknown>[];
  const sama = characterList[0] as Record<string, unknown>;
  const attacks = sama.attacks as {
    light: Record<string, unknown>;
    heavy: Record<string, unknown>;
  };
  const frameBoxes = sama.frameBoxes as Record<string, Record<string, unknown>[]>;
  const idleBoxes = frameBoxes.idle as Record<string, unknown>[];

  sama.assetId = 'missing-sprite';
  attacks.light.damage = -12;
  attacks.light.windows = [];
  attacks.heavy.windows = [
    {
      startFrame: 99,
      endFrame: -4,
      hitbox: { x: 280, y: 160, width: -80, height: -60 },
    },
  ];
  idleBoxes.unshift({
    frame: 99,
    hurt: [{ x: 10, y: 10, width: 20, height: 20 }],
    guard: [],
    collision: { x: 10, y: 10, width: 20, height: 20 },
  });
  idleBoxes[1] = {
    frame: 0,
    hurt: [{ x: 180, y: 160, width: -40, height: -60 }],
    guard: [],
    collision: { x: 200, y: 200, width: -80, height: -80 },
  };
  characterList.push(structuredClone(sama));

  const tuning = sources.tuning as Record<string, unknown>;
  const fighterTuning = (tuning.fighters as Record<string, unknown>[])[0] as Record<string, unknown>;
  fighterTuning.walkSpeed = 0;
  fighterTuning.jumpVelocity = Number.NaN;
  fighterTuning.gravity = -50;

  const stages = sources.stages as Record<string, unknown>;
  const stageList = stages.stages as Record<string, unknown>[];
  const stage = stageList[0] as Record<string, unknown>;
  stage.assetId = 'missing-stage';

  const mutableSources = sources as {
    input?: unknown;
    settings?: unknown;
  };
  mutableSources.input = {};
  mutableSources.settings = {
    defaultStageId: 'missing-stage',
    defaultPlayerId: 'sama',
    defaultCpuId: 'sama',
    roundsToWin: 0,
    roundTimeSeconds: 0,
    seed: Number.NaN,
  };

  return sources;
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
