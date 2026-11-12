import { neutralInput, type DrivingInput } from './driving';
export const drivingInput = neutralInput();
const map: Record<string, Exclude<keyof DrivingInput, 'steering'>> = { KeyW: 'throttle', ArrowUp: 'throttle', KeyS: 'brake', ArrowDown: 'brake', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'handbrake' };
const held = new Set<string>();
export function clearInput() { held.clear(); Object.assign(drivingInput, neutralInput()); delete drivingInput.steering; }
export function installDrivingInput(onPause: () => void, onReset: () => void, onCamera: () => void, enabled: () => boolean = () => true) {
  const sync = () => { Object.assign(drivingInput, neutralInput()); delete drivingInput.steering; held.forEach((code) => { if (map[code]) drivingInput[map[code]] = true; }); };
  const down = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement)?.matches('input,select,textarea,[contenteditable="true"]')) return;
    if (!enabled()) { release(); if (event.code === 'Escape' || event.code === 'KeyP') onPause(); return; }
    if (map[event.code]) { event.preventDefault(); held.add(event.code); sync(); }
    if (!event.repeat) {
      if (event.code === 'Escape' || event.code === 'KeyP') onPause();
      if (event.code === 'KeyR') onReset();
      if (event.code === 'KeyC') onCamera();
    }
  };
  const up = (event: KeyboardEvent) => { held.delete(event.code); if (enabled()) sync(); else clearInput(); };
  const release = () => { held.clear(); clearInput(); };
  window.addEventListener('keydown', down); window.addEventListener('keyup', up);
  window.addEventListener('blur', release); document.addEventListener('visibilitychange', release);
  return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', release); release(); };
}
