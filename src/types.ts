import type * as THREE from 'three'

export type ShotMode = 'pullback' | 'flick'

export type GamePhase = 'ready' | 'playing' | 'shotInFlight' | 'roundOver'

export type ObstacleConfig = {
  id: string
  position: THREE.Vector3Tuple
  size: THREE.Vector3Tuple
  color: number
  pulseOffset: number
}

export type LevelConfig = {
  id: number
  label: string
  hoopDistance: number
  hoopSpeed: number
  hoopRange: number
  scoreTarget: number
  obstacleConfigs: ObstacleConfig[]
}

export type StreakTier = {
  threshold: number
  multiplier: number
  name: string
  flameIntensity: number
  particleRate: number
  primaryColor: number
  secondaryColor: number
}

export type ScoreState = {
  score: number
  madeShots: number
  streak: number
  bestStreak: number
  multiplier: number
  tier: StreakTier
}

export type LaunchVector = {
  velocity: THREE.Vector3
  power: number
}

export type ShotResult = 'made' | 'miss' | 'pending'
