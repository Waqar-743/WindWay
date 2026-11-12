import * as THREE from 'three';
import type { RapierContext, RapierRigidBody } from '@react-three/rapier';
import { driveVelocity, type DrivingInput } from './driving';
import type { GameCar } from './config';
import { CHECKPOINT_PROGRESS, nearestTrackPoint, ROAD_WIDTH, TRACK_CLOSED, TRACK_LENGTH, trackFrame } from './track';
import { surfaceAt, SNOW_HURDLES } from './snowCourse';
import { getDriveableHalfWidth, TRACK_BARRIERS } from './trackBarriers';
import { BOOST_JUMP, jumpSample } from './trackFeatures';

export const PHYSICS_STEP = 1 / 60;
export const RIDE_HEIGHT = 0.58;
export const ROAD_EDGE = ROAD_WIDTH / 2 + 0.05;
export const BODY_HALF_EXTENTS: [number, number, number] = [0.88, 0.2, 2.12];
export const BODY_OFFSET_Y = 0.14;
export type RecoveryReason = 'off-road' | 'fall' | 'water' | 'manual';
type Point = { x: number; y: number; z: number };

export function getRespawnPose(checkpoint: number, initial = false) {
  const earned = Math.max(0, Math.min(CHECKPOINT_PROGRESS.length - 1, Math.floor(checkpoint)));
  // Start seven metres behind the line; recover four metres after an earned
  // gate so the player cannot accidentally earn that gate twice.
  let progress = initial || earned === 0 ? (TRACK_CLOSED ? -7 : 8) / TRACK_LENGTH : CHECKPOINT_PROGRESS[earned] + 4 / TRACK_LENGTH;
  // Avoid spawning inside a new slalom block when checkpoint positions change.
  const nextGate = CHECKPOINT_PROGRESS[earned + 1] ?? 1;
  for (let attempt = 0; !initial && earned > 0 && attempt < 8; attempt++) {
    const p = trackFrame(progress).point;
    const blocked = [...TRACK_BARRIERS, ...SNOW_HURDLES].some(wall => {
      const dx = p.x - wall.position[0], dz = p.z - wall.position[2], c = Math.cos(wall.yaw), s = Math.sin(wall.yaw);
      return Math.abs(dx * c - dz * s) < wall.halfExtents[0] + BODY_HALF_EXTENTS[0] + 0.3
        && Math.abs(dx * s + dz * c) < wall.halfExtents[2] + BODY_HALF_EXTENTS[2] + 0.5;
    });
    if (!blocked) break;
    progress = Math.min(progress + 6 / TRACK_LENGTH, nextGate - 4 / TRACK_LENGTH);
  }
  const frame = trackFrame(progress);
  return { ...frame, progress: TRACK_CLOSED ? ((progress % 1) + 1) % 1 : Math.min(1, progress), position: { x: frame.point.x, y: frame.point.y + RIDE_HEIGHT, z: frame.point.z } };
}

export function recoveryReason(p: Point, nearest: ReturnType<typeof nearestTrackPoint>, offRoadSeconds: number): RecoveryReason | null {
  if (![p.x, p.y, p.z].every(Number.isFinite) || p.y < -2) return 'fall';
  const outside = nearest.distance > getDriveableHalfWidth(nearest.progress);
  if (TRACK_CLOSED && outside && Math.abs(p.z) < 23 && p.y < 0.4) return 'water';
  if (outside && p.y < nearest.point.y - 0.45) return 'fall';
  if (nearest.distance > 18 || (outside && offRoadSeconds >= 0.4)) return 'off-road';
  return null;
}

export function createMotionTools(_rapier: RapierContext['rapier']) {
  return {
    quaternion: new THREE.Quaternion(), euler: new THREE.Euler(0, 0, 0, 'YXZ'),
    jump: { previousDistance: null as number | null, primed: false, boostRemaining: 0, airborne: false, airTime: 0, launchCount: 0 },
  };
}

export function clearMotionState(tools: ReturnType<typeof createMotionTools>) {
  Object.assign(tools.jump, { previousDistance: null, primed: false, boostRemaining: 0, airborne: false, airTime: 0, launchCount: 0 });
}

export function resetVehicleBody(body: RapierRigidBody, checkpoint: number, tools?: ReturnType<typeof createMotionTools>) {
  if (tools) clearMotionState(tools);
  const pose = getRespawnPose(checkpoint);
  body.setTranslation(pose.position, true);
  body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw), true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  return pose;
}

export function readHeading(body: RapierRigidBody, tools: ReturnType<typeof createMotionTools>) {
  const q = body.rotation();
  tools.quaternion.set(q.x, q.y, q.z, q.w);
  return tools.euler.setFromQuaternion(tools.quaternion).y;
}

/** Stable arcade ground adhesion, shared by the live game and physics tests. */
export function stepVehicleMotion(body: RapierRigidBody, _world: RapierContext['world'], tools: ReturnType<typeof createMotionTools>, car: GameCar, input: DrivingInput, dt = PHYSICS_STEP) {
  const position = body.translation(), velocity = body.linvel();
  const yaw = readHeading(body, tools), sin = Math.sin(yaw), cos = Math.cos(yaw);
  const nearest = nearestTrackPoint(position.x, position.z);
  const surface = surfaceAt(nearest.progress);
  const onRoad = nearest.distance <= getDriveableHalfWidth(nearest.progress);
  const ramp = jumpSample(position, nearest), jump = tools.jump;
  jump.boostRemaining = Math.max(0, jump.boostRemaining - dt);
  const surfaceHeight = nearest.point.y + ramp.height;
  const aboveSurface = position.y - surfaceHeight;
  let grounded = onRoad && aboveSurface >= 0.1 && aboveSurface <= RIDE_HEIGHT + 0.65;
  let normalX = -nearest.tangent.x * nearest.tangent.y;
  let normalY = nearest.tangent.x ** 2 + nearest.tangent.z ** 2;
  let normalZ = -nearest.tangent.z * nearest.tangent.y;

  if (ramp.onRamp) {
    const slope = BOOST_JUMP.height / BOOST_JUMP.length;
    normalX -= nearest.tangent.x * slope;
    normalZ -= nearest.tangent.z * slope;
  }

  const forward = velocity.x * sin + velocity.z * cos;
  const lateral = velocity.x * cos - velocity.z * sin;
  const facingForward = sin * nearest.tangent.x + cos * nearest.tangent.z > 0.65;
  let boostStarted = false, launched = false;
  if (ramp.onRamp && ramp.distance > 0.2 && forward > 5 && facingForward && grounded && !jump.primed && !jump.airborne) {
    jump.primed = true; jump.boostRemaining = BOOST_JUMP.boostDuration; boostStarted = true;
  }
  if (jump.primed && !jump.airborne && jump.previousDistance !== null && jump.previousDistance <= BOOST_JUMP.length && jump.previousDistance > BOOST_JUMP.length - 4
    && ramp.distance > BOOST_JUMP.length && ramp.distance < BOOST_JUMP.length + 4 && ramp.withinWidth && forward > 5 && facingForward) {
    jump.airborne = true; jump.airTime = 0; jump.launchCount++; launched = true;
    position.y = Math.max(position.y, nearest.point.y + RIDE_HEIGHT + BOOST_JUMP.height);
    body.setTranslation(position, true);
  }
  if (jump.airborne) {
    jump.airTime += dt;
    const landing = !launched && jump.airTime > 0.15 && velocity.y <= 0 && onRoad && aboveSurface <= RIDE_HEIGHT + 0.14 && aboveSurface > 0.05;
    if (landing) { jump.airborne = false; jump.airTime = 0; grounded = true; }
    else grounded = false;
  }
  const boosting = jump.boostRemaining > 0;
  const boostedForward = boostStarted ? Math.min(car.topSpeed * 1.28, Math.max(BOOST_JUMP.minimumBoostSpeed, forward + BOOST_JUMP.speedGain)) : forward;
  const speedLimit = boosting ? car.topSpeed * 1.28 : Math.max(car.topSpeed * surface.speed, forward - dt * 8);
  const driving = driveVelocity(boostedForward, lateral, input, { ...car, topSpeed: speedLimit,
    grip: car.grip * surface.grip, braking: car.braking * surface.braking, acceleration: car.acceleration * surface.acceleration, steering: car.steering * surface.steering }, onRoad, grounded, dt);
  const vx = sin * driving.forward + cos * driving.lateral;
  const vz = cos * driving.forward - sin * driving.lateral;
  let vy = launched ? BOOST_JUMP.launchVelocity : velocity.y;
  if (grounded) {
    // No springy sphere contacts: constrain height smoothly to the actual
    // road plane, keep uphill/downhill velocity, and cancel one gravity step.
    position.y = surfaceHeight + RIDE_HEIGHT;
    body.setTranslation(position, true);
    vy = -(normalX * vx + normalZ * vz) / Math.max(0.1, normalY) + 18 * dt;
  }
  body.setLinvel({ x: vx, y: vy, z: vz }, true);
  body.setAngvel({ x: 0, y: driving.yawRate, z: 0 }, true);
  jump.previousDistance = ramp.distance;
  if (!jump.airborne && (ramp.distance < -4 || ramp.distance > BOOST_JUMP.length + 12)) jump.primed = false;
  return {
    position, velocity, yaw, nearest, onRoad, grounded, driving, boosting, boostStarted, launched, surface: surface.kind,
    drifting: grounded && Math.abs(forward) > 8 && (input.handbrake || Math.abs(lateral) > 2.8),
  };
}
