import * as THREE from 'three'
import type { LaunchVector, ShotMode } from './types'

type PointerSample = {
  x: number
  y: number
  time: number
}

export class ShotController {
  mode: ShotMode = 'pullback'
  onLaunch: ((launch: LaunchVector) => void) | null = null
  onAim: ((velocity: THREE.Vector3 | null) => void) | null = null

  private active = false
  private canShoot = false
  private start: PointerSample | null = null
  private samples: PointerSample[] = []
  private readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerCancel)
    canvas.style.touchAction = 'none'
  }

  setCanShoot(value: boolean): void {
    this.canShoot = value
    if (!value) this.cancel()
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel)
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.canShoot) return
    this.canvas.setPointerCapture(event.pointerId)
    this.active = true
    const sample = this.sample(event)
    this.start = sample
    this.samples = [sample]
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.active || !this.start) return
    const sample = this.sample(event)
    this.samples.push(sample)
    this.samples = this.samples.slice(-8)
    this.onAim?.(this.computeLaunch(sample)?.velocity ?? null)
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.active || !this.start) return
    const sample = this.sample(event)
    this.samples.push(sample)
    const launch = this.computeLaunch(sample)
    this.cancel()
    if (!launch || launch.power < 0.025) return
    this.onLaunch?.(launch)
  }

  private onPointerCancel = (): void => {
    this.cancel()
  }

  private cancel(): void {
    this.active = false
    this.start = null
    this.samples = []
    this.onAim?.(null)
  }

  private sample(event: PointerEvent): PointerSample {
    return { x: event.clientX, y: event.clientY, time: performance.now() }
  }

  private computeLaunch(current: PointerSample): LaunchVector | null {
    if (!this.start) return null
    if (this.mode === 'pullback') {
      return this.computePullback(current)
    }
    return this.computeFlick(current)
  }

  private computePullback(current: PointerSample): LaunchVector {
    const dx = current.x - this.start!.x
    const dy = current.y - this.start!.y
    const pullDistance = Math.hypot(dx, dy)
    const rawPower = Math.min(1, pullDistance / 430)
    const pull = THREE.MathUtils.smoothstep(rawPower, 0.025, 1)
    const verticalIntent = THREE.MathUtils.clamp(dy / 360, -0.18, 1)
    const forward = THREE.MathUtils.clamp(7.25 + pull * 6.15 + verticalIntent * 2.18, 7, 15.75)
    const upward = THREE.MathUtils.clamp(6.04 + pull * 4.78 + verticalIntent * 1.78, 5.82, 12.4)
    const lateral = THREE.MathUtils.clamp(-dx * 0.026, -4.15, 4.15)
    return {
      velocity: new THREE.Vector3(lateral, upward, -forward),
      power: rawPower,
    }
  }

  private computeFlick(current: PointerSample): LaunchVector {
    const recent = this.samples.length > 2 ? this.samples[0] : this.start!
    const dt = Math.max(16, current.time - recent.time)
    const vx = ((current.x - recent.x) / dt) * 1000
    const vy = ((current.y - recent.y) / dt) * 1000
    const speed = Math.hypot(vx, vy)
    const rawPower = Math.min(1, speed / 2450)
    const power = THREE.MathUtils.smoothstep(rawPower, 0.08, 1)
    const liftIntent = THREE.MathUtils.clamp(-vy / 1850, 0, 1)
    const forward = THREE.MathUtils.clamp(9.4 + power * 4.2 + liftIntent * 2.4, 9.15, 15.75)
    const upward = THREE.MathUtils.clamp(7.64 + power * 3.3 + liftIntent * 2.08, 7.35, 12.35)
    const lateral = THREE.MathUtils.clamp(vx * 0.0039, -4.25, 4.25)
    return {
      velocity: new THREE.Vector3(lateral, upward, -forward),
      power: rawPower,
    }
  }
}
