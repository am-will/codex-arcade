import RAPIER, { type Collider, type RigidBody, type World } from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { BACKBOARD_Z, BALL_RADIUS, LAUNCH_POSITION, RIM_RADIUS } from './config'
import type { LevelConfig } from './types'

const NET_STRANDS = 18
const NET_ROWS = 7
const NET_LENGTH = 1.02
const NET_TOP_RADIUS = RIM_RADIUS * 0.96
const NET_BOTTOM_RADIUS = 0.34
const NET_GRAVITY = -13.6
const NET_AIR_DRAG = 0.956
const NET_CONSTRAINT_ITERATIONS = 7
const NET_IMPACT_RADIUS = BALL_RADIUS + 0.18
const NET_RENDER_SEGMENTS = NET_STRANDS * ((NET_ROWS - 1) * 3 + NET_ROWS)
const NET_SEGMENT_FLOATS = NET_RENDER_SEGMENTS * 2 * 3
const NET_MAX_DISPLACEMENT = [0, 0.22, 0.34, 0.48, 0.62, 0.72, 0.82]
const NET_ROW_DROP = NET_LENGTH / (NET_ROWS - 1)
const NET_MIN_ROW_DROP = NET_ROW_DROP * 0.52
const NET_ALLOWED_UPWARD_DISPLACEMENT = [0, 0.018, 0.024, 0.032, 0.04, 0.048, 0.056]

type NetHitKind = 'rim' | 'net' | 'through'

type NetImpactState = {
  touchedRim: boolean
  touchedNet: boolean
  passedThrough: boolean
  wasAboveRim: boolean
  lastThroughImpulseY: number
}

type NetParticle = {
  position: THREE.Vector3
  previous: THREE.Vector3
  restLocal: THREE.Vector3
  mass: number
  pinned: boolean
}

type NetConstraint = {
  a: NetParticle
  b: NetParticle
  restLength: number
  stiffness: number
}

export class PhysicsWorld {
  readonly world: World

  private readonly hoopBody: RigidBody
  private readonly hoopPosition = new THREE.Vector3(0, 3.05, -7.5)
  private readonly previousHoopPosition = this.hoopPosition.clone()
  private readonly netParticles: NetParticle[][] = []
  private readonly netConstraints: NetConstraint[] = []
  private readonly netRenderSegments: Array<[NetParticle, NetParticle]> = []
  private readonly netSegmentPositions = new Float32Array(NET_SEGMENT_FLOATS)
  private readonly netImpactStates = new Map<number, NetImpactState>()
  private obstacleBodies: RigidBody[] = []
  private readonly tmpVector = new THREE.Vector3()
  private readonly tmpNetVector = new THREE.Vector3()
  private readonly tmpNetVectorB = new THREE.Vector3()
  private netExcitement = 0

  private constructor(world: World, hoopBody: RigidBody) {
    this.world = world
    this.hoopBody = hoopBody
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init()
    const world = new RAPIER.World({ x: 0, y: -9.4, z: 0 })

    const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.06, -4.6))
    world.createCollider(RAPIER.ColliderDesc.cuboid(4.5, 0.06, 12).setFriction(0.86).setRestitution(0.42), floorBody)

    const hoopBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 3.05, -7.5))
    PhysicsWorld.createHoopColliders(world, hoopBody)

    const physics = new PhysicsWorld(world, hoopBody)
    physics.createNet()
    return physics
  }

  step(dt: number): void {
    const timestep = Math.min(1 / 30, Math.max(1 / 120, dt))
    this.world.timestep = timestep
    this.world.step()
    this.simulateNet(timestep)
    this.netExcitement = Math.max(0, this.netExcitement - timestep)
  }

  createShotBody(velocity: THREE.Vector3, position = LAUNCH_POSITION): RigidBody {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setCanSleep(false)
        .setLinearDamping(0.05)
        .setAngularDamping(0.04),
    )
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS).setDensity(0.9).setFriction(0.62).setRestitution(0.55),
      body,
    )
    body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true)
    body.setAngvel({ x: velocity.z * -1.7, y: velocity.x * 1.1, z: velocity.x * -0.8 }, true)
    return body
  }

  removeShotBody(body: RigidBody): void {
    this.world.removeRigidBody(body)
  }

  getBodyPosition(body: RigidBody, target = new THREE.Vector3()): THREE.Vector3 {
    const translation = body.translation()
    return target.set(translation.x, translation.y, translation.z)
  }

  getBodyRotation(body: RigidBody, target = new THREE.Quaternion()): THREE.Quaternion {
    const rotation = body.rotation()
    return target.set(rotation.x, rotation.y, rotation.z, rotation.w)
  }

  getBodyVelocity(body: RigidBody, target = new THREE.Vector3()): THREE.Vector3 {
    const velocity = body.linvel()
    return target.set(velocity.x, velocity.y, velocity.z)
  }

  setHoopPosition(x: number, z: number): void {
    this.hoopPosition.set(x, 3.05, z)
    this.hoopBody.setNextKinematicTranslation({ x, y: 3.05, z })
  }

  updateNetForShot(id: number, position: THREE.Vector3, velocity: THREE.Vector3): void {
    const localX = position.x - this.hoopPosition.x
    const localY = position.y - this.hoopPosition.y
    const localZ = position.z - this.hoopPosition.z
    const radialDistance = Math.hypot(localX, localZ)
    const speed = velocity.length()
    const impactScale = THREE.MathUtils.clamp(speed / 8, 0.35, 1.65)

    let state = this.netImpactStates.get(id)
    if (!state) {
      state = {
        touchedRim: false,
        touchedNet: false,
        passedThrough: false,
        wasAboveRim: localY > 0.2,
        lastThroughImpulseY: Number.POSITIVE_INFINITY,
      }
      this.netImpactStates.set(id, state)
    }

    state.wasAboveRim ||= localY > 0.18

    const nearRimHeight = Math.abs(localY) < BALL_RADIUS * 0.62
    const nearRimTube = Math.abs(radialDistance - RIM_RADIUS) < BALL_RADIUS * 0.5
    if (!state.touchedRim && nearRimHeight && nearRimTube) {
      state.touchedRim = true
      this.applyNetImpact(position, velocity, 'rim', 0.55 * impactScale)
    }

    const inNetHeight = localY < 0.1 && localY > -NET_LENGTH - BALL_RADIUS * 0.55
    if (inNetHeight) {
      const contacted = this.collideNetWithBall(position, velocity)
      if (contacted) {
        this.netExcitement = Math.max(this.netExcitement, 1.2)
        state.touchedNet = true
      }
    }

    const movingDownThroughOpening = state.wasAboveRim && velocity.y < -0.2 && radialDistance < RIM_RADIUS * 0.72
    if (movingDownThroughOpening && localY < 0.22 && localY > -NET_LENGTH) {
      this.applySwishPull(position, velocity, 0.19 * impactScale)
    }
    if (!state.passedThrough && movingDownThroughOpening && localY < -BALL_RADIUS * 0.14) {
      state.passedThrough = true
      state.lastThroughImpulseY = localY
      this.applyNetImpact(position, velocity, 'through', 0.62 * impactScale)
      this.applySwishPull(position, velocity, 0.85 * impactScale)
    } else if (state.passedThrough && movingDownThroughOpening && localY < state.lastThroughImpulseY - 0.16 && localY > -NET_LENGTH) {
      state.lastThroughImpulseY = localY
      this.applyNetImpact(position, velocity, 'through', 0.1 * impactScale)
      this.applySwishPull(position, velocity, 0.16 * impactScale)
    }
  }

  releaseNetShot(id: number): void {
    this.netImpactStates.delete(id)
  }

  swishNetForMake(position: THREE.Vector3, velocity: THREE.Vector3): void {
    this.applySwishPull(position, velocity, 1.85)
  }

  getNetSegmentPositions(): Float32Array {
    this.pinNetToHoop()
    let cursor = 0
    for (const [a, b] of this.netRenderSegments) {
      cursor = this.writeNetSegmentPoint(cursor, a.position)
      cursor = this.writeNetSegmentPoint(cursor, b.position)
    }
    return this.netSegmentPositions.subarray(0, cursor)
  }

  isNetActive(): boolean {
    if (this.netExcitement > 0) return true
    if (this.hoopPosition.distanceToSquared(this.previousHoopPosition) > 0.000001) return true
    for (const row of this.netParticles) {
      for (const particle of row) {
        if (particle.pinned) continue
        const speed = particle.position.distanceToSquared(particle.previous)
        if (speed > 0.000006) return true
        const rest = this.tmpNetVector.copy(this.hoopPosition).add(particle.restLocal)
        if (particle.position.distanceToSquared(rest) > 0.0012) return true
      }
    }
    return false
  }

  syncObstacles(level: LevelConfig): void {
    for (const body of this.obstacleBodies) {
      this.world.removeRigidBody(body)
    }
    this.obstacleBodies = []

    for (const obstacle of level.obstacleConfigs) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(obstacle.position[0], obstacle.position[1], obstacle.position[2]),
      )
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(obstacle.size[0] / 2, obstacle.size[1] / 2, obstacle.size[2] / 2)
          .setFriction(0.3)
          .setRestitution(0.65),
        body,
      )
      this.obstacleBodies.push(body)
    }
  }

  private static createHoopColliders(world: World, body: RigidBody): Collider[] {
    const colliders: Collider[] = []
    colliders.push(
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(1.3, 0.71, 0.06).setTranslation(0, 0.58, BACKBOARD_Z).setRestitution(0.7),
        body,
      ),
    )
    colliders.push(
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.055, 0.05, RIM_RADIUS).setTranslation(-RIM_RADIUS, 0, 0).setRestitution(0.5),
        body,
      ),
    )
    colliders.push(
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.055, 0.05, RIM_RADIUS).setTranslation(RIM_RADIUS, 0, 0).setRestitution(0.5),
        body,
      ),
    )
    colliders.push(
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(RIM_RADIUS, 0.05, 0.055).setTranslation(0, 0, -RIM_RADIUS).setRestitution(0.5),
        body,
      ),
    )
    colliders.push(
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(RIM_RADIUS * 0.42, 0.045, 0.055).setTranslation(0, 0, RIM_RADIUS).setRestitution(0.5),
        body,
      ),
    )
    return colliders
  }

  private createNet(): void {
    for (let row = 0; row < NET_ROWS; row += 1) {
      const particles: NetParticle[] = []
      const rowT = row / (NET_ROWS - 1)
      const radius = THREE.MathUtils.lerp(NET_TOP_RADIUS, NET_BOTTOM_RADIUS, rowT)
      const y = -NET_LENGTH * rowT
      const twist = rowT * (Math.PI / NET_STRANDS)

      for (let strand = 0; strand < NET_STRANDS; strand += 1) {
        const angle = (strand / NET_STRANDS) * Math.PI * 2 + twist
        const restLocal = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
        const position = this.hoopPosition.clone().add(restLocal)
        particles.push({
          position,
          previous: position.clone(),
          restLocal,
          mass: 0.82 + rowT * 0.58,
          pinned: row === 0,
        })
      }
      this.netParticles.push(particles)
    }

    for (let row = 0; row < NET_ROWS; row += 1) {
      for (let strand = 0; strand < NET_STRANDS; strand += 1) {
        const next = (strand + 1) % NET_STRANDS
        this.addNetConstraint(row, strand, row, next, row === 0 ? 0.9 : 0.56, true)

        if (row < NET_ROWS - 1) {
          this.addNetConstraint(row, strand, row + 1, strand, 0.86, true)
          this.addNetConstraint(row, strand, row + 1, next, 0.48, true)
          this.addNetConstraint(row, next, row + 1, strand, 0.38, true)
        }
      }
    }

    this.pinNetToHoop()
  }

  private addNetConstraint(rowA: number, strandA: number, rowB: number, strandB: number, stiffness: number, render: boolean): void {
    const a = this.netParticles[rowA][strandA]
    const b = this.netParticles[rowB][strandB]
    this.netConstraints.push({
      a,
      b,
      restLength: a.restLocal.distanceTo(b.restLocal),
      stiffness,
    })
    if (render) this.netRenderSegments.push([a, b])
  }

  private simulateNet(dt: number): void {
    const substeps = dt > 1 / 70 ? 2 : 1
    const stepDt = dt / substeps

    for (let substep = 0; substep < substeps; substep += 1) {
      this.pinNetToHoop()
      this.integrateNet(stepDt)
      for (let iteration = 0; iteration < NET_CONSTRAINT_ITERATIONS; iteration += 1) {
        this.pinNetToHoop()
        this.solveNetConstraints()
        this.limitNetDisplacement()
        this.enforceNetHangingShape()
      }
      this.enforceNetHangingShape()
      this.pinNetToHoop()
    }

    this.previousHoopPosition.copy(this.hoopPosition)
  }

  private pinNetToHoop(): void {
    for (const particle of this.netParticles[0]) {
      particle.position.copy(this.hoopPosition).add(particle.restLocal)
      particle.previous.copy(particle.position)
    }
  }

  private integrateNet(dt: number): void {
    const gravityStep = NET_GRAVITY * dt * dt
    const settleStrength = this.netExcitement > 0.25 ? 0.0015 : 0.008

    for (let row = 1; row < NET_ROWS; row += 1) {
      for (const particle of this.netParticles[row]) {
        const velocity = this.tmpNetVector.copy(particle.position).sub(particle.previous).multiplyScalar(NET_AIR_DRAG)
        particle.previous.copy(particle.position)
        particle.position.add(velocity)
        particle.position.y += gravityStep

        const rest = this.tmpNetVectorB.copy(this.hoopPosition).add(particle.restLocal)
        particle.position.x += (rest.x - particle.position.x) * settleStrength
        particle.position.z += (rest.z - particle.position.z) * settleStrength
        if (this.netExcitement < 0.08) particle.position.y += (rest.y - particle.position.y) * settleStrength * 0.35
      }
    }
  }

  private solveNetConstraints(): void {
    for (const constraint of this.netConstraints) {
      const delta = this.tmpNetVector.copy(constraint.b.position).sub(constraint.a.position)
      const distance = delta.length()
      if (distance <= 0.000001) continue

      const invMassA = constraint.a.pinned ? 0 : 1 / constraint.a.mass
      const invMassB = constraint.b.pinned ? 0 : 1 / constraint.b.mass
      const invMassTotal = invMassA + invMassB
      if (invMassTotal <= 0) continue

      const correctionScale = ((distance - constraint.restLength) / distance) * constraint.stiffness
      delta.multiplyScalar(correctionScale)
      if (invMassA > 0) constraint.a.position.addScaledVector(delta, invMassA / invMassTotal)
      if (invMassB > 0) constraint.b.position.addScaledVector(delta, -invMassB / invMassTotal)
    }
  }

  private limitNetDisplacement(): void {
    for (let row = 1; row < NET_ROWS; row += 1) {
      const maxDistance = NET_MAX_DISPLACEMENT[row]
      for (const particle of this.netParticles[row]) {
        const rest = this.tmpNetVector.copy(this.hoopPosition).add(particle.restLocal)
        const offset = this.tmpNetVectorB.copy(particle.position).sub(rest)
        const distance = offset.length()
        if (distance <= maxDistance) continue

        offset.multiplyScalar(maxDistance / distance)
        const velocity = particle.position.clone().sub(particle.previous).multiplyScalar(0.35)
        particle.position.copy(rest).add(offset)
        particle.previous.copy(particle.position).sub(velocity)
      }
    }
  }

  private enforceNetHangingShape(): void {
    for (let row = 1; row < NET_ROWS; row += 1) {
      const allowedUp = NET_ALLOWED_UPWARD_DISPLACEMENT[row]
      for (let strand = 0; strand < NET_STRANDS; strand += 1) {
        const particle = this.netParticles[row][strand]
        const parent = this.netParticles[row - 1][strand]
        const restY = this.hoopPosition.y + particle.restLocal.y
        const highestByRest = restY + allowedUp
        const highestByParent = parent.position.y - NET_MIN_ROW_DROP
        const highestAllowed = Math.min(highestByRest, highestByParent)

        if (particle.position.y > highestAllowed) {
          const upwardVelocity = Math.max(0, particle.position.y - particle.previous.y)
          particle.position.y += (highestAllowed - particle.position.y) * 0.72
          if (upwardVelocity > 0) {
            particle.previous.y = particle.position.y - upwardVelocity * 0.16
          }
        }
      }
    }
  }

  private collideNetWithBall(position: THREE.Vector3, velocity: THREE.Vector3): boolean {
    let contacted = false
    const contactRadius = BALL_RADIUS + 0.05

    for (let row = 1; row < NET_ROWS; row += 1) {
      for (const particle of this.netParticles[row]) {
        const delta = this.tmpNetVector.copy(particle.position).sub(position)
        let distance = delta.length()
        if (distance >= contactRadius) continue
        if (distance <= 0.000001) {
          delta.set(particle.restLocal.x, -0.18, particle.restLocal.z).normalize()
          distance = 0.000001
        } else {
          delta.multiplyScalar(1 / distance)
        }

        const penetration = contactRadius - distance
        const rowInfluence = 0.45 + row / NET_ROWS
        particle.position.addScaledVector(delta, penetration * rowInfluence)
        this.applyNetVelocity(particle, velocity, 0.12 * rowInfluence)
        contacted = true
      }
    }

    return contacted
  }

  private applyNetImpact(position: THREE.Vector3, velocity: THREE.Vector3, kind: NetHitKind, strength: number): void {
    const radial = this.tmpNetVector.set(position.x - this.hoopPosition.x, 0, position.z - this.hoopPosition.z)
    if (radial.lengthSq() < 0.0001) radial.set(0, 0, 1)
    radial.normalize()

    const impulse = this.tmpVector.copy(velocity).multiplyScalar(0.11 * strength)
    if (kind === 'rim') {
      impulse.addScaledVector(radial, strength * 0.55)
      impulse.y -= strength * 0.12
    } else if (kind === 'through') {
      impulse.addScaledVector(radial, strength * 0.24)
      impulse.y -= strength * 0.52
    } else {
      impulse.addScaledVector(radial, strength * 0.34)
      impulse.y -= strength * 0.18
    }

    const maxDistance = kind === 'through' ? BALL_RADIUS + 0.58 : NET_IMPACT_RADIUS
    for (let row = 1; row < NET_ROWS; row += 1) {
      for (const particle of this.netParticles[row]) {
        const distance = particle.position.distanceTo(position)
        if (distance > maxDistance) continue
        const falloff = (1 - distance / maxDistance) * (0.65 + row / NET_ROWS)
        this.applyNetVelocity(particle, impulse, falloff)
      }
    }

    this.netExcitement = Math.max(this.netExcitement, kind === 'through' ? 1.45 : 1.0)
  }

  private applySwishPull(position: THREE.Vector3, velocity: THREE.Vector3, strength: number): void {
    const localY = position.y - this.hoopPosition.y
    const ballRowT = THREE.MathUtils.clamp(-localY / NET_LENGTH, 0, 1)
    const downwardSpeed = Math.max(1.2, -velocity.y)

    for (let row = 1; row < NET_ROWS; row += 1) {
      const rowT = row / (NET_ROWS - 1)
      const verticalFalloff = Math.exp(-Math.abs(rowT - ballRowT) * 3.2)
      const rowFalloff = (0.34 + verticalFalloff) * (0.55 + rowT * 0.58) * strength

      for (const particle of this.netParticles[row]) {
        const radial = this.tmpNetVector.set(
          particle.position.x - this.hoopPosition.x,
          0,
          particle.position.z - this.hoopPosition.z,
        )
        if (radial.lengthSq() < 0.0001) continue
        radial.normalize()

        const inward = this.tmpNetVectorB.copy(radial).multiplyScalar(-1)
        particle.position.addScaledVector(inward, 0.074 * rowFalloff)
        particle.position.y -= 0.102 * rowFalloff

        const swishVelocity = this.tmpVector
          .copy(inward)
          .multiplyScalar(0.92)
          .addScaledVector(radial, rowT > 0.62 ? 0.34 : 0)
          .addScaledVector(velocity, 0.045)
        swishVelocity.y -= downwardSpeed * 0.56
        this.applyNetVelocity(particle, swishVelocity, rowFalloff)
      }
    }

    this.netExcitement = Math.max(this.netExcitement, 1.8)
  }

  private applyNetVelocity(particle: NetParticle, velocity: THREE.Vector3, scale: number): void {
    const massScale = scale / particle.mass
    particle.previous.addScaledVector(velocity, -massScale / 60)
  }

  private writeNetSegmentPoint(cursor: number, point: THREE.Vector3): number {
    this.netSegmentPositions[cursor] = point.x
    this.netSegmentPositions[cursor + 1] = point.y
    this.netSegmentPositions[cursor + 2] = point.z
    return cursor + 3
  }

  get tmp(): THREE.Vector3 {
    return this.tmpVector
  }
}
