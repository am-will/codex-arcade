import * as THREE from 'three'
import { CourtScene } from './CourtScene'
import { getLevelForMadeShots, LAUNCH_POSITION, SHOT_CLOCK_SECONDS } from './config'
import { Hud } from './Hud'
import { PhysicsWorld } from './PhysicsWorld'
import { ScoringSystem } from './ScoringSystem'
import { ShotController } from './ShotController'
import type { GamePhase, LevelConfig, ShotMode } from './types'

export class Game {
  private court!: CourtScene
  private physics!: PhysicsWorld
  private shotController!: ShotController
  private hud!: Hud
  private scoring = new ScoringSystem()
  private phase: GamePhase = 'ready'
  private shotMode: ShotMode = 'pullback'
  private activeLevel: LevelConfig = getLevelForMadeShots(0)
  private timeRemaining = SHOT_CLOCK_SECONDS
  private running = false
  private lastFrame = 0
  private elapsed = 0
  private resetDelay = 0
  private animationFrame = 0
  private readonly ballPosition = new THREE.Vector3()
  private readonly ballRotation = new THREE.Quaternion()
  private readonly ballVelocity = new THREE.Vector3()
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
    this.applyLevel(getLevelForMadeShots(0))
    this.resetBall()
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

    const level = getLevelForMadeShots(this.scoring.state.madeShots)
    if (level !== this.activeLevel) {
      this.applyLevel(level)
    }

    this.updateHoop()
    if (this.phase === 'shotInFlight') {
      this.physics.step(dt)
      this.syncBall(true)
      this.evaluateShot()
    } else {
      this.syncBall(false)
    }

    if (this.resetDelay > 0) {
      this.resetDelay -= dt
      if (this.resetDelay <= 0 && this.phase !== 'roundOver') {
        this.resetBall()
      }
    }

    this.shotController.setCanShoot(this.phase === 'ready' || this.phase === 'playing')
    this.court.updateEffects(dt, this.elapsed, this.scoring.state.tier)
    this.hud.update(this.scoring.state, this.timeRemaining, this.phase, this.activeLevel.label, this.activeLevel.id)
    this.court.render()
    this.animationFrame = requestAnimationFrame(this.tick)
  }

  private launch(velocity: THREE.Vector3): void {
    if (this.phase === 'roundOver' || this.phase === 'shotInFlight') return
    if (this.phase === 'ready') this.phase = 'playing'
    this.phase = 'shotInFlight'
    this.court.clearAim()
    this.court.resetTrail()
    this.physics.resetBall()
    this.physics.launchBall(velocity)
    this.scoring.beginShot(this.physics.getBallPosition(this.ballPosition))
  }

  private evaluateShot(): void {
    const result = this.scoring.checkShot(
      this.physics.getBallPosition(this.ballPosition),
      this.physics.getBallVelocity(this.ballVelocity),
      this.court.getHoopPosition(),
    )
    if (result === 'made') {
      this.hud.showMake(this.scoring.state)
      this.court.celebrateMake(this.scoring.state.tier)
      this.phase = 'playing'
      this.resetDelay = 0.58
    } else if (result === 'miss') {
      this.hud.showMiss()
      this.phase = 'playing'
      this.resetDelay = 0.28
    }
  }

  private resetBall(): void {
    this.phase = this.phase === 'roundOver' ? 'roundOver' : this.phase === 'ready' ? 'ready' : 'playing'
    this.resetDelay = 0
    this.physics.resetBall(LAUNCH_POSITION)
    this.court.resetTrail()
    this.syncBall(false)
  }

  private restart(): void {
    this.scoring.reset()
    this.timeRemaining = SHOT_CLOCK_SECONDS
    this.phase = 'ready'
    this.elapsed = 0
    this.applyLevel(getLevelForMadeShots(0))
    this.hud.hideRoundOver()
    this.resetBall()
  }

  private endRound(): void {
    this.timeRemaining = 0
    this.phase = 'roundOver'
    this.resetDelay = 0
    this.physics.resetBall(LAUNCH_POSITION)
    this.court.clearAim()
    this.court.resetTrail()
    this.hud.showRoundOver(this.scoring.state)
  }

  private syncBall(isFlying: boolean): void {
    this.court.updateBall(
      this.physics.getBallPosition(this.ballPosition),
      this.physics.getBallRotation(this.ballRotation),
      isFlying,
    )
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
