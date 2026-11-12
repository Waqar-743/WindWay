import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const intermediate = resolve(root, '.tooling/android-web');
const destination = resolve(root, 'mobile/assets/game');
const posix = path => path.replaceAll('\\', '/');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const packs = ['cartoon-pack', 'jungle-pack', 'snow-pack', 'branding'];

function validateOutput(path, expected) {
  const absolute = resolve(path);
  if (absolute !== resolve(root, expected) || !absolute.startsWith(`${root}${sep}`)) {
    throw new Error(`Refusing generated output outside the exact Android asset directory: ${absolute}`);
  }
}
validateOutput(intermediate, '.tooling/android-web');
validateOutput(destination, 'mobile/assets/game');

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? filesIn(join(directory, entry.name))
    : [join(directory, entry.name)]));
  return nested.flat().sort();
}

// Public contains large legacy authoring models. Bundle the game code separately,
// then explicitly allow only delivery assets needed by the three playable maps.
await build({
  root,
  configFile: join(root, 'vite.config.ts'),
  base: './',
  publicDir: false,
  build: {
    outDir: intermediate,
    emptyOutDir: true,
    copyPublicDir: false,
    sourcemap: false,
  },
});

const config = await readFile(join(root, 'src/game/config.ts'), 'utf8');
const models = [...new Set([...config.matchAll(/\bpath:\s*['"](models\/[^'"]+\.glb)['"]/g)].map(match => match[1]))];
if (models.length !== 2 || models.some(path => path.includes('..'))) {
  throw new Error('Expected the two optimized active game car paths in src/game/config.ts.');
}

// Only this generated directory is removed; handwritten mobile assets stay intact.
validateOutput(destination, 'mobile/assets/game');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const file of await filesIn(intermediate)) {
  const path = relative(intermediate, file);
  const target = join(destination, path);
  await mkdir(dirname(target), { recursive: true });
  if (file.endsWith('.css')) {
    const css = await readFile(file, 'utf8');
    // Keep website typography untouched, but never fetch Google Fonts at runtime
    // from the offline Android WebView. Existing CSS has system fallbacks.
    const offlineCss = css.replace(/@import\s+(?:url\(\s*)?['"]?(?:https?:)?\/\/[^;]+;/gi, '');
    await writeFile(target, offlineCss);
  } else {
    await copyFile(file, target);
  }
}
for (const pack of packs) {
  const sourceDir = join(root, 'public', pack);
  await mkdir(join(destination, pack), { recursive: true });
  for (const file of (await readdir(sourceDir)).filter(path => path.endsWith('.svg'))) {
    await copyFile(join(sourceDir, file), join(destination, pack, file));
  }
}
for (const path of [...models, 'MODEL_CREDITS.md']) {
  const target = join(destination, path);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, 'public', path), target);
}

const files = [];
for (const file of await filesIn(destination)) {
  const bytes = await readFile(file);
  files.push({ path: posix(relative(destination, file)), bytes: bytes.length, sha256: hash(bytes) });
}
await writeFile(join(destination, 'asset-manifest.json'), `${JSON.stringify({
  formatVersion: 1,
  base: './',
  engine: 'Bundled React / Three.js / Rapier game hosted by the Flutter Android shell',
  models,
  totalBytes: files.reduce((sum, item) => sum + item.bytes, 0),
  files,
}, null, 2)}\n`);
const size = (files.reduce((sum, item) => sum + item.bytes, 0) / 1024 / 1024).toFixed(2);
console.log(`Prepared offline Android game: ${files.length} files, ${models.length} optimized cars, ${size} MiB. No legacy full-resolution models copied.`);
