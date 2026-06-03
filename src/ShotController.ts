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
    if (!launch || launch.power < 0.14) return
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
    const pull = Math.min(1, Math.hypot(dx, dy) / 320)
    const forward = THREE.MathUtils.clamp(dy * 0.055 + pull * 6.5, 7.5, 18.5)
    const upward = THREE.MathUtils.clamp(5.8 + dy * 0.025 + pull * 5.5, 6.1, 13.4)
    const lateral = THREE.MathUtils.clamp(-dx * 0.035, -5.8, 5.8)
    return {
      velocity: new THREE.Vector3(lateral, upward, -forward),
      power: pull,
    }
  }

  private computeFlick(current: PointerSample): LaunchVector {
    const recent = this.samples.length > 2 ? this.samples[0] : this.start!
    const dt = Math.max(16, current.time - recent.time)
    const vx = ((current.x - recent.x) / dt) * 1000
    const vy = ((current.y - recent.y) / dt) * 1000
    const speed = Math.hypot(vx, vy)
    const power = Math.min(1, speed / 1800)
    const forward = THREE.MathUtils.clamp(-vy * 0.0085 + power * 5.2, 7.5, 19)
    const upward = THREE.MathUtils.clamp(5.8 + -vy * 0.0046 + power * 4.2, 6, 13.1)
    const lateral = THREE.MathUtils.clamp(vx * 0.0054, -6.2, 6.2)
    return {
      velocity: new THREE.Vector3(lateral, upward, -forward),
      power,
    }
  }
}
