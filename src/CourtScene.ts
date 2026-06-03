import * as THREE from 'three'
import { BALL_RADIUS, LAUNCH_POSITION, RIM_HEIGHT, RIM_RADIUS } from './config'
import type { LevelConfig, StreakTier } from './types'
import { createBallTexture, createFlameTexture, createGlowTexture } from './assets'

type FlameParticle = {
  sprite: THREE.Sprite
  velocity: THREE.Vector3
  life: number
  maxLife: number
}

export type ShotVisual = {
  mesh: THREE.Mesh
  light: THREE.PointLight
  trail: THREE.Line
  trailPositions: THREE.Vector3[]
}

export class CourtScene {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(56, 1, 0.1, 80)
  readonly renderer: THREE.WebGLRenderer
  readonly ballMesh: THREE.Mesh
  readonly ballLight: THREE.PointLight
  readonly aimLine: THREE.Line

  private readonly ballGeometry: THREE.SphereGeometry
  private readonly ballMaterial: THREE.MeshStandardMaterial
  private readonly hoopGroup = new THREE.Group()
  private readonly obstacleGroup = new THREE.Group()
  private readonly flameParticles: FlameParticle[] = []
  private readonly shotTrail: THREE.Line
  private readonly trailPositions: THREE.Vector3[] = []
  private readonly flameTexture = createFlameTexture()
  private readonly cyanGlow = createGlowTexture('rgba(0, 240, 255, 0.82)')
  private readonly magentaGlow = createGlowTexture('rgba(255, 61, 133, 0.82)')
  private backboardMaterial!: THREE.MeshStandardMaterial
  private backboardFlashLight!: THREE.PointLight
  private backboardFlash = 0
  private spawnAccumulator = 0
  private lastTierThreshold = 0
  private screenPulse = 0
  private readonly host: HTMLElement

  constructor(host: HTMLElement) {
    this.host = host
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.host.append(this.renderer.domElement)

    this.scene.background = new THREE.Color(0x05070f)
    this.scene.fog = new THREE.Fog(0x05070f, 11, 37)

    this.camera.position.set(0, 6.1, 11.6)
    this.camera.lookAt(0, 2.55, -6.4)

    this.addLights()
    this.addCourt()
    this.addHoop()

    this.ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 48, 32)
    this.ballMaterial = new THREE.MeshStandardMaterial({
      map: createBallTexture(),
      roughness: 0.36,
      metalness: 0.05,
      emissive: new THREE.Color(0x441200),
      emissiveIntensity: 0.45,
    })
    this.ballMesh = new THREE.Mesh(this.ballGeometry, this.ballMaterial)
    this.ballMesh.castShadow = true
    this.ballMesh.position.set(LAUNCH_POSITION.x, LAUNCH_POSITION.y, LAUNCH_POSITION.z)
    this.scene.add(this.ballMesh)

    this.ballLight = new THREE.PointLight(0xff7a24, 2.2, 5.6)
    this.ballLight.position.copy(this.ballMesh.position)
    this.scene.add(this.ballLight)

    const aimGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    const aimMaterial = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.72 })
    this.aimLine = new THREE.Line(aimGeometry, aimMaterial)
    this.aimLine.visible = false
    this.scene.add(this.aimLine)

    const trailGeometry = new THREE.BufferGeometry()
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0xffd85a,
      transparent: true,
      opacity: 0.76,
      blending: THREE.AdditiveBlending,
    })
    this.shotTrail = new THREE.Line(trailGeometry, trailMaterial)
    this.scene.add(this.shotTrail)

    this.createFlameParticles()
    this.resize()
  }

  resize(): void {
    const width = Math.max(1, this.host.clientWidth)
    const height = Math.max(1, this.host.clientHeight)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.renderer.dispose()
  }

  setHoopPosition(x: number, z: number): void {
    this.hoopGroup.position.set(x, RIM_HEIGHT, z)
  }

  getHoopPosition(): THREE.Vector3 {
    return this.hoopGroup.position.clone()
  }

  setLevel(level: LevelConfig): void {
    this.setHoopPosition(this.hoopGroup.position.x, level.hoopDistance)
    this.obstacleGroup.clear()
    for (const obstacle of level.obstacleConfigs) {
      const geometry = new THREE.BoxGeometry(obstacle.size[0], obstacle.size[1], obstacle.size[2])
      const material = new THREE.MeshStandardMaterial({
        color: obstacle.color,
        emissive: obstacle.color,
        emissiveIntensity: 1.5,
        roughness: 0.28,
        metalness: 0.24,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = obstacle.id
      mesh.position.fromArray(obstacle.position)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.obstacleGroup.add(mesh)
    }
  }

  setAim(start: THREE.Vector3, launch: THREE.Vector3 | null): void {
    if (!launch || launch.lengthSq() < 0.01) {
      this.aimLine.visible = false
      return
    }
    const end = start.clone().add(launch.clone().multiplyScalar(0.16))
    const geometry = this.aimLine.geometry as THREE.BufferGeometry
    geometry.setFromPoints([start, end])
    this.aimLine.visible = true
  }

  clearAim(): void {
    this.aimLine.visible = false
  }

  setLaunchBallVisible(visible: boolean): void {
    this.ballMesh.visible = visible
    this.ballLight.visible = visible
  }

  resetTrail(): void {
    this.trailPositions.length = 0
    this.shotTrail.geometry.setFromPoints([])
  }

  updateBall(position: THREE.Vector3, rotation: THREE.Quaternion, isFlying: boolean): void {
    this.ballMesh.position.copy(position)
    this.ballMesh.quaternion.copy(rotation)
    this.ballLight.position.copy(position)
    if (isFlying) {
      this.trailPositions.push(position.clone())
      while (this.trailPositions.length > 34) this.trailPositions.shift()
      this.shotTrail.geometry.setFromPoints(this.trailPositions)
    }
  }

  createShotVisual(position: THREE.Vector3, rotation: THREE.Quaternion): ShotVisual {
    const mesh = new THREE.Mesh(this.ballGeometry, this.ballMaterial)
    mesh.castShadow = true
    mesh.position.copy(position)
    mesh.quaternion.copy(rotation)
    this.scene.add(mesh)

    const light = new THREE.PointLight(this.ballLight.color, this.ballLight.intensity, 5.6)
    light.position.copy(position)
    this.scene.add(light)

    const trail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xffd85a,
        transparent: true,
        opacity: 0.76,
        blending: THREE.AdditiveBlending,
      }),
    )
    this.scene.add(trail)

    return { mesh, light, trail, trailPositions: [] }
  }

  updateShotVisual(visual: ShotVisual, position: THREE.Vector3, rotation: THREE.Quaternion): void {
    visual.mesh.position.copy(position)
    visual.mesh.quaternion.copy(rotation)
    visual.light.position.copy(position)
    visual.trailPositions.push(position.clone())
    while (visual.trailPositions.length > 28) visual.trailPositions.shift()
    visual.trail.geometry.setFromPoints(visual.trailPositions)
  }

  removeShotVisual(visual: ShotVisual): void {
    this.scene.remove(visual.mesh, visual.light, visual.trail)
    visual.trail.geometry.dispose()
  }

  updateEffects(dt: number, time: number, tier: StreakTier): void {
    if (tier.threshold !== this.lastTierThreshold) {
      this.lastTierThreshold = tier.threshold
      this.screenPulse = 1
    }

    const ballMaterial = this.ballMesh.material as THREE.MeshStandardMaterial
    ballMaterial.emissive.setHex(tier.primaryColor)
    ballMaterial.emissiveIntensity = 0.28 + tier.flameIntensity * 1.45
    this.ballLight.color.setHex(tier.primaryColor)
    this.ballLight.intensity = 1.8 + tier.flameIntensity * 5.2

    this.spawnAccumulator += dt * tier.particleRate
    while (this.spawnAccumulator >= 1) {
      this.spawnAccumulator -= 1
      this.spawnFlame(tier)
    }

    for (const particle of this.flameParticles) {
      if (particle.life <= 0) continue
      particle.life -= dt
      particle.sprite.position.addScaledVector(particle.velocity, dt)
      particle.velocity.y += dt * 0.45
      const t = Math.max(0, particle.life / particle.maxLife)
      particle.sprite.material.opacity = t * (0.24 + tier.flameIntensity * 0.74)
      const scale = (1 - t) * (0.36 + tier.flameIntensity * 0.42) + 0.14
      particle.sprite.scale.setScalar(scale)
      particle.sprite.visible = particle.life > 0
    }

    this.obstacleGroup.children.forEach((child, index) => {
      const mesh = child as THREE.Mesh
      const material = mesh.material as THREE.MeshStandardMaterial
      material.emissiveIntensity = 1.2 + Math.sin(time * 3 + index * 1.7) * 0.38
    })

    if (this.backboardMaterial && this.backboardFlashLight) {
      this.backboardFlash = Math.max(0, this.backboardFlash - dt * 2.8)
      const flash = this.backboardFlash
      this.backboardMaterial.emissive.setHex(flash > 0 ? tier.primaryColor : 0x00f0ff)
      this.backboardMaterial.emissiveIntensity = 0.7 + flash * 4.6
      this.backboardMaterial.opacity = 0.74 + flash * 0.2
      this.backboardFlashLight.color.setHex(tier.primaryColor)
      this.backboardFlashLight.intensity = flash * 8
    }

    if (this.screenPulse > 0) {
      this.screenPulse = Math.max(0, this.screenPulse - dt * 1.7)
      const pulse = 1 + this.screenPulse * 0.06
      this.hoopGroup.scale.setScalar(pulse)
    } else {
      this.hoopGroup.scale.setScalar(1)
    }
  }

  celebrateMake(tier: StreakTier): void {
    this.screenPulse = 1
    this.backboardFlash = 1
    for (let i = 0; i < 18 + tier.flameIntensity * 30; i += 1) {
      this.spawnFlame(tier, true)
    }
  }

  private addLights(): void {
    const ambient = new THREE.HemisphereLight(0x8be9ff, 0x14051f, 1.35)
    this.scene.add(ambient)

    const key = new THREE.DirectionalLight(0xffffff, 1.75)
    key.position.set(-4, 7, 7)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 30
    key.shadow.camera.left = -10
    key.shadow.camera.right = 10
    key.shadow.camera.top = 10
    key.shadow.camera.bottom = -10
    this.scene.add(key)

    const rimLight = new THREE.PointLight(0x00f0ff, 4, 18)
    rimLight.position.set(0, 4.4, -5)
    this.scene.add(rimLight)
  }

  private addCourt(): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 24, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x080b16,
        roughness: 0.42,
        metalness: 0.18,
        emissive: 0x041019,
        emissiveIntensity: 0.7,
      }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.z = -4.6
    floor.receiveShadow = true
    this.scene.add(floor)

    const grid = new THREE.GridHelper(24, 48, 0x00f0ff, 0x1c2946)
    grid.position.set(0, 0.018, -4.6)
    const gridMaterial = grid.material as THREE.Material
    gridMaterial.transparent = true
    gridMaterial.opacity = 0.34
    this.scene.add(grid)

    const laneMaterial = new THREE.LineBasicMaterial({
      color: 0xff3d85,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
    })
    const linePoints = [
      new THREE.Vector3(-2.1, 0.035, 5.5),
      new THREE.Vector3(-2.1, 0.035, -10.5),
      new THREE.Vector3(2.1, 0.035, -10.5),
      new THREE.Vector3(2.1, 0.035, 5.5),
      new THREE.Vector3(-2.1, 0.035, 5.5),
    ]
    this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePoints), laneMaterial))

    const circles = [
      { texture: this.cyanGlow, x: -3.9, z: 3.8, s: 2.3 },
      { texture: this.magentaGlow, x: 3.7, z: -7.8, s: 2.7 },
    ]
    for (const circle of circles) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: circle.texture,
          transparent: true,
          opacity: 0.48,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      sprite.position.set(circle.x, 0.05, circle.z)
      sprite.scale.set(circle.s, circle.s, 1)
      sprite.rotation.x = -Math.PI / 2
      this.scene.add(sprite)
    }

    this.scene.add(this.obstacleGroup)
  }

  private addHoop(): void {
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(RIM_RADIUS, 0.045, 16, 80),
      new THREE.MeshStandardMaterial({
        color: 0xff3d85,
        emissive: 0xff244d,
        emissiveIntensity: 2.3,
        roughness: 0.2,
        metalness: 0.45,
      }),
    )
    rim.rotation.x = Math.PI / 2
    rim.castShadow = true
    this.hoopGroup.add(rim)

    this.backboardMaterial = new THREE.MeshStandardMaterial({
        color: 0x13243a,
        transparent: true,
        opacity: 0.74,
        emissive: 0x00f0ff,
        emissiveIntensity: 0.7,
        roughness: 0.18,
        metalness: 0.4,
      })
    const backboard = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.42, 0.12),
      this.backboardMaterial,
    )
    backboard.position.set(0, 0.58, -0.62)
    backboard.castShadow = true
    this.hoopGroup.add(backboard)

    this.backboardFlashLight = new THREE.PointLight(0xffd85a, 0, 4.8)
    this.backboardFlashLight.position.set(0, 0.5, 0.1)
    this.hoopGroup.add(this.backboardFlashLight)

    const boardFrame = new THREE.LineSegments(
      new THREE.EdgesGeometry(backboard.geometry),
      new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.95 }),
    )
    boardFrame.position.copy(backboard.position)
    this.hoopGroup.add(boardFrame)

    const netMaterial = new THREE.LineBasicMaterial({
      color: 0x9ff8ff,
      transparent: true,
      opacity: 0.66,
      blending: THREE.AdditiveBlending,
    })
    for (let i = 0; i < 14; i += 1) {
      const angle = (i / 14) * Math.PI * 2
      const nextAngle = ((i + 1) / 14) * Math.PI * 2
      const top = new THREE.Vector3(Math.cos(angle) * RIM_RADIUS, 0, Math.sin(angle) * RIM_RADIUS)
      const bottom = new THREE.Vector3(Math.cos(nextAngle) * 0.34, -0.82, Math.sin(nextAngle) * 0.34)
      this.hoopGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([top, bottom]), netMaterial))
    }

    this.hoopGroup.position.set(0, RIM_HEIGHT, -7.5)
    this.scene.add(this.hoopGroup)
  }

  private createFlameParticles(): void {
    for (let i = 0; i < 90; i += 1) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.flameTexture,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      sprite.visible = false
      this.scene.add(sprite)
      this.flameParticles.push({
        sprite,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
      })
    }
  }

  private spawnFlame(tier: StreakTier, burst = false): void {
    const particle = this.flameParticles.find((candidate) => candidate.life <= 0)
    if (!particle) return

    const angle = Math.random() * Math.PI * 2
    const radius = BALL_RADIUS * (0.45 + Math.random() * 0.95)
    particle.sprite.position
      .copy(this.ballMesh.position)
      .add(new THREE.Vector3(Math.cos(angle) * radius, Math.random() * 0.18, Math.sin(angle) * radius))
    particle.velocity.set(
      Math.cos(angle) * (0.16 + Math.random() * 0.8),
      0.35 + Math.random() * (burst ? 2.3 : 1.1),
      Math.sin(angle) * (0.16 + Math.random() * 0.8),
    )
    particle.maxLife = burst ? 0.7 + Math.random() * 0.35 : 0.46 + Math.random() * 0.42
    particle.life = particle.maxLife
    particle.sprite.material.color.setHex(Math.random() > 0.45 ? tier.primaryColor : tier.secondaryColor)
    particle.sprite.material.opacity = 0.3 + tier.flameIntensity * 0.65
    particle.sprite.scale.setScalar(0.12 + Math.random() * (0.22 + tier.flameIntensity * 0.3))
    particle.sprite.visible = true
  }
}
