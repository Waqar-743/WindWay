import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { Children, createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';

// Server rendering verifies shipped copy, states and asset URLs. It does not
// replace browser layout, graphics or touch-device checks.
const require = createRequire(new URL('../package.json', import.meta.url));
const base = '/WindWay/';
const bundle = await build({
  stdin: {
    contents: "export { default as TrackLoader } from './src/game/TrackLoader'; export { default as LandingStory } from './src/game/LandingStory';",
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  loader: { '.css': 'empty' },
  define: { 'import.meta.env.BASE_URL': JSON.stringify(base), 'import.meta.env.DEV': 'false' },
});
const compiled = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports);
const { TrackLoader, LandingStory } = compiled.exports;

let checks = 0;
function check(name, action) {
  action();
  checks++;
  console.log(`PASS ${name}`);
}
function render(Component, props) {
  return renderToStaticMarkup(createElement(Component, props));
}
function assetsExist(html) {
  const publicRoot = resolve('public');
  const images = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
  assert(images.length > 0, 'No SVG illustrations were rendered');
  for (const source of images) {
    assert(source.startsWith(base), `Image must respect the deployed base path: ${source}`);
    const relative = decodeURIComponent(source.slice(base.length).split(/[?#]/)[0]);
    const asset = resolve(publicRoot, relative);
    assert(asset.startsWith(`${publicRoot}${sep}`), `Image escaped public/: ${source}`);
    assert(existsSync(asset), `Image is missing from public/: ${source}`);
  }
}
function localLinksExist(html) {
  const publicRoot = resolve('public');
  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    const href = match[1];
    if (href.startsWith('#')) {
      assert(html.includes(`id="${href.slice(1)}"`), `Missing in-page destination: ${href}`);
    } else if (href.startsWith(base)) {
      const relative = decodeURIComponent(href.slice(base.length).split(/[?#]/)[0]);
      const path = resolve(publicRoot, relative);
      assert(path.startsWith(`${publicRoot}${sep}`), `Link escaped public/: ${href}`);
      assert(existsSync(path), `Missing local destination: ${href}`);
      if (statSync(path).isDirectory()) assert(existsSync(resolve(path, 'index.html')), `Gallery has no index: ${href}`);
    }
  }
}

const label = 'Getting Whiteout Ridge ready';
const loading = (props = {}) => render(TrackLoader, { label, ...props });
check('F1 loader announces a visible, accessible loading label', () => {
  const html = loading();
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert(html.includes(label));
  assert.match(html, /aria-hidden="true"/);
});
check('Unknown progress does not fabricate a percentage or determinate bar', () => {
  for (const progress of [undefined, NaN, Infinity, -Infinity]) {
    const html = loading({ progress });
    assert.doesNotMatch(html, /<progress\b|\d+%/);
  }
});
check('Known progress reports its actual value and accessible name', () => {
  const html = loading({ progress: 37.4 });
  assert.match(html, /<progress\b[^>]*value="37\.4"[^>]*max="100"/);
  assert.match(html, /aria-label="Getting Whiteout Ridge ready"/);
  assert.match(html, />37%<\/span>/);
});
check('Out-of-range progress is safely bounded to the real bar range', () => {
  assert.match(loading({ progress: -20 }), /<progress\b[^>]*value="0"/);
  assert.match(loading({ progress: 120 }), /<progress\b[^>]*value="100"/);
});
check('Compact loading and explicit reduced motion have isolated selectors', () => {
  const html = loading({ compact: true, reducedMotion: true, className: 'test-loader' });
  assert.match(html, /class="track-loader track-loader--compact test-loader"/);
  assert.match(html, /data-reduced-motion="true"/);
  assert.doesNotMatch(loading(), /track-loader--compact|data-reduced-motion/);
});
check('The right-facing F1 artwork uses the deployed base path and exists', () => {
  const html = loading();
  assert.match(html, /src="\/WindWay\/branding\/f1-loading-car\.svg"/);
  assetsExist(html);
  const svg = readFileSync('public/branding/f1-loading-car.svg', 'utf8');
  assert.match(svg, /<svg\b/);
  assert.match(svg, /facing right/i);
});

const css = postcss.parse(readFileSync('src/game/track-loader.css', 'utf8'));
check('F1 movement travels left to right using only transform animation', () => {
  const animation = css.nodes.find((node) => node.type === 'atrule' && node.name === 'keyframes' && node.params === 'windway-loader-drive');
  assert(animation, 'Missing car animation');
  const start = animation.nodes.find((node) => node.selector === 'from');
  const end = animation.nodes.find((node) => node.selector === 'to');
  assert(start && end);
  assert.match(start.nodes.find((node) => node.prop === 'transform')?.value ?? '', /translateX\(-\d+px\)/);
  assert.equal(end.nodes.find((node) => node.prop === 'transform')?.value, 'translateX(100%)');
  animation.walkDecls((declaration) => {
    assert(['transform', 'opacity'].includes(declaration.prop), `Layout-affecting animation: ${declaration.prop}`);
  });
});
check('System and explicit reduced-motion settings stop the moving car', () => {
  let systemStops = false;
  let explicitStops = false;
  css.walkAtRules('media', (media) => {
    if (!media.params.includes('prefers-reduced-motion: reduce')) return;
    media.walkRules((rule) => {
      if (!rule.selector.includes('.track-loader-car')) return;
      rule.walkDecls('animation', (declaration) => { if (declaration.value === 'none') systemStops = true; });
    });
  });
  css.walkRules((rule) => {
    if (!rule.selector.includes("[data-reduced-motion='true']") || !rule.selector.includes('.track-loader-car')) return;
    rule.walkDecls('animation', (declaration) => { if (declaration.value === 'none') explicitStops = true; });
  });
  assert(systemStops && explicitStops, 'Both reduced-motion paths must stop the animation');
});

const noop = () => {};
check('Homepage preview starts with a lazy poster and no video transfer', () => {
  const html = render(LandingStory, {
    selectedMap: 'alpine', selectedCarName: 'McLaren MCL38', reducedMotion: true,
    onChooseMap: noop, onExploreMap: noop, onStartMap: noop, onGarage: noop,
  });
  const video = html.match(/<video\b[^>]*>/)?.[0];
  assert(video, 'Missing driving preview');
  assert.doesNotMatch(video, /\bsrc=|\bautoPlay\b/i, 'Video must wait for visibility and motion/data preferences');
  assert.match(video, /preload="none"/);
  assert.match(video, /\bmuted=""/);
  assert.match(video, /\bplaysinline=""/i);
  assert.match(html, /<img\b[^>]*f1-drive-poster\.webp[^>]*loading="lazy"/);
  assert.match(html, /<button\b[^>]*aria-label="Play driving preview"/);
});
check('Homepage video and poster stay within their transfer budgets', () => {
  for (const [file, budget] of [['f1-drive.mp4', 1_000_000], ['f1-drive-mobile.mp4', 500_000], ['f1-drive-poster.webp', 65_000]]) {
    const bytes = statSync(resolve('public/media', file)).size;
    assert(bytes > 0 && bytes <= budget, `${file}: ${bytes} bytes exceeds its ${budget}-byte budget`);
  }
});
const mapNames = ['The alpine loop', 'Canopy Run', 'Frostbite Ascent'];
for (const selectedMap of ['alpine', 'jungle', 'snow']) {
  const html = render(LandingStory, {
    selectedMap, selectedCarName: 'McLaren MCL38',
    onChooseMap: noop, onExploreMap: noop, onStartMap: noop, onGarage: noop,
  });
  check(`${selectedMap} landing keeps all three map stories on the same page`, () => {
    for (const [index, id] of ['alpine', 'jungle', 'snow'].entries()) {
      const chapter = [...html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)]
        .find((match) => match[1].includes(`id="road-${id}"`));
      assert(chapter, `Missing always-rendered map chapter: ${id}`);
      assert(chapter[2].toLowerCase().includes(mapNames[index].toLowerCase()), `Missing map chapter name: ${mapNames[index]}`);
      assert(chapter[1].includes(`aria-labelledby="title-${id}"`), `Map chapter needs an accessible heading: ${id}`);
      assert.doesNotMatch(chapter[1], /\bhidden(?:[\s=>])|aria-hidden="true"|\binert(?:[\s=>])/);
      assert.doesNotMatch(chapter[1], /display\s*:\s*none|visibility\s*:\s*hidden/);
    }
    assert.match(html, /<main\b/);
    assert.match(html, /<header\b/);
    assert.match(html, /<footer\b/);
  });
  check(`${selectedMap} landing identifies the creator and real GitHub destinations`, () => {
    const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1];
    assert(footer, 'Missing creator footer');
    assert.match(footer, /Waqar Ahmed/);
    assert.match(footer, /href="https:\/\/github\.com\/Waqar-743\/WindWay(?:["#?\/])/);
    assert.match(footer, /href="https:\/\/github\.com\/Waqar-743\/?"/);
    assert.doesNotMatch(html, /github\.com\/Waqar-743\/(?:3D-Car-View|3D-Car-Design)/i);
  });
  check(`${selectedMap} landing artwork, galleries and in-page destinations exist`, () => {
    assetsExist(html);
    localLinksExist(html);
  });
  check(`${selectedMap} landing has exactly one active map selection when present`, () => {
    const pressed = [...html.matchAll(/aria-pressed="(true|false)"/g)].map((match) => match[1]);
    if (pressed.length) {
      assert.equal(pressed.length, 3, 'Each map should have its own selection button');
      assert.equal(pressed.filter((value) => value === 'true').length, 1);
      const active = [...html.matchAll(/<button\b[^>]*aria-pressed="true"[^>]*>([\s\S]*?)<\/button>/g)];
      assert.equal(active.length, 1);
      const selectedName = mapNames[['alpine', 'jungle', 'snow'].indexOf(selectedMap)];
      assert(active[0][1].toLowerCase().includes(selectedName.toLowerCase()), 'Wrong map is marked selected');
    }
  });
  check(`${selectedMap} hero starts the selected road`, () => {
    const calls = [];
    const tree = LandingStory({
      selectedMap, selectedCarName: 'McLaren MCL38', onChooseMap: noop, onGarage: noop,
      onExploreMap: (id) => calls.push(['explore', id]),
      onStartMap: (id) => calls.push(['start', id]),
    });
    function find(node, predicate) {
      if (!isValidElement(node)) return null;
      if (predicate(node)) return node;
      for (const child of Children.toArray(node.props.children)) {
        const match = find(child, predicate);
        if (match) return match;
      }
      return null;
    }
    const hero = find(tree, (node) => node.type === 'button' && node.props.className?.split(' ').includes('wl-hero-drive'));
    assert(hero, 'Missing primary hero button');
    assert(renderToStaticMarkup(hero).includes('Start your drive'), 'Hero must describe the direct-drive action');
    hero.props.onClick();
    assert.deepEqual(calls, [['start', selectedMap]], 'Hero must start the selected road');
    const drive = find(tree, (node) => node.type === 'section' && node.props.className === 'wl-last-call');
    const button = find(drive, (node) => node.type === 'button');
    assert(button, 'Missing direct-drive shortcut');
    button.props.onClick();
    assert.deepEqual(calls, [['start', selectedMap], ['start', selectedMap]], 'Both drive shortcuts should start the selected road');
  });
}

console.log(`\n${checks} landing and F1 loader checks passed.`);
