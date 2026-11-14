# Windway security review

Reviewed: web app (`src/`, `index.html`, `public/`), build configuration, GitHub Actions workflows, and the Android wrapper (read-only).

## Fixed in this pass

1. **Missing Content-Security-Policy** — added a restrictive CSP meta tag to `index.html`, plus `strict-origin-when-cross-origin` referrer policy.
   - Blocks third-party scripts, objects, frames and form targets.
   - Allows only the same-origin app, Google Fonts (already used by `src/index.css`), local Vite HMR WebSocket, and `blob:` URLs required by Three.js GLTF embedded textures.
   - `script-src` includes `'wasm-unsafe-eval'` because Rapier compiles WebAssembly.
   - `'unsafe-inline'` remains required by the existing inline boot/error scripts. Moving those to external files with hashes is a recommended follow-up.
2. **GLTF textures blocked by the new CSP** — `connect-src` now includes `blob:` so embedded GLB textures load correctly. Verified in a headless browser: the car renders with its real paint and tire textures.

## Audit results (`npm audit`)

- 26 advisories: **0 critical, 18 high, 7 moderate, 1 low**.
- Almost all are build/test tooling or transitive dependencies: ESLint/TypeScript-ESLint, Vite/esbuild/Rollup/PostCSS, js-yaml, minimatch, brace-expansion, picomatch, flatted, ajv, browserslist, source-map-js, nanoid.
- Runtime-relevant: `@react-three/drei` (via `lodash.pick` and `uuid`) and `fflate`. The app only feeds trusted local GLB/SVG assets to these libraries.
- `vite` advisories affect the **development server**. This project binds it to `127.0.0.1` with `strictPort`, which limits exposure. Upgrading Vite to v8 is a semver-major change and should be done as a separate maintenance task with a full regression run.
- A non-breaking `npm audit fix --dry-run` would update `@react-three/drei` to 9.122.0, PostCSS to 8.5.33, Rollup to 4.68.3, and most transitive packages, removing the lodash/uuid and most DoS advisories. It was **not applied** in this pass because it changes 60 packages, including the runtime 3D library; the verified build and jungle tests should not be destabilized without a dedicated regression pass. Recommended follow-up: run `npm audit fix`, then `npm run test:game` and `npm run build`, and visually check all three maps.
- `vite`/`esbuild` and `@typescript-eslint/*` require semver-major upgrades; schedule those separately.

## Verified safe

- No `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, or `new Function` usage in `src/`.
- External links use `rel="noreferrer"` or `rel="noopener"`.
- `localStorage` preferences and saved runs are validated and clamped before use.
- No secrets, API keys, or private keys found in source, workflows, or public assets.
- The Vite legacy-path redirect cannot leave the origin; the mobile preview server has a path-traversal guard.
- Android wrapper (not modified): `allowBackup="false"`, `usesCleartextTraffic="false"`, cleartext permitted only for `127.0.0.1`, exported launcher activity only, and the WebView bridge validates message origin/source.
- GitHub Actions use least-privilege `permissions` and deploy only from `main`. Pinning actions to commit SHAs is a recommended supply-chain hardening step.

## Not changed

- The mobile/Android application was reviewed but intentionally left untouched.
- No gameplay geometry, colliders, checkpoint logic, or physics were changed.
