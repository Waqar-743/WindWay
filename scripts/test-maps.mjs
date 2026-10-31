import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import * as THREE from 'three';

// This suite exercises the production map, store and physics modules. The only
// storage used is this in-memory browser substitute; real records are untouched.
const require = createRequire(new URL('../package.json', import.meta.url));
const preferenceKey = 'wildway-preferences-v1';
const storage = new Map([[preferenceKey, JSON.stringify({
  selectedCar: 'mclaren-mcl38', selectedMap: 'alpine',
  bestTimes: { 'mclaren-mcl38': 81.42, 'unrecognized-car': 1 },
})]]);
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
const bundle = await build({
  stdin: { contents: "export * from './src/game/track'; export * from './src/game/maps'; export * from './src/game/driving'; export * from './src/game/config'; export * from './src/game/store'; export * from './src/game/input'; export * from './src/game/vehiclePhysics'; export * from './src/game/trackFeatures'; export * from './src/game/trackBarriers'; export * from './src/game/alpineVillage'; export * from './src/game/jungleSettlement';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  define: { 'import.meta.env.BASE_URL': '"/3D-Car-Design/"', 'import.meta.env.DEV': 'false' },
});
function loadBundle() {
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports);
  return compiled.exports;
}
// Keep access through this live export object: map changes replace these arrays.
const game = loadBundle();
const state = () => game.useGame.getState();
let checks = 0;
function check(name, action) { action(); checks++; console.log(`PASS ${name}`); }
function runningRace() {
  state().startRace(); state().startCountdown();
  for (let i = 0; i < 3; i++) state().tickCountdown();
  assert.equal(state().status, 'running');
}
function fingerprint() {
  return JSON.stringify({ length: game.TRACK_LENGTH, path: game.MAP_PATH,
    points: game.TRACK_POINTS.map(({ point }) => point.toArray()),
    barriers: game.TRACK_BARRIERS, decks: game.BRIDGE_DECK_SEGMENTS,
    supports: game.BRIDGE_SUPPORTS, stripes: game.JUMP_STRIPES });
}

check('three maps have distinct themes, routes, asset packs and race targets', () => {
  assert.equal(game.GAME_MAPS.length, 3);
  const alpine = game.mapById('alpine'), jungle = game.mapById('jungle');
  assert.equal(alpine.laps, 1); assert.equal(jungle.laps, 2);
  assert.equal(alpine.pack, 'cartoon-pack'); assert.equal(jungle.pack, 'jungle-pack');
  for (const field of ['ink', 'paper', 'accent', 'leaf', 'sky', 'road', 'water']) assert.notEqual(alpine.theme[field], jungle.theme[field]);
  assert.notDeepEqual(alpine.points.map((p) => p.toArray()), jungle.points.map((p) => p.toArray()));
  assert.equal(game.mapById('missing-map').id, 'alpine');
});

check('alpine route is exactly twice as long and its minimap stays inside the view', () => {
  game.activateMap('alpine');
  const original = new THREE.CatmullRomCurve3(game.ALPINE_POINTS.map((point) => point.clone().multiplyScalar(0.5)), true, 'catmullrom', 0.35);
  assert(Math.abs(game.TRACK_LENGTH - original.getLength() * 2) < 0.001);
  assert.equal(game.ROAD_WIDTH, 14, 'The longer circuit keeps its drivable road width');
  for (const { point } of game.TRACK_POINTS) {
    const projected = game.trackMapPoint(point.x, point.z);
    assert(projected.x >= 13.9 && projected.x <= 186.1 && projected.y >= 13.9 && projected.y <= 186.1);
  }
  assert(!game.MAP_PATH.includes('NaN'));
});

check('alpine neighborhoods include both stations and leave the road and river clear', () => {
  game.activateMap('alpine');
  const sites = game.buildAlpineTown(), parts = game.buildTownParts(sites);
  for (const kind of ['house', 'shop', 'apartment', 'station', 'fuel']) assert(sites.some((site) => site.kind === kind), 'Missing ' + kind);
  assert(sites.filter((site) => site.side === -1).length >= 10);
  assert(sites.filter((site) => site.side === 1).length >= 10);
  assert.deepEqual(game.buildAlpineTown(), sites, 'Lots must stay stable across scene remounts');
  for (const part of parts.boxes) {
    assert(part.position.every(Number.isFinite) && part.scale.every((n) => Number.isFinite(n) && n > 0));
    for (const x of [-part.scale[0] / 2, part.scale[0] / 2]) for (const z of [-part.scale[2] / 2, part.scale[2] / 2]) {
      const c = Math.cos(part.rotation), s = Math.sin(part.rotation);
      const px = part.position[0] + x * c + z * s, pz = part.position[2] - x * s + z * c;
      assert(game.nearestTrackPoint(px, pz).distance > game.ROAD_WIDTH / 2 + 0.5, 'Village scenery intrudes onto the driving line');
      assert(Math.abs(pz) > 34, 'Village scenery intrudes into a river crossing');
    }
  }
  assert(parts.signs.some((sign) => sign.label === 'VALLEY STATION'));
  assert(parts.signs.some((sign) => sign.label === 'VALLEY FUEL'));
});

check('Canopy Run has distinct tropical homes with clear roads and river crossings', () => {
  game.activateMap('jungle');
  const sites = game.buildJungleVillage(), parts = game.buildJungleHouseParts(sites);
  assert(sites.length >= 12); assert(new Set(sites.map(s => s.color)).size === 3);
  assert(sites.some(s => s.side < 0) && sites.some(s => s.side > 0));
  assert.deepEqual(game.buildJungleVillage(), sites);
  for (const part of parts.boxes) for (const x of [-part.scale[0] / 2, part.scale[0] / 2]) for (const z of [-part.scale[2] / 2, part.scale[2] / 2]) {
    const c = Math.cos(part.rotation), s = Math.sin(part.rotation);
    const px = part.position[0] + x * c + z * s, pz = part.position[2] - x * s + z * c;
    assert(game.nearestTrackPoint(px, pz).distance > game.ROAD_WIDTH / 2 + 1);
    assert(Math.abs(pz) > 34);
  }
  game.activateMap('alpine');
});

check('legacy alpine records remain readable and invalid record keys are filtered', () => {
  assert.equal(state().selectedMap, 'alpine');
  assert.equal(game.gameRecordKey('alpine', 'mclaren-mcl38'), 'mclaren-mcl38');
  assert.equal(game.gameRecordKey('jungle', 'mclaren-mcl38'), 'jungle:mclaren-mcl38');
  assert.equal(state().bestTimes['mclaren-mcl38'], 81.42);
  assert.equal(state().bestTimes['unrecognized-car'], undefined);
});

check('switching maps rebuilds track, gates, minimap, bridge decks, walls and jump stripes together', () => {
  game.activateMap('alpine');
  const original = fingerprint();
  const before = { points: game.TRACK_POINTS, gates: game.CHECKPOINTS,
    decks: game.BRIDGE_DECK_SEGMENTS, barriers: game.TRACK_BARRIERS,
    supports: game.BRIDGE_SUPPORTS, stripes: game.JUMP_STRIPES, start: game.START };
  game.activateMap('jungle');
  assert.equal(game.currentMap.id, 'jungle');
  for (const [key, exported] of Object.entries({ points: 'TRACK_POINTS', gates: 'CHECKPOINTS', decks: 'BRIDGE_DECK_SEGMENTS', barriers: 'TRACK_BARRIERS', supports: 'BRIDGE_SUPPORTS', stripes: 'JUMP_STRIPES', start: 'START' })) assert.notEqual(game[exported], before[key], `${exported} kept the old map reference`);
  assert.notEqual(fingerprint(), original);
  assert(game.BRIDGE_DECK_SEGMENTS.length > 0);
  assert(game.TRACK_BARRIERS.some(({ kind }) => kind === 'bridge'));
  assert(game.TRACK_BARRIERS.some(({ kind }) => kind === 'roadside'));
  assert.equal(game.TRACK_POINTS.length, game.TRACK_SEGMENTS);
  assert.equal(game.CHECKPOINTS.length, 8);
  assert(game.TRACK_LENGTH > 900 && game.TRACK_LENGTH < 1600);
  assert.equal(game.trackCurve.points.length, game.mapById('jungle').points.length);
  game.activateMap('alpine');
  assert.equal(fingerprint(), original, 'Returning to alpine did not restore the original derived geometry');
});

for (const id of ['alpine', 'jungle']) check(`${id}: finite closed road, correctly aligned colliders, supported bridge edges and on-road ramp`, () => {
  game.activateMap(id);
  assert(game.trackFrame(0).point.distanceTo(game.trackFrame(1).point) < 0.00001);
  game.CHECKPOINTS.forEach(({ point }) => assert(game.nearestTrackPoint(point.x, point.z).distance < 0.001));
  const road = game.ribbonGeometry(game.ROAD_WIDTH);
  assert([...road.attributes.position.array].every(Number.isFinite));
  for (let i = 0; i < road.attributes.normal.count; i++) assert(road.attributes.normal.getY(i) > 0.97);
  for (const deck of game.BRIDGE_DECK_SEGMENTS) {
    assert(game.nearestTrackPoint(deck.position[0], deck.position[2]).distance < 0.02);
    assert(deck.halfExtents[0] > game.BRIDGE_RAIL_OFFSET + game.BRIDGE_RAIL_THICKNESS / 2, 'The supported deck must extend beyond the bridge wall');
    assert.equal(game.isBridgeProgress(deck.progress), true);
    assert.equal(game.getDriveableHalfWidth(deck.progress), game.BRIDGE_DRIVEABLE_HALF_WIDTH);
  }
  for (const barrier of game.TRACK_BARRIERS) {
    assert(barrier.position.every(Number.isFinite) && barrier.halfExtents.every((n) => Number.isFinite(n) && n > 0));
    const nearest = game.nearestTrackPoint(barrier.position[0], barrier.position[2]);
    assert(nearest.distance > 6.8 && nearest.distance < 8.5, 'A barrier was left at another map’s road edge');
  }
  const ramp = game.jumpRampGeometry(), vertices = ramp.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const nearest = game.nearestTrackPoint(vertices.getX(i), vertices.getZ(i));
    assert(nearest.distance <= game.BOOST_JUMP.width / 2 + 0.04);
    assert(game.jumpDistance(nearest.progress) >= -0.05 && game.jumpDistance(nearest.progress) <= game.BOOST_JUMP.length + 0.05);
  }
  assert(game.BOOST_JUMP.width < game.ROAD_WIDTH - game.BODY_HALF_EXTENTS[0] * 4);
  road.dispose(); ramp.dispose();
});

check('map selection persists, invalidates loading once and preserves readiness on a no-op', () => {
  state().setReady(true);
  const previousRun = state().runId;
  state().selectMap('jungle');
  assert.equal(state().selectedMap, 'jungle'); assert.equal(game.currentMap.id, 'jungle');
  assert.equal(state().ready, false); assert.equal(state().runId, previousRun + 1);
  assert.equal(JSON.parse(storage.get(preferenceKey)).selectedMap, 'jungle');
  state().setReady(true);
  const points = game.TRACK_POINTS, saved = storage.get(preferenceKey), runId = state().runId;
  state().selectMap('jungle');
  assert.equal(state().ready, true); assert.equal(state().runId, runId);
  assert.equal(game.TRACK_POINTS, points); assert.equal(storage.get(preferenceKey), saved);
});

check('an active race rejects map changes while loading, counting down, running, paused or recovering', () => {
  const unchanged = (status) => {
    assert.equal(state().status, status);
    const points = game.TRACK_POINTS, runId = state().runId;
    state().selectMap('alpine');
    assert.equal(state().selectedMap, 'jungle'); assert.equal(game.currentMap.id, 'jungle');
    assert.equal(state().status, status); assert.equal(game.TRACK_POINTS, points); assert.equal(state().runId, runId);
  };
  state().startRace(); unchanged('loading');
  state().startCountdown(); unchanged('countdown');
  for (let i = 0; i < 3; i++) state().tickCountdown();
  unchanged('running'); state().pause(); unchanged('paused'); state().resume();
  state().beginRecovery('fall', 3); unchanged('recovering');
  assert.equal(state().recovery.checkpoint, 3);
  state().tickRecovery(1.2); assert.equal(state().status, 'running');
});

check('two-lap gate progression resets only after gate seven and finishes only at the final line', () => {
  assert.equal(typeof game.advanceRaceGate, 'function', 'The shipped lap helper must be exported');
  let checkpoint = 0, lap = 1, finished = false;
  for (let crossing = 1; crossing <= 16; crossing++) {
    const next = game.advanceRaceGate(checkpoint, lap, 2);
    checkpoint = next.checkpoint; lap = next.lap; finished = next.finished;
    assert.equal(checkpoint, crossing === 16 ? 7 : crossing % 8);
    assert.equal(lap, crossing < 8 ? 1 : 2);
    assert.equal(finished, crossing === 16);
  }
  assert.deepEqual(game.advanceRaceGate(7, 1, 1), { checkpoint: 7, lap: 1, finished: true });
});

check('recovering on the second lap preserves its lap, earned gate and running clock', () => {
  state().updateTelemetry({ ...state().telemetry, lap: 2, checkpoint: 4, elapsed: 75, resets: 1 });
  state().beginRecovery('fall', 4);
  assert.equal(state().status, 'recovering');
  state().tickRecovery(1.2);
  assert.equal(state().status, 'running');
  assert.equal(state().telemetry.lap, 2);
  assert.equal(state().telemetry.checkpoint, 4);
  assert.equal(state().telemetry.elapsed, 76.2);
});

check('alpine and jungle records, results, lap targets and restored selection stay separated', () => {
  state().finish(135.25, 1);
  assert.equal(state().result.mapId, 'jungle'); assert.equal(state().result.laps, 2);
  assert.equal(state().bestTimes['mclaren-mcl38'], 81.42);
  assert.equal(state().bestTimes['jungle:mclaren-mcl38'], 135.25);
  state().selectMap('alpine');
  assert.equal(state().page, 'map'); assert.equal(state().result, null);
  runningRace(); state().finish(79.53, 0);
  assert.equal(state().result.mapId, 'alpine'); assert.equal(state().result.laps, 1);
  assert.equal(state().bestTimes['mclaren-mcl38'], 79.53);
  assert.equal(state().bestTimes['jungle:mclaren-mcl38'], 135.25);
  state().selectMap('jungle'); runningRace(); state().finish(140.1, 0);
  assert.equal(state().result.newBest, false); assert.equal(state().result.previousBest, 135.25);
  const saved = JSON.parse(storage.get(preferenceKey));
  assert.equal(saved.selectedMap, 'jungle'); assert.equal(saved.telemetry, undefined);
  const restored = loadBundle();
  assert.equal(restored.useGame.getState().selectedMap, 'jungle');
  assert.equal(restored.currentMap.id, 'jungle');
  assert.equal(restored.useGame.getState().bestTimes['mclaren-mcl38'], 79.53);
  assert.equal(restored.useGame.getState().bestTimes['jungle:mclaren-mcl38'], 135.25);
  assert.equal(restored.TRACK_LENGTH, game.TRACK_LENGTH);
});

check('map preview links choose only known maps and leave saved preferences intact', () => {
  const before = storage.get(preferenceKey);
  try {
    globalThis.window = { location: { search: '?map=alpine' } };
    const preview = loadBundle();
    assert.equal(preview.currentMap.id, 'alpine');
    assert.equal(preview.useGame.getState().bestTimes['jungle:mclaren-mcl38'], 135.25);
    assert.equal(storage.get(preferenceKey), before);
    globalThis.window.location.search = '?map=not-a-track';
    assert.equal(loadBundle().currentMap.id, 'jungle');
  } finally { delete globalThis.window; }
});

const assetNames = ['lion', 'giraffe', 'deer', 'python', 'horse', 'wolf', 'monkey', 'toucan', 'elephant',
  'waqar', 'imran', 'tatheer', 'stop-station', 'lap-badge', 'finish-flag', 'track-minimap', 'winner-trophy',
  'broadleaf-tree', 'palm-tree', 'fern', 'vines', 'river', 'checkpoint', 'boost-ramp', 'jungle-badge'];
{
  const missingAssets = assetNames.filter((name) => !existsSync(new URL(`../public/jungle-pack/${name}.svg`, import.meta.url)));
  assert.deepEqual(missingAssets, [], 'The playable jungle must ship every referenced SVG');
  check('all jungle SVGs are self-contained, accessible and matched to visible scene references', () => {
    for (const name of assetNames) {
      const svg = readFileSync(new URL(`../public/jungle-pack/${name}.svg`, import.meta.url), 'utf8');
      assert(/<svg\b/.test(svg) && /viewBox="0 0 256 256"/.test(svg), `${name} lacks its standard SVG canvas`);
      assert(/<title\b/.test(svg), `${name} lacks an accessible title`);
      assert(!/<script\b|\b(?:href|src)=["']https?:/i.test(svg), `${name} includes an external dependency`);
    }
    for (const name of ['waqar', 'imran', 'tatheer']) assert(readFileSync(new URL(`../public/jungle-pack/${name}.svg`, import.meta.url), 'utf8').toUpperCase().includes(name.toUpperCase()));
    const world = readFileSync(new URL('../src/game/JungleWorld.tsx', import.meta.url), 'utf8');
    for (const name of assetNames.slice(0, 15)) assert(world.includes(`"${name}"`) || world.includes(`'${name}'`), `${name} has no jungle world reference`);
  });
}

const rapierRequire = createRequire(require.resolve('@react-three/rapier'));
const RAPIER = rapierRequire('@dimforge/rapier3d-compat');
await RAPIER.init();
const dt = 1 / 60;

function fixture() {
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 }); world.timestep = dt;
  const road = game.ribbonGeometry(game.ROAD_WIDTH), ramp = game.jumpRampGeometry();
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(road.attributes.position.array), new Uint32Array(road.index.array)).setFriction(0.8));
  for (const side of [-1, 1]) world.createCollider(RAPIER.ColliderDesc.cuboid(480, 1, 212).setTranslation(0, -1, side * 236).setFriction(0.9));
  for (const box of [...game.TRACK_BARRIERS, ...game.BRIDGE_DECK_SEGMENTS]) {
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), box.yaw);
    world.createCollider(RAPIER.ColliderDesc.cuboid(...box.halfExtents).setTranslation(...box.position).setRotation(rotation).setFriction(0.2).setRestitution(0));
  }
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(ramp.attributes.position.array), new Uint32Array(ramp.index.array)));
  const pose = game.getRespawnPose(0, true), spawn = pose.position;
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(spawn.x, spawn.y, spawn.z).setRotation(rotation).enabledRotations(false, true, false).setLinearDamping(0.02).setAngularDamping(2).setCanSleep(false).setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.cuboid(...game.BODY_HALF_EXTENTS).setTranslation(0, game.BODY_OFFSET_Y, 0).setMass(1).setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(0).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min), body);
  return { world, body, tools: game.createMotionTools(RAPIER), spawn, dispose: () => { road.dispose(); ramp.dispose(); world.free(); } };
}

game.activateMap('jungle');
for (const car of game.GAME_CARS) {
  const race = fixture();
  const { world, body, tools, spawn } = race;
  let previous = { x: spawn.x, z: spawn.z }, checkpoint = 0, lap = 1, finished = false;
  let boosts = 0, launches = 0, offRoadTime = 0, airTime = 0, maxAirTime = 0;
  let maxDeviation = 0, ordinaryClearance = 0, steps = 0;
  const gateSequence = [];
  try {
    for (; steps < 30000; steps++) {
      const position = body.translation(), velocity = body.linvel(), yaw = game.readHeading(body, tools);
      const nearest = game.nearestTrackPoint(position.x, position.z);
      maxDeviation = Math.max(maxDeviation, nearest.distance);
      const sin = Math.sin(yaw), cos = Math.cos(yaw), forward = velocity.x * sin + velocity.z * cos;
      const target = game.trackFrame(nearest.progress + Math.max(0.014, Math.abs(forward) * 0.00065)).point;
      const desired = Math.atan2(target.x - position.x, target.z - position.z);
      const error = Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw));
      const targetSpeed = Math.abs(error) > 0.45 ? 22 : 33;
      const input = { throttle: forward < targetSpeed, brake: forward > targetSpeed + 2, left: error > 0.025, right: error < -0.025, handbrake: false };
      const motion = game.stepVehicleMotion(body, world, tools, car, input, dt);
      if (motion.boostStarted) boosts++;
      if (motion.launched) launches++;
      airTime = motion.grounded ? 0 : airTime + dt; maxAirTime = Math.max(maxAirTime, airTime);
      assert(motion.grounded || tools.jump.airborne, `${car.name} left the road away from the marked ramp`);
      offRoadTime = motion.nearest.distance > game.getDriveableHalfWidth(motion.nearest.progress) ? offRoadTime + dt : 0;
      const failure = game.recoveryReason(motion.position, motion.nearest, offRoadTime);
      assert.equal(failure, null, `${car.name} required ${failure} recovery during lap ${lap} at checkpoint ${checkpoint}`);
      const gateIndex = (checkpoint + 1) % 8, gate = game.CHECKPOINTS[gateIndex];
      if (game.crossedGate(previous, position, gate) && Math.abs(position.y - gate.point.y) < 3) {
        gateSequence.push(gateIndex);
        const next = game.advanceRaceGate(checkpoint, lap, game.currentMap.laps);
        checkpoint = next.checkpoint; lap = next.lap; finished = next.finished;
        if (finished) break;
      }
      previous = { x: position.x, z: position.z };
      world.step();
      if (motion.grounded && !game.jumpSample(motion.position, motion.nearest).onRamp) {
        const after = body.translation(), road = game.nearestTrackPoint(after.x, after.z);
        if (!game.jumpSample(after, road).onRamp) ordinaryClearance = Math.max(ordinaryClearance, Math.abs(after.y - road.point.y - game.RIDE_HEIGHT));
      }
    }
    assert(finished, `${car.name} failed two jungle laps: lap ${lap}, gate ${checkpoint}, position ${JSON.stringify(body.translation())}, max deviation ${maxDeviation.toFixed(2)}m`);
    assert.deepEqual(gateSequence, [1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0]);
    assert.equal(lap, 2); assert.equal(checkpoint, 7);
    assert.equal(boosts, 2); assert.equal(launches, 2); assert.equal(tools.jump.launchCount, 2);
    assert(ordinaryClearance < 0.04, `${car.name} bounced ${ordinaryClearance.toFixed(3)}m away from the ramp`);
    assert(maxAirTime > 0.2 && maxAirTime < 1.3, `${car.name} jungle ramp flight lasted ${maxAirTime.toFixed(2)}s`);
    for (let earned = 0; earned < 8; earned++) {
      game.resetVehicleBody(body, earned, tools);
      assert(Math.hypot(...Object.values(body.linvel())) < 0.001);
      assert.equal(tools.jump.airborne, false); assert.equal(tools.jump.boostRemaining, 0);
      for (let settling = 0; settling < 30; settling++) {
        const motion = game.stepVehicleMotion(body, world, tools, car, game.neutralInput(), dt);
        assert.equal(game.recoveryReason(motion.position, motion.nearest, 0), null, `${car.name} unsafe jungle respawn at gate ${earned}`);
        world.step();
      }
      const position = body.translation(), nearest = game.nearestTrackPoint(position.x, position.z);
      assert(nearest.distance < 0.05 && Math.abs(position.y - nearest.point.y - game.RIDE_HEIGHT) < 0.04, `${car.name} did not settle safely after jungle gate ${earned}`);
    }
    checks++;
    console.log(`PASS ${car.name}: two real Rapier jungle laps, all 16 ordered gates, exactly 2 boosts and 2 launches, no recoveries, ${(steps * dt).toFixed(2)}s simulated, ${maxDeviation.toFixed(2)}m maximum deviation, ${maxAirTime.toFixed(2)}s flight`);
  } finally { race.dispose(); }
}

console.log(`\n${checks} map checks passed. No browser records were changed.`);
