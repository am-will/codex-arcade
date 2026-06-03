import * as THREE from 'three'
import { RIM_HEIGHT, RIM_RADIUS } from './config'
import { getTierForStreak, STREAK_TIERS } from './config'
import type { ScoreState, ShotResult } from './types'

export class ScoringSystem {
  readonly state: ScoreState = {
    score: 0,
    madeShots: 0,
    streak: 0,
    bestStreak: 0,
    multiplier: 1,
    tier: STREAK_TIERS[0],
  }

  private lastBallPosition = new THREE.Vector3()
  private scoredThisShot = false

  beginShot(ballPosition: THREE.Vector3): void {
    this.lastBallPosition.copy(ballPosition)
    this.scoredThisShot = false
  }

  checkShot(ballPosition: THREE.Vector3, ballVelocity: THREE.Vector3, hoopPosition: THREE.Vector3): ShotResult {
    if (!this.scoredThisShot) {
      const wasAbove = this.lastBallPosition.y > RIM_HEIGHT + 0.16
      const isAtRim = ballPosition.y <= RIM_HEIGHT + 0.08 && ballPosition.y >= RIM_HEIGHT - 0.54
      const falling = ballVelocity.y < -0.5
      const dx = ballPosition.x - hoopPosition.x
      const dz = ballPosition.z - hoopPosition.z
      const insideCylinder = Math.hypot(dx, dz) < RIM_RADIUS * 0.64

      if (wasAbove && isAtRim && falling && insideCylinder) {
        this.scoredThisShot = true
        this.registerMake()
        this.lastBallPosition.copy(ballPosition)
        return 'made'
      }
    }

    this.lastBallPosition.copy(ballPosition)
    if (ballPosition.y < -1.3 || ballPosition.z < hoopPosition.z - 4.4 || Math.abs(ballPosition.x) > 7) {
      this.registerMiss()
      return 'miss'
    }
    return 'pending'
  }

  registerMiss(): void {
    this.state.streak = 0
    this.state.multiplier = 1
    this.state.tier = getTierForStreak(0)
  }

  reset(): void {
    this.state.score = 0
    this.state.madeShots = 0
    this.state.streak = 0
    this.state.bestStreak = 0
    this.state.multiplier = 1
    this.state.tier = getTierForStreak(0)
    this.scoredThisShot = false
  }

  private registerMake(): void {
    this.state.streak += 1
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak)
    this.state.tier = getTierForStreak(this.state.streak)
    this.state.multiplier = this.state.tier.multiplier
    this.state.score += 2 * this.state.multiplier
    this.state.madeShots += 1
  }
}
