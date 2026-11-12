interface DeviceHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

export interface RenderQuality {
  dpr: [number, number];
  shadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
  prefetch: boolean;
}

export function getRenderQuality(): RenderQuality {
  const device = navigator as DeviceHints;
  const touchDevice = window.matchMedia('(pointer: coarse)').matches;
  const lowMemory = device.deviceMemory !== undefined && device.deviceMemory <= 4;
  const lowCpu = device.hardwareConcurrency !== undefined && device.hardwareConcurrency <= 4;
  const constrained = lowMemory || lowCpu || !!device.connection?.saveData;
  const veryLimited = (device.deviceMemory !== undefined && device.deviceMemory <= 2)
    || (device.hardwareConcurrency !== undefined && device.hardwareConcurrency <= 2);
  const fastConnection = device.connection?.effectiveType === '4g';

  return {
    // A touch screen alone does not imply a weak GPU. Keep mobile cars and
    // road markings sharp; auto mode can reduce resolution under real load.
    dpr: constrained ? [1, 1.15] : touchDevice ? [1, 1.35] : [1, 1.5],
    shadows: !veryLimited,
    shadowMapSize: constrained ? 512 : 1024,
    antialias: !veryLimited,
    // Unknown connections load only the selected car. Even capable devices
    // should not compete with interaction or hidden tabs for bandwidth.
    prefetch: !constrained && fastConnection && document.visibilityState === 'visible',
  };
}
