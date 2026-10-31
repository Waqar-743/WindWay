import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import CarVisual, { type CarMotion } from './CarVisual';
import { carById } from './config';
import { CHECKPOINTS, CHECKPOINT_PROGRESS, roadHalfWidthAt, ROAD_WIDTH, TRACK_CLOSED, TRACK_LENGTH, nearestTrackPoint, trackFrame } from './track';
import { snowDrivingOffset, surfaceAt } from './snowCourse';
import { advanceRaceGate, crossedGate } from './driving';
import { currentMap } from './maps';
import { BODY_HALF_EXTENTS, BODY_OFFSET_Y, createMotionTools, getRespawnPose, PHYSICS_STEP, readHeading, recoveryReason, resetVehicleBody, RIDE_HEIGHT, stepVehicleMotion, type RecoveryReason } from './vehiclePhysics';
import { getDriveableHalfWidth } from './trackBarriers';
import { BOOST_JUMP, jumpSample } from './trackFeatures';
import { clearInput, drivingInput } from './input';
import { useGame } from './store';
import { vehicleFrame } from './runtime';
import { gameAudio } from './audio';

const testDrive = import.meta.env.DEV && new URLSearchParams(window.location.search).has('testDrive');

export default function Vehicle() {
  const initialPose = useMemo(() => getRespawnPose(0, true), []);
  const spawn = initialPose.position;
  const initialPosition: [number, number, number] = [spawn.x, spawn.y, spawn.z];
  const body = useRef<RapierRigidBody>(null); const visual = useRef<THREE.Group>(null);
  const { world, rapier } = useRapier();
  const selectedCar = useGame((state) => state.selectedCar); const paint = useGame((state) => state.paint);
  const resetRequest = useGame((state) => state.resetRequest);
  const car = carById(selectedCar);
  const motion = useRef<CarMotion>({ speed: 0, steer: 0, lean: 0, bounce: 0 });
  const simulation = useRef({ elapsed: 0, lap: 1, checkpoint: 0, resets: 0, publish: 0, previous: { x: spawn.x, z: spawn.z }, airTime: 0, offRoadTime: 0, wasGrounded: true, lastCrash: -10 });
  const vectors = useRef(createMotionTools(rapier));
  const ready = useCallback(() => { useGame.getState().setReady(true); useGame.getState().startCountdown(); }, []);

  const resetToRoad = useCallback((reason: RecoveryReason = 'manual') => {
    const rb = body.current; if (!rb) return;
    const game = useGame.getState(); if (game.status !== 'running') return;
    const state = simulation.current;
    const frame = resetVehicleBody(rb, state.checkpoint, vectors.current);
    state.previous = { x: frame.point.x, z: frame.point.z }; state.resets++; state.airTime = 0; state.offRoadTime = 0; state.wasGrounded = true;
    vehicleFrame.position.set(frame.position.x, frame.position.y, frame.position.z); vehicleFrame.velocity.set(0, 0, 0);
    vehicleFrame.yaw = frame.yaw; vehicleFrame.speed = 0; vehicleFrame.steer = 0; vehicleFrame.shake = 0;
    vehicleFrame.drifting = false; vehicleFrame.grounded = true; vehicleFrame.boosting = false; vehicleFrame.resets = state.resets;
    Object.assign(motion.current, { speed: 0, steer: 0, lean: 0, bounce: 0 }); clearInput();
    game.updateTelemetry({ speed: 0, elapsed: state.elapsed, lap: state.lap, checkpoint: state.checkpoint, progress: frame.progress, x: frame.position.x, z: frame.position.z, drifting: false, airborne: false, boosting: false, resets: state.resets, altitude: frame.point.y, surface: surfaceAt(frame.progress).kind });
    game.beginRecovery(reason, state.checkpoint);
    game.react('Back on the road. You’ve got this.', currentMap.id === 'snow' ? 'snowman' : currentMap.id === 'jungle' ? 'imran' : 'crying-driver'); gameAudio.chime('crash');
  }, []);

  useEffect(() => { if (resetRequest > 0) resetToRoad(); }, [resetRequest, resetToRoad]);
  useEffect(() => {
    vehicleFrame.position.set(...initialPosition); vehicleFrame.yaw = initialPose.yaw;
    vehicleFrame.speed = 0; vehicleFrame.drifting = false; vehicleFrame.grounded = true; vehicleFrame.boosting = false; vehicleFrame.shake = 0; vehicleFrame.resets = 0;
  }, []);
  useEffect(() => () => { clearInput(); gameAudio.stop(); }, []);

  useBeforePhysicsStep(() => {
    const game = useGame.getState(); const rb = body.current;
    if (!rb || game.status !== 'running') return;
    const dt = PHYSICS_STEP; const state = simulation.current;
    state.elapsed = Math.max(state.elapsed, game.telemetry.elapsed) + dt;
    let input = drivingInput;
    // Development-only test driver uses the same steering, grip and physics
    // as a player, and still has to cross every physical checkpoint in order.
    if (testDrive) {
      const position = rb.translation(), velocity = rb.linvel(), yaw = readHeading(rb, vectors.current);
      const nearest = nearestTrackPoint(position.x, position.z);
      const forward = velocity.x * Math.sin(yaw) + velocity.z * Math.cos(yaw);
      const targetProgress = nearest.progress + (TRACK_CLOSED ? Math.max(0.014, Math.abs(forward) * 0.00065) : Math.max(14, Math.abs(forward) * 0.8) / TRACK_LENGTH);
      const targetFrame = trackFrame(targetProgress);
      const target = targetFrame.point.clone().addScaledVector(targetFrame.right, snowDrivingOffset(targetProgress));
      const desired = Math.atan2(target.x - position.x, target.z - position.z);
      const error = Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw));
      const bend = nearest.tangent.angleTo(trackFrame(nearest.progress + 28 / TRACK_LENGTH).tangent);
      const targetSpeed = !TRACK_CLOSED ? (bend > 0.3 || Math.abs(error) > 0.25 ? 7 : surfaceAt(nearest.progress).kind === 'black-ice' ? 11 : 16) : Math.abs(error) > 0.45 ? 22 : 33;
      input = { throttle: forward < targetSpeed, brake: forward > targetSpeed + 2, left: error > 0.025, right: error < -0.025, handbrake: false };
    }
    const { position, velocity, yaw, nearest, grounded, driving, drifting, boosting, boostStarted, launched, surface } = stepVehicleMotion(rb, world, vectors.current, car, input, dt);
    state.offRoadTime = nearest.distance > getDriveableHalfWidth(nearest.progress) ? state.offRoadTime + dt : 0;
    const failure = recoveryReason(position, nearest, state.offRoadTime);
    if (failure) { resetToRoad(failure); return; }
    motion.current.speed = driving.forward; motion.current.steer += (driving.steer - motion.current.steer) * 0.15;
    motion.current.lean += (-driving.steer * Math.min(0.055, Math.abs(driving.forward) * 0.002) - motion.current.lean) * 0.08;
    vehicleFrame.position.set(position.x, position.y, position.z); vehicleFrame.velocity.set(velocity.x, velocity.y, velocity.z);
    vehicleFrame.yaw = yaw; vehicleFrame.speed = driving.forward; vehicleFrame.steer = driving.steer; vehicleFrame.drifting = drifting; vehicleFrame.grounded = grounded; vehicleFrame.boosting = boosting; vehicleFrame.resets = state.resets;
    if (boostStarted) { game.react('A little more wild. Boost engaged.'); gameAudio.chime('checkpoint'); }
    if (launched) { game.react('Air mail. Express delivery.', currentMap.id === 'jungle' ? 'toucan' : 'eagle-soaring'); gameAudio.chime('jump'); }
    if (!grounded) state.airTime += dt;
    if (grounded && !state.wasGrounded) {
      if (state.airTime > 0.35) vehicleFrame.shake = Math.min(0.6, state.airTime * 0.2);
      if (state.airTime > 0.6) { game.react('Air mail. Special delivery.', currentMap.id === 'jungle' ? 'tatheer' : 'eagle-soaring'); gameAudio.chime('jump'); }
      state.airTime = 0;
    }
    state.wasGrounded = grounded;
    const gateIndex = TRACK_CLOSED ? (state.checkpoint + 1) % CHECKPOINTS.length : Math.min(CHECKPOINTS.length - 1, state.checkpoint + 1);
    if (crossedGate(state.previous, position, CHECKPOINTS[gateIndex], roadHalfWidthAt(CHECKPOINT_PROGRESS[gateIndex]) + 0.5) && Math.abs(position.y - CHECKPOINTS[gateIndex].point.y) < 3) {
      const next = advanceRaceGate(state.checkpoint, state.lap, currentMap.laps, TRACK_CLOSED, CHECKPOINTS.length);
      const newLap = next.lap !== state.lap;
      state.checkpoint = next.checkpoint; state.lap = next.lap;
      if (next.finished) { game.finish(state.elapsed, state.resets); gameAudio.chime('finish'); gameAudio.stop(); }
      else {
        vehicleFrame.checkpointFlash = 1;
        gameAudio.chime('checkpoint');
        if (newLap) { state.publish = 1; game.react(`Lap ${state.lap} of ${currentMap.laps}. Bring it home!`, 'tatheer'); }
        else if (!TRACK_CLOSED) game.react(state.checkpoint === CHECKPOINTS.length - 2 ? 'The summit is right there. Keep it tidy.' : `Gate ${state.checkpoint}. Higher, colder, a little wilder.`, 'snowman');
        else if (state.checkpoint === 1 || state.checkpoint === 4 || state.checkpoint === 7) game.react(state.checkpoint === 7 ? 'Last stretch. Make it a good one.' : state.checkpoint === 4 ? 'Half a lap. Whole lot of attitude.' : 'That’s the spirit. Keep it rolling.');
      }
    }
    state.previous.x = position.x; state.previous.z = position.z;
    state.publish += dt;
    if (state.publish > 0.1) {
      state.publish = 0;
      game.updateTelemetry({ speed: Math.abs(driving.forward) * 3.6, elapsed: state.elapsed, lap: state.lap, checkpoint: state.checkpoint, progress: nearest.progress, x: position.x, z: position.z, drifting, airborne: !grounded && state.airTime > 0.1, boosting, resets: state.resets, altitude: nearest.point.y, surface });
      gameAudio.update(driving.forward, input.throttle, drifting, true);
    }
  });

  useFrame((_, delta) => {
    if (!visual.current) return;
    visual.current.rotation.z = motion.current.lean;
    visual.current.position.y = -RIDE_HEIGHT;
    const nearest = nearestTrackPoint(vehicleFrame.position.x, vehicleFrame.position.z);
    const ramp = jumpSample(vehicleFrame.position, nearest);
    const grade = Math.atan2(nearest.tangent.y, Math.hypot(nearest.tangent.x, nearest.tangent.z)) + (ramp.onRamp ? Math.atan2(BOOST_JUMP.height, BOOST_JUMP.length) : 0);
    const pitch = vehicleFrame.grounded ? -grade * Math.cos(vehicleFrame.yaw - nearest.yaw)
      : -THREE.MathUtils.clamp(Math.atan2(vehicleFrame.velocity.y, Math.max(8, Math.abs(vehicleFrame.speed))) * 0.65, -0.16, 0.16);
    visual.current.rotation.x += (pitch - visual.current.rotation.x) * (1 - Math.exp(-delta * (vehicleFrame.grounded ? 12 : 5)));
  });

  return <RigidBody
    ref={body} name="player" position={initialPosition} rotation={[0, initialPose.yaw, 0]}
    colliders={false} enabledRotations={[false, true, false]} linearDamping={0.02}
    angularDamping={2} canSleep={false} ccd
    onCollisionEnter={({ other }) => {
      const state = simulation.current;
      if (other.rigidBodyObject?.name === 'barriers' && Math.abs(vehicleFrame.speed) > 6 && state.elapsed - state.lastCrash > 2) {
        state.lastCrash = state.elapsed; vehicleFrame.shake = 0.35; gameAudio.chime('crash'); useGame.getState().react('The barrier says hello.', currentMap.id === 'snow' ? 'snowman' : currentMap.id === 'jungle' ? 'imran' : 'crying-driver');
      }
    }}
  >
    <CuboidCollider args={BODY_HALF_EXTENTS} position={[0, BODY_OFFSET_Y, 0]} mass={1} friction={0} frictionCombineRule={rapier.CoefficientCombineRule.Min} restitution={0} restitutionCombineRule={rapier.CoefficientCombineRule.Min} />
    <group ref={visual} position={[0, -RIDE_HEIGHT, 0]}><Suspense fallback={null}><CarVisual carId={selectedCar} paint={paint} motion={motion} onReady={ready} /></Suspense></group>
  </RigidBody>;
}

export function ChaseCamera() {
  const { camera } = useThree(); const desired = useRef(new THREE.Vector3()); const look = useRef(new THREE.Vector3()); const target = useRef(new THREE.Vector3());
  const initialized = useRef(false);
  const lastRecovery = useRef(0);
  useEffect(() => { initialized.current = false; }, []);
  useFrame((_, delta) => {
    const { settings, cameraMode, status } = useGame.getState();
    const p = vehicleFrame.position; const yaw = vehicleFrame.yaw;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    if (p.lengthSq() < 1) { const pose = getRespawnPose(0, true); p.set(pose.position.x, pose.position.y, pose.position.z); vehicleFrame.yaw = pose.yaw; }
    const hood = cameraMode === 'hood'; const speed = Math.abs(vehicleFrame.speed);
    const distance = hood ? -1.4 : 10.4 + Math.min(3, speed * 0.065);
    desired.current.set(p.x - sin * distance, p.y + (hood ? 1.4 : 5.2), p.z - cos * distance);
    if (!settings.reducedMotion && settings.effects && vehicleFrame.shake > 0.001) {
      desired.current.x += Math.sin(performance.now() * 0.08) * vehicleFrame.shake;
      desired.current.y += Math.cos(performance.now() * 0.1) * vehicleFrame.shake * 0.5;
    }
    vehicleFrame.shake *= Math.exp(-delta * 6);
    look.current.set(p.x + sin * (hood ? 12 : 5), p.y + 0.5, p.z + cos * (hood ? 12 : 5));
    if (!initialized.current || status === 'countdown' || lastRecovery.current !== vehicleFrame.resets) { camera.position.copy(desired.current); target.current.copy(look.current); initialized.current = true; lastRecovery.current = vehicleFrame.resets; }
    else {
      const blend = 1 - Math.exp(-Math.min(delta, 0.05) * (3 + settings.sensitivity * 3));
      camera.position.lerp(desired.current, blend); target.current.lerp(look.current, blend);
    }
    camera.lookAt(target.current);
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = 53 + (!settings.reducedMotion && settings.effects && !hood ? Math.min(9, speed * 0.18) : 0);
      if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * 0.05; camera.updateProjectionMatrix(); }
    }
  });
  return null;
}

export function DrivingEffects() {
  const dust = useRef<THREE.InstancedMesh>(null); const marks = useRef<THREE.InstancedMesh>(null);
  const particles = useRef(Array.from({ length: 36 }, () => ({ position: new THREE.Vector3(), age: 9, scale: 0 })));
  const cursor = useRef(0); const skidCursor = useRef(0); const timer = useRef(0); const object = useRef(new THREE.Object3D());
  const effects = useGame((state) => state.settings.effects);
  const snow = useGame((state) => state.selectedMap === 'snow');
  useFrame((_, delta) => {
    if (!effects || useGame.getState().status !== 'running') return;
    const dt = Math.min(delta, 0.05); timer.current += dt;
    const p = vehicleFrame.position; const yaw = vehicleFrame.yaw;
    if (timer.current > 0.055 && Math.abs(vehicleFrame.speed) > 6 && vehicleFrame.grounded) {
      timer.current = 0;
      const nearest = nearestTrackPoint(p.x, p.z);
      if (vehicleFrame.drifting || nearest.distance > ROAD_WIDTH / 2 || snow) {
        const particle = particles.current[cursor.current++ % particles.current.length]; particle.age = 0;
        particle.position.set(p.x - Math.sin(yaw) * 2, p.y - 0.1, p.z - Math.cos(yaw) * 2); particle.scale = 0.3;
      }
      if (vehicleFrame.drifting && marks.current) {
        for (const side of [-1, 1]) {
          const o = object.current; o.position.set(p.x + Math.cos(yaw) * side * 0.85, nearest.point.y + 0.04, p.z - Math.sin(yaw) * side * 0.85);
          o.rotation.set(0, yaw, 0); o.scale.set(0.26, 0.02, 1.1); o.updateMatrix(); marks.current.setMatrixAt(skidCursor.current++ % 140, o.matrix);
        }
        marks.current.instanceMatrix.needsUpdate = true;
      }
    }
    if (dust.current) {
      particles.current.forEach((particle, index) => {
        particle.age += dt; particle.position.y += dt * 0.7;
        const size = particle.age < 1.2 ? (0.25 + particle.age * 0.7) * (1 - particle.age / 1.2) : 0;
        const o = object.current; o.position.copy(particle.position); o.scale.setScalar(size); o.rotation.set(0, 0, 0); o.updateMatrix(); dust.current!.setMatrixAt(index, o.matrix);
      }); dust.current.instanceMatrix.needsUpdate = true;
    }
  });
  useEffect(() => {
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    if (marks.current) { for (let i = 0; i < 140; i++) marks.current.setMatrixAt(i, hidden); marks.current.instanceMatrix.needsUpdate = true; }
    if (dust.current) { for (let i = 0; i < 36; i++) dust.current.setMatrixAt(i, hidden); dust.current.instanceMatrix.needsUpdate = true; }
  }, [effects]);
  if (!effects) return null;
  return <>
    <instancedMesh ref={dust} args={[undefined, undefined, 36]} frustumCulled={false}><icosahedronGeometry args={[1, 0]} /><meshBasicMaterial color={snow ? '#f3f8fb' : '#e0cda6'} transparent opacity={0.6} depthWrite={false} /></instancedMesh>
    <instancedMesh ref={marks} args={[undefined, undefined, 140]} frustumCulled={false}><boxGeometry /><meshBasicMaterial color={snow ? '#527485' : '#344c40'} transparent opacity={0.5} depthWrite={false} /></instancedMesh>
  </>;
}
