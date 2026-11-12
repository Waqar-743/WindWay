import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packs = ['cartoon-pack', 'jungle-pack', 'snow-pack', 'branding'];
const artRoot = join(root, 'mobile/assets/art');
const resRoot = join(root, 'mobile/android/app/src/main/res');
const inventory = [];
const posix = path => path.replaceAll('\\', '/');
const sha256 = data => createHash('sha256').update(data).digest('hex');

for (const pack of packs) {
  const sourceDir = join(root, 'public', pack);
  const destinationDir = join(artRoot, pack);
  await mkdir(destinationDir, { recursive: true });
  const manifestFile = join(sourceDir, 'manifest.json');
  const sourceManifest = await readFile(manifestFile, 'utf8').then(JSON.parse).catch(() => null);
  const descriptions = new Map((sourceManifest?.assets ?? []).map(item => [item.file, item]));
  for (const file of (await readdir(sourceDir)).filter(name => name.endsWith('.svg')).sort()) {
    const source = join(sourceDir, file);
    const data = await readFile(source);
    const svg = data.toString('utf8');
    const viewBox = svg.match(/<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!viewBox) throw new Error(`SVG viewBox missing: ${source}`);
    if (/<(?:script|foreignObject)\b/i.test(svg) || /\b(?:xlink:)?href\s*=\s*["'](?!#)/i.test(svg)) {
      throw new Error(`SVG is not self-contained and passive: ${source}`);
    }
    await copyFile(source, join(destinationDir, file));
    const sourceInfo = descriptions.get(file);
    const isOverview = /contact-sheet|scene-preview/.test(file);
    inventory.push({
      pack,
      id: file.replace(/\.svg$/, ''),
      name: sourceInfo?.name ?? sourceInfo?.title ?? file.replace(/\.svg$/, '').replaceAll('-', ' '),
      path: `assets/art/${pack}/${file}`,
      source: posix(relative(root, source)),
      viewBox,
      recommendedMenuSize: isOverview ? 320 : 112,
      recommendedHUDSize: isOverview ? null : 28,
      containsText: /<text\b/i.test(svg),
      sourceHash: sha256(data),
    });
  }
}

await mkdir(artRoot, { recursive: true });
await writeFile(join(artRoot, 'manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  sizingUnit: 'Flutter logical pixels; preserve aspect ratio with BoxFit.contain',
  source: 'Existing Windway original SVG artwork, copied without changing viewBoxes or geometry.',
  renderingNote: 'Flutter SVG omits SVG text elements. Render character names, route names, lap numbers and all essential labels as native Flutter Text outside each illustration. Overview SVGs are archival previews, not gameplay HUD artwork.',
  total: inventory.length,
  assets: inventory,
}, null, 2)}\n`);
await copyFile(join(root, 'public/MODEL_CREDITS.md'), join(artRoot, 'MODEL_CREDITS.md'));

const legacySvg = await readFile(join(root, 'mobile/branding/app-icon.svg'));
const foregroundSvg = await readFile(join(root, 'mobile/branding/adaptive-foreground.svg'));
const densities = [
  ['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432],
];
for (const [density, legacySize, foregroundSize] of densities) {
  const mipmapDir = join(resRoot, `mipmap-${density}`);
  const drawableDir = join(resRoot, `drawable-${density}`);
  await Promise.all([mkdir(mipmapDir, { recursive: true }), mkdir(drawableDir, { recursive: true })]);
  const icon = await sharp(legacySvg).resize(legacySize, legacySize).png().toBuffer();
  await writeFile(join(mipmapDir, 'ic_launcher.png'), icon);
  const mask = Buffer.from(`<svg width="${legacySize}" height="${legacySize}"><circle cx="${legacySize / 2}" cy="${legacySize / 2}" r="${legacySize / 2}" fill="white"/></svg>`);
  await sharp(icon).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(join(mipmapDir, 'ic_launcher_round.png'));
  await sharp(foregroundSvg).resize(foregroundSize, foregroundSize).png().toFile(join(drawableDir, 'ic_launcher_foreground.png'));
}
const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/windway_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`;
await mkdir(join(resRoot, 'mipmap-anydpi-v26'), { recursive: true });
await mkdir(join(resRoot, 'values'), { recursive: true });
await writeFile(join(resRoot, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptiveXml);
await writeFile(join(resRoot, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptiveXml);
await writeFile(join(resRoot, 'values/windway_icon_colors.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="windway_launcher_background">#153C35</color></resources>\n');
await sharp(legacySvg).resize(512, 512).png().toFile(join(root, 'mobile/branding/app-icon-preview.png'));
console.log(`Prepared ${inventory.length} exact SVG copies across ${packs.length} packs, model credits, and 15 density-specific launcher images.`);
