import * as THREE from 'three'
import { RIM_HEIGHT, RIM_RADIUS } from './config'
import { getTierForStreak, STREAK_TIERS } from './config'
import type { ScoreState, ShotResult } from './types'

export type ShotScoreTracker = {
  lastBallPosition: THREE.Vector3
  scored: boolean
}

export class ScoringSystem {
  readonly state: ScoreState = {
    score: 0,
    madeShots: 0,
    streak: 0,
    bestStreak: 0,
    multiplier: 1,
    tier: STREAK_TIERS[0],
  }

  beginShot(ballPosition: THREE.Vector3): ShotScoreTracker {
    return {
      lastBallPosition: ballPosition.clone(),
      scored: false,
    }
  }

  checkShot(
    tracker: ShotScoreTracker,
    ballPosition: THREE.Vector3,
    ballVelocity: THREE.Vector3,
    hoopPosition: THREE.Vector3,
  ): ShotResult {
    const wasAboveRim = tracker.lastBallPosition.y > RIM_HEIGHT + 0.16
    const falling = ballVelocity.y < -0.5

    if (!tracker.scored) {
      const isAtRim = ballPosition.y <= RIM_HEIGHT + 0.08 && ballPosition.y >= RIM_HEIGHT - 0.54
      const dx = ballPosition.x - hoopPosition.x
      const dz = ballPosition.z - hoopPosition.z
      const insideCylinder = Math.hypot(dx, dz) < RIM_RADIUS * 0.64

      if (wasAboveRim && isAtRim && falling && insideCylinder) {
        tracker.scored = true
        this.registerMake()
        tracker.lastBallPosition.copy(ballPosition)
        return 'made'
      }
    }

    tracker.lastBallPosition.copy(ballPosition)
    if (
      (wasAboveRim && falling && ballPosition.y < RIM_HEIGHT - 0.34) ||
      ballPosition.y < -1.3 ||
      ballPosition.z < hoopPosition.z - 4.4 ||
      Math.abs(ballPosition.x) > 7
    ) {
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
  }

  registerMake(): void {
    this.state.streak += 1
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak)
    this.state.tier = getTierForStreak(this.state.streak)
    this.state.multiplier = this.state.tier.multiplier
    this.state.score += 2 * this.state.multiplier
    this.state.madeShots += 1
  }
}
