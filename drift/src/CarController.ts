import {
  BoxGeometry,
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { GAME_CONFIG } from './config';
import { findNearestSample, getHeadingAt, getPointAt } from './trackMath';
import type { CarSnapshot, InputState, TrackRuntime, Vec2 } from './types';

const forwardFromHeading = (heading: number): Vector3 => new Vector3(Math.sin(heading), 0, Math.cos(heading));

const signedAngleBetween = (a: Vector3, b: Vector3): number => {
  const angle = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
  return MathUtils.radToDeg(angle);
};

export class CarController {
  readonly group = new Group();
  private readonly body: Mesh;
  private readonly cabin: Mesh;
  private readonly wheels: Mesh[] = [];
  private velocity = new Vector3();
  private heading = 0;
  private y = 0;
  private verticalVelocity = 0;
  private grounded = true;
  private driftActive = false;
  private hopCooldown = 0;
  private boostTimer = 0;
  private shieldTimer = 0;
  private airControl = 0;
  private slipAngle = 0;
  private powerupText = '';
  private powerupTextTimer = 0;

  constructor() {
    const bodyMaterial = new MeshStandardMaterial({
      color: new Color('#f25f5c'),
      roughness: 0.42,
      metalness: 0.2,
    });
    const cabinMaterial = new MeshStandardMaterial({
      color: new Color('#111820'),
      roughness: 0.35,
      metalness: 0.45,
    });
    const wheelMaterial = new MeshStandardMaterial({
      color: new Color('#090b0e'),
      roughness: 0.75,
      metalness: 0.1,
    });
    this.body = new Mesh(new BoxGeometry(2.25, 0.8, 3.35), bodyMaterial);
    this.body.castShadow = true;
    this.body.position.y = 0.62;
    this.cabin = new Mesh(new BoxGeometry(1.45, 0.62, 1.45), cabinMaterial);
    this.cabin.castShadow = true;
    this.cabin.position.set(0, 1.18, -0.35);
    this.group.add(this.body, this.cabin);

    const wheelGeometry = new BoxGeometry(0.46, 0.58, 0.82);
    for (const x of [-1.14, 1.14]) {
      for (const z of [-1.06, 1.08]) {
        const wheel = new Mesh(wheelGeometry, wheelMaterial);
        wheel.castShadow = true;
        wheel.position.set(x, 0.3, z);
        this.wheels.push(wheel);
        this.group.add(wheel);
      }
    }
  }

  reset(runtime: TrackRuntime): void {
    const start = getPointAt(runtime, runtime.definition.startS, runtime.definition.startOffset);
    this.group.position.set(start.x, 0, start.z);
    this.velocity.set(0, 0, 0);
    this.heading = getHeadingAt(runtime, runtime.definition.startS) + (runtime.definition.startHeadingOffset ?? 0);
    this.y = 0;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.driftActive = false;
    this.hopCooldown = 0;
    this.boostTimer = 0;
    this.shieldTimer = 0;
    this.airControl = 0;
    this.slipAngle = 0;
    this.powerupText = '';
    this.powerupTextTimer = 0;
    this.syncVisuals(0);
  }

  update(dt: number, input: InputState, jumpPressed: boolean, runtime: TrackRuntime): void {
    const car = GAME_CONFIG.car;
    this.hopCooldown = Math.max(0, this.hopCooldown - dt);
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    this.powerupTextTimer = Math.max(0, this.powerupTextTimer - dt);
    if (this.powerupTextTimer <= 0) this.powerupText = '';

    if (jumpPressed && this.grounded && this.hopCooldown <= 0 && !this.driftActive) {
      this.grounded = false;
      this.verticalVelocity = car.hopVelocity;
      this.hopCooldown = car.hopCooldown;
      this.airControl = 0.62;
    }

    const nearest = findNearestSample(runtime, { x: this.group.position.x, z: this.group.position.z });
    const offroad = Math.max(0, nearest.distance - runtime.definition.width * 0.5);
    const offroadFactor = offroad > 0 ? MathUtils.clamp(1 - offroad / 9, 0.48, 0.82) : 1;
    const boostFactor = this.boostTimer > 0 ? 1 : 0;
    const maxSpeed = MathUtils.lerp(car.maxSpeed, car.boostMaxSpeed, boostFactor) * offroadFactor;
    const acceleration = MathUtils.lerp(car.acceleration, car.boostAcceleration, boostFactor) * offroadFactor;
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const speed = this.velocity.length();
    const speed01 = MathUtils.clamp(speed / car.maxSpeed, 0.18, 1);
    const steeringAuthority = this.grounded ? 1 : this.airControl;
    const turnRate = (this.driftActive ? car.driftTurnRate : car.normalTurnRate) * speed01 * steeringAuthority;
    this.heading += steer * turnRate * dt;

    const forward = forwardFromHeading(this.heading);
    if (input.accelerate) {
      this.velocity.addScaledVector(forward, acceleration * dt * (this.grounded ? 1 : 0.35));
    }
    if (input.brake) {
      const brakeAmount = speed > 2 ? car.brakeDrag : car.reverseAcceleration;
      this.velocity.addScaledVector(forward, -brakeAmount * dt);
    }

    const desired = forward.clone().multiplyScalar(this.velocity.length());
    const grip = this.driftActive ? car.driftGrip : car.normalGrip;
    this.velocity.lerp(desired, MathUtils.clamp(grip * dt, 0, 1));

    if (!input.accelerate && !input.brake) {
      const drag = Math.max(0, 1 - car.coastDrag * dt * (this.driftActive ? 0.5 : 1));
      this.velocity.multiplyScalar(drag);
    }
    if (this.driftActive) {
      this.velocity.multiplyScalar(Math.pow(car.driftSpeedBleed, dt * 60));
    }
    if (this.velocity.length() > maxSpeed) {
      this.velocity.setLength(maxSpeed);
    }

    this.group.position.addScaledVector(this.velocity, dt);
    this.verticalVelocity -= car.gravity * dt;
    this.y += this.verticalVelocity * dt;

    if (this.y <= 0) {
      if (!this.grounded && input.jump) {
        this.driftActive = true;
      }
      this.y = 0;
      this.verticalVelocity = 0;
      this.grounded = true;
      this.airControl = 0;
    } else {
      this.grounded = false;
    }

    if (this.grounded && this.driftActive && !input.jump) {
      this.driftActive = false;
    }

    this.slipAngle = this.velocity.length() > 0.4 ? signedAngleBetween(forward, this.velocity.clone().normalize()) : 0;
    this.syncVisuals(steer);
  }

  applyBoost(seconds = GAME_CONFIG.pickups.turboSeconds): void {
    this.boostTimer = Math.max(this.boostTimer, seconds);
    this.powerupText = 'TURBO';
    this.powerupTextTimer = 1.2;
  }

  applyShield(): void {
    this.shieldTimer = GAME_CONFIG.pickups.shieldSeconds;
    this.powerupText = 'SHIELD';
    this.powerupTextTimer = 1.2;
  }

  launchFromRamp(): void {
    this.grounded = false;
    this.verticalVelocity = Math.max(this.verticalVelocity, GAME_CONFIG.car.rampVelocity);
    this.boostTimer = Math.max(this.boostTimer, 0.9);
    this.airControl = 0.8;
    this.powerupText = 'AIR';
    this.powerupTextTimer = 0.9;
  }

  hitOil(): void {
    if (this.shieldTimer > 0) return;
    this.heading += (Math.random() > 0.5 ? 1 : -1) * 0.48;
    this.velocity.multiplyScalar(0.82);
    this.powerupText = 'SLIP';
    this.powerupTextTimer = 0.8;
  }

  bumpFrom(point: Vec2, strength: number): void {
    const away = new Vector3(this.group.position.x - point.x, 0, this.group.position.z - point.z);
    if (away.lengthSq() < 0.001) away.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    away.normalize();
    const shieldScale = this.shieldTimer > 0 ? 0.32 : 1;
    this.velocity.multiplyScalar(this.shieldTimer > 0 ? 0.88 : 0.48);
    this.velocity.addScaledVector(away, strength * shieldScale);
    this.group.position.addScaledVector(away, 0.55 * shieldScale);
    this.powerupText = this.shieldTimer > 0 ? 'BLOCKED' : 'BONK';
    this.powerupTextTimer = 0.75;
  }

  snapshot(): CarSnapshot {
    const speed = this.velocity.length();
    return {
      speed,
      kph: speed * 3.6,
      drift: this.driftActive,
      grounded: this.grounded,
      boost: this.boostTimer > 0,
      shield: this.shieldTimer > 0,
      slipAngle: this.slipAngle,
      powerupText: this.powerupText,
    };
  }

  get position(): Vec2 {
    return { x: this.group.position.x, z: this.group.position.z };
  }

  get headingRadians(): number {
    return this.heading;
  }

  get velocityVector(): Vector3 {
    return this.velocity.clone();
  }

  private syncVisuals(steer: number): void {
    this.group.position.y = this.y;
    this.group.quaternion.copy(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), this.heading));
    const speedSpin = this.velocity.length() * 0.05;
    this.body.rotation.z = MathUtils.lerp(this.body.rotation.z, -steer * (this.driftActive ? 0.18 : 0.08), 0.12);
    this.body.rotation.x = MathUtils.lerp(this.body.rotation.x, this.grounded ? 0 : -0.08, 0.08);
    this.cabin.rotation.copy(this.body.rotation);
    for (const wheel of this.wheels) {
      wheel.rotation.x += speedSpin;
      wheel.rotation.y = MathUtils.lerp(wheel.rotation.y, -steer * 0.38, 0.25);
    }
  }
}
