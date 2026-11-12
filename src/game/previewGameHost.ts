import type {} from './mobileBridge';

const commands = new Set(['pause', 'resume', 'restart', 'recover', 'camera', 'calibrate', 'menu']);
const messages = new Set(['ready', 'state', 'save', 'finished', 'exit', 'calibrate', 'error']);

type PreviewCommand =
  | { source: 'windway-app'; type: 'configure'; config: Record<string, unknown> }
  | { source: 'windway-app'; type: 'start'; resume?: unknown }
  | { source: 'windway-app'; type: 'command'; command: string };

/** Only the containing app can control this explicitly requested game frame. */
export function isTrustedPreviewCommand(
  event: { origin: string; source: unknown; data: unknown },
  origin: string,
  parentSource: unknown,
): event is { origin: string; source: unknown; data: PreviewCommand } {
  if (event.origin !== origin || !parentSource || event.source !== parentSource) return false;
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return false;
  const value = event.data as Record<string, unknown>;
  if (value.source !== 'windway-app') return false;
  if (value.type === 'configure') return !!value.config && typeof value.config === 'object' && !Array.isArray(value.config);
  if (value.type === 'start') return true;
  return value.type === 'command' && typeof value.command === 'string' && commands.has(value.command);
}

/** Browser counterpart of the Android channel, restricted to a same-origin
 * child frame. Loading the frame alone never starts or resumes a drive. */
export function installPreviewGameHost(target: Window = window): () => void {
  const query = new URLSearchParams(target.location.search);
  if (query.get('native') !== '1' || query.get('previewGame') !== '1'
    || target.parent === target || target.WindwayNative) return () => {};
  const origin = target.location.origin;
  try {
    if (target.parent.location.origin !== origin) return () => {};
  } catch { return () => {}; }

  const channel = {
    postMessage(raw: string) {
      if (typeof raw !== 'string' || raw.length > 32768) return;
      try {
        const message = JSON.parse(raw) as Record<string, unknown> | null;
        if (!message || typeof message !== 'object' || !messages.has(String(message.type))) return;
        target.parent.postMessage({ source: 'windway-game', message }, origin);
      } catch { /* A malformed engine message cannot navigate the containing app. */ }
    },
  };
  const receive = (event: MessageEvent) => {
    if (!isTrustedPreviewCommand(event, origin, target.parent)) return;
    const api = target.WindwayMobile;
    if (!api) return;
    const message = event.data;
    if (message.type === 'configure') api.configure(message.config);
    else if (message.type === 'start') api.start({ resume: message.resume });
    else api.command(message.command);
  };
  target.WindwayNative = channel;
  target.addEventListener('message', receive);
  return () => {
    target.removeEventListener('message', receive);
    if (target.WindwayNative === channel) delete target.WindwayNative;
  };
}
