import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidRoot = join(root, 'android');
const resRoot = join(androidRoot, 'app/src/main/res');

const legacySvg = await readFile(join(androidRoot, 'branding/app-icon.svg'));
const foregroundSvg = await readFile(join(androidRoot, 'branding/adaptive-foreground.svg'));
const densities = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
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
await writeFile(join(resRoot, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptiveXml);
await writeFile(join(resRoot, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptiveXml);
await sharp(legacySvg).resize(512, 512).png().toFile(join(androidRoot, 'branding/app-icon-preview.png'));

console.log('Prepared 15 density-specific Android launcher icons, adaptive XML, and preview.');
