import * as THREE from 'three';

export let ROAD_WIDTH = 14;
export let TRACK_SEGMENTS = 720;
export let TRACK_CLOSED = true;
export const ALPINE_POINTS = [
  new THREE.Vector3(0, 1.1, 119),
  new THREE.Vector3(82, 2.4, 119),
  new THREE.Vector3(143, 5.8, 55),
  new THREE.Vector3(126, 8.5, -31),
  new THREE.Vector3(73, 6.7, -102),
  new THREE.Vector3(-9, 4.2, -123),
  new THREE.Vector3(-89, 2.3, -88),
  new THREE.Vector3(-140, 1.4, -20),
  new THREE.Vector3(-111, 1.2, 63),
  new THREE.Vector3(-61, 1.1, 105),
].map((point) => point.multiplyScalar(2));
export let trackCurve = new THREE.CatmullRomCurve3(ALPINE_POINTS, true, 'catmullrom', 0.35);

export function trackFrame(progress: number) {
  const t = TRACK_CLOSED ? ((progress % 1) + 1) % 1 : THREE.MathUtils.clamp(progress, 0, 1);
  const point = trackCurve.getPointAt(t);
  const tangent = trackCurve.getTangentAt(t).normalize();
  const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  return { point, tangent, right, yaw: Math.atan2(tangent.x, tangent.z) };
}

export let TRACK_POINTS = Array.from({ length: TRACK_SEGMENTS }, (_, index) => trackFrame(index / TRACK_SEGMENTS));
export let CHECKPOINTS = Array.from({ length: 8 }, (_, index) => trackFrame(index / 8));
export let CHECKPOINT_PROGRESS = Array.from({ length: 8 }, (_, index) => index / 8);
export let TRACK_LENGTH = trackCurve.getLength();

export function nearestTrackPoint(x: number, z: number) {
  let index = 0;
  let distanceSquared = Infinity;
  for (let i = 0; i < TRACK_POINTS.length; i++) {
    const p = TRACK_POINTS[i].point;
    const distance = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (distance < distanceSquared) { distanceSquared = distance; index = i; }
  }
  // Project onto the two neighbouring segments. Returning the closest vertex
  // made the height jump in 2–3 metre steps while a car crossed a slope.
  let segment = index, blend = 0;
  for (const candidate of (TRACK_CLOSED ? [(index + TRACK_SEGMENTS - 1) % TRACK_SEGMENTS, index] : [Math.max(0, index - 1), Math.min(TRACK_SEGMENTS - 1, index)])) {
    const a = TRACK_POINTS[candidate].point, b = TRACK_POINTS[(candidate + 1) % TRACK_POINTS.length].point;
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const distance = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
    if (distance <= distanceSquared) { distanceSquared = distance; segment = candidate; blend = t; }
  }
  const a = TRACK_POINTS[segment], b = TRACK_POINTS[(segment + 1) % TRACK_POINTS.length];
  const point = a.point.clone().lerp(b.point, blend);
  const tangent = a.tangent.clone().lerp(b.tangent, blend).normalize();
  const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  const progress = (segment + blend) / TRACK_SEGMENTS;
  return { point, tangent, right, yaw: Math.atan2(tangent.x, tangent.z), index: segment, progress: TRACK_CLOSED ? progress % 1 : progress, distance: Math.sqrt(distanceSquared) };
}

export function ribbonGeometry(width: number, offset = 0, lift = 0, from = 0, to = 1) {
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = Math.max(2, Math.round(TRACK_SEGMENTS * (to - from)));
  for (let i = 0; i <= segments; i++) {
    const { point, right } = trackFrame(from + (to - from) * i / segments);
    for (const side of [-1, 1]) {
      const edge = point.clone().addScaledVector(right, offset + side * width / 2);
      positions.push(edge.x, edge.y + lift, edge.z);
    }
    if (i < segments) {
      const v = i * 2;
      indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export let MAP_PATH = '';

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

export let START = trackFrame(0);
let mapProjection = { scale: 0.285, x: 100, z: 100 };
export function trackMapPoint(x: number, z: number) { return { x: x * mapProjection.scale + mapProjection.x, y: z * mapProjection.scale + mapProjection.z }; }

function updateMapProjection() {
  const xs = TRACK_POINTS.map(({ point }) => point.x), zs = TRACK_POINTS.map(({ point }) => point.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const scale = 172 / Math.max(maxX - minX, maxZ - minZ);
  mapProjection = { scale, x: 100 - (minX + maxX) / 2 * scale, z: 100 - (minZ + maxZ) / 2 * scale };
  MAP_PATH = TRACK_POINTS.filter((_, index) => index % 3 === 0)
    .map(({ point }, index) => { const p = trackMapPoint(point.x, point.z); return `${index ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ') + (TRACK_CLOSED ? 'Z' : '');
}
updateMapProjection();

/** Switch all derived geometry together, before the selected scene remounts. */
export function setTrackLayout(points: THREE.Vector3[], options: { closed?: boolean; width?: number; segments?: number; gates?: number } = {}) {
  TRACK_CLOSED = options.closed ?? true; ROAD_WIDTH = options.width ?? 14; TRACK_SEGMENTS = options.segments ?? 360;
  // Broader mountain hairpins keep the narrow snowy road physically drivable;
  // difficulty comes from traction and obstacles, not a near-kink in the mesh.
  trackCurve = new THREE.CatmullRomCurve3(points, TRACK_CLOSED, 'catmullrom', TRACK_CLOSED ? 0.35 : 0.55);
  trackCurve.arcLengthDivisions = TRACK_CLOSED ? 200 : 4000;
  TRACK_POINTS = Array.from({ length: TRACK_SEGMENTS + (TRACK_CLOSED ? 0 : 1) }, (_, index) => trackFrame(index / TRACK_SEGMENTS));
  const gates = options.gates ?? 8;
  CHECKPOINT_PROGRESS = Array.from({ length: gates }, (_, index) => TRACK_CLOSED ? index / gates : index / (gates - 1) * 0.99);
  CHECKPOINTS = CHECKPOINT_PROGRESS.map(trackFrame);
  TRACK_LENGTH = trackCurve.getLength();
  START = trackFrame(0);
  updateMapProjection();
}
