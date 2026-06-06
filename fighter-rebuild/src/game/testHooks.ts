import type { CharacterId, GameConfig, MatchConfig, StageId } from './types';

export const TEST_HOOK_KEY = '__SAMA_V_AMODI_TEST_HOOKS__';

export type TestHookInputAction =
  | 'left'
  | 'right'
  | 'jump'
  | 'crouch'
  | 'block'
  | 'light'
  | 'heavy'
  | 'special'
  | 'pause';

export type TestHookMatchPhase = 'booting' | 'menu' | 'selecting' | 'roundIntro' | 'fighting' | 'roundOver' | 'matchOver';

export interface TestHookFighterState {
  readonly id: CharacterId;
  readonly health: number;
  readonly meter: number;
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
  readonly animation: string;
  readonly frame: number;
}

export interface TestHookMatchState {
  readonly phase: TestHookMatchPhase;
  readonly stageId: StageId;
  readonly roundIndex: number;
  readonly timerSeconds: number;
  readonly player: TestHookFighterState;
  readonly cpu: TestHookFighterState;
  readonly winnerId?: CharacterId;
}

export interface TestHookStartMatchOptions {
  readonly match?: Partial<MatchConfig>;
  readonly playerCharacterId?: CharacterId;
  readonly cpuCharacterId?: CharacterId;
  readonly stageId?: StageId;
  readonly seed?: number;
}

export interface SamaAmodiTestHooks {
  readonly version: 1;
  getConfigSnapshot(): GameConfig;
  getMatchState(): TestHookMatchState | null;
  startMatch(options?: TestHookStartMatchOptions): void;
  press(action: TestHookInputAction, frames?: number): void;
  release(action: TestHookInputAction): void;
  setCpuEnabled(enabled: boolean): void;
  setDebugOverlay(enabled: boolean): void;
  forceRoundTimeout(): void;
  forceMeter(characterId: CharacterId, meter: number): void;
  resetMatch(seed?: number): void;
}

export type TestHookHost = {
  [TEST_HOOK_KEY]?: SamaAmodiTestHooks;
};

export function installTestHooks(host: TestHookHost, hooks: SamaAmodiTestHooks): void {
  host[TEST_HOOK_KEY] = hooks;
}

export function removeTestHooks(host: TestHookHost): void {
  delete host[TEST_HOOK_KEY];
}
