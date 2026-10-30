import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import * as THREE from 'three';

const require = createRequire(new URL('../package.json', import.meta.url));
const storage = new Map();
globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) };
const bundle = await build({
  stdin: { contents: "export * from './src/game/track'; export * from './src/game/maps'; export * from './src/game/driving'; export * from './src/game/config'; export * from './src/game/store'; export * from './src/game/input'; export * from './src/game/vehiclePhysics'; export * from './src/game/trackFeatures'; export * from './src/game/trackBarriers'; export * from './src/game/snowCourse';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  define: { 'import.meta.env.BASE_URL': '"/3D-Car-Design/"', 'import.meta.env.DEV': 'false' },
});
function loadBundle() {
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports);
  return compiled.exports;
}
const game = loadBundle();
let checks = 0;
function check(name, action) { action(); checks++; console.log(`PASS ${name}`); }
const state = () => game.useGame.getState();
const alpineLength = game.TRACK_LENGTH;
state().selectMap('snow');

check('expert snow route is a long, narrow, one-way climb with a summit finish', () => {
  assert.equal(game.currentMap.id, 'snow'); assert.equal(game.currentMap.mode, 'ascent');
  assert.equal(game.TRACK_CLOSED, false); assert.equal(game.ROAD_WIDTH, 10);
  assert(game.TRACK_LENGTH > 6000 && game.TRACK_LENGTH > alpineLength * 3.5);
  assert.equal(game.CHECKPOINTS.length, 17);
  assert(game.trackFrame(1).point.distanceTo(game.START.point) > 1000);
  const top = Math.max(...game.TRACK_POINTS.map(({ point }) => point.y));
  const finish = game.CHECKPOINTS.at(-1);
  assert(finish.point.y > top - 1 && finish.point.y > game.START.point.y + 350);
  assert.equal(game.currentMap.laps, 1);
  console.log(`  ${game.TRACK_LENGTH.toFixed(0)}m route, +${(finish.point.y - game.START.point.y).toFixed(0)}m climb, ${game.TRACK_BARRIERS.length} rail sections`);
});
check('open-route endpoints clamp instead of wrapping and minimap preserves the full ascent', () => {
  assert(game.trackFrame(-1).point.distanceTo(game.START.point) < 1e-6);
  assert(game.trackFrame(2).point.distanceTo(game.trackFrame(1).point) < 1e-6);
  const end = game.trackFrame(1).point;
  assert.equal(game.nearestTrackPoint(end.x, end.z).progress, 1);
  assert(!game.MAP_PATH.endsWith('Z'));
  for (const { point } of game.TRACK_POINTS) {
    const p = game.trackMapPoint(point.x, point.z);
    assert(p.x >= 13.99 && p.x <= 186.01 && p.y >= 13.99 && p.y <= 186.01);
  }
});
check('all sixteen ordered gates are required and only the summit crossing finishes', () => {
  let checkpoint = 0;
  for (let crossing = 1; crossing <= 16; crossing++) {
    const result = game.advanceRaceGate(checkpoint, 1, 1, false, game.CHECKPOINTS.length);
    checkpoint = result.checkpoint;
    assert.equal(checkpoint, crossing); assert.equal(result.finished, crossing === 16);
  }
  assert.equal(game.BRIDGE_DECK_SEGMENTS.length, 0);
  for (const frame of game.TRACK_POINTS) assert.equal(game.jumpSample(frame.point, frame).withinWidth, false);
});
check('snow and eight marked ice zones reduce real grip, braking and acceleration', () => {
  assert.equal(game.SNOW_ICE_ZONES.length, 8); assert.equal(game.SNOW_HURDLES.length, 15);
  const snow = game.surfaceAt(0.01), ice = game.surfaceAt(0.11);
  assert.equal(snow.kind, 'packed-snow'); assert.equal(ice.kind, 'black-ice');
  for (const property of ['grip', 'braking', 'acceleration', 'steering']) assert(ice[property] < snow[property] && snow[property] < 1);
  for (const hurdle of game.SNOW_HURDLES) {
    const frame = game.trackFrame(hurdle.progress);
    const lateral = new THREE.Vector3(...hurdle.position).sub(frame.point).dot(frame.right);
    assert(Math.abs(lateral) + hurdle.halfExtents[0] < game.ROAD_WIDTH / 2);
    assert(Math.abs(lateral) - hurdle.halfExtents[0] < game.BODY_HALF_EXTENTS[0], 'Centered car must need to steer around each block');
  }
});
check('snow selection, initial telemetry and personal bests persist independently', () => {
  assert.equal(state().telemetry.x, game.START.point.x); assert.equal(state().telemetry.z, game.START.point.z);
  assert.equal(state().telemetry.surface, 'packed-snow');
  state().startRace(); state().startCountdown(); for (let i = 0; i < 3; i++) state().tickCountdown();
  state().finish(500, 2);
  assert.equal(state().result.mapId, 'snow'); assert.equal(state().result.laps, 1);
  assert.equal(state().bestTimes['snow:mclaren-mcl38'], 500);
  assert.equal(state().bestTimes['mclaren-mcl38'], undefined); assert.equal(state().bestTimes['jungle:mclaren-mcl38'], undefined);
  const restored = loadBundle(); assert.equal(restored.currentMap.id, 'snow');
  assert.equal(restored.useGame.getState().bestTimes['snow:mclaren-mcl38'], 500);
});
check('switching away from snow restores circuit geometry, bridges, gates and dry traction', () => {
  const snowLength = game.TRACK_LENGTH;
  state().selectMap('jungle');
  assert.equal(game.TRACK_CLOSED, true); assert.equal(game.ROAD_WIDTH, 14); assert.equal(game.CHECKPOINTS.length, 8);
  assert(game.BRIDGE_DECK_SEGMENTS.length > 0); assert.equal(game.SNOW_HURDLES.length, 0);
  assert.equal(game.surfaceAt(0.11).kind, 'dry'); assert(game.MAP_PATH.endsWith('Z'));
  state().selectMap('snow');
  assert.equal(game.TRACK_CLOSED, false); assert.equal(game.TRACK_LENGTH, snowLength);
  assert.equal(game.CHECKPOINTS.length, 17); assert.equal(game.SNOW_HURDLES.length, 15);
  assert.equal(state().bestTimes['snow:mclaren-mcl38'], 500);
});
check('all eighteen winter SVGs ship accessible self-contained vector artwork', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/snow-pack/manifest.json', import.meta.url), 'utf8'));
  const files = readdirSync(new URL('../public/snow-pack/', import.meta.url)).filter((name) => name.endsWith('.svg') && name !== 'contact-sheet.svg');
  assert.equal(files.length, 18);
  assert.deepEqual(manifest.assets.map((asset) => asset.file).sort(), files.sort());
  for (const name of files) {
    const svg = readFileSync(new URL(`../public/snow-pack/${name}`, import.meta.url), 'utf8');
    assert(svg.includes('viewBox="0 0 256 256"'), name);
    assert(/<title\b/.test(svg) && /<desc\b/.test(svg), name);
    assert(!/<script\b|\b(?:href|src)=["']https?:/i.test(svg), name);
  }
});
if (process.argv.includes('--geometry-only')) {
  const bends = game.TRACK_POINTS.slice(1, -1).map((frame, i) => ({ progress: (i + 1) / game.TRACK_SEGMENTS,
    radius: game.TRACK_LENGTH / game.TRACK_SEGMENTS / Math.max(0.00001, game.TRACK_POINTS[i].tangent.angleTo(game.TRACK_POINTS[i + 2].tangent) / 2) }));
  console.log(bends.sort((a, b) => a.radius - b.radius).slice(0, 20)); process.exit(0);
}

const rapierRequire = createRequire(require.resolve('@react-three/rapier'));
const RAPIER = rapierRequire('@dimforge/rapier3d-compat'); await RAPIER.init();
const dt = 1 / 60;
function fixture() {
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 }); world.timestep = dt;
  const road = game.ribbonGeometry(game.ROAD_WIDTH);
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(road.attributes.position.array), new Uint32Array(road.index.array)).setFriction(0.8));
  for (const box of [...game.TRACK_BARRIERS, ...game.SNOW_HURDLES]) {
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), box.yaw);
    world.createCollider(RAPIER.ColliderDesc.cuboid(...box.halfExtents).setTranslation(...box.position).setRotation(rotation).setFriction(0).setRestitution(0));
  }
  const pose = game.getRespawnPose(0, true), spawn = pose.position;
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(spawn.x, spawn.y, spawn.z).setRotation(rotation).enabledRotations(false, true, false).setLinearDamping(0.02).setAngularDamping(2).setCanSleep(false).setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.cuboid(...game.BODY_HALF_EXTENTS).setTranslation(0, game.BODY_OFFSET_Y, 0).setMass(1).setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(0).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min), body);
  return { world, body, spawn, tools: game.createMotionTools(RAPIER), dispose: () => { road.dispose(); world.free(); } };
}
function putAt(race, progress, offset = 0) {
  const frame = game.trackFrame(progress), p = frame.point.clone().addScaledVector(frame.right, offset);
  race.body.setTranslation({ x: p.x, y: p.y + game.RIDE_HEIGHT, z: p.z }, true);
  race.body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), frame.yaw), true);
  race.body.setLinvel({ x: 0, y: 0, z: 0 }, true); race.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  game.clearMotionState(race.tools); return frame;
}
{
  const race = fixture(), car = game.GAME_CARS[0];
  try {
    check('live physics retains more slide and needs longer braking on ice', () => {
      function sample(progress, input) {
        const frame = putAt(race, progress);
        race.body.setLinvel({ x: frame.tangent.x * 20 + frame.right.x * 6, y: 0, z: frame.tangent.z * 20 + frame.right.z * 6 }, true);
        return game.stepVehicleMotion(race.body, race.world, race.tools, car, input, dt).driving;
      }
      const snow = sample(0.01, { ...game.neutralInput(), brake: true });
      const ice = sample(0.11, { ...game.neutralInput(), brake: true });
      assert(ice.lateral > snow.lateral); assert(ice.forward > snow.forward);
    });
    check('every earned gate recovers safely uphill with no velocity or accidental jump', () => {
      for (let gate = 0; gate < 17; gate++) {
        const pose = game.resetVehicleBody(race.body, gate, race.tools);
        assert(pose.progress >= game.CHECKPOINT_PROGRESS[gate]);
        assert.equal(Math.hypot(...Object.values(race.body.linvel())), 0);
        for (let step = 0; step < 30; step++) {
          const motion = game.stepVehicleMotion(race.body, race.world, race.tools, car, game.neutralInput(), dt);
          assert.equal(game.recoveryReason(motion.position, motion.nearest, 0), null, `unsafe gate ${gate}`);
          assert(motion.grounded && !motion.launched && !motion.boosting); race.world.step();
        }
      }
    });
    check('solid hurdles stop a centered impact but leave a genuine passing lane', () => {
      const hurdle = game.SNOW_HURDLES[0];
      for (const offset of [0, -hurdle.side * 2.2]) {
        const frame = putAt(race, hurdle.progress - 14 / game.TRACK_LENGTH, offset);
        race.body.setLinvel({ x: frame.tangent.x * 12, y: 0, z: frame.tangent.z * 12 }, true);
        for (let step = 0; step < 120; step++) {
          const motion = game.stepVehicleMotion(race.body, race.world, race.tools, car, game.neutralInput(), dt);
          assert(motion.grounded, 'hurdle collision launched the car'); race.world.step();
        }
        const p = race.body.translation(), progress = game.nearestTrackPoint(p.x, p.z).progress;
        assert(offset === 0 ? progress < hurdle.progress : progress > hurdle.progress, `incorrect obstacle behavior for offset ${offset}`);
      }
    });
    check('protected mountain edges contain full-speed impacts for both cars', () => {
      for (const testedCar of game.GAME_CARS) for (const near of [0.03, 0.2, 0.37, 0.51, 0.625, 0.985]) for (const side of [-1, 1]) {
        const rail = game.TRACK_BARRIERS.filter((box) => box.side === side).reduce((best, box) => Math.abs(box.progress - near) < Math.abs(best.progress - near) ? box : best);
        const frame = putAt(race, rail.progress + 0.4 / game.TRACK_SEGMENTS);
        const heading = frame.yaw + side * Math.PI / 2;
        race.body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading), true);
        race.body.setLinvel({ x: frame.right.x * side * testedCar.topSpeed * 0.82, y: 0, z: frame.right.z * side * testedCar.topSpeed * 0.82 }, true);
        for (let step = 0; step < 90; step++) {
          const motion = game.stepVehicleMotion(race.body, race.world, race.tools, testedCar, { ...game.neutralInput(), throttle: true }, dt);
          assert.equal(game.recoveryReason(motion.position, motion.nearest, 0), null, `rail failed for ${testedCar.name} at ${near}, side ${side}`);
          assert(motion.grounded); race.world.step();
        }
        const p = race.body.translation();
        assert(game.nearestTrackPoint(p.x, p.z).distance < game.ROAD_WIDTH / 2, 'Car passed through a visible mountain rail');
      }
    });
    check('unprotected-edge falls recover instead of allowing a shortcut up the mountain', () => {
      const frame = game.trackFrame(0.55), p = frame.point.clone().addScaledVector(frame.right, 8);
      const nearest = game.nearestTrackPoint(p.x, p.z);
      assert.equal(game.recoveryReason({ ...p, y: frame.point.y - 1 }, nearest, 0), 'fall');
      assert.equal(game.recoveryReason({ ...p, y: frame.point.y + game.RIDE_HEIGHT }, nearest, 0.41), 'off-road');
    });
  } finally { race.dispose(); }
}

for (const car of game.GAME_CARS) {
  const race = fixture(), { body, world, tools, spawn } = race;
  let previous = { x: spawn.x, z: spawn.z }, checkpoint = 0, finished = false, steps = 0, maxDeviation = 0, offRoadTime = 0, stuck = 0;
  const gates = [], passedHurdles = new Set();
  try {
    for (; steps < 60000; steps++) {
      const position = body.translation(), velocity = body.linvel(), yaw = game.readHeading(body, tools);
      const nearest = game.nearestTrackPoint(position.x, position.z);
      maxDeviation = Math.max(maxDeviation, nearest.distance);
      const forward = velocity.x * Math.sin(yaw) + velocity.z * Math.cos(yaw);
      const targetProgress = nearest.progress + Math.max(14, Math.abs(forward) * 0.8) / game.TRACK_LENGTH;
      const targetFrame = game.trackFrame(targetProgress);
      const target = targetFrame.point.clone().addScaledVector(targetFrame.right, game.snowDrivingOffset(targetProgress));
      const desired = Math.atan2(target.x - position.x, target.z - position.z);
      const error = Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw));
      const bend = nearest.tangent.angleTo(game.trackFrame(nearest.progress + 28 / game.TRACK_LENGTH).tangent);
      const targetSpeed = bend > 0.3 || Math.abs(error) > 0.25 ? 7 : game.surfaceAt(nearest.progress).kind === 'black-ice' ? 11 : 16;
      const input = { throttle: forward < targetSpeed, brake: forward > targetSpeed + 2, left: error > 0.025, right: error < -0.025, handbrake: false };
      const motion = game.stepVehicleMotion(body, world, tools, car, input, dt);
      stuck = steps > 120 && Math.abs(forward) < 1 ? stuck + dt : 0;
      assert(stuck < 4, `stuck at ${nearest.progress.toFixed(5)} offset ${nearest.distance.toFixed(2)}, heading error ${error.toFixed(3)}, bend ${bend.toFixed(3)}, targetSpeed ${targetSpeed}, target ${JSON.stringify(target.toArray())}, body ${JSON.stringify(position)}, yaw ${yaw.toFixed(3)}`);
      offRoadTime = nearest.distance > game.getDriveableHalfWidth(nearest.progress) ? offRoadTime + dt : 0;
      const failure = game.recoveryReason(position, nearest, offRoadTime);
      assert.equal(failure, null, `${car.name} ${failure} at ${(nearest.progress * 100).toFixed(1)}%, gate ${checkpoint}`);
      assert(motion.grounded && !motion.boosting && !motion.launched, `${car.name} unexpectedly jumped at ${nearest.progress}`);
      const nextGate = Math.min(checkpoint + 1, game.CHECKPOINTS.length - 1), gate = game.CHECKPOINTS[nextGate];
      if (game.crossedGate(previous, position, gate, game.ROAD_WIDTH / 2 + 1) && Math.abs(position.y - gate.point.y) < 3) {
        gates.push(nextGate);
        const next = game.advanceRaceGate(checkpoint, 1, 1, false, game.CHECKPOINTS.length);
        checkpoint = next.checkpoint; finished = next.finished; if (finished) break;
      }
      for (const hurdle of game.SNOW_HURDLES) if (nearest.progress > hurdle.progress + 0.002) passedHurdles.add(hurdle.id);
      previous = { x: position.x, z: position.z }; world.step();
      if (steps % 10000 === 9999) console.log(`  ${car.name}: ${Math.round(nearest.progress * 100)}% of climb, gate ${checkpoint}, ${forward.toFixed(1)}m/s`);
    }
    assert(finished, `${car.name} did not reach summit: gate ${checkpoint}, progress ${game.nearestTrackPoint(body.translation().x, body.translation().z).progress.toFixed(4)}, position ${JSON.stringify(body.translation())}`);
    assert.deepEqual(gates, Array.from({ length: 16 }, (_, i) => i + 1));
    assert.equal(passedHurdles.size, 15); assert.equal(tools.jump.launchCount, 0);
    assert(steps * dt > 240, 'Expert map should provide a genuinely long run');
    checks++;
    console.log(`PASS ${car.name}: complete real Rapier summit climb, 16 ordered gates, 15 hurdles, no recoveries or jumps, ${(steps * dt).toFixed(2)}s simulated, ${maxDeviation.toFixed(2)}m maximum deviation`);
  } finally { race.dispose(); }
}
console.log(`\n${checks} snow checks passed. No browser records were changed.`);
