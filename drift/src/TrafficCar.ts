import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { getHeadingAt, getPointAt } from './trackMath';
import type { TrackRuntime, TrafficDefinition, Vec2 } from './types';

export class TrafficCar {
  readonly group = new Group();
  private s: number;

  constructor(
    private readonly definition: TrafficDefinition,
    private readonly runtime: TrackRuntime,
  ) {
    this.s = definition.s;
    const body = new Mesh(
      new BoxGeometry(2.2, 0.85, 3.25),
      new MeshStandardMaterial({
        color: new Color(definition.color),
        roughness: 0.5,
        metalness: 0.18,
      }),
    );
    body.position.y = 0.65;
    body.castShadow = true;
    const roof = new Mesh(
      new BoxGeometry(1.35, 0.48, 1.25),
      new MeshStandardMaterial({ color: '#151a24', roughness: 0.35, metalness: 0.35 }),
    );
    roof.position.set(0, 1.22, -0.25);
    roof.castShadow = true;
    this.group.add(body, roof);
    this.sync();
  }

  update(dt: number): void {
    this.s = (this.s + (this.definition.speed * dt) / this.runtime.totalLength) % 1;
    this.sync();
  }

  get position(): Vec2 {
    return { x: this.group.position.x, z: this.group.position.z };
  }

  private sync(): void {
    const point = getPointAt(this.runtime, this.s, this.definition.lane);
    this.group.position.set(point.x, 0, point.z);
    this.group.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), getHeadingAt(this.runtime, this.s));
  }
}
