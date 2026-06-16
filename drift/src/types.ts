import type { ColorRepresentation } from 'three';

export type Vec2 = {
  x: number;
  z: number;
};

export type TrackItemKind = 'boost' | 'ramp' | 'turbo' | 'clock' | 'shield' | 'cone' | 'crate' | 'oil';

export type TrackItem = {
  id: string;
  kind: TrackItemKind;
  s: number;
  offset: number;
  radius?: number;
};

export type TrafficDefinition = {
  id: string;
  s: number;
  lane: number;
  speed: number;
  color: ColorRepresentation;
};

export type MedalTargets = {
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
};

export type TrackDefinition = {
  id: string;
  name: string;
  tagline: string;
  roadColor: ColorRepresentation;
  shoulderColor: ColorRepresentation;
  accentColor: ColorRepresentation;
  skyColor: ColorRepresentation;
  fogColor: ColorRepresentation;
  terrainColor: ColorRepresentation;
  width: number;
  laps: number;
  startS: number;
  startOffset: number;
  startHeadingOffset?: number;
  centerline: Vec2[];
  checkpoints: number[];
  medalTargets: MedalTargets;
  items: TrackItem[];
  traffic: TrafficDefinition[];
};

export type TrackSample = {
  point: Vec2;
  tangent: Vec2;
  normal: Vec2;
  s: number;
  cumulative: number;
};

export type TrackRuntime = {
  definition: TrackDefinition;
  samples: TrackSample[];
  totalLength: number;
};

export type InputState = {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  restart: boolean;
};

export type CarSnapshot = {
  speed: number;
  kph: number;
  drift: boolean;
  grounded: boolean;
  boost: boolean;
  shield: boolean;
  slipAngle: number;
  powerupText: string;
};

export type RaceSnapshot = {
  trackName: string;
  trackTagline: string;
  levelIndex: number;
  levelCount: number;
  elapsed: number;
  displayElapsed: number;
  lap: number;
  laps: number;
  checkpoint: number;
  checkpointCount: number;
  bestTime: number | null;
  medal: string;
  status: 'menu' | 'countdown' | 'racing' | 'finished';
  finishTime: number | null;
};
