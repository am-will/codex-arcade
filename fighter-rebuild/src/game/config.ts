import type {
  AnimationName,
  AssetManifest,
  AssetManifestAnimation,
  AssetManifestCharacter,
  AssetManifestStage,
  AttackProfile,
  AttackWindow,
  CharacterDefinition,
  CharacterId,
  FighterTuning,
  FrameBox,
  FrameBoxes,
  GameConfig,
  InputBindingConfig,
  MatchConfig,
  Rect,
  ResolvedFrameBoxes,
  SettingsConfig,
  StageDefinition,
  StageId,
} from './types';

export const CONFIG_PATHS = {
  manifest: '/assets/manifest.json',
  characters: '/configs/characters.json',
  tuning: '/configs/tuning.json',
  stages: '/configs/stages.json',
  input: '/configs/input.json',
  settings: '/configs/settings.json',
} as const;

type AttackId = 'light' | 'heavy' | 'special';
type JsonLoader = (path: string) => Promise<unknown>;
type WarningList = string[];

export type GameConfigSources = {
  readonly manifest: unknown;
  readonly characters?: unknown;
  readonly tuning?: unknown;
  readonly stages?: unknown;
  readonly input?: unknown;
  readonly settings?: unknown;
};

export const REQUIRED_ANIMATIONS = [
  'idle',
  'walk',
  'jump',
  'crouch',
  'block',
  'light',
  'heavy',
  'special',
  'knockdown',
] as const;

export const REQUIRED_ATTACKS = ['light', 'heavy', 'special'] as const;

const DEFAULT_TUNING: FighterTuning = {
  id: 'default',
  maxHealth: 100,
  walkSpeed: 128,
  jumpVelocity: 330,
  gravity: 820,
  groundFriction: 0.82,
  airControl: 0.45,
  meterMax: 100,
  meterStart: 0,
  pushboxWidth: 100,
  pushboxHeight: 160,
};

const DEFAULT_INPUT: InputBindingConfig = {
  left: 'KeyA',
  right: 'KeyD',
  jump: 'KeyW',
  crouch: 'KeyS',
  block: 'KeyE',
  light: 'KeyJ',
  heavy: 'KeyK',
  special: 'KeyL',
  pause: 'Enter',
};

const DEFAULT_ATTACKS: Record<AttackId, Omit<AttackProfile, 'id' | 'windows'>> = {
  light: {
    animation: 'light',
    damage: 6,
    blockDamage: 1,
    hitstunFrames: 12,
    blockstunFrames: 7,
    recoveryFrames: 10,
    meterGain: 6,
    knockbackX: 46,
    knockbackY: 0,
  },
  heavy: {
    animation: 'heavy',
    damage: 13,
    blockDamage: 3,
    hitstunFrames: 18,
    blockstunFrames: 11,
    recoveryFrames: 18,
    meterGain: 10,
    knockbackX: 82,
    knockbackY: -18,
  },
  special: {
    animation: 'special',
    damage: 20,
    blockDamage: 6,
    hitstunFrames: 24,
    blockstunFrames: 15,
    recoveryFrames: 24,
    meterGain: 0,
    knockbackX: 118,
    knockbackY: -36,
  },
};

export async function loadGameConfig(loadJson: JsonLoader = fetchJson): Promise<GameConfig> {
  const [manifest, characters, tuning, stages, input, settings] = await Promise.all([
    loadJson(CONFIG_PATHS.manifest),
    loadJson(CONFIG_PATHS.characters),
    loadJson(CONFIG_PATHS.tuning),
    loadJson(CONFIG_PATHS.stages),
    loadJson(CONFIG_PATHS.input),
    loadJson(CONFIG_PATHS.settings),
  ]);

  return normalizeGameConfig({
    manifest,
    characters,
    tuning,
    stages,
    input,
    settings,
  });
}

export function normalizeGameConfig(sources: GameConfigSources): GameConfig {
  const warnings: WarningList = [];
  const manifest = normalizeManifest(sources.manifest, warnings);
  const tuning = normalizeTuning(sources.tuning, warnings);
  const stages = normalizeStages(sources.stages, manifest, warnings);
  const stagesById = indexById(stages);
  const input = normalizeInput(sources.input, warnings);
  const characters = normalizeCharacters(sources.characters, manifest, tuning, warnings);
  const charactersById = indexById(characters);
  const settings = normalizeSettings(sources.settings, stages, characters, warnings);
  const match = createMatchConfig(settings, stagesById, charactersById, warnings);

  return {
    manifest,
    characters,
    charactersById,
    tuning,
    stages,
    stagesById,
    input,
    settings,
    match,
    warnings,
  };
}

export function resolveCharacterFrameBoxes(
  character: CharacterDefinition,
  animation: AnimationName,
  requestedFrame: number,
): ResolvedFrameBoxes {
  const animationBoxes = character.frameBoxes[animation] ?? character.frameBoxes.idle ?? [];
  const safeFrame = clampInt(requestedFrame, 0, Math.max(0, animationBoxes.length - 1), 0);
  const frameBox = animationBoxes.find((box) => box.frame === safeFrame) ?? animationBoxes[0] ?? fallbackFrameBox(0, 320, 320);

  return {
    animation,
    requestedFrame,
    frame: frameBox.frame,
    hurt: frameBox.hurt,
    guard: frameBox.guard,
    collision: frameBox.collision,
  };
}

export function resolveFrameBoxes(
  config: Pick<GameConfig, 'characters' | 'charactersById'>,
  characterId: CharacterId,
  animation: AnimationName,
  requestedFrame: number,
): ResolvedFrameBoxes {
  const character = config.charactersById[characterId] ?? config.characters[0];

  if (!character) {
    return {
      animation,
      requestedFrame,
      frame: 0,
      hurt: [{ x: 96, y: 60, width: 128, height: 220 }],
      guard: [],
      collision: { x: 106, y: 120, width: 108, height: 160 },
    };
  }

  return resolveCharacterFrameBoxes(character, animation, requestedFrame);
}

async function fetchJson(path: string): Promise<unknown> {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('No JSON loader was supplied and global fetch is unavailable.');
  }

  const response = await globalThis.fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function normalizeManifest(source: unknown, warnings: WarningList): AssetManifest {
  const sourceRecord = asRecord(source);
  const characters = uniqueRecords(sourceRecord?.characters, 'manifest character', warnings)
    .map((character) => normalizeManifestCharacter(character, warnings))
    .filter((character): character is AssetManifestCharacter => character !== null);
  const stages = uniqueRecords(sourceRecord?.stages, 'manifest stage', warnings)
    .map((stage) => normalizeManifestStage(stage, warnings))
    .filter((stage): stage is AssetManifestStage => stage !== null);

  if (characters.length === 0) {
    warnings.push('Manifest did not declare usable characters; inserted a fallback character contract.');
    characters.push(createFallbackManifestCharacter('sama'));
  }

  if (stages.length === 0) {
    warnings.push('Manifest did not declare usable stages; inserted a fallback stage contract.');
    stages.push(createFallbackManifestStage('byte-boardroom'));
  }

  return {
    schemaVersion: positiveInt(sourceRecord?.schemaVersion, 1),
    generatedAt: stringOr(sourceRecord?.generatedAt, new Date(0).toISOString()),
    title: stringOr(sourceRecord?.title, 'Mortal Codex'),
    style: stringOr(sourceRecord?.style, 'Generated original fighter assets.'),
    characters,
    stages,
    hud: Array.isArray(sourceRecord?.hud) ? (sourceRecord.hud as AssetManifest['hud']) : [],
    vfx: Array.isArray(sourceRecord?.vfx) ? (sourceRecord.vfx as AssetManifest['vfx']) : [],
    audio: Array.isArray(sourceRecord?.audio) ? (sourceRecord.audio as AssetManifest['audio']) : [],
  };
}

function normalizeManifestCharacter(source: Record<string, unknown>, warnings: WarningList): AssetManifestCharacter | null {
  const id = nonEmptyString(source.id);

  if (!id) {
    warnings.push('Skipped manifest character without an id.');
    return null;
  }

  const portraitRecord = asRecord(source.portrait);
  const animations = uniqueRecords(source.animations, `manifest character ${id} animation`, warnings)
    .map((animation) => normalizeManifestAnimation(animation, warnings))
    .filter((animation): animation is AssetManifestAnimation => animation !== null);

  for (const requiredAnimation of REQUIRED_ANIMATIONS) {
    if (!animations.some((animation) => animation.name === requiredAnimation)) {
      warnings.push(`Manifest character ${id} is missing ${requiredAnimation}; inserted a fallback animation contract.`);
      animations.push(createFallbackManifestAnimation(id, requiredAnimation));
    }
  }

  return {
    id,
    displayName: stringOr(source.displayName, id),
    description: typeof source.description === 'string' ? source.description : undefined,
    visualCue: typeof source.visualCue === 'string' ? source.visualCue : undefined,
    portrait: {
      key: stringOr(portraitRecord?.key, `${id}-portrait`),
      path: stringOr(portraitRecord?.path, `/assets/characters/${id}/portrait.png`),
      width: positiveInt(portraitRecord?.width, 192),
      height: positiveInt(portraitRecord?.height, 192),
    },
    animations,
  };
}

function normalizeManifestAnimation(source: Record<string, unknown>, warnings: WarningList): AssetManifestAnimation | null {
  const name = nonEmptyString(source.name);
  const key = nonEmptyString(source.key);

  if (!name || !key) {
    warnings.push('Skipped manifest animation without a name/key pair.');
    return null;
  }

  return {
    name,
    key,
    path: stringOr(source.path, ''),
    frameWidth: positiveInt(source.frameWidth, 320),
    frameHeight: positiveInt(source.frameHeight, 320),
    frameCount: positiveInt(source.frameCount, 1),
    columns: positiveInt(source.columns, positiveInt(source.frameCount, 1)),
    rows: positiveInt(source.rows, 1),
    fps: positiveInt(source.fps, 8),
    loop: Boolean(source.loop),
  };
}

function normalizeManifestStage(source: Record<string, unknown>, warnings: WarningList): AssetManifestStage | null {
  const id = nonEmptyString(source.id);

  if (!id) {
    warnings.push('Skipped manifest stage without an id.');
    return null;
  }

  const spawn = asRecord(source.spawn);
  const layers = uniqueRecords(source.layers, `manifest stage ${id} layer`, warnings).map((layer) => ({
    id: stringOr(layer.id, 'layer'),
    key: stringOr(layer.key, `${id}-layer`),
    path: stringOr(layer.path, ''),
    parallax: finiteNumber(layer.parallax, 1),
    width: positiveInt(layer.width, positiveInt(source.width, 640)),
    height: positiveInt(layer.height, positiveInt(source.height, 360)),
  }));

  return {
    id,
    displayName: stringOr(source.displayName, id),
    width: positiveInt(source.width, 640),
    height: positiveInt(source.height, 360),
    floorY: finiteNumber(source.floorY, 220),
    spawn: {
      playerX: finiteNumber(spawn?.playerX, 220),
      cpuX: finiteNumber(spawn?.cpuX, 420),
    },
    layers,
  };
}

function normalizeTuning(source: unknown, warnings: WarningList): Readonly<Record<string, FighterTuning>> {
  const sourceRecord = asRecord(source);
  const defaultTuning = normalizeTuningEntry(asRecord(sourceRecord?.defaults) ?? {}, DEFAULT_TUNING.id, DEFAULT_TUNING, warnings);
  const entries: Record<string, FighterTuning> = {};

  for (const rawTuning of uniqueRecords(sourceRecord?.fighters, 'fighter tuning', warnings)) {
    const id = nonEmptyString(rawTuning.id);

    if (!id) {
      warnings.push('Skipped fighter tuning without an id.');
      continue;
    }

    entries[id] = normalizeTuningEntry(rawTuning, id, defaultTuning, warnings);
  }

  if (Object.keys(entries).length === 0) {
    warnings.push('No usable fighter tuning entries found; inserted default tuning.');
    entries[defaultTuning.id] = defaultTuning;
  }

  return entries;
}

function normalizeTuningEntry(
  source: Record<string, unknown>,
  id: string,
  fallback: FighterTuning,
  warnings: WarningList,
): FighterTuning {
  return {
    id,
    maxHealth: positiveNumberWithWarning(source.maxHealth, fallback.maxHealth, `${id}.maxHealth`, warnings),
    walkSpeed: positiveNumberWithWarning(source.walkSpeed, fallback.walkSpeed, `${id}.walkSpeed`, warnings),
    jumpVelocity: positiveNumberWithWarning(source.jumpVelocity, fallback.jumpVelocity, `${id}.jumpVelocity`, warnings),
    gravity: positiveNumberWithWarning(source.gravity, fallback.gravity, `${id}.gravity`, warnings),
    groundFriction: clampedNumber(source.groundFriction, 0.01, 1, fallback.groundFriction, `${id}.groundFriction`, warnings),
    airControl: clampedNumber(source.airControl, 0, 1, fallback.airControl, `${id}.airControl`, warnings),
    meterMax: positiveNumberWithWarning(source.meterMax, fallback.meterMax, `${id}.meterMax`, warnings),
    meterStart: clampedNumber(source.meterStart, 0, positiveNumber(source.meterMax, fallback.meterMax), fallback.meterStart, `${id}.meterStart`, warnings),
    pushboxWidth: positiveNumberWithWarning(source.pushboxWidth, fallback.pushboxWidth, `${id}.pushboxWidth`, warnings),
    pushboxHeight: positiveNumberWithWarning(source.pushboxHeight, fallback.pushboxHeight, `${id}.pushboxHeight`, warnings),
  };
}

function normalizeStages(source: unknown, manifest: AssetManifest, warnings: WarningList): readonly StageDefinition[] {
  const sourceRecord = asRecord(source);
  const manifestStages = new Map(manifest.stages.map((stage) => [stage.id, stage]));
  const stages: StageDefinition[] = [];
  const seenIds = new Set<string>();

  for (const rawStage of arrayRecords(sourceRecord?.stages)) {
    const id = nonEmptyString(rawStage.id);

    if (!id) {
      warnings.push('Skipped stage config without an id.');
      continue;
    }

    if (seenIds.has(id)) {
      warnings.push(`Skipped duplicate stage id "${id}".`);
      continue;
    }

    const manifestStage = manifestStages.get(nonEmptyString(rawStage.assetId) ?? id) ?? manifestStages.get(id);

    if (!manifestStage) {
      warnings.push(`Stage "${id}" does not match a manifest stage and was skipped.`);
      continue;
    }

    seenIds.add(id);
    stages.push({
      id,
      displayName: stringOr(rawStage.displayName, manifestStage.displayName),
      assetId: manifestStage.id,
      width: positiveInt(rawStage.width, manifestStage.width),
      height: positiveInt(rawStage.height, manifestStage.height),
      floorY: finiteNumber(rawStage.floorY, manifestStage.floorY),
      playerSpawnX: finiteNumber(rawStage.playerSpawnX, manifestStage.spawn.playerX),
      cpuSpawnX: finiteNumber(rawStage.cpuSpawnX, manifestStage.spawn.cpuX),
      layers: manifestStage.layers.map((layer) => ({
        id: layer.id,
        assetKey: layer.key,
        parallax: finiteNumber(
          arrayRecords(rawStage.layers).find((rawLayer) => rawLayer.id === layer.id)?.parallax,
          layer.parallax,
        ),
      })),
    });
  }

  if (stages.length === 0) {
    warnings.push('No usable stage config found; synthesized stages from the asset manifest.');
    return manifest.stages.map((stage) => stageFromManifest(stage));
  }

  return stages;
}

function normalizeInput(source: unknown, warnings: WarningList): InputBindingConfig {
  const keyboard = asRecord(asRecord(source)?.keyboard) ?? {};

  return {
    left: inputCode(keyboard.left, DEFAULT_INPUT.left, 'left', warnings),
    right: inputCode(keyboard.right, DEFAULT_INPUT.right, 'right', warnings),
    jump: inputCode(keyboard.jump, DEFAULT_INPUT.jump, 'jump', warnings),
    crouch: inputCode(keyboard.crouch, DEFAULT_INPUT.crouch, 'crouch', warnings),
    block: inputCode(keyboard.block, DEFAULT_INPUT.block, 'block', warnings),
    light: inputCode(keyboard.light, DEFAULT_INPUT.light, 'light', warnings),
    heavy: inputCode(keyboard.heavy, DEFAULT_INPUT.heavy, 'heavy', warnings),
    special: inputCode(keyboard.special, DEFAULT_INPUT.special, 'special', warnings),
    pause: inputCode(keyboard.pause, DEFAULT_INPUT.pause, 'pause', warnings),
  };
}

function normalizeCharacters(
  source: unknown,
  manifest: AssetManifest,
  tuning: Readonly<Record<string, FighterTuning>>,
  warnings: WarningList,
): readonly CharacterDefinition[] {
  const sourceRecord = asRecord(source);
  const manifestCharacters = new Map(manifest.characters.map((character) => [character.id, character]));
  const firstManifestCharacter = manifest.characters[0] ?? createFallbackManifestCharacter('sama');
  const firstTuningId = Object.keys(tuning)[0] ?? DEFAULT_TUNING.id;
  const characters: CharacterDefinition[] = [];
  const seenIds = new Set<string>();

  for (const rawCharacter of arrayRecords(sourceRecord?.characters)) {
    const rawId = nonEmptyString(rawCharacter.id);

    if (!rawId) {
      warnings.push('Skipped character config without an id.');
      continue;
    }

    if (seenIds.has(rawId)) {
      warnings.push(`Skipped duplicate character id "${rawId}".`);
      continue;
    }

    const manifestCharacter =
      manifestCharacters.get(nonEmptyString(rawCharacter.assetId) ?? '') ??
      manifestCharacters.get(rawId) ??
      firstManifestCharacter;

    if (manifestCharacter.id !== rawCharacter.assetId && rawCharacter.assetId !== undefined) {
      warnings.push(`Character "${rawId}" references missing asset "${String(rawCharacter.assetId)}"; using "${manifestCharacter.id}".`);
    }

    const tuningId = nonEmptyString(rawCharacter.tuningId);
    const resolvedTuningId = tuningId && tuning[tuningId] ? tuningId : firstTuningId;

    if (tuningId && resolvedTuningId !== tuningId) {
      warnings.push(`Character "${rawId}" references missing tuning "${tuningId}"; using "${resolvedTuningId}".`);
    }

    seenIds.add(rawId);
    characters.push({
      id: rawId,
      displayName: stringOr(rawCharacter.displayName, manifestCharacter.displayName),
      assetId: manifestCharacter.id,
      portraitKey: manifestCharacter.portrait.key,
      tuningId: resolvedTuningId,
      attacks: normalizeAttacks(asRecord(rawCharacter.attacks), manifestCharacter, rawId, warnings),
      frameBoxes: normalizeFrameBoxes(asRecord(rawCharacter.frameBoxes), manifestCharacter, warnings),
    });
  }

  if (characters.length === 0) {
    warnings.push('No usable character config found; synthesized characters from the asset manifest.');
    return manifest.characters.map((manifestCharacter) => ({
      id: manifestCharacter.id,
      displayName: manifestCharacter.displayName,
      assetId: manifestCharacter.id,
      portraitKey: manifestCharacter.portrait.key,
      tuningId: firstTuningId,
      attacks: normalizeAttacks(undefined, manifestCharacter, manifestCharacter.id, warnings),
      frameBoxes: normalizeFrameBoxes(undefined, manifestCharacter, warnings),
    }));
  }

  return characters;
}

function normalizeAttacks(
  source: Record<string, unknown> | undefined,
  manifestCharacter: AssetManifestCharacter,
  characterId: string,
  warnings: WarningList,
): CharacterDefinition['attacks'] {
  const attacks = {} as Record<AttackId, AttackProfile>;

  for (const attackId of REQUIRED_ATTACKS) {
    const rawAttack = asRecord(source?.[attackId]);
    const defaultAttack = DEFAULT_ATTACKS[attackId];
    const animation = manifestCharacter.animations.find((candidate) => candidate.name === defaultAttack.animation);
    const frameCount = animation?.frameCount ?? 1;
    const windows = normalizeAttackWindows(rawAttack?.windows, defaultWindowsForAttack(attackId, frameCount), frameCount, `${characterId}.${attackId}`, warnings);

    attacks[attackId] = {
      id: stringOr(rawAttack?.id, `${characterId}-${attackId}`),
      animation: animation?.name ?? defaultAttack.animation,
      damage: positiveNumberWithWarning(rawAttack?.damage, defaultAttack.damage, `${characterId}.${attackId}.damage`, warnings, 0),
      blockDamage: positiveNumberWithWarning(rawAttack?.blockDamage, defaultAttack.blockDamage, `${characterId}.${attackId}.blockDamage`, warnings, 0),
      hitstunFrames: positiveIntWithWarning(rawAttack?.hitstunFrames, defaultAttack.hitstunFrames, `${characterId}.${attackId}.hitstunFrames`, warnings),
      blockstunFrames: positiveIntWithWarning(rawAttack?.blockstunFrames, defaultAttack.blockstunFrames, `${characterId}.${attackId}.blockstunFrames`, warnings),
      recoveryFrames: positiveIntWithWarning(rawAttack?.recoveryFrames, defaultAttack.recoveryFrames, `${characterId}.${attackId}.recoveryFrames`, warnings),
      meterGain: clampedNumber(rawAttack?.meterGain, 0, 100, defaultAttack.meterGain, `${characterId}.${attackId}.meterGain`, warnings),
      knockbackX: finiteNumber(rawAttack?.knockbackX, defaultAttack.knockbackX),
      knockbackY: finiteNumber(rawAttack?.knockbackY, defaultAttack.knockbackY),
      windows,
    };
  }

  return attacks;
}

function normalizeAttackWindows(
  source: unknown,
  fallback: readonly AttackWindow[],
  frameCount: number,
  label: string,
  warnings: WarningList,
): readonly AttackWindow[] {
  const windows: AttackWindow[] = [];

  for (const rawWindow of arrayRecords(source)) {
    const rawStart = finiteNumber(rawWindow.startFrame, Number.NaN);
    const rawEnd = finiteNumber(rawWindow.endFrame, Number.NaN);

    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
      warnings.push(`Skipped ${label} attack window with invalid frame bounds.`);
      continue;
    }

    const lower = Math.min(rawStart, rawEnd);
    const upper = Math.max(rawStart, rawEnd);

    if (lower !== rawStart || upper !== rawEnd) {
      warnings.push(`Reordered inverted ${label} attack window frame bounds.`);
    }

    windows.push({
      startFrame: clampInt(lower, 0, frameCount - 1, 0),
      endFrame: clampInt(upper, 0, frameCount - 1, 0),
      hitbox: normalizeRect(rawWindow.hitbox, fallback[0]?.hitbox ?? defaultAttackHitbox(), 320, 320, `${label}.hitbox`, warnings),
    });
  }

  if (windows.length === 0) {
    warnings.push(`${label} attack windows were empty or invalid; using fallback windows.`);
    return fallback;
  }

  return windows;
}

function normalizeFrameBoxes(
  source: Record<string, unknown> | undefined,
  manifestCharacter: AssetManifestCharacter,
  warnings: WarningList,
): FrameBoxes {
  const frameBoxes: Record<string, readonly FrameBox[]> = {};

  for (const manifestAnimation of manifestCharacter.animations) {
    const rawBoxes = arrayRecords(source?.[manifestAnimation.name]);
    frameBoxes[manifestAnimation.name] = normalizeAnimationFrameBoxes(rawBoxes, manifestAnimation, warnings);
  }

  return frameBoxes;
}

function normalizeAnimationFrameBoxes(
  rawBoxes: readonly Record<string, unknown>[],
  animation: AssetManifestAnimation,
  warnings: WarningList,
): readonly FrameBox[] {
  const boxesByFrame = new Map<number, Record<string, unknown>>();

  for (const rawBox of rawBoxes) {
    const rawFrame = finiteNumber(rawBox.frame, Number.NaN);

    if (!Number.isInteger(rawFrame) || rawFrame < 0 || rawFrame >= animation.frameCount) {
      warnings.push(`Skipped ${animation.name} frame box with invalid frame index "${String(rawBox.frame)}".`);
      continue;
    }

    if (boxesByFrame.has(rawFrame)) {
      warnings.push(`Ignored duplicate ${animation.name} frame box for frame ${rawFrame}.`);
      continue;
    }

    boxesByFrame.set(rawFrame, rawBox);
  }

  const normalized: FrameBox[] = [];

  for (let frame = 0; frame < animation.frameCount; frame += 1) {
    const fallback = fallbackFrameBox(frame, animation.frameWidth, animation.frameHeight);
    const rawBox = boxesByFrame.get(frame);

    if (!rawBox) {
      warnings.push(`Missing ${animation.name} frame box for frame ${frame}; using fallback box.`);
      normalized.push(fallback);
      continue;
    }

    const hurt = normalizeRects(rawBox.hurt, fallback.hurt, animation.frameWidth, animation.frameHeight, `${animation.name}.${frame}.hurt`, warnings);
    const guard = normalizeRects(rawBox.guard, fallback.guard, animation.frameWidth, animation.frameHeight, `${animation.name}.${frame}.guard`, warnings);

    normalized.push({
      frame,
      hurt,
      guard,
      collision: normalizeRect(rawBox.collision, fallback.collision, animation.frameWidth, animation.frameHeight, `${animation.name}.${frame}.collision`, warnings),
    });
  }

  return normalized;
}

function normalizeSettings(
  source: unknown,
  stages: readonly StageDefinition[],
  characters: readonly CharacterDefinition[],
  warnings: WarningList,
): SettingsConfig {
  const sourceRecord = asRecord(source) ?? {};
  const firstStageId = stages[0]?.id ?? 'byte-boardroom';
  const firstCharacterId = characters[0]?.id ?? 'sama';
  const secondCharacterId = characters[1]?.id ?? firstCharacterId;
  const rawPlayerId = stringOr(sourceRecord.defaultPlayerId, firstCharacterId);
  const playerId = characters.some((character) => character.id === rawPlayerId) ? rawPlayerId : firstCharacterId;
  const rawCpuId = stringOr(sourceRecord.defaultCpuId, secondCharacterId);
  const cpuId = characters.some((character) => character.id === rawCpuId) && rawCpuId !== playerId ? rawCpuId : secondCharacterId;
  const rawStageId = stringOr(sourceRecord.defaultStageId, firstStageId);
  const defaultStageId = stages.some((stage) => stage.id === rawStageId) ? rawStageId : firstStageId;
  const cpuDifficulty = sourceRecord.cpuDifficulty === 'easy' || sourceRecord.cpuDifficulty === 'hard' ? sourceRecord.cpuDifficulty : 'normal';

  if (defaultStageId !== rawStageId) {
    warnings.push(`Default stage "${rawStageId}" is invalid; using "${defaultStageId}".`);
  }

  if (playerId !== rawPlayerId) {
    warnings.push(`Default player "${rawPlayerId}" is invalid; using "${playerId}".`);
  }

  if (cpuId !== rawCpuId) {
    warnings.push(`Default CPU "${rawCpuId}" is invalid or duplicates the player; using "${cpuId}".`);
  }

  return {
    defaultStageId,
    defaultPlayerId: playerId,
    defaultCpuId: cpuId,
    roundsToWin: rangedIntWithWarning(sourceRecord.roundsToWin, 1, 5, 2, 'roundsToWin', warnings),
    roundTimeSeconds: rangedIntWithWarning(sourceRecord.roundTimeSeconds, 15, 300, 60, 'roundTimeSeconds', warnings),
    cpuDifficulty,
    seed: rangedIntWithWarning(sourceRecord.seed, 1, 2147483647, 6102026, 'seed', warnings),
    debugEnabled: typeof sourceRecord.debugEnabled === 'boolean' ? sourceRecord.debugEnabled : false,
  };
}

function createMatchConfig(
  settings: SettingsConfig,
  stagesById: Readonly<Record<StageId, StageDefinition>>,
  charactersById: Readonly<Record<CharacterId, CharacterDefinition>>,
  warnings: WarningList,
): MatchConfig {
  const stageId = stagesById[settings.defaultStageId] ? settings.defaultStageId : Object.keys(stagesById)[0] ?? 'byte-boardroom';
  const playerCharacterId = charactersById[settings.defaultPlayerId] ? settings.defaultPlayerId : Object.keys(charactersById)[0] ?? 'sama';
  const cpuCharacterId = charactersById[settings.defaultCpuId]
    ? settings.defaultCpuId
    : Object.keys(charactersById).find((id) => id !== playerCharacterId) ?? playerCharacterId;

  if (stageId !== settings.defaultStageId) {
    warnings.push(`Match stage fell back to "${stageId}".`);
  }

  return {
    stageId,
    playerCharacterId,
    cpuCharacterId,
    roundsToWin: settings.roundsToWin,
    roundTimeSeconds: settings.roundTimeSeconds,
    seed: settings.seed,
  };
}

function defaultWindowsForAttack(attackId: AttackId, frameCount: number): readonly AttackWindow[] {
  if (attackId === 'special') {
    return [
      { startFrame: clampInt(1, 0, frameCount - 1, 0), endFrame: clampInt(1, 0, frameCount - 1, 0), hitbox: { x: 190, y: 92, width: 88, height: 76 } },
      { startFrame: clampInt(2, 0, frameCount - 1, 0), endFrame: clampInt(3, 0, frameCount - 1, 0), hitbox: { x: 204, y: 108, width: 94, height: 66 } },
      { startFrame: clampInt(4, 0, frameCount - 1, 0), endFrame: clampInt(5, 0, frameCount - 1, 0), hitbox: { x: 194, y: 72, width: 114, height: 90 } },
    ];
  }

  if (attackId === 'heavy') {
    return [{ startFrame: clampInt(2, 0, frameCount - 1, 0), endFrame: clampInt(3, 0, frameCount - 1, 0), hitbox: { x: 196, y: 90, width: 110, height: 82 } }];
  }

  return [{ startFrame: clampInt(1, 0, frameCount - 1, 0), endFrame: clampInt(2, 0, frameCount - 1, 0), hitbox: defaultAttackHitbox() }];
}

function defaultAttackHitbox(): Rect {
  return { x: 200, y: 114, width: 90, height: 58 };
}

function fallbackFrameBox(frame: number, frameWidth: number, frameHeight: number): FrameBox {
  const width = Math.max(1, Math.round(frameWidth * 0.36));
  const height = Math.max(1, Math.round(frameHeight * 0.68));
  const x = Math.round((frameWidth - width) / 2);
  const y = Math.max(0, frameHeight - height - Math.round(frameHeight * 0.12));

  return {
    frame,
    hurt: [{ x, y, width, height }],
    guard: [],
    collision: {
      x: x + Math.round(width * 0.08),
      y: y + Math.round(height * 0.28),
      width: Math.max(1, Math.round(width * 0.84)),
      height: Math.max(1, Math.round(height * 0.72)),
    },
  };
}

function normalizeRects(
  source: unknown,
  fallback: readonly Rect[],
  maxWidth: number,
  maxHeight: number,
  label: string,
  warnings: WarningList,
): readonly Rect[] {
  const rects = arrayRecords(source)
    .map((rect, index) => normalizeRect(rect, undefined, maxWidth, maxHeight, `${label}.${index}`, warnings))
    .filter((rect): rect is Rect => rect !== null);

  if (rects.length === 0) {
    return fallback;
  }

  return rects;
}

function normalizeRect(
  source: unknown,
  fallback: Rect | undefined,
  maxWidth: number,
  maxHeight: number,
  label: string,
  warnings: WarningList,
): Rect;
function normalizeRect(
  source: unknown,
  fallback: undefined,
  maxWidth: number,
  maxHeight: number,
  label: string,
  warnings: WarningList,
): Rect | null;
function normalizeRect(
  source: unknown,
  fallback: Rect | undefined,
  maxWidth: number,
  maxHeight: number,
  label: string,
  warnings: WarningList,
): Rect | null {
  const sourceRecord = asRecord(source);

  if (!sourceRecord) {
    if (!fallback) {
      warnings.push(`Skipped missing ${label} rectangle.`);
      return null;
    }

    warnings.push(`Missing ${label} rectangle; using fallback.`);
    return fallback;
  }

  const rawX = finiteNumber(sourceRecord.x, Number.NaN);
  const rawY = finiteNumber(sourceRecord.y, Number.NaN);
  const rawWidth = finiteNumber(sourceRecord.width, Number.NaN);
  const rawHeight = finiteNumber(sourceRecord.height, Number.NaN);

  if (![rawX, rawY, rawWidth, rawHeight].every(Number.isFinite)) {
    if (!fallback) {
      warnings.push(`Skipped invalid ${label} rectangle.`);
      return null;
    }

    warnings.push(`Invalid ${label} rectangle; using fallback.`);
    return fallback;
  }

  let x = rawX;
  let y = rawY;
  let width = rawWidth;
  let height = rawHeight;

  if (width < 0) {
    x += width;
    width = Math.abs(width);
    warnings.push(`Normalized inverted ${label} rectangle width.`);
  }

  if (height < 0) {
    y += height;
    height = Math.abs(height);
    warnings.push(`Normalized inverted ${label} rectangle height.`);
  }

  if (width <= 0 || height <= 0) {
    if (!fallback) {
      warnings.push(`Skipped empty ${label} rectangle.`);
      return null;
    }

    warnings.push(`Empty ${label} rectangle; using fallback.`);
    return fallback;
  }

  const clampedX = clampNumber(x, 0, maxWidth - 1);
  const clampedY = clampNumber(y, 0, maxHeight - 1);
  const clampedWidth = clampNumber(width, 1, maxWidth - clampedX);
  const clampedHeight = clampNumber(height, 1, maxHeight - clampedY);

  return {
    x: Math.round(clampedX),
    y: Math.round(clampedY),
    width: Math.round(clampedWidth),
    height: Math.round(clampedHeight),
  };
}

function stageFromManifest(stage: AssetManifestStage): StageDefinition {
  return {
    id: stage.id,
    displayName: stage.displayName,
    assetId: stage.id,
    width: stage.width,
    height: stage.height,
    floorY: stage.floorY,
    playerSpawnX: stage.spawn.playerX,
    cpuSpawnX: stage.spawn.cpuX,
    layers: stage.layers.map((layer) => ({
      id: layer.id,
      assetKey: layer.key,
      parallax: layer.parallax,
    })),
  };
}

function createFallbackManifestCharacter(id: string): AssetManifestCharacter {
  return {
    id,
    displayName: id,
    portrait: { key: `${id}-portrait`, path: `/assets/characters/${id}/portrait.png`, width: 192, height: 192 },
    animations: REQUIRED_ANIMATIONS.map((animation) => createFallbackManifestAnimation(id, animation)),
  };
}

function createFallbackManifestAnimation(characterId: string, animation: AnimationName): AssetManifestAnimation {
  return {
    name: animation,
    key: `${characterId}-${animation}`,
    path: `/assets/characters/${characterId}/${animation}.png`,
    frameWidth: 320,
    frameHeight: 320,
    frameCount: animation === 'walk' || animation === 'special' ? 6 : animation === 'heavy' || animation === 'knockdown' ? 5 : animation === 'block' ? 3 : 4,
    columns: animation === 'walk' || animation === 'special' ? 6 : animation === 'heavy' || animation === 'knockdown' ? 5 : animation === 'block' ? 3 : 4,
    rows: 1,
    fps: 8,
    loop: animation === 'idle' || animation === 'walk',
  };
}

function createFallbackManifestStage(id: string): AssetManifestStage {
  return {
    id,
    displayName: 'Byte Boardroom',
    width: 640,
    height: 360,
    floorY: 220,
    spawn: { playerX: 220, cpuX: 420 },
    layers: [],
  };
}

function uniqueRecords(source: unknown, label: string, warnings: WarningList): Record<string, unknown>[] {
  const seen = new Set<string>();
  const records: Record<string, unknown>[] = [];

  for (const record of arrayRecords(source)) {
    const id = nonEmptyString(record.id) ?? nonEmptyString(record.name) ?? nonEmptyString(record.key);

    if (id && seen.has(id)) {
      warnings.push(`Skipped duplicate ${label} id "${id}".`);
      continue;
    }

    if (id) {
      seen.add(id);
    }

    records.push(record);
  }

  return records;
}

function arrayRecords(source: unknown): Record<string, unknown>[] {
  return Array.isArray(source) ? source.filter(isRecord) : [];
}

function indexById<T extends { readonly id: string }>(items: readonly T[]): Readonly<Record<string, T>> {
  const indexed: Record<string, T> = {};

  for (const item of items) {
    indexed[item.id] = item;
  }

  return indexed;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function stringOr(value: unknown, fallback: string): string {
  return nonEmptyString(value) ?? fallback;
}

function inputCode(value: unknown, fallback: string, label: string, warnings: WarningList): string {
  const code = nonEmptyString(value);

  if (!code) {
    warnings.push(`Input binding "${label}" was missing; using "${fallback}".`);
    return fallback;
  }

  return code;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function positiveNumber(value: unknown, fallback: number): number {
  const numberValue = finiteNumber(value, Number.NaN);
  return numberValue > 0 ? numberValue : fallback;
}

function positiveNumberWithWarning(
  value: unknown,
  fallback: number,
  label: string,
  warnings: WarningList,
  minExclusive = 0,
): number {
  const numberValue = finiteNumber(value, Number.NaN);

  if (numberValue > minExclusive) {
    return numberValue;
  }

  warnings.push(`${label} was not greater than ${minExclusive}; using ${fallback}.`);
  return fallback;
}

function positiveInt(value: unknown, fallback: number): number {
  const numberValue = finiteNumber(value, Number.NaN);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function positiveIntWithWarning(value: unknown, fallback: number, label: string, warnings: WarningList): number {
  const numberValue = finiteNumber(value, Number.NaN);

  if (Number.isInteger(numberValue) && numberValue > 0) {
    return numberValue;
  }

  warnings.push(`${label} was not a positive integer; using ${fallback}.`);
  return fallback;
}

function clampedNumber(value: unknown, min: number, max: number, fallback: number, label: string, warnings: WarningList): number {
  const numberValue = finiteNumber(value, Number.NaN);

  if (!Number.isFinite(numberValue)) {
    warnings.push(`${label} was not finite; using ${fallback}.`);
    return fallback;
  }

  return clampNumber(numberValue, min, max);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numberValue = finiteNumber(value, Number.NaN);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.round(clampNumber(numberValue, min, Math.max(min, max)));
}

function rangedIntWithWarning(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
  label: string,
  warnings: WarningList,
): number {
  const numberValue = finiteNumber(value, Number.NaN);

  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    warnings.push(`${label} was outside ${min}-${max}; using ${fallback}.`);
    return fallback;
  }

  return numberValue;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
