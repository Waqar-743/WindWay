import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Enforces the strict visual color rule across the Android application and redesigned website:
 *   - NO BLUE (no cyan/blue/indigo hues 185°-265° and no cool blue-tinted grays)
 *   - NO PINK (no pink/magenta/rose hues 295°-352° and no light desaturated pastel pink)
 *   - NO LIGHT GREEN (no lime/mint/sage/light-green hues 66°-178° with lightness > 28%)
 */
const TARGET_FILES = [
  'index.html',
  'src/game/config.ts',
  'src/game/mobile-app-shell.css',
  'src/game/mobile-game.css',
  'src/game/landing-story.css',
  'src/game/wildway.css',
  'src/game/levels.css',
  'src/game/race-hud.css',
  'src/game/route-map.css',
  'src/game/live-map.css',
  'src/game/track-loader.css',
  'src/game/MobileAppElements.tsx',
  'src/game/StarterOnboarding.tsx',
  'src/game/LandingStory.tsx',
  'src/game/RouteMap.tsx',
  'src/game/Wildway.tsx',
  'src/game/LandingScroll3D.tsx',
  'src/game/Route3DShowcase.tsx',
  'src/game/MobileShowroom.tsx',
  'public/branding/windway-mark.svg',
  'public/branding/f1-loading-car.svg',
  'public/branding/medal-gold.svg',
  'public/branding/windway-crest.svg',
  'android/branding/app-icon.svg',
  'android/branding/adaptive-foreground.svg',
  'android/app/src/main/res/values/colors.xml',
  'android/app/src/main/kotlin/com/waqar/windway/MainActivity.kt',
];

function parseHex(raw) {
  const clean = raw.slice(1);
  if (clean.length === 3 || clean.length === 4) {
    return [0, 1, 2].map((i) => parseInt(clean[i] + clean[i], 16));
  }
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
}

function rgbToHsl(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s: s * 100, l: l * 100 };
}

function classifyForbidden(r, g, b) {
  const { h, s, l } = rgbToHsl(r, g, b);
  // Blue hues or visibly blue-tinted neutrals
  if (s >= 12 && h >= 185 && h <= 265) return `blue (H=${h.toFixed(0)}°, S=${s.toFixed(0)}%, L=${l.toFixed(0)}%)`;
  if (b > r + 6 && b >= g) return `blue-tinted neutral (rgb=${r},${g},${b})`;
  // Pink / magenta / rose hues and light coral-pinks
  if (s >= 12 && h >= 295 && h <= 352) return `pink/magenta (H=${h.toFixed(0)}°, S=${s.toFixed(0)}%, L=${l.toFixed(0)}%)`;
  if (s >= 18 && l > 62 && (h >= 340 || h <= 15)) return `light pink (H=${h.toFixed(0)}°, S=${s.toFixed(0)}%, L=${l.toFixed(0)}%)`;
  // Light green / lime / mint / sage hues
  if (s >= 15 && l > 28 && h >= 66 && h <= 178) return `light green (H=${h.toFixed(0)}°, S=${s.toFixed(0)}%, L=${l.toFixed(0)}%)`;
  return null;
}

let filesChecked = 0;
let colorsChecked = 0;
const violations = [];

for (const rel of TARGET_FILES) {
  const content = await readFile(join(root, rel), 'utf8');
  filesChecked++;

  for (const match of content.matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g)) {
    const token = match[0];
    // Skip CSS ID selectors like #road-alpine or non-color short tokens in HTML anchors
    if (token.length === 4 && content.slice(Math.max(0, match.index - 6), match.index).includes('href=')) continue;
    const [r, g, b] = parseHex(token);
    colorsChecked++;
    const issue = classifyForbidden(r, g, b);
    if (issue) violations.push(`${rel}: ${token} -> ${issue}`);
  }

  for (const match of content.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    const r = Number(match[1]), g = Number(match[2]), b = Number(match[3]);
    colorsChecked++;
    const issue = classifyForbidden(r, g, b);
    if (issue) violations.push(`${rel}: rgb(${r},${g},${b}) -> ${issue}`);
  }
}

assert.equal(
  violations.length,
  0,
  `Forbidden blue, pink, or light-green colors detected:\n${violations.map((v) => `  - ${v}`).join('\n')}`,
);

console.log(`PASS Color policy verified: ${colorsChecked} color literals across ${filesChecked} Android & web files contain ZERO blue, ZERO pink, and ZERO light green.`);
