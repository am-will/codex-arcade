export type SceneKey =
  | 'Boot'
  | 'MainMenu'
  | 'StageSelect'
  | 'CharacterSelect'
  | 'Settings'
  | 'CharacterGym'
  | 'FighterPlayground'
  | 'Match'
  | 'Placeholder';

export type CharacterId = string;
export type StageId = string;
export type AssetKey = string;
export type AnimationName =
  | 'idle'
  | 'walk'
  | 'jump'
  | 'crouch'
  | 'block'
  | 'light'
  | 'heavy'
  | 'special'
  | 'knockdown'
  | string;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameBox {
  readonly frame: number;
  readonly hurt: readonly Rect[];
  readonly guard: readonly Rect[];
  readonly collision: Rect;
}

export type FrameBoxes = Readonly<Record<AnimationName, readonly FrameBox[]>>;

export interface ResolvedFrameBoxes {
  readonly animation: AnimationName;
  readonly requestedFrame: number;
  readonly frame: number;
  readonly hurt: readonly Rect[];
  readonly guard: readonly Rect[];
  readonly collision: Rect;
}

export interface AttackWindow {
  readonly startFrame: number;
  readonly endFrame: number;
  readonly hitbox: Rect;
}

export interface AttackProfile {
  readonly id: string;
  readonly animation: AnimationName;
  readonly damage: number;
  readonly blockDamage: number;
  readonly hitstunFrames: number;
  readonly blockstunFrames: number;
  readonly recoveryFrames: number;
  readonly meterGain: number;
  readonly knockbackX: number;
  readonly knockbackY: number;
  readonly windows: readonly AttackWindow[];
}

export interface FighterTuning {
  readonly id: string;
  readonly maxHealth: number;
  readonly walkSpeed: number;
  readonly jumpVelocity: number;
  readonly gravity: number;
  readonly groundFriction: number;
  readonly airControl: number;
  readonly meterMax: number;
  readonly meterStart: number;
  readonly pushboxWidth: number;
  readonly pushboxHeight: number;
}

export interface CharacterDefinition {
  readonly id: CharacterId;
  readonly displayName: string;
  readonly assetId: CharacterId;
  readonly portraitKey: AssetKey;
  readonly tuningId: string;
  readonly attacks: Readonly<Record<'light' | 'heavy' | 'special', AttackProfile>>;
  readonly frameBoxes: FrameBoxes;
}

export interface StageLayerConfig {
  readonly id: string;
  readonly assetKey: AssetKey;
  readonly parallax: number;
}

export interface StageDefinition {
  readonly id: StageId;
  readonly displayName: string;
  readonly assetId: StageId;
  readonly width: number;
  readonly height: number;
  readonly floorY: number;
  readonly playerSpawnX: number;
  readonly cpuSpawnX: number;
  readonly layers: readonly StageLayerConfig[];
}

export interface InputBindingConfig {
  readonly left: string;
  readonly right: string;
  readonly jump: string;
  readonly crouch: string;
  readonly block: string;
  readonly light: string;
  readonly heavy: string;
  readonly special: string;
  readonly pause: string;
}

export interface SettingsConfig {
  readonly defaultStageId: StageId;
  readonly defaultPlayerId: CharacterId;
  readonly defaultCpuId: CharacterId;
  readonly roundsToWin: number;
  readonly roundTimeSeconds: number;
  readonly cpuDifficulty: 'easy' | 'normal' | 'hard';
  readonly seed: number;
  readonly debugEnabled: boolean;
}

export interface MatchConfig {
  readonly stageId: StageId;
  readonly playerCharacterId: CharacterId;
  readonly cpuCharacterId: CharacterId;
  readonly roundsToWin: number;
  readonly roundTimeSeconds: number;
  readonly seed: number;
}

export interface AssetManifestAnimation {
  readonly name: AnimationName;
  readonly key: AssetKey;
  readonly path: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frameCount: number;
  readonly columns: number;
  readonly rows: number;
  readonly fps: number;
  readonly loop: boolean;
}

export interface AssetManifestCharacter {
  readonly id: CharacterId;
  readonly displayName: string;
  readonly description?: string;
  readonly visualCue?: string;
  readonly portrait: {
    readonly key: AssetKey;
    readonly path: string;
    readonly width: number;
    readonly height: number;
  };
  readonly animations: readonly AssetManifestAnimation[];
}

export interface AssetManifestStageLayer {
  readonly id: string;
  readonly key: AssetKey;
  readonly path: string;
  readonly parallax: number;
  readonly width: number;
  readonly height: number;
}

export interface AssetManifestStage {
  readonly id: StageId;
  readonly displayName: string;
  readonly width: number;
  readonly height: number;
  readonly floorY: number;
  readonly spawn: {
    readonly playerX: number;
    readonly cpuX: number;
  };
  readonly layers: readonly AssetManifestStageLayer[];
}

export interface AssetManifestImage {
  readonly key: AssetKey;
  readonly path: string;
  readonly width: number;
  readonly height: number;
}

export interface AssetManifestVfx {
  readonly key: AssetKey;
  readonly path: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frameCount: number;
  readonly columns: number;
  readonly rows: number;
  readonly animationName: string;
  readonly fps: number;
  readonly loop: boolean;
}

export interface AssetManifestAudio {
  readonly key: AssetKey;
  readonly path: string;
  readonly type: 'sfx' | string;
  readonly format: string;
  readonly durationMs: number;
}

export interface AssetManifest {
  readonly schemaVersion: number;
  readonly generatedAt: string;
  readonly title: string;
  readonly style: string;
  readonly characters: readonly AssetManifestCharacter[];
  readonly stages: readonly AssetManifestStage[];
  readonly hud: readonly AssetManifestImage[];
  readonly vfx: readonly AssetManifestVfx[];
  readonly audio: readonly AssetManifestAudio[];
}

export interface GameConfig {
  readonly manifest: AssetManifest;
  readonly characters: readonly CharacterDefinition[];
  readonly charactersById: Readonly<Record<CharacterId, CharacterDefinition>>;
  readonly tuning: Readonly<Record<string, FighterTuning>>;
  readonly stages: readonly StageDefinition[];
  readonly stagesById: Readonly<Record<StageId, StageDefinition>>;
  readonly input: InputBindingConfig;
  readonly settings: SettingsConfig;
  readonly match: MatchConfig;
  readonly warnings: readonly string[];
}
