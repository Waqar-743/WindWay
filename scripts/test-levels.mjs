import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import * as THREE from 'three';
const require = createRequire(import.meta.url), saved = new Map();
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
const bundle = await build({ stdin: { contents: "export * from './src/game/track'; export * from './src/game/maps'; export * from './src/game/levels'; export * from './src/game/trackBarriers'; export * from './src/game/trackFeatures'; export * from './src/game/snowCourse'; export * from './src/game/driving'; export * from './src/game/vehiclePhysics'; export * from './src/game/store'; export * from './src/game/config';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', define: { 'import.meta.env.BASE_URL': '"/WindWay/"', 'import.meta.env.DEV': 'false' } });
const module = { exports: {} }; new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports); const g = module.exports;
let checks = 0; function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
for (const map of g.GAME_MAPS) for (const level of g.LEVELS) check(map.id + ' level ' + level.id + ': physical width, ordered gates, safe recovery and passing gaps', () => {
  g.activateMap(map.id, level.id);
  assert.equal(g.CHECKPOINTS.length, (map.id === 'snow' ? 17 : 8) + level.id * 2);
  const road = g.ribbonGeometry(g.ROAD_WIDTH), positions = road.attributes.position;
  let minimum = Infinity;
  for (let i = 0; i <= g.TRACK_SEGMENTS; i++) {
    const progress = i / g.TRACK_SEGMENTS, half = g.roadHalfWidthAt(progress); minimum = Math.min(minimum, half * 2);
    const a = new THREE.Vector3().fromBufferAttribute(positions, i * 2), b = new THREE.Vector3().fromBufferAttribute(positions, i * 2 + 1);
    assert(Math.abs(a.distanceTo(b) - half * 2) < 0.001, 'Visible/physical road width differs from recovery bounds');
    assert(g.getDriveableHalfWidth(progress) >= half);
  }
  if (level.id > 0) assert(minimum < g.ROAD_WIDTH - 0.3); else assert(Math.abs(minimum - g.ROAD_WIDTH) < 0.001);
  for (let gate = 0; gate < g.CHECKPOINTS.length; gate++) {
    const pose = g.getRespawnPose(gate), half = g.getDriveableHalfWidth(pose.progress);
    assert(half > g.BODY_HALF_EXTENTS[0] + 1); assert(g.nearestTrackPoint(pose.position.x, pose.position.z).distance + g.BODY_HALF_EXTENTS[0] + 0.5 < half, 'Recovery must leave a safe car-width margin inside the road');
  }
  const challenges = g.TRACK_BARRIERS.filter(b => b.kind === 'challenge');
  assert.equal(challenges.length, map.id === 'snow' ? 0 : level.slalom);
  for (const wall of challenges) {
    const width = g.roadHalfWidthAt(wall.progress) * 2, gap = width - wall.halfExtents[0] * 2;
    assert(gap > g.BODY_HALF_EXTENTS[0] * 2 + 0.6, 'Slalom passage is too narrow for the car');
    assert(Math.abs(wall.position[2]) > 40);
  }
  let checkpoint = 0, lap = 1, finished = false, crossings = 0;
  const target = map.mode === 'ascent' ? g.CHECKPOINTS.length - 1 : g.CHECKPOINTS.length * map.laps;
  while (!finished && crossings <= target) { const next = g.advanceRaceGate(checkpoint, lap, map.laps, g.TRACK_CLOSED, g.CHECKPOINTS.length); checkpoint = next.checkpoint; lap = next.lap; finished = next.finished; crossings++; }
  assert(finished); assert.equal(crossings, target); road.dispose();
});
check('changing levels rebuilds the course and preserves separate best times and completions', () => {
  const state = () => g.useGame.getState(); state().navigate('home'); state().selectMap('alpine'); state().selectLevel(3);
  assert.equal(state().selectedLevel, 3); assert.equal(g.CHECKPOINTS.length, 14);
  state().startRace(); state().selectLevel(5); assert.equal(state().selectedLevel, 3, 'Cannot change a live course');
  state().startCountdown(); for (let i = 0; i < 3; i++) state().tickCountdown();
  state().finish(88, 0); assert.equal(state().result.level, 3); assert(state().completedLevels.alpine.includes(3));
  const key = g.gameRecordKey('alpine', state().selectedCar, 3); assert.equal(state().bestTimes[key], 88);
  state().navigate('home'); state().selectLevel(4); assert.equal(state().bestTimes[g.gameRecordKey('alpine', state().selectedCar, 4)], undefined);
  const storage = JSON.parse(saved.get('wildway-preferences-v1')); assert.equal(storage.selectedLevel, 4); assert(storage.completedLevels.alpine.includes(3));
  assert.notEqual(g.gameRecordKey('alpine', 'mclaren-mcl38', 5), g.gameRecordKey('jungle', 'mclaren-mcl38', 5));
});

const rapierRequire = createRequire(require.resolve('@react-three/rapier')), RAPIER = rapierRequire('@dimforge/rapier3d-compat'); await RAPIER.init();
for (const mapId of ['alpine', 'jungle'].filter(id => !process.env.WINDWAY_TEST_MAP || process.env.WINDWAY_TEST_MAP === id)) {
  g.activateMap(mapId, 5);
  for (const car of g.GAME_CARS) {
    const world = new RAPIER.World({ x: 0, y: -18, z: 0 }); world.timestep = 1 / 60;
    const road = g.ribbonGeometry(g.ROAD_WIDTH), ramp = g.jumpRampGeometry();
    for (const geometry of [road, ramp]) world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(geometry.attributes.position.array), new Uint32Array(geometry.index.array)).setFriction(0.8));
    for (const box of [...g.TRACK_BARRIERS, ...g.BRIDGE_DECK_SEGMENTS]) world.createCollider(RAPIER.ColliderDesc.cuboid(...box.halfExtents).setTranslation(...box.position).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), box.yaw)).setFriction(0.2));
    const pose = g.getRespawnPose(0, true), body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pose.position.x, pose.position.y, pose.position.z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pose.yaw)).enabledRotations(false,true,false).setCcdEnabled(true));
    world.createCollider(RAPIER.ColliderDesc.cuboid(...g.BODY_HALF_EXTENTS).setTranslation(0,g.BODY_OFFSET_Y,0).setMass(1), body);
    const tools = g.createMotionTools(RAPIER); let checkpoint = 0, previous = {...pose.position}, finished = false, maximumDeviation = 0, offRoadTime = 0;
    for (let step = 0; step < 24000; step++) {
      const p = body.translation(), near = g.nearestTrackPoint(p.x,p.z), yaw = g.readHeading(body,tools);
      const targetProgress = near.progress + 8 / g.TRACK_LENGTH, target = g.trackFrame(targetProgress); target.point.addScaledVector(target.right, g.challengeDrivingOffset(targetProgress));
      const desired = Math.atan2(target.point.x-p.x,target.point.z-p.z), error = Math.atan2(Math.sin(desired-yaw),Math.cos(desired-yaw));
      const velocity = body.linvel(), speed = velocity.x*Math.sin(yaw)+velocity.z*Math.cos(yaw);
      const input = { throttle: speed < 13, brake: speed > 15, left: error > 0.025, right: error < -0.025, handbrake: false };
      const motion = g.stepVehicleMotion(body,world,tools,car,input,1/60); world.step(); const at = body.translation();
      maximumDeviation = Math.max(maximumDeviation, motion.nearest.distance);
      offRoadTime = motion.onRoad ? 0 : offRoadTime + 1/60;
      assert.equal(g.recoveryReason(at, g.nearestTrackPoint(at.x,at.z), offRoadTime), null, mapId + ' level 5 driver left the supported course');
      const next = (checkpoint+1)%g.CHECKPOINTS.length;
      if (g.crossedGate(previous, at, g.CHECKPOINTS[next],g.roadHalfWidthAt(g.CHECKPOINT_PROGRESS[next])+0.5) && Math.abs(at.y-g.CHECKPOINTS[next].point.y) < 3) { checkpoint++; if (checkpoint===g.CHECKPOINTS.length) { finished=true; break; } }
      previous = {...at};
    }
    assert(finished, mapId + ' level 5 ' + car.name + ' failed at gate ' + checkpoint + ' / ' + g.CHECKPOINTS.length + ' position ' + JSON.stringify(body.translation()) + ' progress ' + g.nearestTrackPoint(body.translation().x,body.translation().z).progress);
    console.log('PASS ' + mapId + ' level 5 ' + car.name + ': complete physical lap, all 18 gates and eight solid slalom barriers'); checks++;
    road.dispose(); ramp.dispose(); world.free();
  }
}
console.log('\n' + checks + ' level checks passed.');
