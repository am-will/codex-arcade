import type { LevelConfig, StreakTier } from './types'

export const BALL_RADIUS = 0.34
export const LAUNCH_POSITION = { x: 0, y: 1.32, z: 1.85 }
export const RIM_HEIGHT = 3.05
export const RIM_RADIUS = 0.7
export const BACKBOARD_Z = -0.86
export const SHOT_CLOCK_SECONDS = 90

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
    flameIntensity: 0.2,
    particleRate: 0,
    primaryColor: 0xff263d,
    secondaryColor: 0xff8a24,
  },
  {
    threshold: 5,
    multiplier: 3,
    name: 'Torch',
    flameIntensity: 0.62,
    particleRate: 26,
    primaryColor: 0xff4f19,
    secondaryColor: 0xffd85a,
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
    startsAtSeconds: 0,
    hoopDistance: -5.1,
    hoopSpeed: 0.42,
    hoopRange: 0.9,
    basePoints: 2,
    obstacleConfigs: [],
  },
  {
    id: 2,
    label: 'Sideline Heat',
    startsAtSeconds: 30,
    hoopDistance: -6.17,
    hoopSpeed: 0.44,
    hoopRange: 1.15,
    basePoints: 2,
    obstacleConfigs: [],
  },
  {
    id: 3,
    label: 'Crossfire',
    startsAtSeconds: 60,
    hoopDistance: -7.23,
    hoopSpeed: 0.47,
    hoopRange: 1.38,
    basePoints: 5,
    obstacleConfigs: [],
  },
]

export function getTierForStreak(streak: number): StreakTier {
  return STREAK_TIERS.reduce((active, tier) => (streak >= tier.threshold ? tier : active), STREAK_TIERS[0])
}

export function getLevelForElapsedSeconds(elapsedSeconds: number): LevelConfig {
  return LEVELS.reduce((active, level) => (elapsedSeconds >= level.startsAtSeconds ? level : active), LEVELS[0])
}
