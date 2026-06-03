import RAPIER, { type Collider, type RigidBody, type World } from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { BALL_RADIUS, LAUNCH_POSITION, RIM_RADIUS } from './config'
import type { LevelConfig } from './types'

export class PhysicsWorld {
  readonly world: World
  readonly ballBody: RigidBody

  private readonly hoopBody: RigidBody
  private obstacleBodies: RigidBody[] = []
  private readonly tmpVector = new THREE.Vector3()

  private constructor(world: World, ballBody: RigidBody, hoopBody: RigidBody) {
    this.world = world
    this.ballBody = ballBody
    this.hoopBody = hoopBody
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init()
    const world = new RAPIER.World({ x: 0, y: -9.4, z: 0 })

    const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.06, -4.6))
    world.createCollider(RAPIER.ColliderDesc.cuboid(4.5, 0.06, 12).setFriction(0.86).setRestitution(0.42), floorBody)

    const ballBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(LAUNCH_POSITION.x, LAUNCH_POSITION.y, LAUNCH_POSITION.z)
        .setCanSleep(false)
        .setLinearDamping(0.05)
        .setAngularDamping(0.04),
    )
    world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS).setDensity(0.9).setFriction(0.62).setRestitution(0.55),
      ballBody,
    )

    const hoopBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 3.05, -7.5))
    PhysicsWorld.createHoopColliders(world, hoopBody)

    return new PhysicsWorld(world, ballBody, hoopBody)
  }

  step(dt: number): void {
    this.world.timestep = Math.min(1 / 30, Math.max(1 / 120, dt))
    this.world.step()
  }

  resetBall(position = LAUNCH_POSITION): void {
    this.ballBody.setTranslation(position, true)
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }

  launchBall(velocity: THREE.Vector3): void {
    this.ballBody.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true)
    this.ballBody.setAngvel({ x: velocity.z * -1.7, y: velocity.x * 1.1, z: velocity.x * -0.8 }, true)
  }

  getBallPosition(target = new THREE.Vector3()): THREE.Vector3 {
    const translation = this.ballBody.translation()
    return target.set(translation.x, translation.y, translation.z)
  }

  getBallRotation(target = new THREE.Quaternion()): THREE.Quaternion {
    const rotation = this.ballBody.rotation()
    return target.set(rotation.x, rotation.y, rotation.z, rotation.w)
  }

  getBallVelocity(target = new THREE.Vector3()): THREE.Vector3 {
    const velocity = this.ballBody.linvel()
    return target.set(velocity.x, velocity.y, velocity.z)
  }

  setHoopPosition(x: number, z: number): void {
    this.hoopBody.setNextKinematicTranslation({ x, y: 3.05, z })
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
        RAPIER.ColliderDesc.cuboid(1.3, 0.71, 0.06).setTranslation(0, 0.58, -0.62).setRestitution(0.7),
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

  get tmp(): THREE.Vector3 {
    return this.tmpVector
  }
}
