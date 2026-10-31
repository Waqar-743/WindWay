import { create } from 'zustand';
import { GAME_CARS, PAINTS, carById } from './config';
import type { RecoveryReason } from './vehiclePhysics';
import { GAME_MAPS, activateMap, gameRecordKey, mapById } from './maps';
import { START } from './track';
import { LEVELS, levelById } from './levels';

export type Page = 'home' | 'garage' | 'map' | 'settings' | 'howto' | 'race' | 'results';
export type RaceStatus = 'idle' | 'loading' | 'countdown' | 'running' | 'recovering' | 'paused' | 'finished';
export interface Settings {
  sound: number; music: number; quality: 'auto' | 'low' | 'high'; sensitivity: number;
  effects: boolean; reducedMotion: boolean;
}
interface Preferences { selectedCar: string; selectedMap: string; selectedLevel: number; completedLevels: Record<string, number[]>; paint: string; settings: Settings; bestTimes: Record<string, number> }
const defaults: Settings = { sound: 0.55, music: 0.2, quality: 'auto', sensitivity: 1, effects: true, reducedMotion: false };

function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem('wildway-preferences-v1') ?? '{}');
    const settings = { ...defaults, ...saved.settings };
    settings.sound = Math.max(0, Math.min(1, Number(settings.sound) || 0));
    settings.music = Math.max(0, Math.min(1, Number(settings.music) || 0));
    settings.sensitivity = Math.max(0.5, Math.min(1.5, Number(settings.sensitivity) || 1));
    if (!['auto', 'low', 'high'].includes(settings.quality)) settings.quality = 'auto';
    settings.effects = typeof settings.effects === 'boolean' ? settings.effects : true;
    settings.reducedMotion = typeof settings.reducedMotion === 'boolean' ? settings.reducedMotion : false;
    return {
      selectedCar: carById(saved.selectedCar).id,
      selectedMap: mapById(saved.selectedMap).id,
      selectedLevel: levelById(saved.selectedLevel).id,
      completedLevels: Object.fromEntries(GAME_MAPS.map(map => [map.id, Array.isArray(saved.completedLevels?.[map.id]) ? [...new Set<number>(saved.completedLevels[map.id].filter((id: unknown) => LEVELS.some(level => level.id === id)))] : []])),
      paint: PAINTS.some((paint) => paint.hex === saved.paint) ? saved.paint : PAINTS[0].hex,
      settings,
      bestTimes: Object.fromEntries(Object.entries(saved.bestTimes ?? {}).filter(([id, time]) => GAME_MAPS.some((map) => GAME_CARS.some((car) => LEVELS.some(level => gameRecordKey(map.id, car.id, level.id) === id))) && typeof time === 'number' && time > 0 && Number.isFinite(time)).map(([id, time]) => [id, Number(time)])),
    };
  } catch { return { selectedCar: GAME_CARS[0].id, selectedMap: 'alpine', selectedLevel: 0, completedLevels: {}, paint: PAINTS[0].hex, settings: defaults, bestTimes: {} }; }
}
function persistPreferences(state: Preferences) {
  try { localStorage.setItem('wildway-preferences-v1', JSON.stringify({ selectedCar: state.selectedCar, selectedMap: state.selectedMap, selectedLevel: state.selectedLevel, completedLevels: state.completedLevels, paint: state.paint, settings: state.settings, bestTimes: state.bestTimes })); } catch { /* The game remains playable without browser storage. */ }
}

export interface Telemetry {
  speed: number; elapsed: number; lap: number; checkpoint: number; progress: number; x: number; z: number;
  drifting: boolean; airborne: boolean; boosting: boolean; resets: number;
  altitude?: number; surface?: 'dry' | 'packed-snow' | 'black-ice';
}
const emptyTelemetry: Telemetry = { speed: 0, elapsed: 0, lap: 1, checkpoint: 0, progress: 0, x: 0, z: 119, drifting: false, airborne: false, boosting: false, resets: 0 };
const emptyRun = (): Telemetry => ({ ...emptyTelemetry, x: START.point.x, z: START.point.z, altitude: START.point.y, surface: mapById(preferences.selectedMap).mode === 'ascent' ? 'packed-snow' : 'dry' });

interface GameState extends Preferences {
  page: Page; returnPage: Page; status: RaceStatus; countdown: number; ready: boolean;
  runId: number; resetRequest: number; cameraMode: 'chase' | 'hood'; error: string | null;
  telemetry: Telemetry; result: { time: number; previousBest: number | null; newBest: boolean; resets: number; mapId: string; laps: number; level: number } | null;
  reaction: { text: string; character: string; until: number } | null;
  recovery: { reason: RecoveryReason; checkpoint: number; remaining: number } | null;
  navigate: (page: Page) => void;
  selectCar: (id: string) => void; setPaint: (hex: string) => void;
  selectMap: (id: string) => void;
  selectLevel: (id: number) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  startRace: () => void; setReady: (ready: boolean) => void; setError: (error: string | null) => void;
  startCountdown: () => void; tickCountdown: () => void; pause: () => void; resume: () => void;
  resetCar: () => void; finish: (time: number, resets: number) => void;
  beginRecovery: (reason: RecoveryReason, checkpoint: number) => void; tickRecovery: (dt: number) => void;
  updateTelemetry: (telemetry: Telemetry) => void;
  react: (text: string, character?: string) => void; toggleCamera: () => void;
}

const preferences = loadPreferences();
// A shareable preview link may choose a map without discarding saved cars or records.
if (typeof window !== 'undefined') {
  const previewMap = new URLSearchParams(window.location.search).get('map');
  if (GAME_MAPS.some((map) => map.id === previewMap)) preferences.selectedMap = previewMap!;
}
if (typeof window !== 'undefined') {
  const previewLevel = new URLSearchParams(window.location.search).get('level');
  if (previewLevel !== null && /^[0-5]$/.test(previewLevel)) preferences.selectedLevel = Number(previewLevel);
}
activateMap(preferences.selectedMap, preferences.selectedLevel);

export const useGame = create<GameState>((set, get) => ({
  ...preferences, page: 'home', returnPage: 'home', status: 'idle', countdown: 3,
  ready: false, runId: 0, resetRequest: 0, cameraMode: 'chase', error: null,
  telemetry: emptyRun(), result: null, reaction: null, recovery: null,
  navigate: (page) => {
    const state = get();
    if (page === 'settings' || page === 'howto') {
      set({ returnPage: state.page, page, ...(state.page === 'race' ? { status: 'paused' as const } : {}) });
    } else {
      set({ page, ...(page !== 'race' && page !== 'results' ? { status: 'idle' as const, reaction: null, recovery: null } : {}) });
    }
  },
  selectCar: (id) => { const car = carById(id); if (car.id === get().selectedCar) return; set({ selectedCar: car.id, ready: false, paint: car.color, error: null }); persistPreferences(get()); },
  selectMap: (id) => {
    const state = get(), map = mapById(id);
    if (map.id === state.selectedMap || ['loading', 'countdown', 'running', 'recovering', 'paused'].includes(state.status)) return;
    activateMap(map.id, state.selectedLevel);
    set({ selectedMap: map.id, ready: false, status: 'idle', page: state.page === 'results' ? 'map' : state.page,
      runId: state.runId + 1, telemetry: { ...emptyRun(), surface: map.mode === 'ascent' ? 'packed-snow' : 'dry' }, result: null, reaction: null, recovery: null, error: null });
    persistPreferences(get());
  },
  selectLevel: (id) => {
    const state = get(), level = levelById(id);
    if (level.id === state.selectedLevel || ['loading', 'countdown', 'running', 'recovering', 'paused'].includes(state.status)) return;
    activateMap(state.selectedMap, level.id);
    set({ selectedLevel: level.id, ready: false, status: 'idle', runId: state.runId + 1,
      page: state.page === 'results' ? 'map' : state.page, result: null, telemetry: emptyRun(), reaction: null, recovery: null, error: null });
    persistPreferences(get());
  },
  setPaint: (paint) => { set({ paint }); persistPreferences(get()); },
  updateSettings: (settings) => { set({ settings: { ...get().settings, ...settings } }); persistPreferences(get()); },
  startRace: () => set((state) => ({ page: 'race', status: 'loading', countdown: 3, runId: state.runId + 1, resetRequest: 0, telemetry: { ...emptyRun(), surface: mapById(state.selectedMap).mode === 'ascent' ? 'packed-snow' : 'dry' }, result: null, reaction: null, recovery: null, cameraMode: 'chase', error: null })),
  setReady: (ready) => set({ ready }),
  setError: (error) => set({ error }),
  startCountdown: () => { if (get().status === 'loading') set({ status: 'countdown', countdown: 3 }); },
  tickCountdown: () => { const state = get(); if (state.status !== 'countdown') return; if (state.countdown <= 1) set({ countdown: 0, status: 'running' }); else set({ countdown: state.countdown - 1 }); },
  pause: () => { if (get().status === 'running') set({ status: 'paused' }); },
  resume: () => { if (get().status === 'paused') set({ status: 'running', page: 'race' }); },
  resetCar: () => { if (get().status === 'running') set((state) => ({ resetRequest: state.resetRequest + 1 })); },
  beginRecovery: (reason, checkpoint) => {
    if (get().status !== 'running') return;
    set({ status: 'recovering', recovery: { reason, checkpoint, remaining: 1.2 }, reaction: null, telemetry: { ...get().telemetry, speed: 0, airborne: false, boosting: false, drifting: false } });
  },
  tickRecovery: (dt) => {
    const state = get();
    if (state.status !== 'recovering' || !state.recovery || !Number.isFinite(dt) || dt <= 0) return;
    const elapsed = Math.min(dt, state.recovery.remaining);
    const remaining = Math.max(0, state.recovery.remaining - elapsed);
    set({ telemetry: { ...state.telemetry, elapsed: state.telemetry.elapsed + elapsed },
      ...(remaining < 0.0001 ? { status: 'running' as const, recovery: null } : { recovery: { ...state.recovery, remaining } }),
    });
  },
  finish: (time, resets) => {
    const state = get();
    if (state.status !== 'running') return;
    const map = mapById(state.selectedMap), key = gameRecordKey(map.id, state.selectedCar, state.selectedLevel);
    const previousBest = state.bestTimes[key] ?? null;
    const newBest = previousBest === null || time < previousBest;
    set({ status: 'finished', page: 'results', result: { time, previousBest, newBest, resets, mapId: map.id, laps: map.laps, level: state.selectedLevel },
      completedLevels: { ...state.completedLevels, [map.id]: [...new Set([...(state.completedLevels[map.id] ?? []), state.selectedLevel])].sort((a, b) => a - b) }, bestTimes: newBest ? { ...state.bestTimes, [key]: time } : state.bestTimes });
    persistPreferences(get());
  },
  updateTelemetry: (telemetry) => set({ telemetry }),
  react: (text, character) => set({ reaction: { text, character: character ?? mapById(get().selectedMap).character, until: performance.now() + 3200 } }),
  toggleCamera: () => set((state) => ({ cameraMode: state.cameraMode === 'chase' ? 'hood' : 'chase' })),
}));
