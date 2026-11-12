/** Conservative resolution changes only; physics and interface pixels stay intact. */
export function mobileResolution(current: number, fps: number, healthyWindows: number, maximum = 1, minimum = 0.65) {
  if (!Number.isFinite(fps) || fps <= 0) return { dpr: current, healthyWindows: 0 };
  if (fps < 42) return { dpr: Math.max(minimum, Math.round(current * 0.9 * 100) / 100), healthyWindows: 0 };
  const healthy = fps > 57 ? healthyWindows + 1 : 0;
  return healthy >= 3 ? { dpr: Math.min(maximum, Math.round((current + 0.1) * 100) / 100), healthyWindows: 0 }
    : { dpr: current, healthyWindows: healthy };
}
