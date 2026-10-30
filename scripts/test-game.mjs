import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import * as THREE from 'three';

// Exercise the shipped controller and track, not a separate test implementation.
const require = createRequire(new URL('../package.json', import.meta.url));
const storage = new Map();
globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const bundle = await build({
  stdin: { contents: "export * from './src/game/driving'; export * from './src/game/track'; export * from './src/game/config'; export * from './src/game/store'; export * from './src/game/input'; export * from './src/game/vehiclePhysics'; export * from './src/game/trackFeatures'; export * from './src/game/trackBarriers';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  define: { 'import.meta.env.BASE_URL': '"/3D-Car-Design/"', 'import.meta.env.DEV': 'false' },
});
const compiled = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports);
const { driveVelocity, neutralInput, crossedGate, GAME_CARS, useGame, formatTime, trackFrame, ribbonGeometry, nearestTrackPoint, CHECKPOINTS, TRACK_POINTS, TRACK_LENGTH, installDrivingInput, drivingInput, clearInput } = compiled.exports;
const { BODY_HALF_EXTENTS, BODY_OFFSET_Y, createMotionTools, getRespawnPose, recoveryReason, resetVehicleBody, readHeading, RIDE_HEIGHT, ROAD_EDGE, stepVehicleMotion, jumpRampGeometry } = compiled.exports;
const { BOOST_JUMP, jumpSample, jumpDistance, clearMotionState, getDriveableHalfWidth, TRACK_BARRIERS, BRIDGE_DECK_SEGMENTS } = compiled.exports;
let checks = 0;
function check(name, action) { action(); checks++; console.log(`PASS ${name}`); }
const idle = neutralInput(), gas = { ...idle, throttle: true }, brake = { ...idle, brake: true };
const car = GAME_CARS[0], dt = 1 / 60;

check('accelerates, brakes, reverses and respects speed limits', () => {
  let speed = 0;
  for (let i = 0; i < 1200; i++) speed = driveVelocity(speed, 0, gas, car, true, true, dt).forward;
  assert(speed > 45 && speed <= car.topSpeed);
  const fast = speed;
  for (let i = 0; i < 60; i++) speed = driveVelocity(speed, 0, brake, car, true, true, dt).forward;
  assert(speed < fast - 20);
  for (let i = 0; i < 600; i++) speed = driveVelocity(speed, 0, brake, car, true, true, dt).forward;
  assert.equal(speed, -12);
});
check('handbrake releases lateral grip; off-road slows the car', () => {
  const grip = driveVelocity(25, 6, gas, car, true, true, dt);
  const drift = driveVelocity(25, 6, { ...gas, handbrake: true }, car, true, true, dt);
  assert(drift.lateral > grip.lateral);
  assert(driveVelocity(25, 0, gas, car, false, true, dt).forward < grip.forward);
  assert.equal(driveVelocity(25, 0, { ...gas, left: true, right: true }, car, true, true, dt).yawRate, 0);
});
check('checkpoint crossing rejects reverse and out-of-gate shortcuts', () => {
  const gate = { point: { x: 0, z: 0 }, tangent: { x: 0, z: 1 } };
  assert(crossedGate({ x: 0, z: -8 }, { x: 0, z: 12 }, gate));
  assert(!crossedGate({ x: 0, z: 12 }, { x: 0, z: -8 }, gate));
  assert(!crossedGate({ x: 15, z: -8 }, { x: 15, z: 12 }, gate));
  assert(!crossedGate({ x: 0, z: 2 }, { x: 0, z: 3 }, gate));
});
check('closed road mesh is finite, upward facing and matches all gates', () => {
  assert(TRACK_LENGTH > 1400 && TRACK_LENGTH < 2400);
  assert(trackFrame(0).point.distanceTo(trackFrame(1).point) < 0.001);
  const geometry = ribbonGeometry(14);
  assert([...geometry.attributes.position.array].every(Number.isFinite));
  assert(geometry.attributes.normal.getY(0) > 0.9);
  CHECKPOINTS.forEach(({ point }) => assert(nearestTrackPoint(point.x, point.z).distance < 0.01));
  geometry.dispose();
});
check('boost ramp geometry is entirely on the road and leaves bypass lanes', () => {
  const geometry = jumpRampGeometry(), positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const nearest = nearestTrackPoint(positions.getX(i), positions.getZ(i));
    assert(nearest.distance <= BOOST_JUMP.width / 2 + 0.03, 'A ramp vertex lies off the road');
    assert(jumpDistance(nearest.progress) >= -0.05 && jumpDistance(nearest.progress) <= BOOST_JUMP.length + 0.05);
  }
  assert(BOOST_JUMP.width < 14 - BODY_HALF_EXTENTS[0] * 4);
  geometry.dispose();
});
check('race state follows loading → countdown → running → pause → resume', () => {
  useGame.getState().startRace(); assert.equal(useGame.getState().status, 'loading');
  useGame.getState().startCountdown();
  useGame.getState().tickCountdown(); useGame.getState().tickCountdown(); useGame.getState().tickCountdown();
  assert.equal(useGame.getState().status, 'running');
  useGame.getState().pause(); assert.equal(useGame.getState().status, 'paused');
  useGame.getState().navigate('settings'); assert.equal(useGame.getState().returnPage, 'race');
  useGame.getState().resume(); assert.equal(useGame.getState().status, 'running');
});
check('settings, car, paint and personal best save without telemetry', () => {
  useGame.getState().selectCar(GAME_CARS[1].id);
  useGame.getState().setPaint('#70b9c7'); useGame.getState().updateSettings({ sound: 0, quality: 'low' });
  useGame.getState().finish(47.28, 2);
  assert.equal(useGame.getState().result.newBest, true);
  useGame.getState().startRace(); useGame.getState().startCountdown();
  for (let i = 0; i < 3; i++) useGame.getState().tickCountdown();
  useGame.getState().finish(50.1, 0);
  assert.equal(useGame.getState().result.newBest, false);
  const saved = JSON.parse(storage.get('wildway-preferences-v1'));
  assert.equal(saved.bestTimes[GAME_CARS[1].id], 47.28);
  assert.equal(saved.settings.sound, 0); assert.equal(saved.paint, '#70b9c7');
  assert.equal(saved.telemetry, undefined);
});
check('clock rolls over correctly at minute boundaries', () => {
  assert.equal(formatTime(59.999), '01:00.00'); assert.equal(formatTime(61.25), '01:01.25');
});
check('reselecting the active car cannot get loading stuck', () => {
  useGame.getState().setReady(true);
  useGame.getState().selectCar(useGame.getState().selectedCar);
  assert.equal(useGame.getState().ready, true);
});
check('leaving a road, falling and entering water trigger bounded recovery', () => {
  const frame = trackFrame(0.42), off = frame.point.clone().addScaledVector(frame.right, 9);
  const nearest = nearestTrackPoint(off.x, off.z), p = { x: off.x, y: nearest.point.y + RIDE_HEIGHT, z: off.z };
  assert.equal(recoveryReason(p, nearest, 0.2), null, 'Brief shoulder contact should be recoverable');
  assert.equal(recoveryReason(p, nearest, 0.41), 'off-road');
  assert.equal(recoveryReason({ ...p, y: nearest.point.y - 0.6 }, nearest, 0.05), 'fall');
  const bridge = TRACK_POINTS.find(({ point }) => Math.abs(point.z) < 1);
  const wet = bridge.point.clone().addScaledVector(bridge.right, 20); wet.y = 0;
  assert.equal(recoveryReason(wet, nearestTrackPoint(wet.x, wet.z), 0.1), 'water');
  assert.equal(recoveryReason({ x: 0, y: -3, z: 119 }, nearestTrackPoint(0, 119), 0), 'fall');
  assert.equal(recoveryReason({ x: NaN, y: 2, z: 119 }, nearestTrackPoint(0, 119), 0), 'fall');
  assert.equal(recoveryReason({ x: 44, y: 3, z: 151 }, nearestTrackPoint(44, 151), 1), 'off-road', 'The removed outside stunt area must not bypass recovery');
});
check('recovery locks controls, keeps the earned gate, counts time and resumes once', () => {
  useGame.getState().startRace();
  assert.equal(useGame.getState().status, 'loading');
  useGame.getState().tickCountdown(); assert.equal(useGame.getState().status, 'loading');
  useGame.getState().startCountdown();
  for (let i = 0; i < 3; i++) useGame.getState().tickCountdown();
  useGame.getState().updateTelemetry({ ...useGame.getState().telemetry, elapsed: 12.5, checkpoint: 3, resets: 1 });
  useGame.getState().beginRecovery('fall', 3);
  useGame.getState().beginRecovery('fall', 0);
  assert.equal(useGame.getState().recovery.checkpoint, 3, 'Duplicate failure replaced the earned gate');
  const resetRequest = useGame.getState().resetRequest;
  useGame.getState().resetCar(); assert.equal(useGame.getState().resetRequest, resetRequest);
  useGame.getState().finish(12.5, 1); assert.equal(useGame.getState().status, 'recovering');
  useGame.getState().tickRecovery(0.6); assert.equal(useGame.getState().status, 'recovering');
  useGame.getState().tickRecovery(0.6); assert.equal(useGame.getState().status, 'running');
  assert(Math.abs(useGame.getState().telemetry.elapsed - 13.7) < 0.001);
  assert.equal(useGame.getState().telemetry.checkpoint, 3);
  assert.equal(useGame.getState().telemetry.resets, 1);
  useGame.getState().tickRecovery(0.6); assert(Math.abs(useGame.getState().telemetry.elapsed - 13.7) < 0.001);
  useGame.getState().beginRecovery('off-road', 3); useGame.getState().startRace();
  assert.equal(useGame.getState().recovery, null); assert.equal(useGame.getState().telemetry.checkpoint, 0);
});
check('keyboard releases on blur, handles shared bindings and leaves menu Space accessible', () => {
  const listeners = new Map(), documentListeners = new Map();
  globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  globalThis.document = { addEventListener: (name, fn) => documentListeners.set(name, fn), removeEventListener: (name) => documentListeners.delete(name) };
  let enabled = true, prevented = false;
  const dispose = installDrivingInput(() => {}, () => {}, () => {}, () => enabled);
  const key = (code) => ({ code, target: { matches: () => false }, repeat: false, preventDefault: () => { prevented = true; } });
  listeners.get('keydown')(key('KeyW')); listeners.get('keydown')(key('ArrowUp'));
  listeners.get('keyup')(key('KeyW')); assert.equal(drivingInput.throttle, true);
  listeners.get('blur')(); assert.equal(drivingInput.throttle, false);
  listeners.get('keydown')(key('KeyW')); clearInput();
  listeners.get('keyup')(key('KeyR')); assert.equal(drivingInput.throttle, false, 'A stale held key survived a reset');
  enabled = false; prevented = false;
  listeners.get('keydown')(key('Space')); assert.equal(prevented, false);
  dispose(); assert.equal(listeners.size, 0); assert.equal(documentListeners.size, 0);
  delete globalThis.window; delete globalThis.document;
});

const rapierRequire = createRequire(require.resolve('@react-three/rapier'));
const RAPIER = rapierRequire('@dimforge/rapier3d-compat');
await RAPIER.init();
for (const config of GAME_CARS) {
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 }); world.timestep = dt;
  const geometry = ribbonGeometry(14);
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(geometry.attributes.position.array), new Uint32Array(geometry.index.array)).setFriction(0.8));
  for (const side of [-1, 1]) world.createCollider(RAPIER.ColliderDesc.cuboid(480, 1, 212).setTranslation(0, -1, side * 236).setFriction(0.9));
  for (const box of [...TRACK_BARRIERS, ...BRIDGE_DECK_SEGMENTS]) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), box.yaw);
    world.createCollider(RAPIER.ColliderDesc.cuboid(...box.halfExtents).setTranslation(...box.position).setRotation(q).setFriction(0.2).setRestitution(0));
  }
  const ramp = jumpRampGeometry();
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(ramp.attributes.position.array), new Uint32Array(ramp.index.array)));
  const pose = getRespawnPose(0, true), spawn = pose.position;
  const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(spawn.x, spawn.y, spawn.z).setRotation(quaternion).enabledRotations(false, true, false).setLinearDamping(0.02).setAngularDamping(2).setCanSleep(false).setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.cuboid(...BODY_HALF_EXTENTS).setTranslation(0, BODY_OFFSET_Y, 0).setMass(1).setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(0).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min), body);
  const tools = createMotionTools(RAPIER);
  let previous = { x: spawn.x, z: spawn.z }, checkpoint = 0, finished = false, steps = 0, maxDeviation = 0, maxSpeed = 0;
  let airTime = 0, maxAirTime = 0, maxClearance = 0, maxOrdinaryClearance = 0, maxUpVelocity = 0, boosts = 0;
  for (; steps < 18000; steps++) {
    const p = body.translation(), v = body.linvel(), yaw = readHeading(body, tools);
    const nearest = nearestTrackPoint(p.x, p.z); maxDeviation = Math.max(maxDeviation, nearest.distance);
    maxClearance = Math.max(maxClearance, Math.abs(p.y - nearest.point.y - RIDE_HEIGHT)); maxUpVelocity = Math.max(maxUpVelocity, v.y);
    const sin = Math.sin(yaw), cos = Math.cos(yaw), forward = v.x * sin + v.z * cos;
    maxSpeed = Math.max(maxSpeed, Math.abs(forward));
    const target = trackFrame(nearest.progress + Math.max(0.014, Math.abs(forward) * 0.00065)).point;
    const desired = Math.atan2(target.x - p.x, target.z - p.z);
    const error = Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw));
    const targetSpeed = Math.abs(error) > 0.45 ? 22 : 33;
    const input = { throttle: forward < targetSpeed, brake: forward > targetSpeed + 2, left: error > 0.025, right: error < -0.025, handbrake: false };
    const motion = stepVehicleMotion(body, world, tools, config, input, dt);
    if (motion.boostStarted) boosts++;
    airTime = motion.grounded ? 0 : airTime + dt; maxAirTime = Math.max(maxAirTime, airTime);
    assert(motion.grounded || tools.jump.airborne, 'Unexpected airtime away from the jump');
    if (crossedGate(previous, p, CHECKPOINTS[(checkpoint + 1) % 8]) && Math.abs(p.y - CHECKPOINTS[(checkpoint + 1) % 8].point.y) < 3) {
      checkpoint++; if (checkpoint === 8) { finished = true; break; }
    }
    previous = { x: p.x, z: p.z };
    assert(p.y > -2, `${config.name} fell off the road at checkpoint ${checkpoint}`);
    world.step();
    if (motion.grounded && !jumpSample(motion.position, motion.nearest).onRamp) {
      const at = body.translation(), road = nearestTrackPoint(at.x, at.z);
      if (!jumpSample(at, road).onRamp) maxOrdinaryClearance = Math.max(maxOrdinaryClearance, Math.abs(at.y - road.point.y - RIDE_HEIGHT));
    }
  }
  assert(finished, `${config.name} failed to finish: gate ${checkpoint}, position ${JSON.stringify(body.translation())}, velocity ${JSON.stringify(body.linvel())}, max speed ${maxSpeed.toFixed(2)}, max deviation ${maxDeviation.toFixed(2)}`);
  assert(maxOrdinaryClearance < 0.03, `${config.name} bounced ${maxOrdinaryClearance.toFixed(2)}m away from the ramp`);
  assert(maxAirTime > 0.2 && maxAirTime < 1.3, `${config.name} ramp flight lasted ${maxAirTime.toFixed(2)}s`);
  assert.equal(tools.jump.launchCount, 1); assert.equal(boosts, 1);
  console.log(`PASS ${config.name}: all 8 gates, ${(steps * dt).toFixed(2)}s simulated lap, ${maxDeviation.toFixed(2)}m max centerline deviation, ${maxClearance.toFixed(2)}m clearance, ${maxAirTime.toFixed(2)}s airtime, ${maxUpVelocity.toFixed(2)}m/s vertical`);
  checks++;
  check(`${config.name}: recovery clears velocity and stays settled at every earned gate`, () => {
    for (let gate = 0; gate < 8; gate++) {
      body.setLinvel({ x: 30, y: 15, z: -20 }, true); body.setAngvel({ x: 0, y: 4, z: 0 }, true);
      const recovered = resetVehicleBody(body, gate, tools);
      assert(body.linvel().x === 0 && body.linvel().y === 0 && body.linvel().z === 0);
      assert.equal(body.angvel().y, 0);
      assert(nearestTrackPoint(recovered.position.x, recovered.position.z).distance < 0.02);
      if (gate > 0) assert(recovered.progress > gate / 8 && recovered.progress < gate / 8 + 0.01);
      for (let i = 0; i < 60; i++) { stepVehicleMotion(body, world, tools, config, idle, dt); world.step(); }
      assert(Math.abs(body.translation().y - recovered.position.y) < 0.03, `Recovery ${gate} dropped or bounced`);
      assert(Math.hypot(body.translation().x - recovered.position.x, body.translation().z - recovered.position.z) < 0.01);
    }
  });
  check(`${config.name}: a real road-edge fall recovers within half a second`, () => {
    const frame = TRACK_POINTS[175], p = frame.point.clone().addScaledVector(frame.right, ROAD_EDGE + 0.2);
    body.setTranslation({ x: p.x, y: p.y + RIDE_HEIGHT, z: p.z }, true);
    body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(frame.right.x, frame.right.z)), true);
    body.setLinvel({ x: frame.right.x * 12, y: 0, z: frame.right.z * 12 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    let offRoadTime = 0, failure = null, elapsed = 0;
    for (; elapsed < 0.6 && !failure; elapsed += dt) {
      const motion = stepVehicleMotion(body, world, tools, config, gas, dt);
      offRoadTime = motion.nearest.distance > ROAD_EDGE ? offRoadTime + dt : 0;
      failure = recoveryReason(motion.position, motion.nearest, offRoadTime); world.step();
    }
    assert(failure && elapsed <= 0.5, `Edge fall was not recovered: ${elapsed.toFixed(2)}s`);
    const recovered = resetVehicleBody(body, 3, tools);
    assert(recovered.progress > 3 / 8 && recovered.progress < 3 / 8 + 0.01);
    assert.equal(body.linvel().y, 0);
  });
  check(`${config.name}: barrier impact blocks the car without launching it`, () => {
    const wall = TRACK_BARRIERS.find((item) => item.kind === 'roadside');
    const frame = trackFrame(wall.progress); const p = frame.point.clone().addScaledVector(frame.right, wall.side * 4);
    clearMotionState(tools);
    body.setTranslation({ x: p.x, y: p.y + RIDE_HEIGHT, z: p.z }, true);
    body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(frame.right.x * wall.side, frame.right.z * wall.side)), true);
    body.setLinvel({ x: frame.right.x * wall.side * 18, y: 0, z: frame.right.z * wall.side * 18 }, true);
    let maxImpactClearance = 0;
    for (let i = 0; i < 180; i++) {
      stepVehicleMotion(body, world, tools, config, gas, dt); world.step();
      const at = body.translation(), road = nearestTrackPoint(at.x, at.z);
      maxImpactClearance = Math.max(maxImpactClearance, at.y - road.point.y - RIDE_HEIGHT);
    }
    const at = body.translation();
    assert(nearestTrackPoint(at.x, at.z).distance < 7, 'Car passed through the barrier');
    assert(maxImpactClearance < 0.15, 'Barrier launched the car');
  });
  check(`${config.name}: on-road ramp boosts once, flies briefly, and lands on the circuit`, () => {
    const entry = trackFrame(BOOST_JUMP.startProgress - 5 / TRACK_LENGTH);
    body.setTranslation({ x: entry.point.x, y: entry.point.y + RIDE_HEIGHT, z: entry.point.z }, true);
    body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), entry.yaw), true);
    body.setLinvel({ x: entry.tangent.x * 25, y: 0, z: entry.tangent.z * 25 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    clearMotionState(tools);
    let height = 0, flying = 0, maxFlying = 0, landed = false;
    let beforeBoost = 0, afterBoost = 0, previousSpeed = 25, triggerCount = 0;
    for (let i = 0; i < 180; i++) {
      const motion = stepVehicleMotion(body, world, tools, config, gas, dt); world.step();
      if (motion.boostStarted) { beforeBoost = previousSpeed; afterBoost = motion.driving.forward; triggerCount++; }
      previousSpeed = motion.driving.forward;
      const at = body.translation(), nearest = nearestTrackPoint(at.x, at.z);
      height = Math.max(height, at.y - nearest.point.y - RIDE_HEIGHT);
      flying = motion.grounded ? 0 : flying + dt; maxFlying = Math.max(maxFlying, flying);
      if (motion.grounded && maxFlying > 0.2) { landed = true; assert(nearest.distance < 4, 'Ramp landed outside the road'); break; }
    }
    assert(height > 1.5 && height < 3.5, `Unexpected jump height: ${height.toFixed(2)}m`);
    assert(maxFlying > 0.2 && maxFlying < 1.5, `Unexpected ramp flight: ${maxFlying.toFixed(2)}s`);
    assert(landed, `Car never landed from the optional ramp: ${JSON.stringify(body.translation())}, ${maxFlying.toFixed(2)}s in air`);
    assert.equal(triggerCount, 1); assert.equal(tools.jump.launchCount, 1);
    assert(afterBoost > beforeBoost + 7, 'Ramp did not noticeably increase speed');
    resetVehicleBody(body, 0, tools); assert.equal(tools.jump.boostRemaining, 0); assert.equal(tools.jump.airborne, false);
  });
  check(`${config.name}: bypass lane stays grounded and reverse cannot activate boost`, () => {
    for (const mode of ['left-bypass', 'right-bypass', 'reverse']) {
      clearMotionState(tools);
      const bypass = mode !== 'reverse', offset = mode === 'left-bypass' ? -5.5 : mode === 'right-bypass' ? 5.5 : 0;
      const entry = trackFrame(BOOST_JUMP.startProgress + (mode === 'reverse' ? BOOST_JUMP.length + 6 : -6) / TRACK_LENGTH);
      const p = entry.point.clone().addScaledVector(entry.right, offset);
      body.setTranslation({ x: p.x, y: p.y + RIDE_HEIGHT, z: p.z }, true);
      body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), entry.yaw), true);
      body.setLinvel({ x: entry.tangent.x * (mode === 'reverse' ? -10 : 22), y: 0, z: entry.tangent.z * (mode === 'reverse' ? -10 : 22) }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      for (let i = 0; i < 100; i++) {
        const at = body.translation(), near = nearestTrackPoint(at.x, at.z), yaw = readHeading(body, tools);
        const target = trackFrame(near.progress + 0.014); target.point.addScaledVector(target.right, offset);
        const error = Math.atan2(Math.sin(Math.atan2(target.point.x - at.x, target.point.z - at.z) - yaw), Math.cos(Math.atan2(target.point.x - at.x, target.point.z - at.z) - yaw));
        const input = bypass ? { ...gas, left: error > 0.025, right: error < -0.025 } : brake;
        const motion = stepVehicleMotion(body, world, tools, config, input, dt); world.step();
        assert(!motion.boostStarted && !motion.boosting && !motion.launched, `${mode} activated boost`);
        if (bypass) assert(motion.grounded, 'Bypass lane unexpectedly flew');
      }
      assert.equal(tools.jump.launchCount, 0);
    }
  });
  ramp.dispose(); geometry.dispose(); world.free();
}
console.log(`\n${checks} game checks passed. No browser records were changed.`);
