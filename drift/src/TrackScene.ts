import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { getHeadingAt, getPointAt } from './trackMath';
import type { TrackItem, TrackRuntime } from './types';

export type ItemVisual = {
  item: TrackItem;
  object: Group;
  collectedUntil: number;
};

export class TrackScene {
  readonly group = new Group();
  readonly itemVisuals = new Map<string, ItemVisual>();

  constructor(private readonly runtime: TrackRuntime) {
    this.group.add(this.createTerrain());
    this.group.add(this.createRoad(this.runtime.definition.width + 3.2, this.runtime.definition.shoulderColor, 0.005));
    this.group.add(this.createRoad(this.runtime.definition.width, this.runtime.definition.roadColor, 0.03));
    this.group.add(this.createLaneMarks());
    this.group.add(this.createCheckpointGates());
    this.group.add(this.createProps());
    this.group.add(this.createItems());
  }

  update(elapsed: number): void {
    for (const visual of this.itemVisuals.values()) {
      const visible = elapsed >= visual.collectedUntil;
      visual.object.visible = visible;
      if (visible && !['boost', 'ramp', 'cone', 'crate', 'oil'].includes(visual.item.kind)) {
        visual.object.rotation.y += 0.035;
        visual.object.position.y = 1.15 + Math.sin(elapsed * 4 + visual.item.s * 20) * 0.12;
      }
    }
  }

  collect(id: string, until: number): void {
    const visual = this.itemVisuals.get(id);
    if (!visual) return;
    visual.collectedUntil = until;
    visual.object.visible = false;
  }

  resetCollections(): void {
    for (const visual of this.itemVisuals.values()) {
      visual.collectedUntil = 0;
      visual.object.visible = true;
    }
  }

  private createTerrain(): Mesh {
    const mesh = new Mesh(
      new PlaneGeometry(260, 220, 1, 1),
      new MeshStandardMaterial({
        color: new Color(this.runtime.definition.terrainColor),
        roughness: 0.9,
        metalness: 0,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.035;
    mesh.receiveShadow = true;
    return mesh;
  }

  private createRoad(width: number, color: unknown, y: number): Mesh {
    const vertices: number[] = [];
    const indices: number[] = [];
    const samples = this.runtime.samples;
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      const left = {
        x: sample.point.x - sample.normal.x * width * 0.5,
        z: sample.point.z - sample.normal.z * width * 0.5,
      };
      const right = {
        x: sample.point.x + sample.normal.x * width * 0.5,
        z: sample.point.z + sample.normal.z * width * 0.5,
      };
      vertices.push(left.x, y, left.z, right.x, y, right.z);
      const next = (index + 1) % samples.length;
      indices.push(index * 2, next * 2, index * 2 + 1, index * 2 + 1, next * 2, next * 2 + 1);
    }
    const geometry = new BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({
        color: new Color(color as string),
        roughness: 0.72,
        metalness: 0.04,
        side: DoubleSide,
      }),
    );
    mesh.receiveShadow = true;
    return mesh;
  }

  private createLaneMarks(): Group {
    const group = new Group();
    const material = new MeshStandardMaterial({
      color: new Color(this.runtime.definition.accentColor),
      emissive: new Color(this.runtime.definition.accentColor),
      emissiveIntensity: 0.18,
      roughness: 0.35,
    });
    for (let s = 0; s < 1; s += 0.028) {
      const point = getPointAt(this.runtime, s, 0);
      const mark = new Mesh(new BoxGeometry(0.24, 0.04, 2.2), material);
      mark.position.set(point.x, 0.08, point.z);
      mark.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), getHeadingAt(this.runtime, s));
      group.add(mark);
    }
    return group;
  }

  private createCheckpointGates(): Group {
    const group = new Group();
    const material = new MeshStandardMaterial({
      color: '#f7f2da',
      emissive: '#f7d44c',
      emissiveIntensity: 0.12,
      roughness: 0.25,
    });
    const gateS = [this.runtime.definition.startS, ...this.runtime.definition.checkpoints];
    for (let index = 0; index < gateS.length; index += 1) {
      const s = gateS[index];
      const sample = getPointAt(this.runtime, s, 0);
      const heading = getHeadingAt(this.runtime, s);
      const groupGate = new Group();
      const bar = new Mesh(new BoxGeometry(this.runtime.definition.width + 1.2, 0.18, 0.28), material);
      bar.position.y = 4.2;
      const left = new Mesh(new CylinderGeometry(0.12, 0.12, 4.2, 8), material);
      left.position.set(-(this.runtime.definition.width * 0.5 + 0.6), 2.1, 0);
      const right = left.clone();
      right.position.x *= -1;
      groupGate.add(bar, left, right);
      groupGate.position.set(sample.x, 0, sample.z);
      groupGate.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), heading + Math.PI / 2);
      group.add(groupGate);
    }
    return group;
  }

  private createProps(): Group {
    const group = new Group();
    const material = new MeshStandardMaterial({
      color: '#121820',
      roughness: 0.7,
      metalness: 0.1,
    });
    for (let s = 0; s < 1; s += 0.045) {
      for (const side of [-1, 1]) {
        const point = getPointAt(this.runtime, s, side * (this.runtime.definition.width * 0.5 + 4.8));
        const post = new Mesh(new BoxGeometry(0.55, 1.8 + Math.random() * 1.6, 0.55), material);
        post.position.set(point.x, post.geometry.parameters.height * 0.5, point.z);
        group.add(post);
      }
    }
    return group;
  }

  private createItems(): Group {
    const group = new Group();
    for (const item of this.runtime.definition.items) {
      const itemGroup = new Group();
      const point = getPointAt(this.runtime, item.s, item.offset);
      const heading = getHeadingAt(this.runtime, item.s);
      itemGroup.position.set(point.x, 0.08, point.z);
      itemGroup.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), heading);
      itemGroup.add(this.createItemMesh(item));
      this.itemVisuals.set(item.id, { item, object: itemGroup, collectedUntil: 0 });
      group.add(itemGroup);
    }
    return group;
  }

  private createItemMesh(item: TrackItem): Mesh {
    if (item.kind === 'boost') {
      const mesh = new Mesh(
        new BoxGeometry(3.2, 0.08, 4.6),
        new MeshStandardMaterial({
          color: '#38e8c6',
          emissive: '#23cba9',
          emissiveIntensity: 0.55,
          roughness: 0.25,
        }),
      );
      mesh.position.y = 0.04;
      return mesh;
    }
    if (item.kind === 'ramp') {
      const mesh = new Mesh(
        new BoxGeometry(4.2, 0.65, 3.4),
        new MeshStandardMaterial({
          color: '#f7d44c',
          emissive: '#bd7b00',
          emissiveIntensity: 0.14,
          roughness: 0.48,
        }),
      );
      mesh.position.y = 0.34;
      mesh.rotation.x = -0.2;
      return mesh;
    }
    if (item.kind === 'cone') {
      const mesh = new Mesh(new ConeGeometry(0.6, 1.25, 18), new MeshStandardMaterial({ color: '#ff7a18', roughness: 0.6 }));
      mesh.position.y = 0.63;
      return mesh;
    }
    if (item.kind === 'crate') {
      const mesh = new Mesh(new BoxGeometry(1.45, 1.45, 1.45), new MeshStandardMaterial({ color: '#9c6b3f', roughness: 0.8 }));
      mesh.position.y = 0.75;
      return mesh;
    }
    if (item.kind === 'oil') {
      const mesh = new Mesh(
        new CircleGeometry(1.25, 28),
        new MeshStandardMaterial({
          color: '#101018',
          metalness: 0.45,
          roughness: 0.2,
          side: DoubleSide,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.03;
      return mesh;
    }
    if (item.kind === 'clock') {
      const mesh = new Mesh(
        new RingGeometry(0.46, 0.78, 28),
        new MeshStandardMaterial({
          color: '#ffffff',
          emissive: '#9ee8ff',
          emissiveIntensity: 0.65,
          side: DoubleSide,
        }),
      );
      mesh.position.y = 1.15;
      return mesh;
    }
    if (item.kind === 'shield') {
      const mesh = new Mesh(
        new TorusGeometry(0.7, 0.18, 12, 28),
        new MeshStandardMaterial({
          color: '#65d5ff',
          emissive: '#2a82ff',
          emissiveIntensity: 0.5,
        }),
      );
      mesh.position.y = 1.15;
      return mesh;
    }
    const mesh = new Mesh(
      new TorusGeometry(0.62, 0.2, 12, 26),
      new MeshStandardMaterial({
        color: '#ff5bc8',
        emissive: '#ff248d',
        emissiveIntensity: 0.55,
      }),
    );
    mesh.position.y = 1.15;
    return mesh;
  }
}
