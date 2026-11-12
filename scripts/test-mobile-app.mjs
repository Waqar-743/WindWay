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
const bundle = await build({ stdin: { contents: "export * from './src/game/mobileAppPreferences'; export * from './src/game/config'; export * from './src/game/previewGameHost'; export { default as MobileAppShell } from './src/game/MobileAppShell'; export { default as MobileAppPages } from './src/game/MobileAppPages';", loader: 'ts', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', define: { 'import.meta.env.BASE_URL': '"./"' }, plugins: [{
  name: 'menu-tests-without-gpu',
  setup(builder) {
    builder.onResolve({ filter: /MobileShowroom$/ }, () => ({ path: 'showroom', namespace: 'menu-test' }));
    builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'styles', namespace: 'menu-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'menu-test' }, (args) => ({ contents: args.path === 'showroom' ? 'export default function Showroom() { return null; }' : '', loader: 'js' }));
  },
}] });
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
const app = module.exports;
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }
const saved = { version: 1, mapId: 'jungle', carId: 'mercedes-w14', checkpoint: 5, lap: 2, elapsed: 137.25, resets: 3 };

check('A fresh browser app opens with usable driving choices and no Continue checkpoint', () => {
  const state = app.defaultBrowserAppState();
  assert.equal(state.version, 1); assert.equal(state.savedRun, null); assert.deepEqual(state.bestTimes, {});
  assert.equal(state.config.mapId, 'alpine'); assert.equal(state.config.carId, 'mclaren-mcl38');
  assert.equal(state.config.steeringMode, 'arrows'); assert.equal(state.config.quality, 'auto');
  assert.equal(state.config.cameraMode, 'chase'); assert.equal(state.config.sound, .55);
});
check('Every route, car, paint, crew, supported steering mode and graphics choice can be selected', () => {
  let state = app.defaultBrowserAppState();
  for (const map of app.APP_MAPS) {
    assert(map.name && map.description && map.art && map.difficulty);
    state = app.updateBrowserConfig(state, { mapId: map.id }); assert.equal(state.config.mapId, map.id);
  }
  for (const car of app.GAME_CARS) { state = app.updateBrowserConfig(state, { carId: car.id }); assert.equal(state.config.carId, car.id); }
  for (const paint of app.PAINTS) { state = app.updateBrowserConfig(state, { paint: paint.hex }); assert.equal(state.config.paint, paint.hex); }
  for (const crew of app.APP_CREW) { state = app.updateBrowserConfig(state, { character: crew.id }); assert.equal(state.config.character, crew.id); }
  for (const steeringMode of ['arrows', 'wheel']) { state = app.updateBrowserConfig(state, { steeringMode }); assert.equal(state.config.steeringMode, steeringMode); }
  for (const quality of ['low', 'auto', 'high']) { state = app.updateBrowserConfig(state, { quality }); assert.equal(state.config.quality, quality); }
  for (const cameraMode of ['hood', 'chase']) { state = app.updateBrowserConfig(state, { cameraMode }); assert.equal(state.config.cameraMode, cameraMode); }
});
check('Malformed preferences cannot select unknown content or poison numeric settings', () => {
  const defaults = app.defaultBrowserAppState();
  const state = app.validateBrowserAppState({ version: 1, config: { mapId: 'missing', carId: 'mclaren', paint: 'red', character: 'missing', steeringMode: 'tilt', cameraMode: 'missing', quality: 'ultra', sound: NaN, sensitivity: Infinity, effects: 'yes', reducedMotion: 1 }, bestTimes: { unknown: 10 }, savedRun: { version: 3 } });
  assert.deepEqual(state, defaults);
  assert.deepEqual(app.validateBrowserAppState({ version: 100, config: { mapId: 'snow' } }), defaults);
  for (const value of [null, [], 'text', 7]) assert.deepEqual(app.validateBrowserAppState(value), defaults);
  const low = app.updateBrowserConfig(defaults, { sound: -1, sensitivity: -1 });
  assert.equal(low.config.sound, 0); assert.equal(low.config.sensitivity, .5);
  const high = app.updateBrowserConfig(defaults, { sound: 2, sensitivity: 7 });
  assert.equal(high.config.sound, 1); assert.equal(high.config.sensitivity, 1.5);
});
check('Only unfinished, ordered checkpoints with valid map, car and lap enable Continue', () => {
  assert.deepEqual(app.validateBrowserSavedRun(saved), saved);
  for (const patch of [{ version: 2 }, { mapId: 'missing' }, { carId: 'missing' }, { checkpoint: 8 }, { checkpoint: -1 }, { checkpoint: 1.5 }, { lap: 0 }, { lap: 3 }, { elapsed: NaN }, { elapsed: Infinity }, { elapsed: -1 }, { elapsed: 604801 }, { resets: -1 }, { resets: .5 }]) {
    assert.equal(app.validateBrowserSavedRun({ ...saved, ...patch }), null, JSON.stringify(patch));
  }
  assert.equal(app.validateBrowserSavedRun({ ...saved, mapId: 'alpine', lap: 2 }), null);
  assert.equal(app.validateBrowserSavedRun({ ...saved, mapId: 'snow', checkpoint: 16, lap: 1 }), null);
  assert(app.validateBrowserSavedRun({ ...saved, mapId: 'snow', checkpoint: 15, lap: 1 }));
});
check('A saved run keeps its own road and car when next-drive choices change', () => {
  const original = app.defaultBrowserAppState(), input = { ...saved };
  const checkpoint = app.saveBrowserCheckpoint(original, input);
  input.checkpoint = 0;
  assert.equal(original.savedRun, null); assert.equal(checkpoint.savedRun.checkpoint, 5);
  const next = app.updateBrowserConfig(checkpoint, { mapId: 'snow', carId: 'mclaren-mcl38', paint: '#70b9c7', character: 'snowman', cameraMode: 'hood', quality: 'high', effects: true, sound: .2, sensitivity: 1.3, reducedMotion: true });
  assert.equal(next.config.mapId, 'snow'); assert.equal(next.config.carId, 'mclaren-mcl38');
  assert.deepEqual(next.savedRun, saved, 'Continue must still identify the saved run rather than the newly browsed road');
  assert.deepEqual(app.saveBrowserCheckpoint(next, { ...saved, checkpoint: 999 }).savedRun, saved, 'Invalid messages must not erase valid progress');
  assert.equal(app.saveBrowserCheckpoint(next, null).savedRun, null);
});
check('Finished results keep the fastest per-road/car record and clear completed Continue progress', () => {
  const original = app.saveBrowserCheckpoint(app.defaultBrowserAppState(), saved);
  let state = app.recordBrowserResult(original, { mapId: 'jungle', carId: 'mercedes-w14', time: 182.3 });
  assert.equal(state.savedRun, null); assert.deepEqual(original.savedRun, saved);
  assert.equal(state.bestTimes['jungle:mercedes-w14'], 182.3);
  state = app.recordBrowserResult(state, { mapId: 'jungle', carId: 'mercedes-w14', time: 190 });
  assert.equal(state.bestTimes['jungle:mercedes-w14'], 182.3);
  state = app.recordBrowserResult(state, { mapId: 'jungle', carId: 'mercedes-w14', time: 175.4 });
  state = app.recordBrowserResult(state, { mapId: 'alpine', carId: 'mclaren-mcl38', time: 91.2 });
  assert.equal(state.bestTimes['jungle:mercedes-w14'], 175.4); assert.equal(state.bestTimes['mclaren-mcl38'], 91.2);
  for (const result of [{ mapId: 'missing', carId: 'mercedes-w14', time: 10 }, { mapId: 'snow', carId: 'unknown', time: 10 }, { mapId: 'snow', carId: 'mercedes-w14', time: -1 }, { mapId: 'snow', carId: 'mercedes-w14', time: Infinity }]) assert.deepEqual(app.recordBrowserResult(original, result), original);
});
check('Browser storage round-trips menu settings, records and Continue under its own key', () => {
  const values = new Map(), requested = [];
  const storage = { getItem(key) { requested.push(key); return values.get(key) ?? null; }, setItem(key, value) { requested.push(key); values.set(key, value); } };
  const state = app.saveBrowserCheckpoint(app.updateBrowserConfig(app.defaultBrowserAppState(), { mapId: 'snow', carId: 'mercedes-w14', steeringMode: 'wheel', quality: 'high', sound: .35 }), saved);
  state.bestTimes['mclaren-mcl38'] = 81.7;
  assert.equal(app.persistBrowserAppState(state, storage), true);
  const restored = app.loadBrowserAppState(storage);
  assert.deepEqual(restored, state); assert(requested.every((key) => key === app.BROWSER_APP_STORAGE_KEY));
  restored.config.sound = 0; assert.equal(state.config.sound, .35, 'Restoration should not share mutable state with the saved source');
});
check('Corrupt, oversized or unavailable browser storage still permits a fresh app session', () => {
  for (const raw of ['{broken', '[]', JSON.stringify({ version: 2 }), 'x'.repeat(32769)]) assert.deepEqual(app.loadBrowserAppState({ getItem: () => raw }), app.defaultBrowserAppState());
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
check('The browser app first renders its complete lobby with Continue disabled and no auto-started game frame', () => {
  const html = menuMarkup(createElement(app.MobileAppShell));
  assert(html.includes('data-app-page="home"')); assert(!html.includes('<iframe'));
  const continueButton = html.match(/<button[^>]*class="[^"]*wwa-continue[^"]*"[^>]*>/)?.[0];
  assert(continueButton?.includes('disabled=""'));
  for (const label of ['Start drive', 'Continue', 'Roads', 'Garage', 'Crew', 'Records', 'How to play', 'Settings']) assert(text(html).includes(label) || html.includes(`aria-label="${label}"`), `Lobby is missing ${label}`);
});
check('Restored Continue shows its saved route and earned gate without launching until chosen', () => {
  const state = app.saveBrowserCheckpoint(app.updateBrowserConfig(app.defaultBrowserAppState(), { mapId: 'snow' }), saved);
  const html = menuMarkup(createElement(app.MobileAppShell), state);
  assert(!html.includes('<iframe')); assert(text(html).includes('Canopy Run')); assert(text(html).includes('Gate 6'));
  const continueButton = html.match(/<button[^>]*class="[^"]*wwa-continue[^"]*"[^>]*>/)?.[0];
  assert(continueButton && !continueButton.includes('disabled'));
});
check('Roads, Garage, Crew and Records render the real choices and selected state', () => {
  const state = app.updateBrowserConfig(app.defaultBrowserAppState(), { mapId: 'jungle', carId: 'mercedes-w14', paint: '#70b9c7', character: 'snowman' });
  const patch = () => { throw Error('Rendering a menu must not change a preference'); };
  for (const [page, choices] of [['maps', app.APP_MAPS], ['garage', app.GAME_CARS], ['crew', app.APP_CREW]]) {
    const html = menuMarkup(createElement(app.MobileAppPages, { page, app: state, patch }));
    for (const choice of choices) assert(text(html).includes(choice.name), `${page} is missing ${choice.name}`);
    assert(html.includes('aria-pressed="true"'), `${page} has no selected choice`);
    if (page === 'maps') assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
    if (page === 'garage') for (const paint of app.PAINTS) assert(html.includes(`aria-label="${paint.name}"`));
  }
  state.bestTimes['jungle:mercedes-w14'] = 81.7;
  const records = menuMarkup(createElement(app.MobileAppPages, { page: 'records', app: state, patch }));
  for (const map of app.APP_MAPS) assert(text(records).includes(map.name));
  assert(text(records).includes('01:21.70')); assert(text(records).includes('No finish yet'));
});
check('Settings, driving help and credits expose the controls and options supported by the app', () => {
  const state = app.updateBrowserConfig(app.defaultBrowserAppState(), { steeringMode: 'wheel', quality: 'high', effects: true, reducedMotion: true, sound: .25 });
  const patch = () => { throw Error('Rendering a menu must not change a preference'); };
  const settings = menuMarkup(createElement(app.MobileAppPages, { page: 'settings', app: state, patch }));
  for (const label of ['Arrow buttons', 'Steering wheel', 'Wheel sensitivity', 'Chase', 'Hood', 'Low', 'Auto', 'High', 'Extra visual effects', 'Reduce motion', 'Engine sound']) assert(text(settings).includes(label));
  assert(settings.includes('type="range"')); assert(settings.includes('value="0.25"')); assert.equal((settings.match(/type="checkbox"[^>]*checked=""/g) ?? []).length, 2);
  const help = menuMarkup(createElement(app.MobileAppPages, { page: 'help', app: state, patch }));
  for (const label of ['Accelerate', 'Brake / reverse', 'Steer', 'Handbrake', 'Pause', 'Continue']) assert(text(help).includes(label));
  const about = menuMarkup(createElement(app.MobileAppPages, { page: 'about', app: state, patch }));
  assert(text(about).includes('Waqar Ahmed')); assert(about.includes('https://creativecommons.org/licenses/by-nc-sa/4.0/')); assert(about.includes('MODEL_CREDITS.md'));
});
// These leaf pages are stateless. Exercise their real event handlers without
// mounting a GPU showroom or replacing React's state/lifecycle implementation.
function leafElements(node, result = []) {
  if (Array.isArray(node)) { node.forEach((child) => leafElements(child, result)); return result; }
  if (!node || typeof node !== 'object' || !node.props) return result;
  if (typeof node.type === 'function') return leafElements(node.type(node.props), result);
  if (typeof node.type === 'string') result.push(node);
  leafElements(node.props.children, result); return result;
}
function elementText(node) {
  if (Array.isArray(node)) return node.map(elementText).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return node?.props ? elementText(node.props.children) : '';
}
check('Menu choice and settings event handlers update the actual preference model', () => {
  let state = app.defaultBrowserAppState();
  const elements = (page) => leafElements(app.MobileAppPages({ page, app: state, patch: (value) => { state = app.updateBrowserConfig(state, value); } }));
  const choose = (page, name) => {
    const button = elements(page).find((element) => element.type === 'button' && (element.props['aria-label'] === name || elementText(element).includes(name)));
    assert(button, `${page} is missing the ${name} control`); button.props.onClick();
  };
  choose('maps', 'Canopy Run'); assert.equal(state.config.mapId, 'jungle');
  choose('garage', 'Mercedes-AMG W14'); assert.equal(state.config.carId, 'mercedes-w14');
  choose('garage', 'River blue'); assert.equal(state.config.paint, '#70b9c7');
  choose('crew', 'Snowy'); assert.equal(state.config.character, 'snowman');
  choose('settings', 'Steering wheel'); assert.equal(state.config.steeringMode, 'wheel');
  choose('settings', 'Hood'); assert.equal(state.config.cameraMode, 'hood');
  choose('settings', 'High'); assert.equal(state.config.quality, 'high');
  for (const [label, key, event] of [['Engine sound', 'sound', { target: { value: '.25' } }], ['Wheel sensitivity', 'sensitivity', { target: { value: '1.25' } }], ['Reduce motion', 'reducedMotion', { target: { checked: true } }], ['Extra visual effects', 'effects', { target: { checked: true } }]]) {
    const field = elements('settings').find((element) => element.type === 'label' && elementText(element).includes(label));
    const input = leafElements(field).find((element) => element.type === 'input');
    assert(input, `Settings is missing ${label}`); input.props.onChange(event);
    assert.equal(state.config[key], event.target.value !== undefined ? Number(event.target.value) : event.target.checked);
  }
});
check('Menu illustrations, paint choices and delivery car references point to real bundled-source assets', () => {
  const references = new Set(renderedPages.flatMap((html) => [...html.matchAll(/<(?:img|a)\b[^>]*(?:src|href)="(\.\/[^"?#]+)"/g)].map((match) => match[1])));
  assert(references.size >= app.APP_MAPS.length + app.APP_CREW.length + 1, 'Route art, companion art and full credits should all be linked');
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
    WindwayMobile: { configure: (config) => calls.push(['configure', config]), start: (options) => calls.push(['start', options]), command: (command) => calls.push(['command', command]) },
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
check('User-start commands deliver the selected configuration and saved Continue run to the engine', () => {
  const host = frame(), cleanup = app.installPreviewGameHost(host.target);
  const state = app.saveBrowserCheckpoint(app.updateBrowserConfig(app.defaultBrowserAppState(), { mapId: 'snow', carId: 'mclaren-mcl38', quality: 'high', steeringMode: 'wheel' }), saved);
  host.receive({ source: 'windway-app', type: 'configure', config: { ...state.config, bestTimes: state.bestTimes } });
  assert.equal(host.calls.length, 1); assert.equal(host.calls[0][0], 'configure'); assert.equal(host.calls[0][1].quality, 'high');
  host.receive({ source: 'windway-app', type: 'start', resume: state.savedRun });
  assert.deepEqual(host.calls[1], ['start', { resume: saved }]);
  host.receive({ source: 'windway-app', type: 'start' });
  assert.deepEqual(host.calls[2], ['start', { resume: undefined }]);
  for (const command of ['pause', 'resume', 'restart', 'recover', 'camera', 'calibrate', 'menu']) host.receive({ source: 'windway-app', type: 'command', command });
  assert.deepEqual(host.calls.slice(3).map((call) => call[1]), ['pause', 'resume', 'restart', 'recover', 'camera', 'calibrate', 'menu']);
  const before = host.calls.length;
  for (const data of [{ source: 'windway-app', type: 'command', command: 'delete' }, { source: 'windway-app', type: 'command', command: {} }, { source: 'windway-app', type: 'configure', config: null }, { source: 'windway-app', type: 'configure', config: [] }]) host.receive(data);
  assert.equal(host.calls.length, before); cleanup();
});
check('Only bounded game status, saves and results are forwarded to the exact app origin', () => {
  const host = frame(), cleanup = app.installPreviewGameHost(host.target);
  const messages = [{ type: 'state', status: 'running', page: 'race' }, { type: 'save', run: saved }, { type: 'finished', result: { mapId: 'jungle', carId: 'mercedes-w14', time: 155 } }, { type: 'exit' }, { type: 'calibrate' }, { type: 'error', message: 'Could not load' }];
  for (const message of messages) host.target.WindwayNative.postMessage(JSON.stringify(message));
  assert.deepEqual(host.forwarded.map((item) => item.message.message), messages);
  assert(host.forwarded.every((item) => item.targetOrigin === origin));
  const before = host.forwarded.length;
  for (const raw of ['not json', 'null', '[]', JSON.stringify({ type: 'navigate', url: 'https://other.example' }), 'x'.repeat(32769)]) host.target.WindwayNative.postMessage(raw);
  assert.equal(host.forwarded.length, before); cleanup();
});
check('Preview cleanup releases listeners and preserves a replacement native channel', () => {
  const host = frame(), cleanup = app.installPreviewGameHost(host.target);
  assert.equal(host.listeners.size, 1); cleanup(); assert.equal(host.listeners.size, 0); assert.equal(host.target.WindwayNative, undefined);
  const next = frame(), cleanupNext = app.installPreviewGameHost(next.target), replacement = { postMessage() {} };
  next.target.WindwayNative = replacement; cleanupNext(); assert.equal(next.target.WindwayNative, replacement);
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
  assert.equal(document.status, 200); assert.equal(document.body.toString(), html, 'Serving the app must not inject an automatic race or fake channel');
  assert.equal(document.headers['cache-control'], 'no-store'); assert.equal(document.headers['x-content-type-options'], 'nosniff');
  checks++; console.log('PASS Local preview opens the app entry and serves its exact HTML without automatic race injection');
  for (const [file, mime] of [['game.js', 'text/javascript'], ['game.css', 'text/css'], ['car.glb', 'model/gltf-binary'], ['physics.wasm', 'application/wasm']]) {
    const asset = await fetch('/assets/' + file); assert.equal(asset.status, 200); assert(asset.headers['content-type'].startsWith(mime));
  }
  const head = await fetch('/assets/car.glb', 'HEAD'); assert.equal(head.status, 200); assert.equal(head.body.length, 0); assert.equal(head.headers['content-length'], '4');
  checks++; console.log('PASS Local preview serves game assets with their actual MIME types and supports metadata-only HEAD requests');
  for (const path of ['/..%2foutside.txt', '/%2e%2e%5coutside.txt', '/assets/', '/missing.js']) {
    const denied = await fetch(path); assert([403, 404].includes(denied.status)); assert(!denied.body.includes(Buffer.from('Private fixture')));
  }
  assert.equal((await fetch('/%E0%A4%A')).status, 400);
  const post = await fetch('/index.html?native=1', 'POST'); assert.equal(post.status, 405); assert.equal(post.headers.allow, 'GET, HEAD');
  checks++; console.log('PASS Local preview blocks encoded path escapes, missing routes, malformed encodings and unsupported writes');
} finally {
  if (server) await new Promise((done) => server.close(done));
  assert(resolve(temporary).startsWith(resolve(tmpdir()) + sep) && basename(temporary).startsWith('windway-mobile-app-test-'));
  await rm(temporary, { recursive: true, force: true });
}

console.log(`\n${checks} browser mobile-app checks passed. Browser navigation and rendering are verified separately.`);
