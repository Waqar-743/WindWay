import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(new URL('../package.json', import.meta.url));
const storage = new Map(), events = new Map(), messages = [];
globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
globalThis.document = { visibilityState: 'visible', body: { classList: { add() {}, remove() {} }, dataset: {} }, addEventListener: (key, value) => events.set(key, value), removeEventListener: (key) => events.delete(key) };
globalThis.window = { location: { search: '' }, addEventListener() {}, removeEventListener() {} };
const bundle = await build({ stdin: { contents: "export * from './src/game/mobileBridge'; export * from './src/game/store'; export * from './src/game/input'; export * from './src/game/driving'; export * from './src/game/config'; export * from './src/game/vehiclePhysics'; export * from './src/game/mobilePerformance'; export * from './src/utils/renderQuality';", loader: 'ts', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', define: { 'import.meta.env.BASE_URL': '"./"' } });
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
const game = module.exports;
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }
check('The website does not expose a native API without the real native channel', () => {
  window.location.search = '?native=1';
  assert.equal(game.isNativeGame(), false);
  game.installMobileBridge()();
  assert.equal(window.WindwayMobile, undefined);
});
window.WindwayNative = { postMessage: (raw) => messages.push(JSON.parse(raw)) };
const cleanup = game.installMobileBridge();
const api = window.WindwayMobile;
check('Native host receives a protocol handshake', () => assert(messages.some((message) => message.type === 'ready' && message.protocol === 1)));
const valid = { version: 1, mapId: 'jungle', carId: 'mercedes-w14', checkpoint: 5, lap: 2, elapsed: 137.25, resets: 3 };
check('Checkpoint saves validate map, car, ordered gate, lap, elapsed time and reset count', () => {
  assert.deepEqual(game.validateSavedRun(valid), valid);
  for (const change of [{ version: 2 }, { mapId: 'missing' }, { carId: 'missing' }, { checkpoint: 8 }, { checkpoint: -1 }, { checkpoint: 1.5 }, { lap: 3 }, { lap: 0 }, { elapsed: NaN }, { elapsed: Infinity }, { elapsed: -1 }, { elapsed: 604801 }, { resets: -1 }, { resets: 0.5 }]) assert.equal(game.validateSavedRun({ ...valid, ...change }), null, JSON.stringify(change));
  assert.equal(game.validateSavedRun({ ...valid, mapId: 'snow', checkpoint: 16, lap: 1 }), null, 'A finished summit run must not resume beyond its finish');
});
check('Native configuration restores the selected car, map, paint and graphics preferences', () => {
  api.configure({ mapId: 'jungle', carId: 'mercedes-w14', paint: '#70b9c7', steeringMode: 'tilt', cameraMode: 'hood', character: 'imran', quality: 'low', effects: false, sound: .3, sensitivity: 1.2, reducedMotion: true, bestTimes: { 'jungle:mercedes-w14': 123.5, 'mclaren-mcl38': -20, unknown: 7 } });
  const state = game.useGame.getState();
  assert.equal(state.selectedMap, 'jungle'); assert.equal(state.selectedCar, 'mercedes-w14'); assert.equal(state.paint, '#70b9c7');
  assert.equal(state.settings.quality, 'low'); assert.equal(state.settings.reducedMotion, true); assert.equal(state.settings.effects, false); assert.equal(state.settings.sound, .3);
  assert.equal(state.bestTimes['jungle:mercedes-w14'], 123.5); assert.equal(state.bestTimes.unknown, undefined);
});
check('Continue restores earned progress and spawns safely at its checkpoint, not a falling position', () => {
  api.start({ resume: valid });
  const state = game.useGame.getState();
  assert.equal(state.status, 'loading'); assert.equal(state.page, 'race'); assert.equal(state.cameraMode, 'hood');
  for (const key of ['lap', 'checkpoint', 'elapsed', 'resets']) assert.equal(state.telemetry[key], valid[key]);
  const pose = game.getRespawnPose(state.telemetry.checkpoint);
  assert(Number.isFinite(pose.position.x) && pose.position.y > 0);
});
check('Tilt steering is analog, finite, bounded and only active during a running race', () => {
  api.steer(.4); assert.equal(game.drivingInput.steering, undefined);
  game.useGame.setState({ status: 'running' });
  api.steer(.4); assert.equal(game.drivingInput.steering, .4);
  api.steer(9); assert.equal(game.drivingInput.steering, 1);
  api.steer(NaN); assert.equal(game.drivingInput.steering, 0);
});
check('Analog values provide proportional steering while keyboard steering remains unchanged', () => {
  const car = game.GAME_CARS[0], dt = 1 / 60;
  const digital = game.driveVelocity(20, 0, { ...game.neutralInput(), left: true }, car, true, true, dt);
  const analog = game.driveVelocity(20, 0, { ...game.neutralInput(), steering: .35 }, car, true, true, dt);
  assert(Math.abs(analog.yawRate / digital.yawRate - .35) < 1e-8);
  const invalid = game.driveVelocity(20, 0, { ...game.neutralInput(), steering: NaN, right: true }, car, true, true, dt);
  assert(invalid.yawRate < 0);
});
check('Pausing clears all held controls, preserves a save, and resuming does not auto-accelerate', () => {
  game.drivingInput.throttle = true; api.steer(.8); api.command('pause');
  assert.equal(game.useGame.getState().status, 'paused'); assert.equal(game.drivingInput.throttle, false); assert.equal(game.drivingInput.steering, undefined);
  assert(messages.some((message) => message.type === 'save' && message.run.checkpoint === 5));
  api.command('resume'); assert.equal(game.useGame.getState().status, 'running'); assert.equal(game.drivingInput.throttle, false);
});
check('Native lifecycle can suspend the countdown and resume that countdown safely', () => {
  game.useGame.setState({ status: 'countdown', countdown: 2 });
  Object.assign(game.drivingInput, { throttle: true, brake: true, left: true, right: true, handbrake: true, steering: .8 });
  api.command('pause'); api.command('pause');
  assert.equal(game.useGame.getState().status, 'paused');
  game.useGame.getState().tickCountdown();
  assert.equal(game.useGame.getState().countdown, 2);
  assert.deepEqual(game.drivingInput, game.neutralInput());
  api.command('resume');
  assert.equal(game.useGame.getState().status, 'countdown'); assert.equal(game.useGame.getState().countdown, 2);
  assert.deepEqual(game.drivingInput, game.neutralInput());
});
check('A user pause freezes recovery and resumes its remaining recovery time', () => {
  game.useGame.setState({ status: 'running' });
  game.useGame.getState().beginRecovery('off-road', 5);
  game.useGame.getState().tickRecovery(.4);
  const before = game.useGame.getState();
  api.command('pause'); api.command('pause');
  game.useGame.getState().tickRecovery(.5);
  assert.equal(game.useGame.getState().status, 'paused');
  assert.deepEqual(game.useGame.getState().recovery, before.recovery);
  assert.equal(game.useGame.getState().telemetry.elapsed, before.telemetry.elapsed);
  api.command('resume');
  assert.equal(game.useGame.getState().status, 'recovering');
  assert.deepEqual(game.useGame.getState().recovery, before.recovery);
  game.useGame.getState().tickRecovery(.1);
  assert.equal(game.useGame.getState().status, 'recovering');
  assert(Math.abs(game.useGame.getState().recovery.remaining - (before.recovery.remaining - .1)) < 1e-9);
  assert.deepEqual(game.drivingInput, game.neutralInput());
});
check('Loading in the background pauses as soon as the loaded car becomes ready', () => {
  game.useGame.setState({ status: 'loading' }); api.command('pause'); game.useGame.getState().startCountdown();
  assert.equal(game.useGame.getState().status, 'paused'); api.command('resume'); assert.equal(game.useGame.getState().status, 'countdown');
});
check('Resume during loading cancels a queued pause without skipping the countdown', () => {
  game.useGame.setState({ status: 'loading' }); api.command('pause'); api.command('resume');
  assert.equal(game.useGame.getState().status, 'loading');
  game.useGame.getState().startCountdown();
  assert.equal(game.useGame.getState().status, 'countdown');
  assert.equal(game.useGame.getState().countdown, 3);
});
check('Only tilt mode accepts native sensor input; wheel and arrow modes cannot retain it', () => {
  game.useGame.setState({ status: 'running' }); api.configure({ steeringMode: 'wheel' }); api.steer(.9); assert.equal(game.drivingInput.steering, undefined);
  api.configure({ steeringMode: 'arrows' }); api.steer(.9); assert.equal(game.drivingInput.steering, undefined);
});
check('A sensor fallback cannot change a resumed car or map, and preserves quality, sound and camera', () => {
  const before = game.useGame.getState();
  api.configure({ steeringMode: 'arrows', mapId: 'alpine', carId: 'mclaren-mcl38' });
  const after = game.useGame.getState();
  assert.equal(after.selectedMap, before.selectedMap); assert.equal(after.selectedCar, before.selectedCar);
  assert.equal(after.settings.quality, before.settings.quality); assert.equal(after.settings.sound, before.settings.sound); assert.equal(after.cameraMode, before.cameraMode);
});
check('Camera and checkpoint reset commands reach the actual game controller', () => {
  const state = game.useGame.getState(); const prior = state.cameraMode, resets = state.resetRequest;
  api.command('camera'); assert.notEqual(game.useGame.getState().cameraMode, prior);
  api.command('recover'); assert.equal(game.useGame.getState().resetRequest, resets + 1);
});
check('Finish messages include map, car and real completion time for native record persistence', () => {
  game.useGame.getState().finish(151.8, 3);
  const finished = messages.findLast((message) => message.type === 'finished');
  assert.equal(finished.result.carId, 'mercedes-w14'); assert.equal(finished.result.mapId, 'jungle'); assert.equal(finished.result.time, 151.8);
});
check('A fresh Start resets prior race progress instead of silently continuing', () => {
  api.start(); const state = game.useGame.getState();
  assert.equal(state.telemetry.checkpoint, 0); assert.equal(state.telemetry.lap, 1); assert.equal(state.telemetry.elapsed, 0);
});
check('Restart begins a fresh run on the same road and car without restoring a suspended recovery', () => {
  api.start({ resume: valid }); game.useGame.setState({ status: 'running', cameraMode: 'chase' });
  game.useGame.getState().beginRecovery('manual', 5); api.command('pause');
  const before = game.useGame.getState();
  Object.assign(game.drivingInput, { throttle: true, brake: true, left: true, right: true, handbrake: true, steering: .8 });
  api.command('restart');
  const state = game.useGame.getState();
  assert.equal(state.runId, before.runId + 1);
  assert.equal(state.status, 'loading'); assert.equal(state.page, 'race');
  assert.equal(state.selectedMap, before.selectedMap); assert.equal(state.selectedCar, before.selectedCar);
  assert.deepEqual(state.settings, before.settings); assert.equal(state.cameraMode, 'hood');
  assert.equal(state.telemetry.checkpoint, 0); assert.equal(state.telemetry.lap, 1); assert.equal(state.telemetry.elapsed, 0); assert.equal(state.telemetry.resets, 0);
  assert.equal(state.recovery, null); assert.equal(state.result, null);
  assert.deepEqual(game.drivingInput, game.neutralInput());
  game.useGame.getState().startCountdown(); api.command('pause'); api.command('resume');
  assert.equal(game.useGame.getState().status, 'countdown');
  assert.equal(game.useGame.getState().countdown, 3);
});
check('Restart while loading cancels the old pending pause so the new countdown can begin', () => {
  api.start({ resume: valid }); api.command('pause');
  const runId = game.useGame.getState().runId;
  api.command('restart');
  assert.equal(game.useGame.getState().runId, runId + 1);
  game.useGame.getState().startCountdown();
  assert.equal(game.useGame.getState().status, 'countdown');
  assert.equal(game.useGame.getState().telemetry.checkpoint, 0);
  assert.deepEqual(game.drivingInput, game.neutralInput());
});
check('Restart from finished results preserves the selected road, car and earned record', () => {
  game.useGame.setState({ status: 'running' });
  game.useGame.getState().finish(64.5, 0);
  const before = game.useGame.getState();
  assert.equal(before.page, 'results'); assert(before.result);
  api.command('restart');
  const after = game.useGame.getState();
  assert.equal(after.status, 'loading'); assert.equal(after.page, 'race');
  assert.equal(after.runId, before.runId + 1); assert.equal(after.result, null);
  assert.equal(after.selectedMap, before.selectedMap); assert.equal(after.selectedCar, before.selectedCar);
  assert.deepEqual(after.bestTimes, before.bestTimes);
  assert.equal(after.telemetry.elapsed, 0); assert.equal(after.telemetry.checkpoint, 0);
});
check('Restart after a game error clears the error and starts the same car and road safely', () => {
  game.useGame.getState().setError('The car could not load.');
  const before = game.useGame.getState();
  Object.assign(game.drivingInput, { throttle: true, steering: -.7 });
  api.command('restart');
  const after = game.useGame.getState();
  assert.equal(after.error, null); assert.equal(after.status, 'loading'); assert.equal(after.page, 'race');
  assert.equal(after.runId, before.runId + 1);
  assert.equal(after.selectedMap, before.selectedMap); assert.equal(after.selectedCar, before.selectedCar);
  assert.deepEqual(game.drivingInput, game.neutralInput());
  const errorsBeforeRetry = messages.filter((message) => message.type === 'error').length;
  game.useGame.getState().setError('The car could not load.');
  assert.equal(messages.filter((message) => message.type === 'error').length, errorsBeforeRetry + 1, 'A second failed attempt must report its error to Android even when its text is unchanged');
  api.command('restart');
});
check('Stop to menu saves the current checkpoint before exit and releases every held control', () => {
  const telemetry = { ...game.useGame.getState().telemetry, checkpoint: 3, lap: 2, elapsed: 65.25, resets: 2 };
  game.useGame.setState({ status: 'running', telemetry });
  Object.assign(game.drivingInput, { throttle: true, brake: true, left: true, right: true, handbrake: true, steering: .8 });
  const sentBefore = messages.length;
  api.command('menu');
  const sent = messages.slice(sentBefore), saveIndex = sent.findIndex((message) => message.type === 'save'), exitIndex = sent.findIndex((message) => message.type === 'exit');
  assert(saveIndex >= 0 && exitIndex > saveIndex, 'Stop must persist progress before the native host leaves gameplay');
  assert.deepEqual(sent[saveIndex].run, { version: 1, mapId: 'jungle', carId: 'mercedes-w14', checkpoint: 3, lap: 2, elapsed: 65.25, resets: 2 });
  assert.equal(game.useGame.getState().page, 'home');
  assert.deepEqual(game.drivingInput, game.neutralInput());
  assert.equal(messages.at(-1).type, 'exit');
});
check('Bridge cleanup removes native globals and background listeners', () => {
  cleanup(); assert.equal(window.WindwayMobile, undefined); assert(!events.has('visibilitychange'));
});
check('Automatic Android resolution reduces GPU load gradually and never falls below the readable floor', () => {
  let current = 1;
  for (let sample = 0; sample < 30; sample++) { const next = game.mobileResolution(current, 30, 0); assert(next.dpr <= current && next.dpr >= .65); current = next.dpr; }
  assert.equal(current, .65);
});
check('Resolution recovery uses hysteresis, stays capped at one, and ignores invalid timing data', () => {
  let sample = game.mobileResolution(.65, 60, 0); assert.equal(sample.dpr, .65);
  sample = game.mobileResolution(sample.dpr, 60, sample.healthyWindows); assert.equal(sample.dpr, .65);
  sample = game.mobileResolution(sample.dpr, 60, sample.healthyWindows); assert.equal(sample.dpr, .75);
  assert.equal(game.mobileResolution(1, 60, 2).dpr, 1);
  assert.equal(game.mobileResolution(.85, 49, 2).healthyWindows, 0);
  assert.equal(game.mobileResolution(.85, NaN, 2).dpr, .85);
});
check('Automatic graphics respects its sharper device ceiling and readable resolution floor', () => {
  let current = 1.35;
  for (let sample = 0; sample < 40; sample++) {
    const next = game.mobileResolution(current, 25, 0, 1.35, .8);
    assert(next.dpr <= current && next.dpr >= .8);
    current = next.dpr;
  }
  assert.equal(current, .8);
  let healthy = 0;
  for (let sample = 0; sample < 36; sample++) {
    const next = game.mobileResolution(current, 60, healthy, 1.35, .8);
    assert(next.dpr >= current && next.dpr <= 1.35);
    if ((sample + 1) % 3 !== 0) assert.equal(next.dpr, current, 'Resolution should recover only after three healthy measurement windows');
    current = next.dpr; healthy = next.healthyWindows;
  }
  assert.equal(current, 1.35);
});
check('Touch input alone keeps sharp graphics, while a 4 GB phone retains affordable shadows', () => {
  const priorNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  window.matchMedia = () => ({ matches: true });
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { deviceMemory: 8, hardwareConcurrency: 8, connection: { effectiveType: '4g' } } });
    let quality = game.getRenderQuality();
    assert.deepEqual(quality.dpr, [1, 1.35]); assert.equal(quality.shadows, true); assert.equal(quality.antialias, true);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { deviceMemory: 4, hardwareConcurrency: 8, connection: { effectiveType: '4g' } } });
    quality = game.getRenderQuality();
    assert.deepEqual(quality.dpr, [1, 1.15]); assert.equal(quality.shadows, true); assert.equal(quality.shadowMapSize, 512);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { deviceMemory: 2, hardwareConcurrency: 2, connection: { saveData: true } } });
    quality = game.getRenderQuality();
    assert.equal(quality.shadows, false); assert.equal(quality.antialias, false); assert.equal(quality.prefetch, false);
  } finally {
    if (priorNavigator) Object.defineProperty(globalThis, 'navigator', priorNavigator);
    else delete globalThis.navigator;
    delete window.matchMedia;
  }
});
console.log(`\n${checks} Android game bridge checks passed. Physical sensor and GPU tests remain separate.`);
