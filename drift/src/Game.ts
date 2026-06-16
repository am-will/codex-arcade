import RAPIER from '@dimforge/rapier3d-compat';
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { CarController } from './CarController';
import { GAME_CONFIG, STORAGE_PREFIX } from './config';
import { Hud } from './Hud';
import { Input } from './Input';
import { TrafficCar } from './TrafficCar';
import { TrackScene } from './TrackScene';
import { buildTrackRuntime, findNearestSample, formatTime, getPointAt, medalForTime } from './trackMath';
import { TRACKS } from './tracks';
import type { RaceSnapshot, TrackRuntime, Vec2 } from './types';

type RaceStatus = RaceSnapshot['status'];

type Spark = {
  mesh: Mesh;
  life: number;
};

export class Game {
  private readonly host = document.createElement('main');
  private readonly renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(62, 1, 0.1, 600);
  private readonly input = new Input();
  private readonly car = new CarController();
  private readonly hud = new Hud(TRACKS);
  private readonly sparks: Spark[] = [];
  private runtime: TrackRuntime = buildTrackRuntime(TRACKS[0]);
  private trackScene: TrackScene | null = null;
  private traffic: TrafficCar[] = [];
  private levelIndex = 0;
  private status: RaceStatus = 'menu';
  private elapsed = 0;
  private displayPenalty = 0;
  private finishTime: number | null = null;
  private lap = 1;
  private checkpoint = 0;
  private countdown = 3;
  private lastTime = performance.now();
  private raf = 0;
  private isNewBest = false;
  private physicsWorld: RAPIER.World | null = null;

  constructor(private readonly root: HTMLElement) {
    this.host.className = 'game-shell';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.host.append(this.renderer.domElement, this.hud.element);
    this.root.append(this.host);
    this.scene.add(this.car.group);
    this.hud.bindMenu((index) => this.startLevel(index));
    this.hud.showMenu();
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.handleGlobalKeys);
  }

  async start(): Promise<void> {
    const warn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('using deprecated parameters for the initialization function')) {
        return;
      }
      warn(...args);
    };
    try {
      await RAPIER.init();
    } finally {
      console.warn = warn;
    }
    this.physicsWorld = new RAPIER.World({ x: 0, y: -GAME_CONFIG.car.gravity, z: 0 });
    this.setupLights();
    this.loadTrack(0);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.input.dispose();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.handleGlobalKeys);
    this.renderer.dispose();
  }

  private setupLights(): void {
    const ambient = new AmbientLight('#ffffff', 1.4);
    const sun = new DirectionalLight('#fff2d4', 3.2);
    sun.castShadow = true;
    sun.position.set(-35, 65, 28);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 160;
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    this.scene.add(ambient, sun);
  }

  private loadTrack(index: number): void {
    this.levelIndex = (index + TRACKS.length) % TRACKS.length;
    this.runtime = buildTrackRuntime(TRACKS[this.levelIndex]);
    if (this.trackScene) {
      this.scene.remove(this.trackScene.group);
    }
    for (const traffic of this.traffic) this.scene.remove(traffic.group);
    this.trackScene = new TrackScene(this.runtime);
    this.scene.add(this.trackScene.group);
    this.traffic = this.runtime.definition.traffic.map((definition) => {
      const traffic = new TrafficCar(definition, this.runtime);
      this.scene.add(traffic.group);
      return traffic;
    });
    this.scene.background = new Color(this.runtime.definition.skyColor);
    this.scene.fog = new Fog(new Color(this.runtime.definition.fogColor), 95, 230);
    this.car.reset(this.runtime);
    this.positionCamera(true);
  }

  private startLevel(index: number): void {
    this.loadTrack(index);
    this.elapsed = 0;
    this.displayPenalty = 0;
    this.finishTime = null;
    this.lap = 1;
    this.checkpoint = 0;
    this.countdown = 3;
    this.isNewBest = false;
    this.status = 'countdown';
    this.trackScene?.resetCollections();
    this.hud.hideMenu();
    this.hud.hideFinish();
  }

  private frame = (time: number): void => {
    const dt = Math.min((time - this.lastTime) / 1000, GAME_CONFIG.maxFrameDelta);
    this.lastTime = time;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.afterFrame();
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    this.physicsWorld?.step();
    if (this.status === 'countdown') {
      this.countdown -= dt;
      this.hud.updateCountdown(this.countdown);
      if (this.countdown <= 0) this.status = 'racing';
    } else if (this.status === 'racing') {
      this.elapsed += dt;
    }

    if ((this.input.wasPressed('restart') || this.input.snapshot.restart) && this.status !== 'menu') {
      this.startLevel(this.levelIndex);
    }

    const input = this.status === 'racing' ? this.input.snapshot : {
      accelerate: false,
      brake: false,
      left: false,
      right: false,
      jump: false,
      restart: false,
    };
    this.car.update(dt, input, this.input.wasPressed('jump'), this.runtime);
    for (const traffic of this.traffic) traffic.update(dt);
    if (this.status === 'racing') {
      this.handleItems();
      this.handleTrafficCollisions();
      this.handleCheckpoints();
      this.emitDriftSparks(dt);
    }
    this.updateSparks(dt);
    this.trackScene?.update(this.elapsed);
    this.positionCamera(false);
    this.hud.update(this.raceSnapshot(), this.car.snapshot());
  }

  private handleItems(): void {
    if (!this.trackScene) return;
    const carPosition = this.car.position;
    for (const visual of this.trackScene.itemVisuals.values()) {
      if (this.elapsed < visual.collectedUntil) continue;
      const itemPoint = getPointAt(this.runtime, visual.item.s, visual.item.offset);
      const radius = visual.item.radius ?? (visual.item.kind === 'boost' || visual.item.kind === 'ramp' ? 2.6 : 1.75);
      if (distance(carPosition, itemPoint) > radius) continue;
      if (visual.item.kind === 'boost') {
        this.car.applyBoost(GAME_CONFIG.pickups.boostPadSeconds);
        this.trackScene.collect(visual.item.id, this.elapsed + 0.8);
      } else if (visual.item.kind === 'ramp') {
        this.car.launchFromRamp();
        this.trackScene.collect(visual.item.id, this.elapsed + 1);
      } else if (visual.item.kind === 'turbo') {
        this.car.applyBoost(GAME_CONFIG.pickups.turboSeconds);
        this.trackScene.collect(visual.item.id, this.elapsed + GAME_CONFIG.pickups.respawnSeconds);
      } else if (visual.item.kind === 'clock') {
        this.displayPenalty += GAME_CONFIG.pickups.clockBonus;
        this.car.applyBoost(0.7);
        this.trackScene.collect(visual.item.id, this.elapsed + GAME_CONFIG.pickups.respawnSeconds);
      } else if (visual.item.kind === 'shield') {
        this.car.applyShield();
        this.trackScene.collect(visual.item.id, this.elapsed + GAME_CONFIG.pickups.respawnSeconds);
      } else if (visual.item.kind === 'oil') {
        this.car.hitOil();
        this.trackScene.collect(visual.item.id, this.elapsed + 2.5);
      } else {
        this.car.bumpFrom(itemPoint, 12);
        this.trackScene.collect(visual.item.id, this.elapsed + 2.5);
      }
    }
  }

  private handleTrafficCollisions(): void {
    const carPosition = this.car.position;
    for (const traffic of this.traffic) {
      if (distance(carPosition, traffic.position) < GAME_CONFIG.car.collisionRadius + 1.35) {
        this.car.bumpFrom(traffic.position, 18);
      }
    }
  }

  private handleCheckpoints(): void {
    const carPosition = this.car.position;
    const checkpoints = this.runtime.definition.checkpoints;
    if (this.checkpoint < checkpoints.length) {
      const target = getPointAt(this.runtime, checkpoints[this.checkpoint], 0);
      if (distance(carPosition, target) < this.runtime.definition.width * 0.75) {
        this.checkpoint += 1;
      }
      return;
    }

    const finish = getPointAt(this.runtime, this.runtime.definition.startS, 0);
    if (distance(carPosition, finish) < this.runtime.definition.width * 0.75) {
      if (this.lap >= this.runtime.definition.laps) {
        this.finishRace();
      } else {
        this.lap += 1;
        this.checkpoint = 0;
      }
    }
  }

  private finishRace(): void {
    const finalTime = Math.max(0, this.elapsed - this.displayPenalty);
    const bestKey = `${STORAGE_PREFIX}${this.runtime.definition.id}`;
    const previous = Number.parseFloat(localStorage.getItem(bestKey) ?? '');
    this.isNewBest = Number.isNaN(previous) || finalTime < previous;
    if (this.isNewBest) localStorage.setItem(bestKey, finalTime.toFixed(3));
    this.finishTime = finalTime;
    this.status = 'finished';
    this.hud.showFinish(
      this.raceSnapshot(),
      this.isNewBest,
      () => this.startLevel(this.levelIndex),
      () => this.startLevel(this.levelIndex + 1),
      () => {
        this.status = 'menu';
        this.hud.showMenu();
      },
    );
  }

  private emitDriftSparks(dt: number): void {
    const snapshot = this.car.snapshot();
    if (!snapshot.drift || snapshot.speed < 12 || Math.random() > dt * 18) return;
    const material = new MeshBasicMaterial({ color: snapshot.boost ? '#38e8c6' : '#f7d44c' });
    const spark = new Mesh(new SphereGeometry(0.12, 8, 8), material);
    const side = Math.random() > 0.5 ? 1 : -1;
    const offset = new Vector3(Math.cos(this.car.headingRadians) * side * 1.2, 0.18, -Math.sin(this.car.headingRadians) * side * 1.2);
    spark.position.set(this.car.position.x + offset.x, 0.18, this.car.position.z + offset.z);
    this.scene.add(spark);
    this.sparks.push({ mesh: spark, life: 0.45 });
  }

  private updateSparks(dt: number): void {
    for (let index = this.sparks.length - 1; index >= 0; index -= 1) {
      const spark = this.sparks[index];
      spark.life -= dt;
      spark.mesh.position.y += dt * 0.9;
      spark.mesh.scale.multiplyScalar(0.94);
      if (spark.life <= 0) {
        this.scene.remove(spark.mesh);
        this.sparks.splice(index, 1);
      }
    }
  }

  private raceSnapshot(): RaceSnapshot {
    const best = Number.parseFloat(localStorage.getItem(`${STORAGE_PREFIX}${this.runtime.definition.id}`) ?? '');
    const displayElapsed = this.finishTime ?? Math.max(0, this.elapsed - this.displayPenalty);
    return {
      trackName: this.runtime.definition.name,
      trackTagline: this.runtime.definition.tagline,
      levelIndex: this.levelIndex,
      levelCount: TRACKS.length,
      elapsed: this.elapsed,
      displayElapsed,
      lap: this.lap,
      laps: this.runtime.definition.laps,
      checkpoint: this.checkpoint,
      checkpointCount: this.runtime.definition.checkpoints.length,
      bestTime: Number.isNaN(best) ? null : best,
      medal: medalForTime(displayElapsed, this.runtime.definition.medalTargets),
      status: this.status,
      finishTime: this.finishTime,
    };
  }

  private positionCamera(immediate: boolean): void {
    const velocity = this.car.velocityVector;
    const heading = this.car.headingRadians;
    const forward = velocity.length() > 4
      ? velocity.clone().normalize()
      : new Vector3(Math.sin(heading), 0, Math.cos(heading));
    const desired = new Vector3(this.car.position.x, 0, this.car.position.z)
      .addScaledVector(forward, -GAME_CONFIG.camera.distance)
      .add(new Vector3(0, GAME_CONFIG.camera.height, 0));
    const lookAt = new Vector3(this.car.position.x, 1.2, this.car.position.z)
      .addScaledVector(forward, GAME_CONFIG.camera.lookAhead);
    if (immediate) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, GAME_CONFIG.camera.followLerp);
    this.camera.lookAt(lookAt);
  }

  private resize = (): void => {
    const width = this.host.clientWidth || window.innerWidth;
    const height = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private handleGlobalKeys = (event: KeyboardEvent): void => {
    if (event.code === 'Digit1') this.startLevel(0);
    if (event.code === 'Digit2') this.startLevel(1);
    if (event.code === 'Digit3') this.startLevel(2);
    if (event.code === 'Escape' && this.status !== 'menu') {
      this.status = 'menu';
      this.hud.showMenu();
    }
  };
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
