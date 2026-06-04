import RAPIER, { type Collider, type RigidBody, type World } from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { BACKBOARD_Z, BALL_RADIUS, LAUNCH_POSITION, RIM_RADIUS } from './config'
import type { LevelConfig } from './types'

const NET_STRANDS = 16
const NET_ROWS = 4
const NET_LENGTH = 0.88
const NET_TOP_RADIUS = RIM_RADIUS * 0.96
const NET_BOTTOM_RADIUS = 0.34
const NET_NODE_RADIUS = 0.032
const NET_IMPACT_RADIUS = BALL_RADIUS + 0.2
const NET_SEGMENT_FLOATS = NET_STRANDS * (1 + (NET_ROWS - 1) + NET_ROWS + (NET_ROWS - 1)) * 2 * 3
const NET_MAX_DISPLACEMENT = [0.16, 0.34, 0.48, 0.58]

type NetHitKind = 'rim' | 'net' | 'through'

type NetImpactState = {
  touchedRim: boolean
  touchedNet: boolean
  passedThrough: boolean
  wasAboveRim: boolean
  lastThroughImpulseY: number
}

export class PhysicsWorld {
  readonly world: World

  private readonly hoopBody: RigidBody
  private readonly netNodes: RigidBody[][] = []
  private readonly netRestLocal: THREE.Vector3[][] = []
  private readonly netSegments: Array<[number, number, number, number]> = []
  private readonly netSegmentPositions = new Float32Array(NET_SEGMENT_FLOATS)
  private readonly netImpactStates = new Map<number, NetImpactState>()
  private obstacleBodies: RigidBody[] = []
  private readonly tmpVector = new THREE.Vector3()
  private readonly tmpNetVector = new THREE.Vector3()
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
    this.world.timestep = Math.min(1 / 30, Math.max(1 / 120, dt))
    this.world.step()
    this.stabilizeNet()
    this.netExcitement = Math.max(0, this.netExcitement - dt)
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
    this.hoopBody.setNextKinematicTranslation({ x, y: 3.05, z })
  }

  updateNetForShot(id: number, position: THREE.Vector3, velocity: THREE.Vector3): void {
    const hoop = this.hoopBody.translation()
    const localX = position.x - hoop.x
    const localY = position.y - hoop.y
    const localZ = position.z - hoop.z
    const radialDistance = Math.hypot(localX, localZ)
    const speed = velocity.length()
    const impactScale = THREE.MathUtils.clamp(speed / 9, 0.35, 1.8)

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

    const nearRimHeight = Math.abs(localY) < BALL_RADIUS * 0.65
    const nearRimTube = Math.abs(radialDistance - RIM_RADIUS) < BALL_RADIUS * 0.55
    if (!state.touchedRim && nearRimHeight && nearRimTube) {
      state.touchedRim = true
      this.applyNetImpact(position, velocity, 'rim', 0.62 * impactScale)
    }

    const inNetHeight = localY < 0.08 && localY > -NET_LENGTH - BALL_RADIUS * 0.5
    const netRadiusAtBall = THREE.MathUtils.lerp(NET_TOP_RADIUS, NET_BOTTOM_RADIUS, THREE.MathUtils.clamp(-localY / NET_LENGTH, 0, 1))
    const brushesNet = inNetHeight && Math.abs(radialDistance - netRadiusAtBall) < NET_IMPACT_RADIUS
    if (brushesNet) {
      this.applyNetImpact(position, velocity, 'net', (state.touchedNet ? 0.05 : 0.3) * impactScale)
      state.touchedNet = true
    }

    const movingDownThroughOpening = state.wasAboveRim && velocity.y < -0.2 && radialDistance < RIM_RADIUS * 0.72
    if (!state.passedThrough && movingDownThroughOpening && localY < -BALL_RADIUS * 0.16) {
      state.passedThrough = true
      this.applyNetImpact(position, velocity, 'through', 0.75 * impactScale)
    } else if (state.passedThrough && movingDownThroughOpening && localY < state.lastThroughImpulseY - 0.12 && localY > -NET_LENGTH) {
      state.lastThroughImpulseY = localY
      this.applyNetImpact(position, velocity, 'through', 0.12 * impactScale)
    }
  }

  releaseNetShot(id: number): void {
    this.netImpactStates.delete(id)
  }

  getNetSegmentPositions(): Float32Array {
    let cursor = 0
    const hoop = this.hoopBody.translation()

    for (let strand = 0; strand < NET_STRANDS; strand += 1) {
      const anchor = this.netRestLocal[0][strand]
      cursor = this.writeNetSegmentPoint(cursor, hoop.x + anchor.x, hoop.y + anchor.y, hoop.z + anchor.z)
      cursor = this.writeNetSegmentBody(cursor, this.netNodes[0][strand])
    }

    for (const [rowA, strandA, rowB, strandB] of this.netSegments) {
      cursor = this.writeNetSegmentBody(cursor, this.netNodes[rowA][strandA])
      cursor = this.writeNetSegmentBody(cursor, this.netNodes[rowB][strandB])
    }

    return this.netSegmentPositions.subarray(0, cursor)
  }

  isNetActive(): boolean {
    if (this.netExcitement > 0) return true
    const hoop = this.hoopBody.translation()
    for (const row of this.netNodes) {
      const rowIndex = this.netNodes.indexOf(row)
      for (let strand = 0; strand < row.length; strand += 1) {
        const node = row[strand]
        const velocity = node.linvel()
        if (velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z > 0.0008) return true
        const position = node.translation()
        const rest = this.netRestLocal[rowIndex][strand]
        const dx = position.x - hoop.x - rest.x
        const dy = position.y - hoop.y - rest.y
        const dz = position.z - hoop.z - rest.z
        if (dx * dx + dy * dy + dz * dz > 0.0009) return true
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
    const hoop = this.hoopBody.translation()

    for (let row = 0; row < NET_ROWS; row += 1) {
      const rowNodes: RigidBody[] = []
      const rowRest: THREE.Vector3[] = []
      const rowT = row / (NET_ROWS - 1)
      const radius = THREE.MathUtils.lerp(NET_TOP_RADIUS, NET_BOTTOM_RADIUS, rowT)
      const y = -NET_LENGTH * rowT
      const twist = rowT * (Math.PI / NET_STRANDS)

      for (let strand = 0; strand < NET_STRANDS; strand += 1) {
        const angle = (strand / NET_STRANDS) * Math.PI * 2 + twist
        const local = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
        const body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(hoop.x + local.x, hoop.y + local.y, hoop.z + local.z)
            .setLinearDamping(3.8)
            .setAngularDamping(8)
            .setCanSleep(false)
            .setGravityScale(0.36)
            .setAdditionalSolverIterations(3),
        )
        this.world.createCollider(RAPIER.ColliderDesc.ball(NET_NODE_RADIUS).setDensity(0.08).setSensor(true), body)
        rowNodes.push(body)
        rowRest.push(local)
      }

      this.netNodes.push(rowNodes)
      this.netRestLocal.push(rowRest)
    }

    const zero = { x: 0, y: 0, z: 0 }
    for (let strand = 0; strand < NET_STRANDS; strand += 1) {
      const top = this.netRestLocal[0][strand]
      this.world.createImpulseJoint(RAPIER.JointData.spring(0.02, 120, 9, top, zero), this.hoopBody, this.netNodes[0][strand], true)
      this.world.createImpulseJoint(RAPIER.JointData.rope(0.08, top, zero), this.hoopBody, this.netNodes[0][strand], true)

      for (let row = 0; row < NET_ROWS - 1; row += 1) {
        const bodyA = this.netNodes[row][strand]
        const bodyB = this.netNodes[row + 1][strand]
        const rest = this.netRestLocal[row][strand].distanceTo(this.netRestLocal[row + 1][strand])
        this.world.createImpulseJoint(RAPIER.JointData.spring(rest, 32, 3.6, zero, zero), bodyA, bodyB, true)
        this.world.createImpulseJoint(RAPIER.JointData.rope(rest * 1.22, zero, zero), bodyA, bodyB, true)
        this.netSegments.push([row, strand, row + 1, strand])
      }

      for (let row = 0; row < NET_ROWS; row += 1) {
        const next = (strand + 1) % NET_STRANDS
        const bodyA = this.netNodes[row][strand]
        const bodyB = this.netNodes[row][next]
        const rest = this.netRestLocal[row][strand].distanceTo(this.netRestLocal[row][next])
        this.world.createImpulseJoint(RAPIER.JointData.spring(rest, row === 0 ? 18 : 13, 2.2, zero, zero), bodyA, bodyB, true)
        this.netSegments.push([row, strand, row, next])
      }

      for (let row = 0; row < NET_ROWS - 1; row += 1) {
        const next = (strand + 1) % NET_STRANDS
        const bodyA = this.netNodes[row][strand]
        const bodyB = this.netNodes[row + 1][next]
        const rest = this.netRestLocal[row][strand].distanceTo(this.netRestLocal[row + 1][next])
        this.world.createImpulseJoint(RAPIER.JointData.spring(rest, 14, 2.4, zero, zero), bodyA, bodyB, true)
        this.netSegments.push([row, strand, row + 1, next])
      }
    }
  }

  private applyNetImpact(position: THREE.Vector3, velocity: THREE.Vector3, kind: NetHitKind, strength: number): void {
    const hoop = this.hoopBody.translation()
    const radial = new THREE.Vector3(position.x - hoop.x, 0, position.z - hoop.z)
    if (radial.lengthSq() < 0.0001) radial.set(0, 0, 1)
    radial.normalize()

    const impulse = this.tmpVector.copy(velocity).multiplyScalar(0.065 * strength)
    if (kind === 'rim') {
      impulse.addScaledVector(radial, strength * 0.45)
      impulse.y -= 0.08 * strength
    } else if (kind === 'through') {
      impulse.addScaledVector(radial, strength * 0.28)
      impulse.y -= 0.4 * strength
    } else {
      impulse.addScaledVector(radial, strength * 0.38)
      impulse.y -= 0.16 * strength
    }

    const maxDistance = kind === 'through' ? BALL_RADIUS + 0.52 : NET_IMPACT_RADIUS
    for (let row = 0; row < NET_ROWS; row += 1) {
      for (let strand = 0; strand < NET_STRANDS; strand += 1) {
        const node = this.netNodes[row][strand]
        const translation = node.translation()
        const distance = Math.hypot(translation.x - position.x, translation.y - position.y, translation.z - position.z)
        if (distance > maxDistance) continue
        const falloff = 1 - distance / maxDistance
        node.applyImpulse(
          {
            x: impulse.x * falloff,
            y: impulse.y * falloff,
            z: impulse.z * falloff,
          },
          true,
        )
      }
    }

    this.netExcitement = Math.max(this.netExcitement, kind === 'through' ? 1.4 : 0.9)
  }

  private stabilizeNet(): void {
    const hoop = this.hoopBody.translation()
    const settleAlpha = this.netExcitement <= 0 ? 0.1 : this.netExcitement < 0.35 ? 0.025 : 0

    for (let row = 0; row < NET_ROWS; row += 1) {
      for (let strand = 0; strand < NET_STRANDS; strand += 1) {
        const node = this.netNodes[row][strand]
        const rest = this.netRestLocal[row][strand]
        const position = node.translation()
        const restX = hoop.x + rest.x
        const restY = hoop.y + rest.y
        const restZ = hoop.z + rest.z
        const displacement = this.tmpNetVector.set(position.x - restX, position.y - restY, position.z - restZ)
        const distance = displacement.length()
        const maxDistance = NET_MAX_DISPLACEMENT[row]

        if (distance > maxDistance * 2.6) {
          node.setTranslation({ x: restX, y: restY, z: restZ }, true)
          node.setLinvel({ x: 0, y: 0, z: 0 }, true)
          continue
        }

        if (distance > maxDistance) {
          displacement.multiplyScalar(maxDistance / distance)
          node.setTranslation({ x: restX + displacement.x, y: restY + displacement.y, z: restZ + displacement.z }, true)
          const velocity = node.linvel()
          node.setLinvel({ x: velocity.x * 0.32, y: velocity.y * 0.32, z: velocity.z * 0.32 }, true)
        } else if (distance > 0.025) {
          node.applyImpulse({ x: displacement.x * -0.0025, y: displacement.y * -0.0025, z: displacement.z * -0.0025 }, true)
        }

        if (settleAlpha > 0 && distance > 0.006) {
          const nextPosition = node.translation()
          const velocity = node.linvel()
          node.setTranslation(
            {
              x: nextPosition.x + (restX - nextPosition.x) * settleAlpha,
              y: nextPosition.y + (restY - nextPosition.y) * settleAlpha,
              z: nextPosition.z + (restZ - nextPosition.z) * settleAlpha,
            },
            true,
          )
          const damping = this.netExcitement <= 0 ? 0.62 : 0.82
          node.setLinvel({ x: velocity.x * damping, y: velocity.y * damping, z: velocity.z * damping }, true)
        }
      }
    }
  }

  private writeNetSegmentBody(cursor: number, body: RigidBody): number {
    const position = body.translation()
    return this.writeNetSegmentPoint(cursor, position.x, position.y, position.z)
  }

  private writeNetSegmentPoint(cursor: number, x: number, y: number, z: number): number {
    this.netSegmentPositions[cursor] = x
    this.netSegmentPositions[cursor + 1] = y
    this.netSegmentPositions[cursor + 2] = z
    return cursor + 3
  }

  get tmp(): THREE.Vector3 {
    return this.tmpVector
  }
}
