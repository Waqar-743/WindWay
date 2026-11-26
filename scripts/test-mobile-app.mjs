import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMobilePreviewServer } from './serve-mobile-app.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const bundle = await build({
  stdin: {
    contents: "export * from './src/game/mobileAppPreferences'; export * from './src/game/config'; export * from './src/game/levels'; export * from './src/game/previewGameHost'; export { default as MobileAppShell } from './src/game/MobileAppShell'; export { default as MobileAppPages } from './src/game/MobileAppPages'; export { default as StarterOnboarding } from './src/game/StarterOnboarding';",
    loader: 'ts',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  define: { 'import.meta.env.BASE_URL': '"./"' },
  plugins: [{
    name: 'menu-tests-without-gpu',
    setup(builder) {
      builder.onResolve({ filter: /MobileShowroom$/ }, () => ({ path: 'showroom', namespace: 'menu-test' }));
      builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'styles', namespace: 'menu-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'menu-test' }, (args) => ({ contents: args.path === 'showroom' ? 'export default function Showroom() { return null; }' : '', loader: 'js' }));
    },
  }],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
const app = module.exports;
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }
const saved = { version: 1, mapId: 'jungle', carId: 'mercedes-w14', checkpoint: 5, lap: 2, elapsed: 137.25, resets: 3 };

check('A fresh mobile app opens with onboarding pending, usable choices, Level 0 and no Continue checkpoint', () => {
  const state = app.defaultBrowserAppState();
  assert.equal(state.version, 1); assert.equal(state.onboardingCompleted, false); assert.equal(state.savedRun, null);
  assert.deepEqual(state.bestTimes, {}); assert.deepEqual(state.completedLevels, { alpine: [], jungle: [], snow: [] });
  assert.equal(state.config.mapId, 'alpine'); assert.equal(state.config.level, 0); assert.equal(state.config.carId, 'mclaren-mcl38');
  assert.equal(state.config.steeringMode, 'arrows'); assert.equal(state.config.quality, 'auto');
  assert.equal(state.config.cameraMode, 'chase'); assert.equal(state.config.sound, .55); assert.equal(state.config.haptics, true);
});
check('Every path, level, car, paint, crew, steering mode and graphics choice can be selected', () => {
  let state = app.defaultBrowserAppState();
  for (const map of app.APP_MAPS) {
    assert(map.name && map.description && map.art && map.difficulty);
    state = app.updateBrowserConfig(state, { mapId: map.id }); assert.equal(state.config.mapId, map.id);
  }
  for (const lvl of app.LEVELS) { state = app.updateBrowserConfig(state, { level: lvl.id }); assert.equal(state.config.level, lvl.id); }
  for (const car of app.GAME_CARS) { state = app.updateBrowserConfig(state, { carId: car.id }); assert.equal(state.config.carId, car.id); }
  for (const paint of app.PAINTS) { state = app.updateBrowserConfig(state, { paint: paint.hex }); assert.equal(state.config.paint, paint.hex); }
  for (const crew of app.APP_CREW) { state = app.updateBrowserConfig(state, { character: crew.id }); assert.equal(state.config.character, crew.id); }
  for (const steeringMode of ['arrows', 'wheel', 'tilt']) { state = app.updateBrowserConfig(state, { steeringMode }); assert.equal(state.config.steeringMode, steeringMode); }
  for (const quality of ['low', 'auto', 'high']) { state = app.updateBrowserConfig(state, { quality }); assert.equal(state.config.quality, quality); }
  for (const cameraMode of ['hood', 'chase']) { state = app.updateBrowserConfig(state, { cameraMode }); assert.equal(state.config.cameraMode, cameraMode); }
});
check('Malformed preferences cannot select unknown content or poison numeric settings', () => {
  const defaults = app.defaultBrowserAppState();
  const state = app.validateBrowserAppState({ version: 1, onboardingCompleted: 'yes', config: { mapId: 'missing', level: 99, carId: 'mclaren', paint: 'blue', character: 'missing', steeringMode: 'voice', cameraMode: 'missing', quality: 'ultra', sound: NaN, sensitivity: Infinity, effects: 'yes', haptics: 'yes', invertTilt: 1, reducedMotion: 1 }, bestTimes: { unknown: 10 }, completedLevels: { alpine: [99, 'x'] }, savedRun: { version: 3 } });
  assert.deepEqual(state, defaults);
  assert.deepEqual(app.validateBrowserAppState({ version: 100, config: { mapId: 'snow' } }), defaults);
  for (const value of [null, [], 'text', 7]) assert.deepEqual(app.validateBrowserAppState(value), defaults);
  const low = app.updateBrowserConfig(defaults, { sound: -1, sensitivity: -1 });
  assert.equal(low.config.sound, 0); assert.equal(low.config.sensitivity, .5);
  const high = app.updateBrowserConfig(defaults, { sound: 2, sensitivity: 7 });
  assert.equal(high.config.sound, 1); assert.equal(high.config.sensitivity, 1.5);
});
check('Only unfinished, ordered checkpoints with valid map, level, car and lap enable Continue', () => {
  assert.deepEqual(app.validateBrowserSavedRun(saved), saved);
  for (const patch of [{ version: 2 }, { mapId: 'missing' }, { carId: 'missing' }, { level: -1 }, { level: 6 }, { checkpoint: 8 }, { checkpoint: -1 }, { checkpoint: 1.5 }, { lap: 0 }, { lap: 3 }, { elapsed: NaN }, { elapsed: Infinity }, { elapsed: -1 }, { elapsed: 604801 }, { resets: -1 }, { resets: .5 }]) {
    assert.equal(app.validateBrowserSavedRun({ ...saved, ...patch }), null, JSON.stringify(patch));
  }
  assert.equal(app.validateBrowserSavedRun({ ...saved, mapId: 'alpine', lap: 2 }), null);
  assert.equal(app.validateBrowserSavedRun({ ...saved, mapId: 'snow', checkpoint: 16, lap: 1 }), null);
  assert(app.validateBrowserSavedRun({ ...saved, mapId: 'snow', checkpoint: 15, lap: 1 }));
  assert(app.validateBrowserSavedRun({ ...saved, level: 4, checkpoint: 14 }));
});
check('A saved run keeps its own path, level and car when next-drive choices change', () => {
  const original = app.defaultBrowserAppState(), input = { ...saved, level: 2 };
  const checkpoint = app.saveBrowserCheckpoint(original, input);
  input.checkpoint = 0;
  assert.equal(original.savedRun, null); assert.equal(checkpoint.savedRun.checkpoint, 5); assert.equal(checkpoint.savedRun.level, 2);
  const next = app.updateBrowserConfig(checkpoint, { mapId: 'snow', level: 5, carId: 'mclaren-mcl38', paint: '#ebb53b', character: 'snowman', cameraMode: 'hood', quality: 'high', effects: true, sound: .2, sensitivity: 1.3, reducedMotion: true });
  assert.equal(next.config.mapId, 'snow'); assert.equal(next.config.level, 5);
  assert.deepEqual(next.savedRun, { ...saved, level: 2 }, 'Continue must still identify the saved run rather than the newly browsed path');
  assert.deepEqual(app.saveBrowserCheckpoint(next, { ...saved, checkpoint: 999 }).savedRun, { ...saved, level: 2 });
  assert.equal(app.saveBrowserCheckpoint(next, null).savedRun, null);
});
check('Finished results keep the fastest per-path/car/level record, track completions, and clear Continue', () => {
  const original = app.saveBrowserCheckpoint(app.defaultBrowserAppState(), saved);
  let state = app.recordBrowserResult(original, { mapId: 'jungle', carId: 'mercedes-w14', level: 0, time: 182.3 });
  assert.equal(state.savedRun, null); assert.deepEqual(original.savedRun, saved);
  assert.equal(state.bestTimes['jungle:mercedes-w14'], 182.3);
  assert.deepEqual(state.completedLevels.jungle, [0]);
  state = app.recordBrowserResult(state, { mapId: 'jungle', carId: 'mercedes-w14', level: 0, time: 190 });
  assert.equal(state.bestTimes['jungle:mercedes-w14'], 182.3);
  state = app.recordBrowserResult(state, { mapId: 'jungle', carId: 'mercedes-w14', level: 3, time: 175.4 });
  assert.equal(state.bestTimes['jungle:mercedes-w14:3'], 175.4);
  assert.deepEqual(state.completedLevels.jungle, [0, 3]);
  assert.equal(app.countTotalCompletions(state), 2);
  for (const result of [{ mapId: 'missing', carId: 'mercedes-w14', time: 10 }, { mapId: 'snow', carId: 'unknown', time: 10 }, { mapId: 'snow', carId: 'mercedes-w14', time: -1 }, { mapId: 'snow', carId: 'mercedes-w14', time: Infinity }]) assert.deepEqual(app.recordBrowserResult(original, result), original);
});
check('Storage round-trips onboarding, levels, settings, records and Continue under its own key', () => {
  const values = new Map(), requested = [];
  const storage = { getItem(key) { requested.push(key); return values.get(key) ?? null; }, setItem(key, value) { requested.push(key); values.set(key, value); } };
  let state = app.setOnboardingCompleted(app.defaultBrowserAppState(), true);
  state = app.saveBrowserCheckpoint(app.updateBrowserConfig(state, { mapId: 'snow', level: 3, carId: 'mercedes-w14', steeringMode: 'wheel', quality: 'high', sound: .35, haptics: false }), saved);
  state.bestTimes['mclaren-mcl38'] = 81.7;
  state.completedLevels.alpine = [0, 1];
  assert.equal(app.persistBrowserAppState(state, storage), true);
  const restored = app.loadBrowserAppState(storage);
  assert.deepEqual(restored, state); assert(requested.every((key) => key === app.BROWSER_APP_STORAGE_KEY));
  restored.config.sound = 0; assert.equal(state.config.sound, .35);
});
check('Corrupt, oversized or unavailable storage still permits a fresh app session', () => {
  for (const raw of ['{broken', '[]', JSON.stringify({ version: 2 }), 'x'.repeat(65537)]) assert.deepEqual(app.loadBrowserAppState({ getItem: () => raw }), app.defaultBrowserAppState());
  assert.deepEqual(app.loadBrowserAppState({ getItem() { throw Error('Storage blocked'); } }), app.defaultBrowserAppState());
  assert.equal(app.persistBrowserAppState(app.defaultBrowserAppState(), { setItem() { throw Error('Storage full'); } }), false);
});

const renderedPages = [];
function menuMarkup(element, state = app.defaultBrowserAppState()) {
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), originalError = console.error, warnings = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'http://127.0.0.1:4186', href: 'http://127.0.0.1:4186/index.html?native=1', search: '?native=1' }, localStorage: { getItem: () => JSON.stringify(state), setItem() {} } } });
  console.error = (...values) => warnings.push(values.join(' '));
  try {
    const html = renderToStaticMarkup(element);
    assert(warnings.every((warning) => warning.includes('useLayoutEffect')), `Unexpected menu rendering warning: ${warnings.join('\n')}`);
    renderedPages.push(html); return html;
  } finally {
    console.error = originalError;
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else delete globalThis.window;
  }
}
const text = (html) => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
const onboarded = () => app.setOnboardingCompleted(app.defaultBrowserAppState(), true);

check('First-time launch renders the interactive Starter Onboarding Guide before the Lobby', () => {
  const html = menuMarkup(createElement(app.MobileAppShell), app.defaultBrowserAppState());
  assert(html.includes('data-app-page="starter"')); assert(!html.includes('<iframe'));
  for (const label of ['DRIVER STARTER BRIEFING', 'Welcome', 'Switch Setup', 'Controls', 'Ready to Race', 'Skip to lobby', 'Next Step']) {
    assert(text(html).includes(label), `Starter page is missing ${label}`);
  }
});
check('After onboarding, the mobile app opens its complete lobby with Paths, Levels, Garage, Crew, Records and Guide', () => {
  const html = menuMarkup(createElement(app.MobileAppShell), onboarded());
  assert(html.includes('data-app-page="home"')); assert(!html.includes('<iframe'));
  const continueButton = html.match(/<button[^>]*class="[^"]*wwa-continue[^"]*"[^>]*>/)?.[0];
  assert(continueButton?.includes('disabled=""'));
  for (const label of ['Start drive', 'Continue', 'Paths', 'Levels', 'Garage', 'Crew', 'Records', 'Guide', 'Settings', 'Starter guide']) {
    assert(text(html).includes(label) || html.includes(`aria-label="${label}"`), `Lobby is missing ${label}`);
  }
});
check('Restored Continue shows its saved path, level and earned gate without auto-launching', () => {
  const state = app.saveBrowserCheckpoint(app.updateBrowserConfig(onboarded(), { mapId: 'snow' }), { ...saved, level: 2 });
  const html = menuMarkup(createElement(app.MobileAppShell), state);
  assert(!html.includes('<iframe')); assert(text(html).includes('Canopy Run')); assert(text(html).includes('L2')); assert(text(html).includes('Gate 6'));
  const continueButton = html.match(/<button[^>]*class="[^"]*wwa-continue[^"]*"[^>]*>/)?.[0];
  assert(continueButton && !continueButton.includes('disabled'));
});
check('Paths, Levels, Garage, Crew and Records render the real choices and selected state', () => {
  const state = app.updateBrowserConfig(onboarded(), { mapId: 'jungle', level: 3, carId: 'mercedes-w14', paint: '#ebb53b', character: 'snowman' });
  const noop = () => {};
  const pageProps = (page) => ({ page, app: state, hasTiltSensor: true, isAndroidHost: true, patch: () => { throw Error('Render must not mutate'); }, onNavigate: noop, onOpenStarter: noop, onResetDefaults: noop });
  for (const [page, choices] of [['maps', app.APP_MAPS], ['levels', app.LEVELS], ['garage', app.GAME_CARS], ['crew', app.APP_CREW]]) {
    const html = menuMarkup(createElement(app.MobileAppPages, pageProps(page)));
    for (const choice of choices) assert(text(html).includes(choice.name), `${page} is missing ${choice.name}`);
    assert(html.includes('aria-pressed="true"'), `${page} has no selected choice`);
    if (page === 'garage') for (const paint of app.PAINTS) assert(html.includes(`aria-label="${paint.name}"`));
  }
  state.bestTimes['jungle:mercedes-w14:3'] = 81.7;
  state.completedLevels.jungle = [3];
  const records = menuMarkup(createElement(app.MobileAppPages, pageProps('records')));
  assert(text(records).includes('01:21.70')); assert(text(records).includes('CLEARED')); assert(text(records).includes('1 / 18'));
});
check('Settings, driving guide and credits expose Android tilt, haptics, starter replay and credits', () => {
  const state = app.updateBrowserConfig(onboarded(), { steeringMode: 'tilt', invertTilt: true, haptics: true, quality: 'high', effects: true, reducedMotion: true, sound: .25 });
  const noop = () => {};
  const props = (page) => ({ page, app: state, hasTiltSensor: true, isAndroidHost: true, patch: () => { throw Error('Render must not mutate'); }, onNavigate: noop, onOpenStarter: noop, onResetDefaults: noop });
  const settings = menuMarkup(createElement(app.MobileAppPages, props('settings')));
  for (const label of ['Arrow buttons', 'Steering wheel', 'Phone tilt', 'Invert tilt steering', 'Tactile haptic feedback', 'Chase', 'Hood', 'Low', 'Auto', 'High', 'Extra visual effects', 'Reduce motion', 'Engine sound', 'Replay Starter Guide']) {
    assert(text(settings).includes(label), `Settings is missing ${label}`);
  }
  const help = menuMarkup(createElement(app.MobileAppPages, props('help')));
  for (const label of ['Open Starter Guide', 'Accelerate', 'Brake / reverse', 'Steer', 'Handbrake', 'Conquer all 6 levels']) assert(text(help).includes(label));
  const about = menuMarkup(createElement(app.MobileAppPages, props('about')));
  assert(text(about).includes('Waqar Ahmed')); assert(about.includes('https://creativecommons.org/licenses/by-nc-sa/4.0/')); assert(about.includes('MODEL_CREDITS.md'));
});
check('Menu illustrations, paint choices and delivery car references point to real bundled-source assets', () => {
  const references = new Set(renderedPages.flatMap((html) => [...html.matchAll(/<(?:img|a)\b[^>]*(?:src|href)="(\.\/[^"?#]+)"/g)].map((match) => match[1])));
  assert(references.size >= app.APP_MAPS.length + app.APP_CREW.length + 1);
  for (const reference of [...references, ...app.GAME_CARS.map((car) => './' + car.path)]) assert(existsSync(resolve('public', reference)), `Missing source asset: ${reference}`);
});

const origin = 'http://127.0.0.1:4186';
function frame() {
  const calls = [], forwarded = [], listeners = new Map();
  const parent = { location: { origin }, postMessage: (message, targetOrigin) => forwarded.push({ message, targetOrigin }) };
  const target = {
    location: { origin, search: '?native=1&previewGame=1' }, parent,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
    WindwayMobile: { configure: (config) => calls.push(['configure', config]), start: (options) => calls.push(['start', options]), command: (command) => calls.push(['command', command]), steer: (value) => calls.push(['steer', value]) },
  };
  return { target, parent, calls, forwarded, listeners, receive(data, patch = {}) { listeners.get('message')?.({ origin, source: parent, data, ...patch }); } };
}
check('Only an explicit embedded same-origin preview frame installs a browser native channel', () => {
  for (const search of ['', '?native=1', '?previewGame=1', '?native=0&previewGame=1']) {
    const host = frame(); host.target.location.search = search;
    app.installPreviewGameHost(host.target)(); assert.equal(host.target.WindwayNative, undefined); assert.equal(host.listeners.size, 0);
  }
  const top = frame(); top.target.parent = top.target;
  app.installPreviewGameHost(top.target)(); assert.equal(top.target.WindwayNative, undefined);
  const foreign = frame(); foreign.parent.location.origin = 'https://other.example';
  app.installPreviewGameHost(foreign.target)(); assert.equal(foreign.target.WindwayNative, undefined);
  const inaccessible = frame(); Object.defineProperty(inaccessible.parent, 'location', { get() { throw Error('Cross-origin parent'); } });
  app.installPreviewGameHost(inaccessible.target)(); assert.equal(inaccessible.target.WindwayNative, undefined);
  const native = frame(), existing = { postMessage() {} }; native.target.WindwayNative = existing;
  app.installPreviewGameHost(native.target)(); assert.equal(native.target.WindwayNative, existing);
});
check('Loading and ready handshakes do not automatically configure, start or resume a drive', () => {
  const host = frame(), cleanup = app.installPreviewGameHost(host.target);
  assert(host.target.WindwayNative); assert.deepEqual(host.calls, []);
  host.target.WindwayNative.postMessage(JSON.stringify({ type: 'ready', protocol: 1 }));
  assert.deepEqual(host.calls, []);
  assert.deepEqual(host.forwarded, [{ message: { source: 'windway-game', message: { type: 'ready', protocol: 1 } }, targetOrigin: origin }]);
  cleanup();
});
check('App commands require both the exact parent window and exact local origin', () => {
  const host = frame(), cleanup = app.installPreviewGameHost(host.target);
  const start = { source: 'windway-app', type: 'start' };
  assert.equal(app.isTrustedPreviewCommand({ origin, source: host.parent, data: start }, origin, host.parent), true);
  for (const event of [
    { origin: 'https://attacker.example', source: host.parent, data: start },
    { origin, source: {}, data: start }, { origin, source: null, data: start },
    { origin, source: host.parent, data: { ...start, source: 'windway-game' } },
    { origin, source: host.parent, data: null }, { origin, source: host.parent, data: [start] },
    { origin, source: host.parent, data: JSON.stringify(start) },
  ]) { assert.equal(app.isTrustedPreviewCommand(event, origin, host.parent), false); host.receive(event.data, event); }
  assert.deepEqual(host.calls, []); cleanup();
});
check('User-start, tilt steer, and nextLevel commands reach the engine cleanly', () => {
  const host = frame(), cleanup = app.installPreviewGameHost(host.target);
  const state = app.saveBrowserCheckpoint(app.updateBrowserConfig(app.defaultBrowserAppState(), { mapId: 'snow', level: 2, carId: 'mclaren-mcl38', quality: 'high', steeringMode: 'tilt' }), saved);
  host.receive({ source: 'windway-app', type: 'configure', config: { ...state.config, bestTimes: state.bestTimes } });
  assert.equal(host.calls.length, 1); assert.equal(host.calls[0][0], 'configure'); assert.equal(host.calls[0][1].level, 2);
  host.receive({ source: 'windway-app', type: 'start', resume: state.savedRun });
  assert.deepEqual(host.calls[1], ['start', { resume: saved }]);
  host.receive({ source: 'windway-app', type: 'steer', value: 0.42 });
  assert.deepEqual(host.calls[2], ['steer', 0.42]);
  for (const command of ['pause', 'resume', 'restart', 'recover', 'camera', 'calibrate', 'menu', 'nextLevel']) host.receive({ source: 'windway-app', type: 'command', command });
  assert.deepEqual(host.calls.slice(3).map((call) => call[1]), ['pause', 'resume', 'restart', 'recover', 'camera', 'calibrate', 'menu', 'nextLevel']);
  cleanup();
});
check('Only bounded game status, saves, levels, haptics and results are forwarded to the exact app origin', () => {
  const host = frame(), cleanup = app.installPreviewGameHost(host.target);
  const messages = [{ type: 'state', status: 'running', page: 'race' }, { type: 'save', run: saved }, { type: 'level', level: 2 }, { type: 'haptic', kind: 'gate' }, { type: 'finished', result: { mapId: 'jungle', carId: 'mercedes-w14', level: 2, time: 155 } }, { type: 'exit' }, { type: 'calibrate' }, { type: 'error', message: 'Could not load' }];
  for (const message of messages) host.target.WindwayNative.postMessage(JSON.stringify(message));
  assert.deepEqual(host.forwarded.map((item) => item.message.message), messages);
  assert(host.forwarded.every((item) => item.targetOrigin === origin));
  const before = host.forwarded.length;
  for (const raw of ['not json', 'null', '[]', JSON.stringify({ type: 'navigate', url: 'https://other.example' }), 'x'.repeat(32769)]) host.target.WindwayNative.postMessage(raw);
  assert.equal(host.forwarded.length, before); cleanup();
});

const temporary = await mkdtemp(join(tmpdir(), 'windway-mobile-app-test-'));
const directory = join(temporary, 'game');
let server;
try {
  await mkdir(join(directory, 'assets'), { recursive: true });
  const html = '<!doctype html><head><title>Windway test</title></head><body><script type="module" src="./assets/game.js"></script></body>';
  await Promise.all([
    writeFile(join(directory, 'index.html'), html), writeFile(join(directory, 'assets/game.js'), 'export const game = true;'),
    writeFile(join(directory, 'assets/game.css'), 'body{background:transparent}'), writeFile(join(directory, 'assets/car.glb'), Buffer.from([1, 2, 3, 4])),
    writeFile(join(directory, 'assets/physics.wasm'), Buffer.from([0, 97, 115, 109])), writeFile(join(temporary, 'outside.txt'), 'Private fixture'),
  ]);
  server = createMobilePreviewServer(directory);
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  const fetch = (path, method = 'GET') => new Promise((done, reject) => {
    const operation = request({ hostname: '127.0.0.1', port, path, method }, (response) => {
      const chunks = []; response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => done({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    operation.on('error', reject); operation.end();
  });
  const redirected = await fetch('/?map=snow');
  assert.equal(redirected.status, 302);
  const destination = new URL(redirected.headers.location, origin);
  assert.equal(destination.pathname, '/index.html'); assert.equal(destination.searchParams.get('native'), '1'); assert.equal(destination.searchParams.get('map'), 'snow');
  const document = await fetch('/index.html?native=1');
  assert.equal(document.status, 200); assert.equal(document.body.toString(), html);
  checks++; console.log('PASS Local preview serves the unified mobile app without automatic race injection');
  for (const [file, mime] of [['game.js', 'text/javascript'], ['game.css', 'text/css'], ['car.glb', 'model/gltf-binary'], ['physics.wasm', 'application/wasm']]) {
    const asset = await fetch('/assets/' + file); assert.equal(asset.status, 200); assert(asset.headers['content-type'].startsWith(mime));
  }
  const head = await fetch('/assets/car.glb', 'HEAD'); assert.equal(head.status, 200); assert.equal(head.body.length, 0); assert.equal(head.headers['content-length'], '4');
  checks++; console.log('PASS Local preview serves game assets with exact MIME types and supports HEAD');
  for (const path of ['/..%2foutside.txt', '/%2e%2e%5coutside.txt', '/assets/', '/missing.js']) {
    const denied = await fetch(path); assert([403, 404].includes(denied.status)); assert(!denied.body.includes(Buffer.from('Private fixture')));
  }
  assert.equal((await fetch('/%E0%A4%A')).status, 400);
  const post = await fetch('/index.html?native=1', 'POST'); assert.equal(post.status, 405); assert.equal(post.headers.allow, 'GET, HEAD');
  checks++; console.log('PASS Local preview blocks path escapes, missing routes, malformed encodings and writes');
} finally {
  if (server) await new Promise((done) => server.close(done));
  assert(resolve(temporary).startsWith(resolve(tmpdir()) + sep) && basename(temporary).startsWith('windway-mobile-app-test-'));
  await rm(temporary, { recursive: true, force: true });
}

console.log(`\n${checks} unified Android/mobile app checks passed.`);
