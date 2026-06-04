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

type BackboardSpark = {
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
  private readonly backboardSparkles: BackboardSpark[] = []
  private readonly shotTrail: THREE.Line
  private readonly trailPositions: THREE.Vector3[] = []
  private readonly flameTexture = createFlameTexture()
  private readonly cyanGlow = createGlowTexture('rgba(0, 240, 255, 0.82)')
  private readonly sparkleTexture = createGlowTexture('rgba(255, 216, 90, 0.92)')
  private backboardMaterial!: THREE.MeshStandardMaterial
  private backboardFrameMaterial!: THREE.LineBasicMaterial
  private backboardAimMaterial!: THREE.MeshBasicMaterial
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
    this.createBackboardSparkles()
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

    const flameActive = tier.threshold >= 5
    if (flameActive) {
      this.spawnAccumulator += dt * tier.particleRate
      while (this.spawnAccumulator >= 1) {
        this.spawnAccumulator -= 1
        this.spawnFlame(tier)
      }
    } else {
      this.spawnAccumulator = 0
    }

    for (const particle of this.flameParticles) {
      if (particle.life <= 0) continue
      particle.life -= dt
      particle.sprite.position.addScaledVector(particle.velocity, dt)
      particle.velocity.y += dt * 0.16
      const t = Math.max(0, particle.life / particle.maxLife)
      particle.sprite.material.opacity = t * t * (0.38 + tier.flameIntensity * 0.66)
      const scale = 0.08 + t * (0.22 + tier.flameIntensity * 0.36)
      particle.sprite.scale.setScalar(scale)
      particle.sprite.visible = particle.life > 0
    }

    for (const sparkle of this.backboardSparkles) {
      if (sparkle.life <= 0) continue
      sparkle.life -= dt
      sparkle.sprite.position.addScaledVector(sparkle.velocity, dt)
      sparkle.velocity.multiplyScalar(1 - dt * 1.8)
      const t = Math.max(0, sparkle.life / sparkle.maxLife)
      sparkle.sprite.material.opacity = t * 0.95
      sparkle.sprite.scale.setScalar(0.05 + t * 0.16)
      sparkle.sprite.visible = sparkle.life > 0
    }

    this.obstacleGroup.children.forEach((child, index) => {
      const mesh = child as THREE.Mesh
      const material = mesh.material as THREE.MeshStandardMaterial
      material.emissiveIntensity = 1.2 + Math.sin(time * 3 + index * 1.7) * 0.38
    })

    if (this.backboardMaterial && this.backboardFlashLight) {
      this.backboardFlash = Math.max(0, this.backboardFlash - dt * 2.8)
      this.screenPulse = Math.max(0, this.screenPulse - dt * 3.4)
      const flash = Math.max(this.backboardFlash, this.screenPulse * 0.72)
      this.backboardMaterial.emissive.setHex(flash > 0 ? 0xffd85a : 0x00f0ff)
      this.backboardMaterial.emissiveIntensity = 0.62 + flash * (3.2 + Math.sin(time * 24) * 0.45)
      this.backboardMaterial.opacity = 0.74 + flash * 0.2
      this.backboardFlashLight.color.setHex(flash > 0 ? 0xffd85a : 0x00f0ff)
      this.backboardFlashLight.intensity = flash * 9
      this.backboardFrameMaterial.opacity = 0.78 + flash * 0.22
      this.backboardAimMaterial.opacity = 0.86 + flash * 0.14
      this.backboardAimMaterial.color.setHex(flash > 0.18 ? 0xffffff : 0xffd85a)
    }
  }

  celebrateMake(tier: StreakTier): void {
    this.screenPulse = 1
    this.backboardFlash = 1
    this.spawnBackboardSparkles(tier)
    if (tier.threshold >= 5) {
      for (let i = 0; i < 18 + tier.flameIntensity * 30; i += 1) {
        this.spawnFlame(tier, true)
      }
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

    const circles = [{ texture: this.cyanGlow, x: -3.9, z: 3.8, s: 2.3 }]
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

    this.backboardFrameMaterial = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.95 })
    const boardFrame = new THREE.LineSegments(
      new THREE.EdgesGeometry(backboard.geometry),
      this.backboardFrameMaterial,
    )
    boardFrame.position.copy(backboard.position)
    this.hoopGroup.add(boardFrame)

    this.backboardAimMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd85a,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    })
    const aimSquare = new THREE.Group()
    const squareWidth = 0.94
    const squareHeight = 0.72
    const stroke = 0.058
    const bottomY = 0.02
    const centerY = bottomY + squareHeight / 2
    const frontZ = -0.53
    const horizontalGeometry = new THREE.BoxGeometry(squareWidth + stroke, stroke, 0.012)
    const verticalGeometry = new THREE.BoxGeometry(stroke, squareHeight + stroke, 0.012)
    const top = new THREE.Mesh(horizontalGeometry, this.backboardAimMaterial)
    top.position.set(0, bottomY + squareHeight, frontZ)
    const left = new THREE.Mesh(verticalGeometry, this.backboardAimMaterial)
    left.position.set(-squareWidth / 2, centerY, frontZ)
    const right = new THREE.Mesh(verticalGeometry, this.backboardAimMaterial)
    right.position.set(squareWidth / 2, centerY, frontZ)
    aimSquare.add(top, left, right)
    this.hoopGroup.add(aimSquare)

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

  private createBackboardSparkles(): void {
    for (let i = 0; i < 70; i += 1) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.sparkleTexture,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      sprite.visible = false
      this.hoopGroup.add(sprite)
      this.backboardSparkles.push({
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
    particle.sprite.position.copy(this.ballMesh.position).add(new THREE.Vector3(Math.cos(angle) * radius, Math.random() * 0.16, Math.sin(angle) * radius))
    particle.velocity.set(
      Math.cos(angle) * (0.05 + Math.random() * 0.34),
      0.6 + Math.random() * (burst ? 1.7 : 0.72),
      Math.sin(angle) * (0.05 + Math.random() * 0.34),
    )
    particle.maxLife = burst ? 0.38 + Math.random() * 0.24 : 0.28 + Math.random() * 0.22
    particle.life = particle.maxLife
    particle.sprite.material.color.setHex(Math.random() > 0.45 ? tier.primaryColor : tier.secondaryColor)
    particle.sprite.material.opacity = 0.42 + tier.flameIntensity * 0.58
    particle.sprite.scale.setScalar(0.1 + Math.random() * (0.12 + tier.flameIntensity * 0.26))
    particle.sprite.visible = true
  }

  private spawnBackboardSparkles(tier: StreakTier): void {
    const count = 22 + Math.floor(tier.flameIntensity * 18)
    for (let i = 0; i < count; i += 1) {
      const sparkle = this.backboardSparkles.find((candidate) => candidate.life <= 0)
      if (!sparkle) return
      const side = Math.random() > 0.5 ? 1 : -1
      const fromHorizontalEdge = Math.random() > 0.48
      const x = fromHorizontalEdge ? side * (1.18 + Math.random() * 0.12) : THREE.MathUtils.randFloatSpread(2.18)
      const y = fromHorizontalEdge ? 0.58 + THREE.MathUtils.randFloatSpread(1.02) : 0.02 + Math.random() * 1.16
      sparkle.sprite.position.set(x, y, -0.49)
      sparkle.velocity.set(
        THREE.MathUtils.randFloatSpread(0.82),
        0.28 + Math.random() * 0.86,
        0.06 + Math.random() * 0.18,
      )
      sparkle.maxLife = 0.36 + Math.random() * 0.34
      sparkle.life = sparkle.maxLife
      sparkle.sprite.material.color.setHex(Math.random() > 0.35 ? 0xffd85a : tier.secondaryColor)
      sparkle.sprite.material.opacity = 0.95
      sparkle.sprite.scale.setScalar(0.08 + Math.random() * 0.12)
      sparkle.sprite.visible = true
    }
  }
}
