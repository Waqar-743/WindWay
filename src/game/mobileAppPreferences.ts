import { GAME_CARS, PAINTS } from './config';
import { checkpointCount, LEVELS } from './levels';
import type {} from './mobileBridge';

export const BROWSER_APP_STORAGE_KEY = 'windway.mobile.app.v2';
const LEGACY_STORAGE_KEY = 'windway.browser.app.v1';

export const APP_MAPS = [
  { id: 'alpine', name: 'Alpine Valley', region: 'Windway Valley', tagline: 'Find your line.', difficulty: 'First drive', laps: 1, gates: 8, terrain: 'Mountain circuit', art: 'cartoon-pack/mountain-range.svg', description: 'Flowing corners, pine forests and river crossings. Learn the car, then carry your speed over the boost ramp.' },
  { id: 'jungle', name: 'Canopy Run', region: 'Jungle Reserve', tagline: 'Follow the canopy.', difficulty: 'Intermediate', laps: 2, gates: 8, terrain: 'Jungle circuit', art: 'jungle-pack/jungle-badge.svg', description: 'Two laps through dense tropical forest. Cross winding rivers, spot the wildlife and line up the boost jump.' },
  { id: 'snow', name: 'Frostbite Ascent', region: 'Whiteout Ridge', tagline: 'Earn the summit.', difficulty: 'Expert climb', laps: 1, gates: 17, terrain: '6.44 km ascent', art: 'snow-pack/snowy-mountain.svg', description: 'A one-way mountain climb through narrow switchbacks, black ice and snow hurdles. Keep your braking early and your line clean.' },
] as const;

export const APP_CREW = [
  { id: 'waqar', name: 'Waqar', role: 'The curious driver', art: 'jungle-pack/waqar.svg', description: 'Always looking for the next bend. A familiar face beside your race messages.' },
  { id: 'imran', name: 'Imran', role: 'The calm navigator', art: 'jungle-pack/imran.svg', description: 'A little patience and a clean braking point. Keeps the drive steady.' },
  { id: 'tatheer', name: 'Tatheer', role: 'The bold explorer', art: 'jungle-pack/tatheer.svg', description: 'Sees a ramp and has a plan. Always ready to take the longer road.' },
  { id: 'snowman', name: 'Snowy', role: 'The summit regular', art: 'snow-pack/snowman.svg', description: 'At home above the snowline. Knows to slow down before the ice.' },
] as const;

export type BrowserMapId = typeof APP_MAPS[number]['id'];

export interface BrowserGameConfig {
  mapId: BrowserMapId;
  level: number;
  carId: string;
  paint: string;
  character: typeof APP_CREW[number]['id'];
  steeringMode: 'arrows' | 'wheel' | 'tilt';
  cameraMode: 'chase' | 'hood';
  quality: 'auto' | 'low' | 'high';
  effects: boolean;
  sound: number;
  sensitivity: number;
  invertTilt: boolean;
  haptics: boolean;
  reducedMotion: boolean;
}

export interface BrowserSavedRun {
  version: 1;
  mapId: BrowserMapId;
  carId: string;
  level?: number;
  checkpoint: number;
  lap: number;
  elapsed: number;
  resets: number;
}

export interface BrowserAppState {
  version: 1;
  onboardingCompleted: boolean;
  config: BrowserGameConfig;
  savedRun: BrowserSavedRun | null;
  completedLevels: Record<BrowserMapId, number[]>;
  bestTimes: Record<string, number>;
}

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const choice = <T extends string>(value: unknown, values: readonly T[], fallback: T): T => typeof value === 'string' && values.includes(value as T) ? value as T : fallback;
const levelChoice = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < LEVELS.length ? value : fallback;

export const browserRecordKey = (mapId: string, carId: string, level = 0) =>
  level === 0 ? (mapId === 'alpine' ? carId : `${mapId}:${carId}`) : `${mapId}:${carId}:${level}`;

export function emptyCompletedLevels(): Record<BrowserMapId, number[]> {
  return { alpine: [], jungle: [], snow: [] };
}

export function defaultBrowserAppState(): BrowserAppState {
  return {
    version: 1,
    onboardingCompleted: false,
    config: {
      mapId: 'alpine',
      level: 0,
      carId: GAME_CARS[0].id,
      paint: PAINTS[0].hex,
      character: 'waqar',
      steeringMode: 'arrows',
      cameraMode: 'chase',
      quality: 'auto',
      effects: false,
      sound: .55,
      sensitivity: 1,
      invertTilt: false,
      haptics: true,
      reducedMotion: false,
    },
    savedRun: null,
    completedLevels: emptyCompletedLevels(),
    bestTimes: {},
  };
}

export function validateBrowserSavedRun(value: unknown): BrowserSavedRun | null {
  const data = record(value);
  const map = APP_MAPS.find((item) => item.id === data.mapId);
  if (data.version !== 1 || !map || !GAME_CARS.some((car) => car.id === data.carId)) return null;
  const hasLevel = data.level !== undefined;
  if (hasLevel && (typeof data.level !== 'number' || !Number.isInteger(data.level) || data.level < 0 || data.level >= LEVELS.length)) return null;
  const level = hasLevel ? Number(data.level) : 0;
  const maxCheckpoint = checkpointCount(map.id === 'snow', level) - (map.id === 'snow' ? 2 : 1);
  for (const [key, min, max] of [['checkpoint', 0, maxCheckpoint], ['lap', 1, map.laps], ['resets', 0, 1000000]] as const) {
    const entry = data[key];
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < min || entry > max) return null;
  }
  if (typeof data.elapsed !== 'number' || !Number.isFinite(data.elapsed) || data.elapsed < 0 || data.elapsed > 604800) return null;
  const run: BrowserSavedRun = { version: 1, mapId: map.id, carId: String(data.carId), checkpoint: Number(data.checkpoint), lap: Number(data.lap), elapsed: data.elapsed, resets: Number(data.resets) };
  if (level > 0) run.level = level;
  return run;
}

export function validateBrowserAppState(value: unknown): BrowserAppState {
  const defaults = defaultBrowserAppState();
  const data = record(value);
  if (data.version !== 1) return defaults;
  const settings = record(data.config);
  const config: BrowserGameConfig = {
    mapId: choice(settings.mapId, APP_MAPS.map((map) => map.id), defaults.config.mapId),
    level: levelChoice(settings.level, defaults.config.level),
    carId: choice(settings.carId, GAME_CARS.map((car) => car.id), GAME_CARS[0].id),
    paint: choice(settings.paint, PAINTS.map((paint) => paint.hex), defaults.config.paint),
    character: choice(settings.character, APP_CREW.map((character) => character.id), defaults.config.character),
    steeringMode: choice(settings.steeringMode, ['arrows', 'wheel', 'tilt'], defaults.config.steeringMode),
    cameraMode: choice(settings.cameraMode, ['chase', 'hood'], defaults.config.cameraMode),
    quality: choice(settings.quality, ['auto', 'low', 'high'], defaults.config.quality),
    effects: typeof settings.effects === 'boolean' ? settings.effects : defaults.config.effects,
    sound: number(settings.sound, defaults.config.sound, 0, 1),
    sensitivity: number(settings.sensitivity, defaults.config.sensitivity, .5, 1.5),
    invertTilt: typeof settings.invertTilt === 'boolean' ? settings.invertTilt : defaults.config.invertTilt,
    haptics: typeof settings.haptics === 'boolean' ? settings.haptics : defaults.config.haptics,
    reducedMotion: typeof settings.reducedMotion === 'boolean' ? settings.reducedMotion : defaults.config.reducedMotion,
  };
  const records = record(data.bestTimes);
  const bestTimes: Record<string, number> = {};
  for (const map of APP_MAPS) for (const car of GAME_CARS) for (const lvl of LEVELS) {
    const key = browserRecordKey(map.id, car.id, lvl.id), time = records[key];
    if (typeof time === 'number' && Number.isFinite(time) && time > 0 && time <= 604800) bestTimes[key] = time;
  }
  const rawCompleted = record(data.completedLevels);
  const completedLevels = emptyCompletedLevels();
  for (const map of APP_MAPS) {
    const items = rawCompleted[map.id];
    if (Array.isArray(items)) {
      completedLevels[map.id] = [...new Set(items.filter((v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < LEVELS.length))].sort((a, b) => a - b);
    }
  }
  return {
    version: 1,
    onboardingCompleted: typeof data.onboardingCompleted === 'boolean' ? data.onboardingCompleted : false,
    config,
    savedRun: validateBrowserSavedRun(data.savedRun),
    completedLevels,
    bestTimes,
  };
}

export function updateBrowserConfig(state: BrowserAppState, patch: Partial<BrowserGameConfig>): BrowserAppState {
  return validateBrowserAppState({ ...state, config: { ...state.config, ...patch } });
}

export function setOnboardingCompleted(state: BrowserAppState, completed: boolean): BrowserAppState {
  return validateBrowserAppState({ ...state, onboardingCompleted: completed });
}

export function saveBrowserCheckpoint(state: BrowserAppState, run: unknown): BrowserAppState {
  if (run === null) return { ...state, savedRun: null };
  const validated = validateBrowserSavedRun(run);
  return validated ? { ...state, savedRun: validated } : state;
}

export function recordBrowserResult(state: BrowserAppState, value: unknown): BrowserAppState {
  const result = record(value);
  const map = APP_MAPS.find((item) => item.id === result.mapId);
  if (!map || !GAME_CARS.some((car) => car.id === result.carId) || typeof result.time !== 'number' || !Number.isFinite(result.time) || result.time <= 0 || result.time > 604800) return state;
  const level = levelChoice(result.level, state.config.level);
  const key = browserRecordKey(map.id, String(result.carId), level);
  const existing = state.completedLevels[map.id] ?? [];
  const nextCompleted = existing.includes(level) ? existing : [...existing, level].sort((a, b) => a - b);
  return {
    ...state,
    savedRun: null,
    completedLevels: { ...state.completedLevels, [map.id]: nextCompleted },
    bestTimes: { ...state.bestTimes, [key]: Math.min(state.bestTimes[key] ?? Infinity, result.time) },
  };
}

export function countTotalCompletions(state: BrowserAppState): number {
  return APP_MAPS.reduce((sum, map) => sum + (state.completedLevels[map.id]?.length ?? 0), 0);
}

export function loadBrowserAppState(storage?: Pick<Storage, 'getItem'>): BrowserAppState {
  try {
    if (!storage && typeof window !== 'undefined' && window.WindwayAndroidHost) {
      const nativeRaw = window.WindwayAndroidHost.loadState();
      if (nativeRaw && nativeRaw.length <= 65536) return validateBrowserAppState(JSON.parse(nativeRaw));
    }
    const target = storage ?? window.localStorage;
    const raw = target.getItem(BROWSER_APP_STORAGE_KEY) ?? target.getItem(LEGACY_STORAGE_KEY);
    return raw && raw.length <= 65536 ? validateBrowserAppState(JSON.parse(raw)) : defaultBrowserAppState();
  } catch { return defaultBrowserAppState(); }
}

export function persistBrowserAppState(state: BrowserAppState, storage?: Pick<Storage, 'setItem'>): boolean {
  const serialized = JSON.stringify(validateBrowserAppState(state));
  let nativeSaved = true;
  if (!storage && typeof window !== 'undefined' && window.WindwayAndroidHost) {
    try { nativeSaved = Boolean(window.WindwayAndroidHost.saveState(serialized)); } catch { nativeSaved = false; }
  }
  try {
    (storage ?? window.localStorage).setItem(BROWSER_APP_STORAGE_KEY, serialized);
    return nativeSaved;
  } catch {
    return typeof window !== 'undefined' && Boolean(window.WindwayAndroidHost) ? nativeSaved : false;
  }
}
