import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const game = join(root, 'mobile/assets/game');
const manifest = JSON.parse(await readFile(join(game, 'asset-manifest.json'), 'utf8'));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const html = await readFile(join(game, 'index.html'), 'utf8');

check(manifest.base === './', 'Android bundle has a relative base');
check(!html.includes('src="/WindWay/') && !html.includes('href="/WindWay/'), 'Android entry has no GitHub Pages base');
check(!html.includes('/src/main.tsx'), 'Android entry references compiled game assets');
const resourceLinks = [...html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g)]
  .map(match => match[1]).filter(path => !/^(?:https?:|data:|#)/.test(path));
check(resourceLinks.some(path => /^\.\/assets\/.*\.js$/.test(path)), 'Compiled relative JavaScript entry exists');
for (const prefix of ['/windway-a91ef/', '/a/very/different-local-token/game/']) {
  const base = new URL(`${prefix}index.html`, 'http://127.0.0.1:39837');
  for (const path of [...resourceLinks, ...manifest.models, 'cartoon-pack/formula-racer.svg']) {
    const resolved = new URL(path, base);
    check(resolved.origin === base.origin && resolved.pathname.startsWith(prefix), `Relative asset stays under randomized local prefix: ${path}`);
    const decoded = decodeURIComponent(resolved.pathname.slice(prefix.length));
    check(!decoded.includes('..') && (await stat(join(game, decoded))).isFile(), `Bundled relative asset exists: ${decoded}`);
  }
}

const js = [];
for (const item of manifest.files) {
  check(!item.path.startsWith('/') && !item.path.split('/').includes('..'), `Safe bundled path: ${item.path}`);
  const bytes = await readFile(join(game, item.path));
  check(bytes.length === item.bytes && hash(bytes) === item.sha256, `Bundle inventory hash: ${item.path}`);
  if (item.path.endsWith('.js')) js.push(bytes.toString('utf8'));
  if (item.path.endsWith('.css')) {
    check(!/@import\s+(?:url\(\s*)?['"]?(?:https?:)?\/\//i.test(bytes.toString('utf8')), 'Offline styles never import remote fonts');
  }
}
const code = js.join('\n');
check(code.includes('WindwayMobile'), 'Native game bridge is included in the real game bundle');
for (const method of ['configure', 'start', 'command', 'steer']) {
  check(new RegExp(`\\b${method}\\b`).test(code), `Native bridge method ${method} is bundled`);
}
for (const pack of ['cartoon-pack', 'jungle-pack', 'snow-pack', 'branding']) {
  const source = (await readdir(join(root, 'public', pack))).filter(path => path.endsWith('.svg')).sort();
  const bundled = (await readdir(join(game, pack))).filter(path => path.endsWith('.svg')).sort();
  assert.deepEqual(bundled, source, `All ${pack} SVGs are available offline`);
  checks += 1;
  for (const file of source) {
    check(hash(await readFile(join(game, pack, file))) === hash(await readFile(join(root, 'public', pack, file))), `Offline SVG matches source: ${pack}/${file}`);
  }
}
const modelFiles = manifest.files.filter(item => item.path.endsWith('.glb'));
check(modelFiles.length === 2 && manifest.models.length === 2, 'Exactly two delivery car models are bundled');
check(modelFiles.every(item => manifest.models.includes(item.path) && item.bytes < 8 * 1024 * 1024), 'Car models are the optimized delivery variants');
check(!manifest.files.some(item => /(?:^|\/)(?:img|3d-Model|mclaren-mcl36)(?:\/|$)|\.gltf$|\.map$/.test(item.path)), 'No legacy authoring models or source maps enter APK assets');
check((await readFile(join(game, 'MODEL_CREDITS.md'), 'utf8')) === (await readFile(join(root, 'public/MODEL_CREDITS.md'), 'utf8')), 'Offline model attribution and noncommercial license preserved');
check(manifest.totalBytes === manifest.files.reduce((sum, item) => sum + item.bytes, 0), 'Offline bundle size inventory matches files');
console.log(`${checks} offline Android web bundle checks passed.`);
