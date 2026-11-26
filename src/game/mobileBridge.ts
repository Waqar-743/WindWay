import { useSyncExternalStore } from 'react';
import { useGame, type RaceStatus, type ResumeRun } from './store';
import { GAME_CARS, PAINTS } from './config';
import { GAME_MAPS, gameRecordKey, mapById } from './maps';
import { CHECKPOINTS } from './track';
import { checkpointCount, LEVELS, levelById } from './levels';
import { clearInput, drivingInput } from './input';
import { gameAudio } from './audio';

export interface MobileConfig {
  steeringMode: 'arrows' | 'wheel' | 'tilt';
  character: 'waqar' | 'imran' | 'tatheer' | 'snowman';
  cameraMode: 'chase' | 'hood';
  sensitivity: number;
}
export interface SavedRun extends ResumeRun { version: 1; mapId: string; carId: string; level?: number }
interface NativeAPI {
  configure: (config: Record<string, unknown>) => void;
  start: (options?: { resume?: unknown }) => void;
  command: (command: string) => void;
  steer: (value: number) => void;
}
export interface WindwayAndroidHostAPI {
  loadState: () => string | null;
  saveState: (json: string) => boolean;
  setTiltActive: (active: boolean, sensitivity: number, inverted: boolean) => void;
  calibrateTilt: () => void;
  haptic: (kind: string) => void;
  setKeepScreenOn: (enabled: boolean) => void;
  getDeviceInfo: () => string;
  exitApp: () => void;
}
declare global {
  interface Window {
    WindwayNative?: { postMessage: (message: string) => void };
    WindwayMobile?: NativeAPI;
    WindwayAndroidHost?: WindwayAndroidHostAPI;
    onWindwayTilt?: (value: number) => void;
    onWindwayBack?: () => void;
    onWindwayLifecycle?: (event: string) => void;
  }
}
let config: MobileConfig = { steeringMode: 'arrows', character: 'waqar', cameraMode: 'chase', sensitivity: 1 };
const listeners = new Set<() => void>();
export const isNativeGame = () => typeof window !== 'undefined' && !!window.WindwayNative
  && new URLSearchParams(window.location.search).get('native') === '1';
export function useMobileConfig() {
  return useSyncExternalStore((callback) => { listeners.add(callback); return () => { listeners.delete(callback); }; }, () => config, () => config);
}
function post(message: Record<string, unknown>) {
  try { window.WindwayNative?.postMessage(JSON.stringify(message)); } catch { /* Native host may be tearing down. */ }
}
function number(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
/** Saves resume at an earned checkpoint only, never at an unsafe world position. */
export function validateSavedRun(value: unknown): SavedRun | null {
  if (!value || typeof value !== 'object') return null;
  const run = value as Record<string, unknown>;
  if (run.version !== 1 || !GAME_MAPS.some((map) => map.id === run.mapId) || !GAME_CARS.some((car) => car.id === run.carId)) return null;
  const hasLevel = run.level !== undefined;
  if (hasLevel && (typeof run.level !== 'number' || !Number.isInteger(run.level) || run.level < 0 || run.level >= LEVELS.length)) return null;
  const level = hasLevel ? Number(run.level) : 0;
  const map = mapById(String(run.mapId));
  const maxGate = checkpointCount(map.mode === 'ascent', level) - (map.mode === 'ascent' ? 2 : 1);
  for (const [key, max] of [['checkpoint', maxGate], ['lap', map.laps], ['resets', 1000000]] as const) {
    if (typeof run[key] !== 'number' || !Number.isInteger(run[key]) || run[key] < (key === 'lap' ? 1 : 0) || run[key] > max) return null;
  }
  if (typeof run.elapsed !== 'number' || !Number.isFinite(run.elapsed) || run.elapsed < 0 || run.elapsed > 86400 * 7) return null;
  const validated: SavedRun = { version: 1, mapId: String(run.mapId), carId: String(run.carId), checkpoint: Number(run.checkpoint), lap: Number(run.lap), elapsed: run.elapsed, resets: Number(run.resets) };
  if (level > 0) validated.level = level;
  return validated;
}
export function installMobileBridge() {
  if (!isNativeGame()) return () => {};
  let started = false, lastSave = '', savedAt = -Infinity, previousStatus = '', previousPage = '';
  let suspended: RaceStatus | null = null, pauseWhenReady = false, previousError: string | null = null;
  let lastCheckpoint = 0, lastBoosting = false;
  document.body.classList.add('windway-native');
  const save = (force = false) => {
    const state = useGame.getState();
    if (!started || !['loading', 'countdown', 'running', 'paused', 'recovering'].includes(state.status)) return;
    const { checkpoint, lap, elapsed, resets } = state.telemetry;
    const candidate: Record<string, unknown> = { version: 1, mapId: state.selectedMap, carId: state.selectedCar, checkpoint, lap, elapsed, resets };
    if (state.selectedLevel > 0) candidate.level = state.selectedLevel;
    const run = validateSavedRun(candidate);
    if (!run) return;
    const key = `${run.mapId}:${run.carId}:${run.level ?? 0}:${checkpoint}:${lap}:${resets}`;
    if (!force && key === lastSave && performance.now() - savedAt < 2000) return;
    lastSave = key; savedAt = performance.now(); post({ type: 'save', run });
  };
  const api: NativeAPI = {
    configure: (incoming) => {
      if (!incoming || typeof incoming !== 'object') return;
      const state = useGame.getState();
      const choicesUnlocked = ['idle', 'finished'].includes(state.status);
      if (choicesUnlocked && GAME_MAPS.some((map) => map.id === incoming.mapId)) state.selectMap(String(incoming.mapId));
      if (choicesUnlocked && incoming.level !== undefined && LEVELS.some((lvl) => lvl.id === Number(incoming.level))) state.selectLevel(levelById(incoming.level).id);
      if (choicesUnlocked && GAME_CARS.some((car) => car.id === incoming.carId)) state.selectCar(String(incoming.carId));
      if (choicesUnlocked && PAINTS.some((paint) => paint.hex === incoming.paint)) state.setPaint(String(incoming.paint));
      config = {
        steeringMode: ['arrows', 'wheel', 'tilt'].includes(String(incoming.steeringMode)) ? incoming.steeringMode as MobileConfig['steeringMode'] : config.steeringMode,
        character: ['waqar', 'imran', 'tatheer', 'snowman'].includes(String(incoming.character)) ? incoming.character as MobileConfig['character'] : config.character,
        cameraMode: ['chase', 'hood'].includes(String(incoming.cameraMode)) ? incoming.cameraMode as MobileConfig['cameraMode'] : config.cameraMode,
        sensitivity: number(incoming.sensitivity, 0.5, 1.5, config.sensitivity),
      };
      clearInput();
      if (incoming.bestTimes && typeof incoming.bestTimes === 'object') {
        const records = incoming.bestTimes as Record<string, unknown>;
        const bestTimes = { ...state.bestTimes };
        for (const map of GAME_MAPS) for (const car of GAME_CARS) for (const lvl of LEVELS) {
          const key = gameRecordKey(map.id, car.id, lvl.id);
          const value = records[key];
          if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 604800) bestTimes[key] = Math.min(bestTimes[key] ?? Infinity, value);
        }
        useGame.setState({ bestTimes });
      }
      if (incoming.completedLevels && typeof incoming.completedLevels === 'object') {
        const raw = incoming.completedLevels as Record<string, unknown>;
        const completedLevels: Record<string, number[]> = { ...state.completedLevels };
        for (const map of GAME_MAPS) {
          const items = raw[map.id];
          if (Array.isArray(items)) {
            completedLevels[map.id] = [...new Set([...(completedLevels[map.id] ?? []), ...items.filter((v): v is number => typeof v === 'number' && LEVELS.some((lvl) => lvl.id === v))])].sort((a, b) => a - b);
          }
        }
        useGame.setState({ completedLevels });
      }
      state.updateSettings({ quality: ['auto', 'low', 'high'].includes(String(incoming.quality)) ? incoming.quality as 'auto' | 'low' | 'high' : state.settings.quality,
        effects: typeof incoming.effects === 'boolean' ? incoming.effects : state.settings.effects,
        reducedMotion: typeof incoming.reducedMotion === 'boolean' ? incoming.reducedMotion : state.settings.reducedMotion,
        sound: number(incoming.sound, 0, 1, state.settings.sound), music: 0, sensitivity: 1 });
      if (incoming.cameraMode === 'hood' || incoming.cameraMode === 'chase') useGame.setState({ cameraMode: config.cameraMode });
      document.body.dataset.steering = config.steeringMode;
      listeners.forEach((notify) => notify());
    },
    start: (options) => {
      clearInput();
      const resume = validateSavedRun(options?.resume);
      const state = useGame.getState();
      // Only the native host can select the bundled configuration before a run.
      state.navigate('home');
      if (resume) {
        state.selectMap(resume.mapId);
        state.selectLevel(resume.level ?? 0);
        state.selectCar(resume.carId);
      }
      started = true; lastSave = ''; savedAt = -Infinity;
      suspended = null; pauseWhenReady = false; previousError = null;
      lastCheckpoint = resume?.checkpoint ?? 0; lastBoosting = false;
      state.startRace(resume ? { checkpoint: resume.checkpoint, lap: resume.lap, elapsed: resume.elapsed, resets: resume.resets } : undefined);
      useGame.setState({ cameraMode: config.cameraMode });
      void gameAudio.unlock();
    },
    command: (command) => {
      const state = useGame.getState();
      if (command === 'pause') {
        clearInput();
        if (state.status === 'loading') pauseWhenReady = true;
        else if (['running', 'countdown', 'recovering'].includes(state.status)) { suspended = state.status; useGame.setState({ status: 'paused' }); }
        save(true);
      }
      else if (command === 'resume') { clearInput(); pauseWhenReady = false; void gameAudio.unlock(); if (state.status === 'paused' && suspended) { useGame.setState({ status: suspended, page: 'race' }); suspended = null; } else state.resume(); }
      else if (command === 'restart') { clearInput(); suspended = null; pauseWhenReady = false; previousError = null; lastCheckpoint = 0; lastBoosting = false; void gameAudio.unlock(); state.startRace(); useGame.setState({ cameraMode: config.cameraMode }); }
      else if (command === 'nextLevel') {
        clearInput(); suspended = null; pauseWhenReady = false; previousError = null; lastCheckpoint = 0; lastBoosting = false;
        const nextLevel = Math.min(LEVELS.length - 1, state.selectedLevel + 1);
        state.navigate('home');
        state.selectLevel(nextLevel);
        post({ type: 'level', level: nextLevel });
        void gameAudio.unlock();
        state.startRace();
        useGame.setState({ cameraMode: config.cameraMode });
      }
      else if (command === 'recover') { state.resetCar(); post({ type: 'haptic', kind: 'tap' }); }
      else if (command === 'camera') { state.toggleCamera(); post({ type: 'haptic', kind: 'tap' }); }
      else if (command === 'calibrate') { clearInput(); post({ type: 'calibrate' }); }
      else if (command === 'menu') { save(true); clearInput(); started = false; state.navigate('home'); post({ type: 'exit' }); }
    },
    steer: (value) => {
      if (config.steeringMode !== 'tilt' || useGame.getState().status !== 'running') { delete drivingInput.steering; return; }
      drivingInput.steering = number(value, -1, 1, 0);
    },
  };
  window.WindwayMobile = api;
  const unsubscribe = useGame.subscribe((state) => {
    if (!started) return;
    if (state.error && state.error !== previousError) { previousError = state.error; post({ type: 'error', message: state.error }); }
    if (pauseWhenReady && state.status === 'countdown') { pauseWhenReady = false; suspended = 'countdown'; useGame.setState({ status: 'paused' }); return; }
    if (state.status === 'running') {
      if (state.telemetry.checkpoint > lastCheckpoint) {
        lastCheckpoint = state.telemetry.checkpoint;
        post({ type: 'haptic', kind: 'gate' });
      }
      if (state.telemetry.boosting && !lastBoosting) post({ type: 'haptic', kind: 'boost' });
      lastBoosting = state.telemetry.boosting;
    }
    if (state.status !== previousStatus || state.page !== previousPage) {
      const wasFinished = previousStatus === 'finished';
      previousStatus = state.status; previousPage = state.page;
      post({ type: 'state', status: state.status, page: state.page });
      if (state.status === 'recovering') post({ type: 'haptic', kind: 'impact' });
      if (state.status !== 'running') { clearInput(); save(true); }
      if (state.status === 'finished' && !wasFinished) {
        post({ type: 'haptic', kind: 'finish' });
        post({ type: 'finished', result: { ...state.result, carId: state.selectedCar, level: state.selectedLevel } });
      }
      if (['home', 'garage'].includes(state.page)) { started = false; post({ type: 'exit' }); }
    }
    if (state.telemetry.checkpoint < CHECKPOINTS.length) save();
  });
  const background = () => { if (document.visibilityState === 'hidden') api.command('pause'); };
  document.addEventListener('visibilitychange', background);
  const unlock = () => { void gameAudio.unlock(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  post({ type: 'ready', protocol: 1 });
  return () => { save(true); clearInput(); unsubscribe(); document.removeEventListener('visibilitychange', background); window.removeEventListener('pointerdown', unlock); if (window.WindwayMobile === api) delete window.WindwayMobile; document.body.classList.remove('windway-native'); };
}
