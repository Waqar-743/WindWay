import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(root, 'android');
const res = join(android, 'app/src/main/res');
const ktRoot = join(android, 'app/src/main/kotlin/com/waqar/windway');
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

// 1. Launcher densities and adaptive safe zone
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

// 2. Colors, manifest, and Kotlin Android project integrity
const colorsXml = await readFile(join(res, 'values/colors.xml'), 'utf8');
check(colorsXml.includes('#0B0A09') && colorsXml.includes('#141210') && colorsXml.includes('#F2A93B'), 'Android resource colors use Obsidian Carbon & Championship Amber');

const manifest = await readFile(join(android, 'app/src/main/AndroidManifest.xml'), 'utf8');
check(!manifest.includes('android.permission.INTERNET'), 'Native Kotlin Android app requires zero INTERNET permission');
check(manifest.includes('android.permission.VIBRATE'), 'Android manifest declares VIBRATE for haptics');
check(manifest.includes('sensorLandscape'), 'Android activity targets natural sensorLandscape racing orientation');
check(manifest.includes('glEsVersion="0x00030000"'), 'Android manifest requires OpenGL ES 3.0');

const mainActivity = await readFile(join(ktRoot, 'MainActivity.kt'), 'utf8');
check(mainActivity.includes('installSplashScreen()'), 'MainActivity integrates Android SplashScreen API');
check(mainActivity.includes('WebViewAssetLoader'), 'MainActivity serves bundled game offline via WebViewAssetLoader');
check(mainActivity.includes('WindwayAndroidHost'), 'MainActivity exposes WindwayAndroidHost bridge');
check(mainActivity.includes('onBackPressedDispatcher'), 'MainActivity handles Android Back button cleanly');

const bridge = await readFile(join(ktRoot, 'WindwayAndroidBridge.kt'), 'utf8');
for (const method of ['loadState', 'saveState', 'setTiltActive', 'calibrateTilt', 'haptic', 'setKeepScreenOn', 'getDeviceInfo', 'exitApp']) {
  check(bridge.includes(`fun ${method}(`), `WindwayAndroidBridge exposes @JavascriptInterface ${method}`);
}

const offlineHandler = await readFile(join(ktRoot, 'OfflineAssetHandler.kt'), 'utf8');
check(offlineHandler.includes('"application/wasm"') && offlineHandler.includes('"model/gltf-binary"'), 'OfflineAssetHandler maps WASM and GLB MIME types');

const proguard = await readFile(join(android, 'app/proguard-rules.pro'), 'utf8');
check(proguard.includes('WindwayAndroidBridge') && proguard.includes('JavascriptInterface'), 'ProGuard rules retain @JavascriptInterface bridge methods');

console.log(`${checks} Native Kotlin Android asset & manifest checks passed.`);
