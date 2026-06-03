import type { LevelConfig, StreakTier } from './types'

export const BALL_RADIUS = 0.34
export const LAUNCH_POSITION = { x: 0, y: 1.25, z: 6.2 }
export const RIM_HEIGHT = 3.05
export const RIM_RADIUS = 0.64
export const SHOT_CLOCK_SECONDS = 60

export const STREAK_TIERS: StreakTier[] = [
  {
    threshold: 0,
    multiplier: 1,
    name: 'Warm',
    flameIntensity: 0.12,
    particleRate: 5,
    primaryColor: 0xff8a24,
    secondaryColor: 0x30e8ff,
  },
  {
    threshold: 3,
    multiplier: 2,
    name: 'Lit',
    flameIntensity: 0.32,
    particleRate: 12,
    primaryColor: 0xffa724,
    secondaryColor: 0xff3d85,
  },
  {
    threshold: 5,
    multiplier: 3,
    name: 'Torch',
    flameIntensity: 0.5,
    particleRate: 20,
    primaryColor: 0xff4f19,
    secondaryColor: 0xffe66d,
  },
  {
    threshold: 10,
    multiplier: 5,
    name: 'Flamethrow',
    flameIntensity: 0.78,
    particleRate: 34,
    primaryColor: 0xfff06a,
    secondaryColor: 0x00f0ff,
  },
  {
    threshold: 20,
    multiplier: 10,
    name: 'Inferno',
    flameIntensity: 1,
    particleRate: 54,
    primaryColor: 0xffffff,
    secondaryColor: 0xff244d,
  },
]

export const LEVELS: LevelConfig[] = [
  {
    id: 1,
    label: 'Neon Warmup',
    hoopDistance: -7.5,
    hoopSpeed: 0.75,
    hoopRange: 1.05,
    scoreTarget: 0,
    obstacleConfigs: [],
  },
  {
    id: 2,
    label: 'Sideline Heat',
    hoopDistance: -9.2,
    hoopSpeed: 1,
    hoopRange: 1.45,
    scoreTarget: 4,
    obstacleConfigs: [],
  },
  {
    id: 3,
    label: 'Crossfire',
    hoopDistance: -10.8,
    hoopSpeed: 1.2,
    hoopRange: 1.75,
    scoreTarget: 9,
    obstacleConfigs: [
      {
        id: 'crossfire-left',
        position: [-1.35, 2.25, -2.7],
        size: [0.26, 1.75, 0.28],
        color: 0x00f0ff,
        pulseOffset: 0,
      },
      {
        id: 'crossfire-right',
        position: [1.35, 2.25, -2.7],
        size: [0.26, 1.75, 0.28],
        color: 0xff3d85,
        pulseOffset: 1.4,
      },
    ],
  },
  {
    id: 4,
    label: 'Arc Furnace',
    hoopDistance: -12.7,
    hoopSpeed: 1.45,
    hoopRange: 2.05,
    scoreTarget: 16,
    obstacleConfigs: [
      {
        id: 'furnace-gate',
        position: [0, 2.55, -4.5],
        size: [2.2, 0.22, 0.32],
        color: 0xffd85a,
        pulseOffset: 0.4,
      },
      {
        id: 'furnace-left',
        position: [-1.9, 2, -6.4],
        size: [0.24, 1.45, 0.28],
        color: 0x00f0ff,
        pulseOffset: 1.1,
      },
      {
        id: 'furnace-right',
        position: [1.9, 2, -6.4],
        size: [0.24, 1.45, 0.28],
        color: 0xff3d85,
        pulseOffset: 2.2,
      },
    ],
  },
  {
    id: 5,
    label: 'Inferno Lane',
    hoopDistance: -14.8,
    hoopSpeed: 1.8,
    hoopRange: 2.45,
    scoreTarget: 20,
    obstacleConfigs: [
      {
        id: 'inferno-low',
        position: [0, 1.85, -3.7],
        size: [1.85, 0.22, 0.28],
        color: 0xff3d85,
        pulseOffset: 0.2,
      },
      {
        id: 'inferno-high',
        position: [0, 3.05, -7.2],
        size: [1.55, 0.2, 0.28],
        color: 0x00f0ff,
        pulseOffset: 1.8,
      },
      {
        id: 'inferno-left',
        position: [-2.3, 2.25, -8.9],
        size: [0.23, 1.7, 0.28],
        color: 0xffd85a,
        pulseOffset: 2.8,
      },
      {
        id: 'inferno-right',
        position: [2.3, 2.25, -8.9],
        size: [0.23, 1.7, 0.28],
        color: 0xffd85a,
        pulseOffset: 3.6,
      },
    ],
  },
]

export function getTierForStreak(streak: number): StreakTier {
  return STREAK_TIERS.reduce((active, tier) => (streak >= tier.threshold ? tier : active), STREAK_TIERS[0])
}

export function getLevelForMadeShots(madeShots: number): LevelConfig {
  return LEVELS.reduce((active, level) => (madeShots >= level.scoreTarget ? level : active), LEVELS[0])
}
