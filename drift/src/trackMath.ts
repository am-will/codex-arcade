import { CatmullRomCurve3, Vector3 } from 'three';
import { GAME_CONFIG } from './config';
import type { TrackDefinition, TrackRuntime, TrackSample, Vec2 } from './types';

const wrap01 = (value: number): number => ((value % 1) + 1) % 1;

export function buildTrackRuntime(definition: TrackDefinition): TrackRuntime {
  const curve = new CatmullRomCurve3(
    definition.centerline.map((point) => new Vector3(point.x, 0, point.z)),
    true,
    'catmullrom',
    0.45,
  );
  const points = curve.getSpacedPoints(GAME_CONFIG.roadSampleCount);
  const samples: TrackSample[] = [];
  const cumulativeLengths: number[] = [0];
  let totalLength = 0;

  for (let index = 1; index < points.length; index += 1) {
    totalLength += points[index].distanceTo(points[index - 1]);
    cumulativeLengths[index] = totalLength;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % (points.length - 1)];
    const dx = next.x - current.x;
    const dz = next.z - current.z;
    const length = Math.hypot(dx, dz) || 1;
    const tangent = { x: dx / length, z: dz / length };
    samples.push({
      point: { x: current.x, z: current.z },
      tangent,
      normal: { x: -tangent.z, z: tangent.x },
      s: cumulativeLengths[index] / totalLength,
      cumulative: cumulativeLengths[index],
    });
  }

  return {
    definition,
    samples,
    totalLength,
  };
}

export function getSampleAt(runtime: TrackRuntime, s: number): TrackSample {
  const wrapped = wrap01(s);
  const index = Math.floor(wrapped * runtime.samples.length) % runtime.samples.length;
  return runtime.samples[index];
}

export function getPointAt(runtime: TrackRuntime, s: number, offset = 0): Vec2 {
  const sample = getSampleAt(runtime, s);
  return {
    x: sample.point.x + sample.normal.x * offset,
    z: sample.point.z + sample.normal.z * offset,
  };
}

export function getHeadingAt(runtime: TrackRuntime, s: number): number {
  const sample = getSampleAt(runtime, s);
  return Math.atan2(sample.tangent.x, sample.tangent.z);
}

export function findNearestSample(runtime: TrackRuntime, position: Vec2): TrackSample & { distance: number; signedOffset: number } {
  let best = runtime.samples[0];
  let bestDistanceSq = Number.POSITIVE_INFINITY;

  for (const sample of runtime.samples) {
    const dx = position.x - sample.point.x;
    const dz = position.z - sample.point.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      best = sample;
    }
  }

  const offsetVector = {
    x: position.x - best.point.x,
    z: position.z - best.point.z,
  };
  return {
    ...best,
    distance: Math.sqrt(bestDistanceSq),
    signedOffset: offsetVector.x * best.normal.x + offsetVector.z * best.normal.z,
  };
}

export function sDeltaForward(from: number, to: number): number {
  const delta = wrap01(to) - wrap01(from);
  return delta < -0.5 ? delta + 1 : delta;
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const millis = Math.floor((safe - Math.floor(safe)) * 1000);
  return `${minutes}:${wholeSeconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

export function medalForTime(seconds: number, targets: TrackDefinition['medalTargets']): string {
  if (seconds <= targets.platinum) return 'platinum';
  if (seconds <= targets.gold) return 'gold';
  if (seconds <= targets.silver) return 'silver';
  if (seconds <= targets.bronze) return 'bronze';
  return 'finish';
}
