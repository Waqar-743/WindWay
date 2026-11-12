import { currentLevel } from './levels';
import { ROAD_WIDTH, TRACK_CLOSED, TRACK_POINTS, TRACK_SEGMENTS, TRACK_LENGTH, roadHalfWidthAt, trackFrame } from './track';

type Position = [number, number, number];

/** One box shared by the visible mesh, live collider and headless physics tests. */
export type TrackBarrier = {
  id: string;
  kind: 'bridge' | 'roadside' | 'challenge';
  side: -1 | 1;
  progress: number;
  position: Position;
  yaw: number;
  halfExtents: Position;
};

export type BridgeDeckSegment = {
  id: string;
  index: number;
  progress: number;
  position: Position;
  yaw: number;
  halfExtents: Position;
};

export const BRIDGE_RAIL_OFFSET = 8.2;
export const BRIDGE_RAIL_THICKNESS = 0.6;
export const BRIDGE_DRIVEABLE_HALF_WIDTH = BRIDGE_RAIL_OFFSET - BRIDGE_RAIL_THICKNESS / 2;
export const DEFAULT_DRIVEABLE_HALF_WIDTH = ROAD_WIDTH / 2 + 0.05;

// Continue the protected deck onto both banks, not just over the water. The
// small overlaps seal joints on a curved bridge without invisible end walls.
function buildBridgeSegments() { return TRACK_POINTS.map((frame, index) => {
  const next = TRACK_POINTS[(index + 1) % TRACK_SEGMENTS];
  return TRACK_CLOSED && Math.abs((frame.point.z + next.point.z) / 2) <= 34;
}); }
let bridgeSegments = buildBridgeSegments();

export function isBridgeProgress(progress: number) {
  if (!TRACK_CLOSED) return false;
  const normalized = ((progress % 1) + 1) % 1;
  return bridgeSegments[Math.floor(normalized * TRACK_SEGMENTS) % TRACK_SEGMENTS];
}

/** The bridge shoulder is a real supported deck all the way to its solid rail. */
export function getDriveableHalfWidth(progress: number) {
  return isBridgeProgress(progress) ? BRIDGE_DRIVEABLE_HALF_WIDTH : ROAD_WIDTH / 2 + 0.05;
}

function buildBridgeDecks(): BridgeDeckSegment[] { return TRACK_POINTS.flatMap((frame, index) => {
  if (!bridgeSegments[index]) return [];
  const next = TRACK_POINTS[(index + 1) % TRACK_SEGMENTS];
  const dx = next.point.x - frame.point.x, dz = next.point.z - frame.point.z;
  const length = Math.hypot(dx, dz), forwardX = dx / length, forwardZ = dz / length;
  // The side endpoints of a curved plank project beyond its centreline
  // chord. Cover those corners too, or an outer-curve joint can open a
  // centimetre-wide unsupported wedge even when the centreline overlaps.
  const cornerExtension = 8.85 * Math.max(
    Math.abs(frame.right.x * forwardX + frame.right.z * forwardZ),
    Math.abs(next.right.x * forwardX + next.right.z * forwardZ),
  );
  return [{
    id: `bridge-deck-${index}`, index, progress: (index + 0.5) / TRACK_SEGMENTS,
    position: [(frame.point.x + next.point.x) / 2, (frame.point.y + next.point.y) / 2 - 0.23, (frame.point.z + next.point.z) / 2] as Position,
    yaw: Math.atan2(dx, dz), halfExtents: [8.85, 0.14, length / 2 + cornerExtension + 0.12] as Position,
  }];
}); }
export let BRIDGE_DECK_SEGMENTS = buildBridgeDecks();

function buildBarriers(): TrackBarrier[] { return TRACK_POINTS.flatMap<TrackBarrier>((frame, index) => {
  if (!TRACK_CLOSED) {
    if (index >= TRACK_SEGMENTS) return [];
    const next = TRACK_POINTS[index + 1], turn = frame.tangent.angleTo(next.tangent);
    if (index > 12 && index < TRACK_SEGMENTS - 20 && turn < 0.025 && index % 32 >= 20) return [];
    return ([-1, 1] as const).map((side) => {
      const a = frame.point.clone().addScaledVector(frame.right, side * (roadHalfWidthAt(index / TRACK_SEGMENTS) + 0.3));
      const b = next.point.clone().addScaledVector(next.right, side * (roadHalfWidthAt(index / TRACK_SEGMENTS) + 0.3));
      return { id: `snow-rail-${index}-${side}`, kind: 'roadside' as const, side, progress: index / TRACK_SEGMENTS,
        position: [(a.x + b.x) / 2, (a.y + b.y) / 2 + 0.65, (a.z + b.z) / 2] as Position,
        yaw: Math.atan2(b.x - a.x, b.z - a.z), halfExtents: [0.28, 0.65, Math.hypot(b.x - a.x, b.z - a.z) / 2 + 0.16] as Position };
    });
  }
  if (bridgeSegments[index]) {
    const next = TRACK_POINTS[(index + 1) % TRACK_SEGMENTS];
    return ([-1, 1] as const).map((side) => {
      const a = frame.point.clone().addScaledVector(frame.right, side * BRIDGE_RAIL_OFFSET);
      const b = next.point.clone().addScaledVector(next.right, side * BRIDGE_RAIL_OFFSET);
      const dx = b.x - a.x, dz = b.z - a.z;
      return {
        id: `bridge-rail-${index}-${side}`, kind: 'bridge' as const, side, progress: (index + 0.5) / TRACK_SEGMENTS,
        position: [(a.x + b.x) / 2, (a.y + b.y) / 2 + 0.64, (a.z + b.z) / 2] as Position,
        yaw: Math.atan2(dx, dz), halfExtents: [BRIDGE_RAIL_THICKNESS / 2, 0.73, Math.hypot(dx, dz) / 2 + 0.12] as Position,
      };
    });
  }
  if (index % 12 !== 0 || index <= 12 || Math.abs(frame.point.z) <= 40) return [];
  return ([-1, 1] as const).map((side) => {
    // Set the barrier just outside the painted road: the car makes contact
    // while its centre is still on supported asphalt, rather than falling
    // off before it can reach a decorative block farther down the shoulder.
    const p = frame.point.clone().addScaledVector(frame.right, side * (roadHalfWidthAt(index / TRACK_SEGMENTS) + 0.55));
    return {
      id: `roadside-${index}-${side}`, kind: 'roadside' as const, side, progress: index / TRACK_SEGMENTS,
      position: [p.x, p.y + 0.65, p.z] as Position, yaw: frame.yaw,
      halfExtents: [0.35, 0.65, 2.7] as Position,
    };
  });
}); }
function buildChallengeBarriers(): TrackBarrier[] {
  if (!TRACK_CLOSED) return [];
  return [0.16, 0.25, 0.34, 0.47, 0.58, 0.68, 0.79, 0.89].slice(0, currentLevel.slalom).flatMap((initial, index) => {
    let progress = initial, frame = trackFrame(progress);
    for (let attempt = 0; attempt < 6 && Math.abs(frame.point.z) < 48; attempt++) { progress += 0.012; frame = trackFrame(progress); }
    if (Math.abs(frame.point.z) < 48) return [];
    const side = (index % 2 ? 1 : -1) as -1 | 1, halfWidth = roadHalfWidthAt(progress);
    const width = halfWidth - 0.1;
    const p = frame.point.clone().addScaledVector(frame.right, side * (halfWidth - width / 2));
    return [{ id: 'level-slalom-' + index, kind: 'challenge' as const, side, progress,
      position: [p.x, p.y + 0.65, p.z] as Position, yaw: frame.yaw, halfExtents: [width / 2, 0.65, 0.8] as Position }];
  });
}
export let TRACK_BARRIERS = [...buildBarriers(), ...buildChallengeBarriers()];

/** A continuous safe line for the development driver and route validation. */
export function challengeDrivingOffset(progress: number) {
  let offset = 0;
  for (const barrier of TRACK_BARRIERS) {
    if (barrier.kind !== 'challenge') continue;
    const distance = Math.abs((((progress - barrier.progress) % 1) + 1.5) % 1 - 0.5) * TRACK_LENGTH;
    if (distance < 32) {
      const half = roadHalfWidthAt(progress), lane = Math.min((roadHalfWidthAt(barrier.progress) + 0.1) / 2, half - 1.15);
      offset += -barrier.side * lane * Math.cos(distance / 32 * Math.PI / 2) ** 2;
    }
  }
  return offset;
}

// Only decorative uprights extend below the deck. Their blocking parapets
// above the road are the exact solid boxes in TRACK_BARRIERS.
function buildSupports() { return BRIDGE_DECK_SEGMENTS.filter(({ index }) => index % 4 === 0).flatMap(({ progress }) => {
  const frame = trackFrame(progress);
  return ([-1, 1] as const).map((side) => {
    const p = frame.point.clone().addScaledVector(frame.right, side * BRIDGE_RAIL_OFFSET);
    const top = p.y + 1.45, bottom = -3.2;
    return { position: [p.x, (top + bottom) / 2, p.z] as Position, scale: [0.72, top - bottom, 0.72] as Position, rotation: frame.yaw };
  });
}); }
export let BRIDGE_SUPPORTS = buildSupports();

export function rebuildTrackBarriers() {
  bridgeSegments = buildBridgeSegments();
  BRIDGE_DECK_SEGMENTS = buildBridgeDecks();
  TRACK_BARRIERS = [...buildBarriers(), ...buildChallengeBarriers()];
  BRIDGE_SUPPORTS = buildSupports();
}
