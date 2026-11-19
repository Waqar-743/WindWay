import * as THREE from 'three';
import { SNOW_ICE_ZONES } from './snowCourse';
import { BOOST_JUMP } from './trackFeatures';
import { TRACK_CLOSED, TRACK_LENGTH, TRACK_POINTS } from './track';

export type CornerSeverity = 'sweeper' | 'medium' | 'hard' | 'hairpin';
export type CornerDirection = 'left' | 'right';

export interface TrackCorner {
  /** Normalized progress along the route [0..1]. */
  progress: number;
  /** Signed heading change in radians (positive = left, negative = right). */
  deltaYaw: number;
  direction: CornerDirection;
  severity: CornerSeverity;
  /** World-space apex position. */
  point: THREE.Vector3;
  /** World-space unit tangent at the apex. */
  tangent: THREE.Vector3;
  /** World-space unit right vector at the apex. */
  right: THREE.Vector3;
  /** Outside direction multiplier (+1 = right side of track, -1 = left side). */
  outsideSide: 1 | -1;
}

export interface PaceCallout {
  label: string;
  detail: string;
  kind: 'left' | 'right' | 'hairpin-left' | 'hairpin-right' | 'ice' | 'boost';
  distanceMetres: number;
}

export interface TransmissionState {
  gear: string;
  gearIndex: number;
  rpm: number; // 0..1
  redline: boolean;
}

const GEAR_THRESHOLDS = [0, 0.13, 0.26, 0.39, 0.52, 0.65, 0.78, 0.89, 1.04];

/** Maps forward speed (m/s) to a responsive 8-speed F1 transmission readout. */
export function computeTransmission(speedMs: number, topSpeed: number): TransmissionState {
  if (speedMs < -0.6) {
    const revRpm = Math.min(1, 0.22 + Math.abs(speedMs) / 14);
    return { gear: 'R', gearIndex: -1, rpm: revRpm, redline: revRpm > 0.88 };
  }
  const absSpeed = Math.max(0, speedMs);
  if (absSpeed < 0.8) {
    return { gear: 'N', gearIndex: 0, rpm: 0.16, redline: false };
  }
  const ratio = absSpeed / Math.max(1, topSpeed);
  let gearIndex = 1;
  for (let g = 1; g <= 8; g++) {
    if (ratio >= GEAR_THRESHOLDS[g - 1]) gearIndex = g;
  }
  const low = GEAR_THRESHOLDS[gearIndex - 1];
  const high = GEAR_THRESHOLDS[gearIndex];
  const span = Math.max(0.05, high - low);
  const local = THREE.MathUtils.clamp((ratio - low) / span, 0, 1.05);
  const rpm = THREE.MathUtils.clamp(0.32 + local * 0.68, 0.2, 1);
  return {
    gear: String(gearIndex),
    gearIndex,
    rpm,
    redline: rpm >= 0.87,
  };
}

/** Detects distinct bends on any CatmullRomCurve3 so 2D maps and 3D signage share exact corners. */
export function analyzeCurveCorners(
  curve: THREE.CatmullRomCurve3,
  closed: boolean,
  sampleCount = 320,
  minTurnRadians = 0.58,
  minSpacingProgress = 0.055,
): TrackCorner[] {
  const length = curve.getLength();
  const windowProgress = Math.min(0.06, Math.max(26 / Math.max(1, length), 0.015));
  const scores: { progress: number; deltaYaw: number }[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const progress = i / sampleCount;
    const beforeP = closed ? ((progress - windowProgress * 0.45) % 1 + 1) % 1 : Math.max(0, progress - windowProgress * 0.45);
    const afterP = closed ? (progress + windowProgress * 0.55) % 1 : Math.min(1, progress + windowProgress * 0.55);
    const tBefore = curve.getTangentAt(beforeP);
    const tAfter = curve.getTangentAt(afterP);
    const yawBefore = Math.atan2(tBefore.x, tBefore.z);
    const yawAfter = Math.atan2(tAfter.x, tAfter.z);
    const deltaYaw = Math.atan2(Math.sin(yawAfter - yawBefore), Math.cos(yawAfter - yawBefore));
    scores.push({ progress, deltaYaw });
  }

  const peaks: { progress: number; deltaYaw: number }[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const prev = scores[(i - 1 + sampleCount) % sampleCount];
    const curr = scores[i];
    const next = scores[(i + 1) % sampleCount];
    if (!closed && (i < 3 || i > sampleCount - 4)) continue;
    const abs = Math.abs(curr.deltaYaw);
    if (abs < minTurnRadians) continue;
    if (abs >= Math.abs(prev.deltaYaw) && abs >= Math.abs(next.deltaYaw)) {
      const tooClose = peaks.some((existing) => {
        const raw = Math.abs(existing.progress - curr.progress);
        const dist = closed ? Math.min(raw, 1 - raw) : raw;
        return dist < minSpacingProgress;
      });
      if (!tooClose) peaks.push(curr);
    }
  }

  return peaks.map(({ progress, deltaYaw }) => {
    const abs = Math.abs(deltaYaw);
    const severity: CornerSeverity = abs >= 1.55 ? 'hairpin' : abs >= 1.05 ? 'hard' : abs >= 0.78 ? 'medium' : 'sweeper';
    const direction: CornerDirection = deltaYaw > 0 ? 'left' : 'right';
    const point = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress).normalize();
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    return {
      progress,
      deltaYaw,
      direction,
      severity,
      point,
      tangent,
      right,
      outsideSide: direction === 'left' ? -1 : 1,
    };
  });
}

/** Computes a live rally-style pace note for what lies 35–135m ahead on the active track. */
export function getUpcomingPaceCallout(progress: number, mapId: string, speedMs: number): PaceCallout | null {
  if (speedMs < 5 || TRACK_POINTS.length < 16) return null;

  const lookMin = 22;
  const lookMax = Math.min(155, 70 + speedMs * 1.9);

  // 1. Check for upcoming ice zone on Snow
  if (mapId === 'snow') {
    for (const [from, to] of SNOW_ICE_ZONES) {
      if (progress >= from && progress <= to) {
        return { label: 'BLACK ICE', detail: 'HOLD STEADY LINE', kind: 'ice', distanceMetres: 0 };
      }
      const dist = (from - progress) * TRACK_LENGTH;
      if (dist > 4 && dist < lookMax) {
        return { label: 'ICE ZONE AHEAD', detail: `BRAKE EARLY · ${Math.round(dist)} M`, kind: 'ice', distanceMetres: Math.round(dist) };
      }
    }
  }

  // 2. Check for upcoming boost ramp on Alpine / Jungle
  if (TRACK_CLOSED && BOOST_JUMP.length > 0) {
    const rawDelta = ((BOOST_JUMP.startProgress - progress) % 1 + 1) % 1;
    const dist = rawDelta * TRACK_LENGTH;
    if (dist > 8 && dist < 115) {
      return { label: 'BOOST RAMP', detail: `LINE UP STRAIGHT · ${Math.round(dist)} M`, kind: 'boost', distanceMetres: Math.round(dist) };
    }
  }

  // 3. Scan ahead along TRACK_POINTS for sharpest bend
  const total = TRACK_POINTS.length;
  const stepMetres = TRACK_LENGTH / total;
  const startStep = Math.max(1, Math.round(lookMin / stepMetres));
  const endStep = Math.max(startStep + 2, Math.round(lookMax / stepMetres));
  const windowSteps = Math.max(4, Math.round(44 / stepMetres));
  const baseIndex = Math.floor(progress * total) % total;

  let peakTurn = 0;
  let peakDist = 0;

  for (let offset = startStep; offset <= endStep; offset += 2) {
    const idxA = TRACK_CLOSED ? (baseIndex + offset) % total : Math.min(total - 1, baseIndex + offset);
    const idxB = TRACK_CLOSED ? (baseIndex + offset + windowSteps) % total : Math.min(total - 1, baseIndex + offset + windowSteps);
    if (!TRACK_CLOSED && idxB >= total - 1) break;
    const dYaw = Math.atan2(
      Math.sin(TRACK_POINTS[idxB].yaw - TRACK_POINTS[idxA].yaw),
      Math.cos(TRACK_POINTS[idxB].yaw - TRACK_POINTS[idxA].yaw),
    );
    if (Math.abs(dYaw) > Math.abs(peakTurn)) {
      peakTurn = dYaw;
      peakDist = offset * stepMetres;
    }
  }

  const abs = Math.abs(peakTurn);
  if (abs < 0.62) return null;

  const isLeft = peakTurn > 0;
  const distRounded = Math.max(15, Math.round(peakDist / 5) * 5);
  if (abs >= 1.35) {
    return {
      label: isLeft ? 'HAIRPIN LEFT' : 'HAIRPIN RIGHT',
      detail: `HEAVY BRAKE · ${distRounded} M`,
      kind: isLeft ? 'hairpin-left' : 'hairpin-right',
      distanceMetres: distRounded,
    };
  }
  if (abs >= 0.92) {
    return {
      label: isLeft ? 'SHARP LEFT' : 'SHARP RIGHT',
      detail: `CLIP APEX · ${distRounded} M`,
      kind: isLeft ? 'left' : 'right',
      distanceMetres: distRounded,
    };
  }
  return {
    label: isLeft ? 'FAST LEFT' : 'FAST RIGHT',
    detail: `FLOWING BEND · ${distRounded} M`,
    kind: isLeft ? 'left' : 'right',
    distanceMetres: distRounded,
  };
}

export interface RunGrade {
  tier: 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE';
  headline: string;
  cleanDrive: boolean;
}

/** Evaluates finishing pace and cleanliness for post-race medals. */
export function evaluateRunGrade(time: number, resets: number, mapId: string, level: number): RunGrade {
  const levelFactor = 1 + level * 0.08;
  const goldTarget = (mapId === 'snow' ? 420 : mapId === 'jungle' ? 115 : 54) * levelFactor;
  const cleanDrive = resets === 0;
  if (time <= goldTarget * 0.9 && cleanDrive) {
    return { tier: 'PLATINUM', headline: 'APEX MASTERCLASS', cleanDrive };
  }
  if (time <= goldTarget) {
    return { tier: 'GOLD', headline: cleanDrive ? 'GOLD · FLAWLESS LINE' : 'GOLD PACE', cleanDrive };
  }
  if (time <= goldTarget * 1.24) {
    return { tier: 'SILVER', headline: cleanDrive ? 'SILVER · CLEAN DRIVE' : 'SILVER PACE', cleanDrive };
  }
  return { tier: 'BRONZE', headline: cleanDrive ? 'CLEAN FINISH' : 'FINISHER', cleanDrive };
}
