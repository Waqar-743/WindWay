import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = join(root, 'mobile');
const res = join(mobile, 'android/app/src/main/res');
const manifest = JSON.parse(await readFile(join(mobile, 'assets/art/manifest.json'), 'utf8'));
const packs = ['cartoon-pack', 'jungle-pack', 'snow-pack', 'branding'];
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

check(manifest.total === manifest.assets.length, 'Inventory total must match records');
check(new Set(manifest.assets.map(asset => asset.path)).size === manifest.total, 'Inventory asset paths must be unique');
for (const pack of packs) {
  const sourceNames = (await readdir(join(root, 'public', pack))).filter(name => name.endsWith('.svg')).sort();
  const mobileNames = (await readdir(join(mobile, 'assets/art', pack))).filter(name => name.endsWith('.svg')).sort();
  assert.deepEqual(mobileNames, sourceNames, `${pack}: every source SVG must be included with no omissions`);
  checks += 1;
  for (const file of sourceNames) {
    const asset = manifest.assets.find(item => item.pack === pack && item.path.endsWith(`/${file}`));
    check(Boolean(asset), `${pack}/${file}: inventory record`);
    const original = await readFile(join(root, 'public', pack, file));
    const copied = await readFile(join(mobile, asset.path));
    check(hash(original) === hash(copied) && asset.sourceHash === hash(original), `${file}: exact source hash`);
    const svg = copied.toString('utf8');
    check(svg.match(/<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1] === asset.viewBox, `${file}: scalable viewBox preserved`);
    check(!/<(?:script|foreignObject)\b/i.test(svg) && !/\b(?:xlink:)?href\s*=\s*["'](?!#)/i.test(svg), `${file}: passive and self-contained`);
    const ids = new Set([...svg.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(match => match[1]));
    for (const match of svg.matchAll(/url\(\s*["']?#([^)'"\s]+)["']?\s*\)/g)) {
      check(ids.has(match[1]), `${file}: internal SVG reference ${match[1]} exists`);
    }
    check(asset.recommendedMenuSize >= 44 && (asset.recommendedHUDSize === null || asset.recommendedHUDSize <= 32), `${file}: menu and compact HUD sizing`);
    check(asset.containsText === /<text\b/i.test(svg), `${file}: native text fallback metadata`);
  }
}
check((await readFile(join(mobile, 'assets/art/MODEL_CREDITS.md'), 'utf8')) === (await readFile(join(root, 'public/MODEL_CREDITS.md'), 'utf8')), 'Model attribution retained exactly');
for (const [density, iconSize, foregroundSize] of [['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432]]) {
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    const info = await sharp(join(res, `mipmap-${density}`, name)).metadata();
    check(info.width === iconSize && info.height === iconSize && info.format === 'png', `${density}/${name}: proper launcher density`);
  }
  const foreground = sharp(join(res, `drawable-${density}/ic_launcher_foreground.png`));
  const info = await foreground.metadata();
  check(info.width === foregroundSize && info.height === foregroundSize && info.hasAlpha, `${density}: transparent adaptive foreground density`);
  const { data, info: raw } = await foreground.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const inset = foregroundSize * 21 / 108;
  let safe = true;
  for (let y = 0; y < raw.height; y += 1) {
    for (let x = 0; x < raw.width; x += 1) {
      const outside = x < inset || y < inset || x >= raw.width - inset || y >= raw.height - inset;
      if (outside && data[(y * raw.width + x) * 4 + 3] !== 0) safe = false;
    }
  }
  check(safe, `${density}: car stays inside 66dp adaptive safe zone`);
}
for (const file of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  const xml = await readFile(join(res, 'mipmap-anydpi-v26', file), 'utf8');
  check(xml.includes('<adaptive-icon') && xml.includes('@color/windway_launcher_background') && xml.includes('@drawable/ic_launcher_foreground'), `${file}: valid adaptive layer references`);
}
check((await readFile(join(res, 'values/windway_icon_colors.xml'), 'utf8')).includes('#153C35'), 'Launcher background matches pine branding');
console.log(`${checks} Android asset checks passed (${manifest.total} SVGs and every Android launcher density).`);
