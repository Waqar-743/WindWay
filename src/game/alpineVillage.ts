import { ROAD_WIDTH, TRACK_LENGTH, nearestTrackPoint, seededRandom, trackFrame } from './track';

export type TownPosition = [number, number, number];
export interface TownSite {
  id: string; kind: 'house' | 'shop' | 'apartment' | 'station' | 'fuel';
  position: TownPosition; yaw: number; width: number; depth: number; height: number;
  plotWidth: number; plotDepth: number; color: string; roof: string; side: number; progress: number;
}
export interface TownPart { position: TownPosition; scale: TownPosition; rotation: number; color: string }
export interface TownSign { position: TownPosition; yaw: number; width: number; label: string; color: string }
const walls = ['#efdab7', '#d7e3df', '#e8bda8', '#ebd797', '#b5cbd3', '#cfdbb4'];
const roofs = ['#aa624e', '#566c77', '#b8775a', '#64766c'];

export function townPosition(site: TownSite, x: number, y: number, z: number): TownPosition {
  const c = Math.cos(site.yaw), s = Math.sin(site.yaw);
  return [site.position[0] + x * c + z * s, site.position[1] + y, site.position[2] - x * s + z * c];
}

/** Stable, road-relative lots keep both streetsides populated on the longer loop. */
export function buildAlpineTown(): TownSite[] {
  const random = seededRandom(71832), sites: TownSite[] = [];
  function place(kind: TownSite['kind'], progress: number, side: number, index: number) {
    const frame = trackFrame(progress);
    const width = kind === 'station' ? 30 : kind === 'fuel' ? 25 : kind === 'shop' ? 14 : kind === 'apartment' ? 15 : 9 + random() * 3;
    const depth = kind === 'station' ? 15 : kind === 'fuel' ? 21 : 10 + random() * 3;
    const height = kind === 'station' ? 8 : kind === 'fuel' ? 5.5 : kind === 'apartment' ? 12 + random() * 5 : kind === 'shop' ? 8 : 5 + random() * 2.5;
    const center = frame.point.clone().addScaledVector(frame.right, side * (ROAD_WIDTH / 2 + 10 + depth / 2));
    const site: TownSite = { id: 'alpine-lot-' + index + '-' + side, kind, progress, side,
      position: [center.x, frame.point.y - 0.18, center.z], yaw: frame.yaw - side * Math.PI / 2,
      width, depth, height, plotWidth: kind === 'station' ? 62 : width + 5,
      plotDepth: kind === 'station' ? depth + 23 : depth + 10,
      color: walls[index % walls.length], roof: roofs[index % roofs.length] };
    // The station's platform and tracks extend behind the facade.
    const back = kind === 'station' ? -4 - site.plotDepth / 2 : -site.plotDepth / 2;
    for (const x of [-site.plotWidth / 2, 0, site.plotWidth / 2]) {
      for (const z of [back, 0, depth / 2 + 5]) {
        const p = townPosition(site, x, 0, z);
        if (Math.abs(p[2]) < 40 || nearestTrackPoint(p[0], p[2]).distance < ROAD_WIDTH / 2 + 2) return;
      }
    }
    if (sites.some((other) => Math.hypot(other.position[0] - center.x, other.position[2] - center.z) < (site.plotWidth + other.plotWidth) / 2 + 5)) return;
    sites.push(site);
  }
  place('station', 0.49, 1, 100);
  place('fuel', 0.72, -1, 101);
  const count = Math.floor(TRACK_LENGTH / 33);
  for (let i = 0; i < count; i++) {
    if (i % 13 > 9) continue;
    for (const side of [-1, 1]) {
      const kind = i % 9 < 3 ? 'shop' : i % 7 === 4 ? 'apartment' : 'house';
      place(kind, (i + 0.3) / count, side, i);
    }
  }
  return sites;
}

export function isTownLot(x: number, z: number, sites: TownSite[], margin = 5) {
  return sites.some((site) => {
    const dx = x - site.position[0], dz = z - site.position[2], c = Math.cos(site.yaw), s = Math.sin(site.yaw);
    return Math.abs(dx * c - dz * s) < site.plotWidth / 2 + margin && Math.abs(dx * s + dz * c + 4) < site.plotDepth / 2 + margin + 4;
  });
}

/** Small details share instanced geometry, including on the mobile quality tier. */
export function buildTownParts(sites: TownSite[]) {
  const boxes: TownPart[] = [], gables: TownPart[] = [], crowns: TownPart[] = [], signs: TownSign[] = [];
  for (const site of sites) {
    const { width: w, depth: d, height: h, kind } = site;
    const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string) => boxes.push({ position: townPosition(site, x, y, z), scale: [sx, sy, sz], rotation: site.yaw, color });
    const sign = (label: string, x: number, y: number, z: number, width: number, color = '#315a60') => signs.push({ label, position: townPosition(site, x, y, z), yaw: site.yaw, width, color });
    const roof = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => gables.push({ position: townPosition(site, x, y, z), scale: [sx, sy, sz], rotation: site.yaw, color: site.roof });
    // Solid retaining plinths meet the elevated road rather than floating over the valley.
    const foundationHeight = Math.max(0.5, site.position[1] + 0.5);
    box(0, -foundationHeight / 2, kind === 'station' ? -4 : 0, site.plotWidth, foundationHeight, site.plotDepth, '#adb3a0');
    box(0, -0.08, kind === 'station' ? -4 : 0, site.plotWidth, 0.18, site.plotDepth, kind === 'fuel' ? '#b6b8ad' : '#d4cbb8');
    box(0, 0.02, d / 2 + 3, w + 5, 0.2, 3.5, '#e8dfcc');
    if (kind === 'fuel') {
      // Rear shop, canopy, four pumps and a tall roadside price sign.
      box(0, 2.5, -d / 2 + 3, w - 3, 5, 6, '#eee0bc');
      box(0, 4.9, -d / 2 + 6.05, w - 2, 0.65, 0.24, '#3e8285');
      box(0, 2.4, -d / 2 + 6.08, 14, 2.8, 0.12, '#547e8a');
      box(0, 6.5, 2, w + 1, 0.75, 12, '#f2e6cd');
      box(0, 6.5, 8.05, w + 1, 0.55, 0.18, '#d87958');
      for (const x of [-9, 9]) box(x, 3.1, 2, 0.45, 6.2, 0.45, '#49666d');
      for (const x of [-5, 5]) for (const z of [-0.8, 4.2]) {
        box(x, 0.16, z, 3, 0.3, 2.2, '#dfd9c9');
        box(x, 1.15, z, 1.05, 2, 0.7, '#d87958');
        box(x, 1.7, z + 0.38, 0.76, 0.65, 0.08, '#294a54');
        box(x + 0.68, 1.2, z, 0.12, 1.3, 0.2, '#344650');
      }
      box(-w / 2, 4.6, d / 2 + 2, 0.4, 9, 0.4, '#49666d');
      sign('FUEL / 24', -w / 2, 8, d / 2 + 2.25, 5.2, '#b7674e');
      sign('VALLEY FUEL', 0, 6.5, 8.16, 9, '#b7674e');
    } else {
      box(0, h / 2, 0, w, h, d, site.color);
      box(0, 0.4, 0, w + 0.2, 0.8, d + 0.2, '#acaa99');
      box(0, h - 0.12, 0, w + 0.5, 0.28, d + 0.5, '#f5ead4');
      if (kind === 'apartment') {
        box(0, h + 0.22, 0, w + 0.8, 0.48, d + 0.8, site.roof);
        box(-w / 3, h + 0.65, -d / 4, 2.7, 0.9, 2.2, '#9da79d');
      } else {
        roof(0, h, 0, w + 1.5, kind === 'station' ? 3 : 2.5, d + 1.5);
        box(-w / 3, h + 1.5, -d / 4, 0.9, 3.2, 0.9, '#bc9b7c');
      }
      const floors = kind === 'apartment' ? 4 : 2, columns = kind === 'station' ? 6 : kind === 'house' ? 2 : 3;
      for (let floor = 0; floor < floors; floor++) for (let column = 0; column < columns; column++) {
        if (floor === 0 && column === Math.floor(columns / 2)) continue;
        const x = (column - (columns - 1) / 2) * (w - 3) / columns, y = 1.9 + floor * (h - 2.8) / floors;
        for (const front of [-1, 1]) {
          const z = front * (d / 2 + 0.06);
          box(x, y, z, 1.8, 1.9, 0.18, '#f8edd8');
          box(x, y, z + front * 0.11, 1.45, 1.55, 0.09, '#547f8d');
          box(x, y, z + front * 0.18, 0.08, 1.6, 0.08, '#efdfbf');
          box(x, y - 1.02, z, 2.05, 0.16, 0.48, '#f4e8d0');
          if (kind === 'house') {
            for (const shutter of [-1, 1]) box(x + shutter * 1.13, y, z, 0.32, 1.85, 0.2, '#567e73');
          }
        }
      }
      for (const side of [-1, 1]) for (const z of [-d / 4, d / 4]) {
        box(side * (w / 2 + 0.04), h * 0.58, z, 0.14, 1.9, 1.65, '#f5ead4');
        box(side * (w / 2 + 0.12), h * 0.58, z, 0.09, 1.55, 1.3, '#547f8d');
      }
      box(0, 1.5, d / 2 + 0.13, 1.8, 3, 0.23, '#44615f');
      box(0.55, 1.45, d / 2 + 0.28, 0.12, 0.12, 0.1, '#e1ba74');
      box(0, 0.12, d / 2 + 0.65, 3, 0.25, 1.1, '#e9ddc6');
      if (kind === 'shop') {
        box(0, 3.1, d / 2 + 0.85, w - 0.8, 0.32, 1.8, '#54857e');
        for (let stripe = 0; stripe < 7; stripe++) box((stripe - 3) * (w - 0.8) / 7, 3.29, d / 2 + 0.85, (w - 0.8) / 14, 0.08, 1.8, '#f4e4be');
        sign(site.progress < 0.2 ? 'VALLEY CAFE' : 'MARKET', 0, 4.1, d / 2 + 0.2, 7.2);
      }
      if (kind === 'station') {
        sign('VALLEY STATION', 0, 5.9, d / 2 + 0.15, 12);
        box(0, 0.35, -d / 2 - 3, 60, 0.7, 4, '#c9bfa9');
        box(0, 4.1, -d / 2 - 3, 50, 0.4, 4.8, '#5b7d79');
        for (const x of [-22, -11, 0, 11, 22]) box(x, 2, -d / 2 - 3, 0.25, 4, 0.25, '#45605c');
        for (const z of [-d / 2 - 6.3, -d / 2 - 8.5]) box(0, 0.07, z, 60, 0.2, 0.16, '#617074');
        for (let i = 0; i < 42; i++) box((i - 20.5) * 1.4, -0.02, -d / 2 - 7.4, 0.28, 0.14, 3.4, '#9a8067');
        // A parked two-car regional train makes the platform recognizable from the road.
        for (const x of [-9, 9]) {
          box(x, 1.65, -d / 2 - 7.4, 16.6, 3, 3, '#587f80');
          box(x, 3.24, -d / 2 - 7.4, 16.8, 0.3, 3.1, '#e6e1cd');
          box(x, 0.7, -d / 2 - 7.4, 16.8, 0.5, 3.1, '#dbb373');
          for (let i = 0; i < 7; i++) box(x + (i - 3) * 2, 2.2, -d / 2 - 5.86, 1.35, 1.1, 0.09, '#c0d6d7');
        }
      }
    }
    // Each lot has a pavement connection, bench, planters and a street lamp.
    box(0, 0.025, d / 2 + 6.4, 2, 0.1, 3.2, '#e5dbc6');
    for (const x of [-w / 2 - 0.7, w / 2 + 0.7]) {
      box(x, 0.35, d / 2 + 1.5, 1.5, 0.65, 1.5, '#c6b598');
      crowns.push({ position: townPosition(site, x, 1.05, d / 2 + 1.5), scale: [1, 0.75, 1], rotation: 0, color: '#78965f' });
    }
    box(w / 2, 3.8, d / 2 + 3, 0.18, 7.5, 0.18, '#48616a');
    box(w / 2 - 0.65, 7.45, d / 2 + 3, 1.5, 0.16, 0.23, '#48616a');
    box(w / 2 - 1.2, 7.32, d / 2 + 3, 0.85, 0.18, 0.5, '#f4d89b');
    if (kind !== 'fuel') {
      box(-w / 2 + 1, 0.65, d / 2 + 3, 2.6, 0.16, 0.75, '#a57b55');
      box(-w / 2 + 1, 1.05, d / 2 + 2.72, 2.6, 0.65, 0.14, '#a57b55');
      for (const x of [-w / 2 + 0.1, -w / 2 + 1.9]) box(x, 0.28, d / 2 + 3, 0.15, 0.56, 0.6, '#48616a');
    }
  }
  return { boxes, gables, crowns, signs };
}
