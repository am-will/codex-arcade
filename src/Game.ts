import * as THREE from 'three'
import type { RigidBody } from '@dimforge/rapier3d-compat'
import { CourtScene, type ShotVisual } from './CourtScene'
import { getLevelForElapsedSeconds, LAUNCH_POSITION, RIM_HEIGHT, SHOT_CLOCK_SECONDS } from './config'
import { Hud } from './Hud'
import { PhysicsWorld } from './PhysicsWorld'
import { ScoringSystem, type ShotScoreTracker } from './ScoringSystem'
import { ShotController } from './ShotController'
import type { GamePhase, LevelConfig, ShotMode } from './types'

type ActiveShot = {
  id: number
  body: RigidBody
  visual: ShotVisual
  tracker: ShotScoreTracker
  position: THREE.Vector3
  rotation: THREE.Quaternion
  velocity: THREE.Vector3
}

declare global {
  interface Window {
    __FLAMETHROW_TEST__?: {
      forceMake: (count?: number) => void
      forceMiss: () => void
      forceRoundOver: () => void
      dropThroughHoop: () => void
      dropAtBackboard: () => void
      setElapsedSeconds: (elapsedSeconds: number) => void
      snapshot: () => {
        phase: GamePhase
        score: number
        streak: number
        multiplier: number
        bestStreak: number
        madeShots: number
        level: number
        basePoints: number
        hoopDistance: number
        hoopSpeed: number
        elapsedSeconds: number
        timeRemaining: number
        activeShots: number
        readyBallAvailable: boolean
        shots: Array<{ x: number; y: number; z: number; vy: number; enteredHoopOpening: boolean }>
      }
    }
  }
}

export class Game {
  private court!: CourtScene
  private physics!: PhysicsWorld
  private shotController!: ShotController
  private hud!: Hud
  private scoring = new ScoringSystem()
  private phase: GamePhase = 'ready'
  private shotMode: ShotMode = 'pullback'
  private activeLevel: LevelConfig = getLevelForElapsedSeconds(0)
  private timeRemaining = SHOT_CLOCK_SECONDS
  private running = false
  private lastFrame = 0
  private elapsed = 0
  private readyBallDelay = 0
  private readyBallAvailable = true
  private animationFrame = 0
  private nextShotId = 1
  private activeShots: ActiveShot[] = []
  private readonly ballPosition = new THREE.Vector3()
  private readonly ballRotation = new THREE.Quaternion()
  private readonly app: HTMLElement

  constructor(app: HTMLElement) {
    this.app = app
  }

  async start(): Promise<void> {
    this.app.innerHTML = `
      <main class="game-shell">
        <section class="game-stage" aria-label="Flamethrow game court">
          <div id="three-host"></div>
          <div id="hud-root"></div>
        </section>
      </main>
    `
    const threeHost = this.app.querySelector<HTMLElement>('#three-host')!
    const hudRoot = this.app.querySelector<HTMLElement>('#hud-root')!

    this.court = new CourtScene(threeHost)
    this.physics = await PhysicsWorld.create()
    this.hud = new Hud(hudRoot, {
      onModeChange: (mode) => {
        this.shotMode = mode
        this.shotController.mode = mode
      },
      onRestart: () => this.restart(),
    })
    this.shotController = new ShotController(this.court.renderer.domElement)
    this.shotController.onLaunch = ({ velocity }) => this.launch(velocity)
    this.shotController.onAim = (velocity) => {
      this.court.setAim(this.court.ballMesh.position, velocity)
    }
    this.shotController.mode = this.shotMode
    this.applyLevel(getLevelForElapsedSeconds(0))
    this.resetBall()
    this.installTestHooks()
    this.bindResize()
    this.running = true
    this.lastFrame = performance.now()
    this.animationFrame = requestAnimationFrame(this.tick)
  }

  dispose(): void {
    this.running = false
    cancelAnimationFrame(this.animationFrame)
    this.shotController?.dispose()
    this.court?.dispose()
  }

  private tick = (now: number): void => {
    if (!this.running) return
    const dt = Math.min(0.04, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    this.elapsed += dt

    if (this.phase !== 'ready' && this.phase !== 'roundOver') {
      this.timeRemaining -= dt
      if (this.timeRemaining <= 0) {
        this.endRound()
      }
    }

    const level = getLevelForElapsedSeconds(this.getGameElapsedSeconds())
    if (level !== this.activeLevel) {
      this.applyLevel(level)
    }

    this.updateHoop()
    if (this.activeShots.length > 0) {
      this.physics.step(dt)
      this.updateActiveShots()
    }

    if (!this.readyBallAvailable && this.phase !== 'roundOver') {
      this.readyBallDelay -= dt
      if (this.readyBallDelay <= 0) {
        this.respawnReadyBall()
      }
    }

    this.shotController.setCanShoot((this.phase === 'ready' || this.phase === 'playing') && this.readyBallAvailable)
    this.court.updateEffects(dt, this.elapsed, this.scoring.state.tier)
    this.hud.update(this.scoring.state, this.timeRemaining, this.phase, this.activeLevel.label, this.activeLevel.id)
    this.court.render()
    this.animationFrame = requestAnimationFrame(this.tick)
  }

  private launch(velocity: THREE.Vector3): void {
    if (this.phase === 'roundOver' || !this.readyBallAvailable) return
    if (this.phase === 'ready') this.phase = 'playing'
    this.court.clearAim()
    this.spawnActiveShot(velocity)
    this.readyBallAvailable = false
    this.readyBallDelay = 0.24
    this.court.setLaunchBallVisible(false)
  }

  private updateActiveShots(): void {
    const hoopPosition = this.court.getHoopPosition()
    const remainingShots: ActiveShot[] = []

    for (const shot of this.activeShots) {
      this.physics.getBodyPosition(shot.body, shot.position)
      this.physics.getBodyRotation(shot.body, shot.rotation)
      this.physics.getBodyVelocity(shot.body, shot.velocity)
      this.court.updateShotVisual(shot.visual, shot.position, shot.rotation)

      const result = this.scoring.checkShot(
        shot.tracker,
        shot.position,
        shot.velocity,
        hoopPosition,
        this.activeLevel.basePoints,
      )
      if (result === 'made') {
        this.hud.showMake(this.scoring.state)
        this.court.celebrateMake(this.scoring.state.tier)
        this.removeActiveShot(shot)
      } else if (result === 'miss') {
        this.hud.showMiss()
        this.removeActiveShot(shot)
      } else {
        remainingShots.push(shot)
      }
    }
    this.activeShots = remainingShots
  }

  private resetBall(): void {
    this.phase = this.phase === 'roundOver' ? 'roundOver' : this.phase === 'ready' ? 'ready' : 'playing'
    this.readyBallDelay = 0
    this.readyBallAvailable = this.phase !== 'roundOver'
    this.court.setLaunchBallVisible(this.readyBallAvailable)
    this.syncBall(false)
  }

  private restart(): void {
    this.scoring.reset()
    this.clearActiveShots()
    this.timeRemaining = SHOT_CLOCK_SECONDS
    this.phase = 'ready'
    this.elapsed = 0
    this.applyLevel(getLevelForElapsedSeconds(0))
    this.hud.hideRoundOver()
    this.resetBall()
  }

  private endRound(): void {
    this.timeRemaining = 0
    this.phase = 'roundOver'
    this.readyBallDelay = 0
    this.readyBallAvailable = false
    this.clearActiveShots()
    this.court.setLaunchBallVisible(false)
    this.court.clearAim()
    this.court.resetTrail()
    this.hud.showRoundOver(this.scoring.state)
  }

  private installTestHooks(): void {
    const params = new URLSearchParams(window.location.search)
    if (!params.has('test')) return
    window.__FLAMETHROW_TEST__ = {
      forceMake: (count = 1) => {
        this.clearActiveShots()
        for (let index = 0; index < count; index += 1) {
          this.scoring.registerMake(this.activeLevel.basePoints)
        }
        this.phase = this.phase === 'ready' ? 'playing' : this.phase
        this.court.celebrateMake(this.scoring.state.tier)
        this.hud.showMake(this.scoring.state)
      },
      forceMiss: () => {
        this.scoring.registerMiss()
        this.hud.showMiss()
      },
      forceRoundOver: () => this.endRound(),
      dropThroughHoop: () => {
        const hoop = this.court.getHoopPosition()
        const position = new THREE.Vector3(hoop.x, RIM_HEIGHT + 0.92, hoop.z)
        this.spawnActiveShot(new THREE.Vector3(0, -1.2, 0), position)
        this.phase = this.phase === 'ready' ? 'playing' : this.phase
      },
      dropAtBackboard: () => {
        const hoop = this.court.getHoopPosition()
        const position = new THREE.Vector3(hoop.x, RIM_HEIGHT + 0.92, hoop.z - 0.72)
        this.spawnActiveShot(new THREE.Vector3(0, -1.2, 0), position)
        this.phase = this.phase === 'ready' ? 'playing' : this.phase
      },
      setElapsedSeconds: (elapsedSeconds) => {
        this.phase = 'playing'
        this.timeRemaining = Math.max(0, SHOT_CLOCK_SECONDS - elapsedSeconds)
        this.applyLevel(getLevelForElapsedSeconds(this.getGameElapsedSeconds()))
      },
      snapshot: () => ({
        phase: this.phase,
        score: this.scoring.state.score,
        streak: this.scoring.state.streak,
        multiplier: this.scoring.state.multiplier,
        bestStreak: this.scoring.state.bestStreak,
        madeShots: this.scoring.state.madeShots,
        level: this.activeLevel.id,
        basePoints: this.activeLevel.basePoints,
        hoopDistance: this.activeLevel.hoopDistance,
        hoopSpeed: this.activeLevel.hoopSpeed,
        elapsedSeconds: this.getGameElapsedSeconds(),
        timeRemaining: this.timeRemaining,
        activeShots: this.activeShots.length,
        readyBallAvailable: this.readyBallAvailable,
        shots: this.activeShots.map((shot) => ({
          x: shot.position.x,
          y: shot.position.y,
          z: shot.position.z,
          vy: shot.velocity.y,
          enteredHoopOpening: shot.tracker.enteredHoopOpening,
        })),
      }),
    }
  }

  private syncBall(isFlying: boolean): void {
    this.court.updateBall(
      this.ballPosition.set(LAUNCH_POSITION.x, LAUNCH_POSITION.y, LAUNCH_POSITION.z),
      this.ballRotation.identity(),
      isFlying,
    )
  }

  private respawnReadyBall(): void {
    this.readyBallAvailable = true
    this.readyBallDelay = 0
    this.court.setLaunchBallVisible(true)
    this.syncBall(false)
  }

  private removeActiveShot(shot: ActiveShot): void {
    this.physics.removeShotBody(shot.body)
    this.court.removeShotVisual(shot.visual)
  }

  private spawnActiveShot(velocity: THREE.Vector3, position = LAUNCH_POSITION): void {
    const body = this.physics.createShotBody(velocity, position)
    const shotPosition = this.physics.getBodyPosition(body, new THREE.Vector3())
    const rotation = this.physics.getBodyRotation(body, new THREE.Quaternion())
    const visual = this.court.createShotVisual(shotPosition, rotation)
    this.activeShots.push({
      id: this.nextShotId,
      body,
      visual,
      tracker: this.scoring.beginShot(shotPosition),
      position: shotPosition,
      rotation,
      velocity: new THREE.Vector3(),
    })
    this.nextShotId += 1
  }

  private clearActiveShots(): void {
    for (const shot of this.activeShots) {
      this.removeActiveShot(shot)
    }
    this.activeShots = []
  }

  private getGameElapsedSeconds(): number {
    return SHOT_CLOCK_SECONDS - this.timeRemaining
  }

  private updateHoop(): void {
    const x = Math.sin(this.elapsed * this.activeLevel.hoopSpeed) * this.activeLevel.hoopRange
    this.court.setHoopPosition(x, this.activeLevel.hoopDistance)
    this.physics.setHoopPosition(x, this.activeLevel.hoopDistance)
  }

  private applyLevel(level: LevelConfig): void {
    this.activeLevel = level
    this.court?.setLevel(level)
    this.physics?.syncObstacles(level)
  }

  private bindResize(): void {
    const observer = new ResizeObserver(() => this.court.resize())
    observer.observe(this.app)
    window.addEventListener('orientationchange', () => this.court.resize())
  }
}
