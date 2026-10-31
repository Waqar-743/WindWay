import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

// Headless checks of the shipped screen components. The 3D scene is deliberately
// stubbed: these verify UI state and asset references, not GPU output or layout.
const require = createRequire(new URL('../package.json', import.meta.url));
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const bundle = await build({
  stdin: {
    contents: "export { default as Windway } from './src/game/Wildway'; export * from './src/game/store'; export * from './src/game/maps'; export * from './src/game/config';",
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  loader: { '.css': 'empty' },
  define: { 'import.meta.env.BASE_URL': '"/3D-Car-Design/"', 'import.meta.env.DEV': 'false' },
  plugins: [{
    name: 'headless-scene',
    setup(plugin) {
      plugin.onResolve({ filter: /^\.\/GameScene$/ }, () => ({ path: 'GameScene', namespace: 'ui-test' }));
      plugin.onLoad({ filter: /.*/, namespace: 'ui-test' }, () => ({
        contents: 'import { createElement } from "react"; export default function GameScene() { return createElement("div", { "data-headless-scene": "true" }); }',
        loader: 'js', resolveDir: process.cwd(),
      }));
    },
  }],
});
const compiled = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports);
const { Windway, useGame, GAME_MAPS, GAME_CARS, gameRecordKey, formatTime } = compiled.exports;

let checks = 0;
function check(name, action) {
  action();
  checks++;
  console.log(`PASS ${name}`);
}
const initial = useGame.getInitialState();
function prepare(map, page, extra = {}) {
  useGame.setState({ status: 'idle', page: 'home' });
  useGame.getState().selectMap(map.id);
  const carId = GAME_CARS[0].id;
  useGame.setState({
    selectedCar: carId,
    page, status: page === 'race' ? 'running' : page === 'results' ? 'finished' : 'idle',
    returnPage: 'home', error: null, reaction: null, recovery: null,
    telemetry: { ...useGame.getState().telemetry, elapsed: 12.34, lap: map.laps, checkpoint: 3, speed: 87, boosting: false, airborne: false, drifting: false },
    bestTimes: { [gameRecordKey('alpine', carId)]: 51.27, [gameRecordKey('jungle', carId)]: 104.36, [gameRecordKey('snow', carId)]: 450.12 },
    result: { time: 96.52, previousBest: 104.36, newBest: true, resets: 2, mapId: map.id, laps: map.laps },
    ...extra,
  });
  // Zustand's SSR path reads its initial snapshot. Synchronize that object only
  // within this isolated test instance; the real store/actions remain shipped.
  Object.assign(initial, useGame.getState());
}
function render() { return renderToString(createElement(Windway)); }
function withoutReactComments(html) { return html.replace(/<!--[\s\S]*?-->/g, ''); }
function elementWithClass(html, className) {
  const openings = /<([a-z][\w-]*)\b[^>]*\bclass="([^"]*)"[^>]*>/gi;
  for (const opening of html.matchAll(openings)) {
    if (!opening[2].split(/\s+/).includes(className)) continue;
    const tag = opening[1];
    const tags = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    tags.lastIndex = opening.index;
    let depth = 0;
    for (let token = tags.exec(html); token; token = tags.exec(html)) {
      depth += token[0].startsWith('</') ? -1 : token[0].endsWith('/>') ? 0 : 1;
      if (depth === 0) return html.slice(opening.index, tags.lastIndex);
    }
    assert.fail(`Unclosed ${className} element`);
  }
  return null;
}
function assertCornerHUD(html, status) {
  const root = elementWithClass(html, 'race-ui');
  assert(root, 'No race HUD');
  assert(root.startsWith(`<div class="race-ui race-ui-${status}"`), 'HUD must expose the current race status');
  assert(root.slice(0, root.indexOf('>')).includes('data-hud-layout="split-corners"'), 'HUD must identify its split-corner layout');
  const dashboard = elementWithClass(root, 'race-dashboard');
  assert(dashboard?.startsWith('<aside'), 'Race information needs a dedicated aside');
  assert(dashboard.slice(0, dashboard.indexOf('>')).includes('aria-label="Race information"'), 'Dashboard needs an accessible landmark label');
  assert.equal((root.match(/class="race-dashboard"/g) ?? []).length, 1, 'HUD must contain exactly one dashboard');
  const outside = root.replace(dashboard, '');
  for (const className of ['race-stats', 'lap-clock', 'lap-counter', 'checkpoint-progress', 'race-tools', 'race-notices']) {
    assert(elementWithClass(dashboard, className), `Missing dashboard component: ${className}`);
    assert(!elementWithClass(outside, className), `${className} escaped the dashboard`);
  }
  for (const className of ['race-minimap', 'speed-gauge']) {
    const widget = elementWithClass(outside, className);
    assert(widget?.startsWith('<section'), `${className} needs its own corner landmark`);
    assert(widget.slice(0, widget.indexOf('>')).includes('aria-label='), `${className} needs an accessible label`);
    assert(!elementWithClass(dashboard, className), `${className} must be separate from the timer panel`);
    assert.equal((root.match(new RegExp(`class="${className}"`, 'g')) ?? []).length, 1, `${className} must not be duplicated`);
  }
  for (const className of ['winter-drive-info', 'ramp-status', 'race-reaction', 'countdown', 'recovery-card', 'go-message']) {
    assert(!elementWithClass(outside, className), `${className} must not cover the center of the track`);
  }
  assert(!elementWithClass(root, 'recovery-overlay'), 'Recovery must not use a full-screen scrim');
  assert(!elementWithClass(root, 'speed-lines'), 'Speed effects must not cover the game screen');
  if (status === 'running') {
    assert(elementWithClass(outside, 'touch-controls'), 'Touch driving controls should remain separate from the information dashboard');
    assert(!elementWithClass(dashboard, 'touch-controls'), 'Touch pedals must not be squeezed into the dashboard');
  }
  return { root, dashboard, outside, notices: elementWithClass(dashboard, 'race-notices') };
}
function imageSources(html) { return [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]); }
function assertImageFiles(html) {
  const sources = imageSources(html);
  assert(sources.length > 0, 'Screen contains no SVG art');
  const publicRoot = resolve('public');
  for (const source of sources) {
    assert(source.startsWith('/3D-Car-Design/'), `Unexpected image source: ${source}`);
    const asset = resolve(publicRoot, decodeURIComponent(source.slice('/3D-Car-Design/'.length)));
    assert(asset.startsWith(`${publicRoot}${sep}`), `Asset escaped public directory: ${source}`);
    assert(existsSync(asset), `Missing image asset: ${source}`);
  }
}

// Let the lazy import resolve once before checking the stubbed scene output.
prepare(GAME_MAPS[0], 'garage'); render();
await new Promise((done) => setImmediate(done));

for (const map of GAME_MAPS) {
  for (const page of ['home', 'map', 'garage', 'settings', 'howto', 'race', 'results']) {
    prepare(map, page);
    const html = render();
    check(`${map.id} ${page}: screen and intended viewport render`, () => {
      assert(html.includes(`map-${map.id} page-${page}`));
      assert.equal(html.includes('data-headless-scene="true"'), page !== 'home', 'Landing should not download the 3D viewport');
      assert(!html.includes('data-msg='), 'SSR unexpectedly fell back due to an error');
      assert(!html.includes('src=""'));
    });
    check(`${map.id} ${page}: every image points to a shipped asset`, () => assertImageFiles(html));
    check(`${map.id} ${page}: expected screen content is present`, () => {
      const expected = {
        home: map.name,
        map: map.description,
        garage: 'Pick your kind',
        settings: 'Your Windway.',
        howto: map.mode === 'ascent' ? 'One hard climb.' : map.laps === 2 ? 'Two jungle laps.' : 'One clean loop.',
        race: map.mode === 'ascent' ? 'SUMMIT CLIMB' : `LAP ${map.laps}<i> / ${map.laps}`,
        results: map.mode === 'ascent' ? `${map.name} · summit climb` : `${map.name} · ${map.laps} ${map.laps === 1 ? 'lap' : 'laps'}`,
      }[page];
      assert(withoutReactComments(html).includes(expected), `Missing expected copy: ${expected}`);
    });
    if (page === 'home' || page === 'map') {
      check(`${map.id} ${page}: exactly one map selection is pressed`, () => {
        const selector = page === 'home' ? html.match(/<fieldset>[\s\S]*?<\/fieldset>/)?.[0] : html.match(/<fieldset class="map-selector[\s\S]*?<\/fieldset>/)?.[0];
        assert(selector, 'No map selector');
        assert.equal((selector.match(/aria-pressed="true"/g) ?? []).length, 1);
        assert.equal((selector.match(/aria-pressed="false"/g) ?? []).length, GAME_MAPS.length - 1);
        const pressedButton = [...selector.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((match) => match[0]).find((button) => button.includes('aria-pressed="true"'));
        assert(pressedButton?.includes(`<strong>${map.name}</strong>`));
      });
    }
    if (page === 'race') {
      check(`${map.id} ${page}: record uses the correct map namespace`, () => {
        assert(html.includes(formatTime(map.id === 'snow' ? 450.12 : map.id === 'jungle' ? 104.36 : 51.27)));
      });
    }
    if (page === 'home') {
      check(`${map.id} landing: all three stories, SVG art and creator footer stay together`, () => {
        for (const road of GAME_MAPS) assert(html.includes(`id="road-${road.id}"`));
        assert(html.includes('Waqar Ahmed') && html.includes('https://github.com/Waqar-743/WindWay'));
        assert(html.includes('windway-landing') && !html.includes('scene-shell'));
      });
    }
    if (page === 'race') {
      check(`${map.id} race: timer stays right while roadmap and speed have separate corners`, () => {
        const { dashboard, outside } = assertCornerHUD(html, 'running');
        assert(dashboard.includes(formatTime(12.34)), 'Timer is missing from the dashboard');
        assert(elementWithClass(outside, 'race-minimap')?.includes(map.region.toUpperCase()), 'Roadmap must identify the current map');
        assert(elementWithClass(outside, 'race-minimap')?.includes('class="track-map"'), 'Roadmap must render the actual live track');
        assert(elementWithClass(outside, 'speed-gauge')?.includes('Speed 87 kilometers per hour'), 'Corner speed must match live telemetry');
        assert(dashboard.includes('Pause race'), 'Pause control is missing from the dashboard');
      });
    }
    if (map.id === 'jungle' && page === 'map') {
      check('jungle map: wildlife, named crew and recolored racing kit appear', () => {
        const sources = imageSources(html);
        for (const name of ['lion','giraffe','deer','python','horse','wolf','waqar','imran','tatheer','stop-station','boost-ramp','finish-flag','checkpoint','lap-badge','winner-trophy']) {
          assert(sources.includes(`/3D-Car-Design/jungle-pack/${name}.svg`), `Missing jungle art: ${name}`);
        }
      });
    }
    if (map.id === 'snow' && page === 'map') {
      check('snow map: winter cast, obstacles, elevation and summit kit appear', () => {
        const sources = imageSources(html);
        for (const name of ['snowman','arctic-fox','snowy-tree','snowy-mountain','ice-warning','slalom-gate','mountain-hut','checkpoint','summit-trophy','summit-flag']) {
          assert(sources.includes(`/3D-Car-Design/snow-pack/${name}.svg`), `Missing snow art: ${name}`);
        }
        assert(html.includes('checkpoint elevation profile'));
        assert(withoutReactComments(html).includes('15 solid snow-block obstacles'));
        assert(html.includes('<strong>16</strong><span>GATES TO THE TOP</span>'));
      });
    }
  }
}

const jungle = GAME_MAPS.find((map) => map.id === 'jungle');
for (const character of ['waqar', 'imran', 'tatheer', 'toucan']) {
  prepare(jungle, 'race', { reaction: { text: 'A jungle reaction.', character, until: performance.now() + 3200 } });
  const html = render();
  check(`jungle race: ${character} reaction resolves to the new pack`, () => {
    assert(imageSources(html).includes(`/3D-Car-Design/jungle-pack/${character}.svg`));
    assertImageFiles(html);
  });
}
for (const status of ['loading','countdown','paused','recovering']) {
  prepare(jungle, 'race', {
    status,
    recovery: status === 'recovering' ? { reason: 'water', checkpoint: 3, remaining: 0.6 } : null,
  });
  const html = render();
  check(`jungle race: ${status} feedback renders with valid art`, () => {
    const expected = { loading: 'Warming up your ride', countdown: 'THE JUNGLE IS YOURS IN', paused: 'pause-title', recovering: 'RETURNING TO CHECKPOINT 03' }[status];
    assert(withoutReactComments(html).includes(expected));
    assertImageFiles(html);
  });
}

const snow = GAME_MAPS.find((map) => map.id === 'snow');
for (const status of ['loading','countdown','paused','recovering']) {
  prepare(snow, 'race', {
    status,
    recovery: status === 'recovering' ? { reason: 'fall', checkpoint: 12, remaining: 0.6 } : null,
  });
  const html = render();
  check(`snow race: ${status} feedback renders with valid art`, () => {
    const expected = { loading: 'Warming up your ride', countdown: 'THE SUMMIT IS YOURS IN', paused: 'pause-title', recovering: 'RETURNING TO CHECKPOINT 12' }[status];
    assert(withoutReactComments(html).includes(expected)); assertImageFiles(html);
  });
}
prepare(snow, 'race', { telemetry: { ...useGame.getState().telemetry, surface: 'black-ice', altitude: 240, progress: 0.6 } });
check('snow race: ice warning, real altitude, climb progress and full gate count are visible', () => {
  const html = withoutReactComments(render());
  assert(html.includes('BLACK ICE / EASY INPUTS')); assert(html.includes('240 m altitude · 60% to the summit'));
  assert(html.includes('of 16 gates completed')); assertImageFiles(html);
});

for (const map of GAME_MAPS) {
  for (const status of ['loading', 'countdown', 'recovering', 'paused']) {
    prepare(map, 'race', {
      status, countdown: 2,
      recovery: status === 'recovering' ? { reason: 'fall', checkpoint: 3, remaining: 0.6 } : null,
    });
    const html = render();
    check(`${map.id} ${status}: feedback stays in the edge dashboard, except the explicit pause menu`, () => {
      const { dashboard, outside, notices } = assertCornerHUD(html, status);
      assertImageFiles(html);
      if (status === 'paused') {
        assert(outside.includes('pause-title'), 'Pause menu should remain a separate, deliberate modal');
        assert(!dashboard.includes('pause-title'));
      } else if (status === 'recovering') {
        const recovery = elementWithClass(notices, 'recovery-card');
        assert(recovery, 'Recovery card must be part of the compact notice stack');
        assert(withoutReactComments(recovery).includes('RETURNING TO CHECKPOINT 03'));
        assert(recovery.includes('aria-label="Returning the car to the road"'));
      } else {
        const countdown = elementWithClass(notices, 'countdown');
        assert(countdown, `${status} message must be part of the compact notice stack`);
        assert(status === 'loading' ? countdown.includes('Warming up your ride') : countdown.includes('<strong>2</strong>'));
      }
    });
  }
  for (const [label, boosting, airborne] of [['boost', true, false], ['airtime', false, true], ['boost and airtime', true, true]]) {
    prepare(map, 'race');
    useGame.setState({
      reaction: { text: 'Keep the road in view.', character: map.character, until: performance.now() + 3200 },
      telemetry: { ...useGame.getState().telemetry, elapsed: 0.5, speed: 147, boosting, airborne },
    });
    Object.assign(initial, useGame.getState());
    const html = render();
    check(`${map.id} ${label}: launch, start and character feedback never become center overlays`, () => {
      const { notices } = assertCornerHUD(html, 'running');
      const ramp = elementWithClass(notices, 'ramp-status');
      assert(ramp, 'Ramp feedback must be part of the compact notice stack');
      assert(ramp.includes(boosting ? 'BOOST' : 'AIRTIME'));
      if (airborne) assert(ramp.includes('AIRTIME'));
      assert(elementWithClass(notices, 'race-reaction')?.includes('Keep the road in view.'));
      assert(elementWithClass(notices, 'go-message')?.includes('GO GET LOST.'));
      assertImageFiles(html);
    });
  }
  prepare(map, 'race');
  useGame.setState({ telemetry: { ...useGame.getState().telemetry, elapsed: 3661.99, speed: 1234, checkpoint: map.mode === 'ascent' ? 16 : 8 } });
  Object.assign(initial, useGame.getState());
  check(`${map.id} race: long times and large speed values remain complete in their own widgets`, () => {
    const html = render();
    const { dashboard, outside } = assertCornerHUD(html, 'running');
    assert(elementWithClass(dashboard, 'lap-clock')?.includes(formatTime(3661.99)));
    assert(elementWithClass(outside, 'speed-gauge')?.includes('<strong>1234</strong>'));
    assert(dashboard.includes(`aria-label="${map.mode === 'ascent' ? 16 : 8} of ${map.mode === 'ascent' ? 16 : 8} gates completed"`));
    assertImageFiles(html);
  });
}

prepare(snow, 'race');
useGame.setState({ telemetry: { ...useGame.getState().telemetry, surface: 'black-ice', altitude: 365, progress: 1 } });
Object.assign(initial, useGame.getState());
check('snow race: ice warning remains a labelled edge-dashboard status at the summit', () => {
  const html = render();
  const { dashboard } = assertCornerHUD(html, 'running');
  const warning = elementWithClass(dashboard, 'winter-drive-info');
  assert(warning?.includes('role="status"'));
  assert(warning.includes('BLACK ICE / EASY INPUTS'));
  assert(withoutReactComments(warning).includes('365 m altitude · 100% to the summit'));
});

check('preferences use isolated in-memory browser storage', () => {
  assert(storage.has('wildway-preferences-v1'));
  const saved = JSON.parse(storage.get('wildway-preferences-v1'));
  assert(['alpine','jungle','snow'].includes(saved.selectedMap));
  assert.equal(saved.telemetry, undefined);
});
for (const map of GAME_MAPS) for (let level = 0; level <= 5; level++) check(map.id + ' level ' + level + ': selectable level UI, correct gate count and separate race record', () => {
  useGame.getState().navigate('home'); useGame.getState().selectLevel(level); prepare(map, 'home');
  let html = withoutReactComments(render());
  const picker = elementWithClass(html, 'level-picker'); assert(picker, 'Missing level picker');
  assert.equal((picker.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert(picker.includes('Level ' + level));
  for (let option = 0; option <= 5; option++) assert(picker.includes('aria-label="Level ' + option + ':'));
  const gates = (map.id === 'snow' ? 16 : 8) + level * 2; assert(picker.includes(gates + ' gates'));
  const key = gameRecordKey(map.id, GAME_CARS[0].id, level);
  prepare(map, 'race', { bestTimes: { [key]: 78.9 } }); html = withoutReactComments(render());
  assert(html.includes('LEVEL ' + level)); assert(html.includes('BEST ' + formatTime(78.9)));
  assert(html.includes(' / ' + gates));
});
useGame.getState().navigate('home'); useGame.getState().selectLevel(0);

console.log(`\n${checks} headless UI checks passed. These do not replace browser layout or driving tests.`);
