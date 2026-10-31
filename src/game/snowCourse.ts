import { TRACK_CLOSED, roadHalfWidthAt, trackFrame } from './track';

export const SNOW_ICE_ZONES = [[0.095, 0.13], [0.215, 0.25], [0.34, 0.375], [0.46, 0.50], [0.58, 0.62], [0.705, 0.745], [0.825, 0.86], [0.92, 0.95]] as const;
export function surfaceAt(progress: number) {
  if (TRACK_CLOSED) return { kind: 'dry' as const, grip: 1, braking: 1, acceleration: 1, steering: 1, speed: 1 };
  const ice = SNOW_ICE_ZONES.some(([from, to]) => progress >= from && progress <= to);
  return { kind: ice ? 'black-ice' as const : 'packed-snow' as const, grip: ice ? 0.24 : 0.64,
    braking: ice ? 0.4 : 0.75, acceleration: ice ? 0.68 : 0.85, steering: ice ? 0.82 : 0.95, speed: 0.82 };
}
export type SnowHurdle = { id: string; progress: number; side: number; position: [number, number, number]; yaw: number; halfExtents: [number, number, number] };
export let SNOW_HURDLES: SnowHurdle[] = [];
export function rebuildSnowCourse() {
  SNOW_HURDLES = TRACK_CLOSED ? [] : [0.075, 0.155, 0.195, 0.28, 0.315, 0.40, 0.44, 0.525, 0.565, 0.65, 0.69, 0.775, 0.81, 0.89, 0.965].map((progress, index) => {
    const frame = trackFrame(progress), side = index % 2 ? 1 : -1;
    const p = frame.point.clone().addScaledVector(frame.right, side * Math.min(1.9, roadHalfWidthAt(progress) - 1.5));
    return { id: `snow-hurdle-${index}`, progress, side, position: [p.x, p.y + 0.75, p.z], yaw: frame.yaw, halfExtents: [Math.min(1.35, roadHalfWidthAt(progress) / 2 - 0.25), 0.75, 1.6] };
  });
}

/** A marked, continuous slalom line used by the development/test driver only. */
export function snowDrivingOffset(progress: number) {
  let offset = 0;
  for (const hurdle of SNOW_HURDLES) {
    const distance = Math.abs(progress - hurdle.progress);
    if (distance < 0.013) offset += -hurdle.side * Math.min(2.2, roadHalfWidthAt(progress) - 1.2) * Math.cos(distance / 0.013 * Math.PI / 2) ** 2;
  }
  return offset;
}
