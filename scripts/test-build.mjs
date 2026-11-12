import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const root = resolve('dist');
const repository = process.env.GITHUB_REPOSITORY?.split('/').at(-1) ?? 'WindWay';
const base = `/${repository}/`;
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
let checks = 0;
function check(name, action) { action(); checks++; console.log(`PASS ${name}`); }
function localFile(url) {
  const location = new URL(url, `https://windway.test${base}`);
  assert(location.pathname.startsWith(base), `Asset escaped the current repository base: ${url}`);
  const file = resolve(root, decodeURIComponent(location.pathname.slice(base.length)));
  assert(file.startsWith(root + sep));
  assert(existsSync(file), `Published asset is missing: ${url}`);
  return file;
}
check('production entry and every local HTML asset use the current repository path', () => {
  assert(!html.includes('/3D-Car-View/assets/') && !html.includes('/3D-Car-Design/assets/'));
  const sources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter((url) => !/^(https?:|#|data:)/.test(url));
  assert(sources.length >= 4);
  for (const url of sources) localFile(url);
  const entry = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1];
  assert(entry?.startsWith(`${base}assets/`), 'Main script uses an obsolete deployment path');
});
check('new F1 boot loader, retry feedback and canonical sharing links are in the HTML', () => {
  assert(html.includes('boot-road') && html.includes('f1-loading-car.svg'));
  assert(html.includes('boot-retry') && html.includes('could not load'));
  assert(html.includes(`https://waqar-743.github.io/${repository}/`));
  assert(html.includes('prefers-reduced-motion'));
  localFile('branding/f1-loading-car.svg');
});
check('all generated script and style chunks are nonempty and omit the former asset base', () => {
  const chunks = readdirSync(resolve(root, 'assets')).filter((file) => /\.(js|css)$/.test(file));
  assert(chunks.length >= 3);
  for (const chunk of chunks) {
    const contents = readFileSync(resolve(root, 'assets', chunk), 'utf8');
    assert(contents.length > 0, chunk);
    assert(!contents.includes('/3D-Car-View/assets/'), `${chunk} requests the old repository assets`);
  }
});
check('each illustrated map gallery and every manifest SVG is included in the deployment', () => {
  for (const pack of ['cartoon-pack', 'jungle-pack', 'snow-pack']) {
    localFile(`${pack}/index.html`);
    const manifest = JSON.parse(readFileSync(localFile(`${pack}/manifest.json`), 'utf8'));
    const files = manifest.assets.map((asset) => typeof asset === 'string' ? asset : asset.file ?? `${asset.id}.svg`);
    assert(files.length > 0);
    for (const file of files) localFile(`${pack}/${file}`);
  }
});
check('both game cars, attribution, no-Jekyll marker and helpful 404 page ship together', () => {
  for (const file of ['models/mclaren-mcl38/f1_2024_mclaren_mcl38.glb', 'models/mercedes-w14/f1_2023_mercedes_amg_w14_e_performance_s1.glb', 'MODEL_CREDITS.md', '.nojekyll']) localFile(file);
  const recovery = readFileSync(localFile('404.html'), 'utf8');
  assert(recovery.includes(`https://waqar-743.github.io/${repository}/`));
  assert(recovery.includes('Waqar Ahmed') && recovery.includes('Back to Windway'));
});
check('lightweight homepage driving previews and poster are included in the deployment', () => {
  for (const file of ['f1-drive.mp4', 'f1-drive-mobile.mp4', 'f1-drive-poster.webp']) localFile(`media/${file}`);
});
console.log(`\n${checks} production deployment checks passed for ${base}`);
