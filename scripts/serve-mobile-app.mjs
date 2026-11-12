import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = resolve(project, 'mobile/assets/game');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm', '.png': 'image/png', '.md': 'text/plain; charset=utf-8',
};

/** Serve the exact Android game assets, including the browser app shell. The
 * application owns navigation, preferences and saves; this server injects no
 * fake native channel and never automatically launches a race. */
export function createMobilePreviewServer(directory = assetRoot) {
  const root = resolve(directory);
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return;
    }
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/' || (url.pathname === '/index.html' && url.searchParams.get('native') !== '1')) {
        url.searchParams.set('native', '1');
        response.writeHead(302, { Location: '/index.html' + url.search }).end(); return;
      }
      const file = resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
      const info = await stat(file);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
      response.setHeader('Content-Length', info.size);
      if (request.method === 'HEAD') { response.end(); return; }
      const stream = createReadStream(file);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    } catch (error) {
      response.writeHead(error instanceof URIError ? 400 : 404).end();
    }
  });
}

export async function startMobilePreview(port = 4186) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Choose a valid local port.');
  try { await access(resolve(assetRoot, 'index.html')); }
  catch { throw new Error('Prepare the game first with npm run android:prepare:web.'); }
  const server = createMobilePreviewServer();
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', done);
  });
  console.log(`Windway mobile app: http://127.0.0.1:${port}/index.html?native=1`);
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startMobilePreview(Number(process.env.WINDWAY_PREVIEW_PORT ?? 4186)).catch((error) => {
    console.error(error.message); process.exitCode = 1;
  });
}
