import { ROAD_WIDTH, TRACK_LENGTH, nearestTrackPoint, seededRandom, trackFrame } from './track';

export type TownPosition = [number, number, number];
export interface TownSite {
  id: string; kind: 'house' | 'shop' | 'apartment' | 'station' | 'fuel';
  position: TownPosition; yaw: number; width: number; depth: number; height: number;
  plotWidth: number; plotDepth: number; color: string; roof: string; side: number; progress: number;
}
export interface TownPart { position: TownPosition; scale: TownPosition; rotation: number; color: string }
export interface TownSign { position: TownPosition; yaw: number; width: number; label: string; color: string }
const walls = ['#e8c9a0', '#c9d8d0', '#e0a98f', '#e6c97a', '#a9c4cf', '#b9cd9e'];
const roofs = ['#a85a45', '#4f6571', '#b06f52', '#5b6e63'];
const flowers = ['#e98254', '#f7d674', '#c77dbb', '#fff7e8', '#70b9c7'];

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
  const glow: TownPart[] = [], umbrellas: TownPart[] = [], smoke: TownPosition[] = [];
  for (const site of sites) {
    const { width: w, depth: d, height: h, kind } = site;
    const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string) => boxes.push({ position: townPosition(site, x, y, z), scale: [sx, sy, sz], rotation: site.yaw, color });
    const sign = (label: string, x: number, y: number, z: number, width: number, color = '#315a60') => signs.push({ label, position: townPosition(site, x, y, z), yaw: site.yaw, width, color });
    const roof = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => gables.push({ position: townPosition(site, x, y, z), scale: [sx, sy, sz], rotation: site.yaw, color: site.roof });
    const light = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color = '#ffe7b0') => glow.push({ position: townPosition(site, x, y, z), scale: [sx, sy, sz], rotation: site.yaw, color });
    const umbrella = (x: number, y: number, z: number, radius: number, height: number, color: string) => umbrellas.push({ position: townPosition(site, x, y, z), scale: [radius, height, radius], rotation: site.yaw, color });
    const chimney = (x: number, y: number, z: number) => smoke.push(townPosition(site, x, y, z));
    const flower = (x: number, y: number, z: number, size = 0.16, color = flowers[0]) => box(x, y, z, size, size, size, color);

    // Solid retaining plinths meet the elevated road rather than floating over the valley.
    const foundationHeight = Math.max(0.5, site.position[1] + 0.5);
    box(0, -foundationHeight / 2, kind === 'station' ? -4 : 0, site.plotWidth, foundationHeight, site.plotDepth, '#8f9584');
    box(0, -0.08, kind === 'station' ? -4 : 0, site.plotWidth, 0.18, site.plotDepth, kind === 'fuel' ? '#a8aaa0' : '#c4b9a4');
    box(0, 0.02, d / 2 + 3, w + 5, 0.2, 3.5, '#d6c9b2');
    if (kind !== 'station' && kind !== 'fuel') {
      box(0, 0.03, d / 2 + 3.6, w + 2, 0.06, 1.6, '#7a9a5e');
      box(0, 0.06, d / 2 + 4.44, w + 2.2, 0.08, 0.12, '#b8a98e');
      for (let i = -2; i <= 2; i++) flower(i * 0.9, 0.12, d / 2 + 3.2, 0.14, flowers[(i + 3) % flowers.length]);
    }
    if (kind === 'fuel') {
      // Rear shop, canopy, four pumps and a tall roadside price sign.
      box(0, 2.5, -d / 2 + 3, w - 3, 5, 6, '#eee0bc');
      box(0, 4.9, -d / 2 + 6.05, w - 2, 0.65, 0.24, '#3e8285');
      box(0, 2.4, -d / 2 + 6.08, 14, 2.8, 0.12, '#547e8a');
      box(0, 6.5, 2, w + 1, 0.75, 12, '#f2e6cd');
      box(0, 6.5, 8.05, w + 1, 0.55, 0.18, '#d87958');
      box(0, 6.9, 8.06, w + 1, 0.2, 0.2, '#f7d674');
      for (const x of [-9, 9]) box(x, 3.1, 2, 0.45, 6.2, 0.45, '#49666d');
      for (const x of [-5, 5]) for (const z of [-0.8, 4.2]) {
        box(x, 0.16, z, 3, 0.3, 2.2, '#dfd9c9');
        box(x, 1.15, z, 1.05, 2, 0.7, '#d87958');
        box(x, 1.7, z + 0.38, 0.76, 0.65, 0.08, '#294a54');
        light(x, 1.7, z + 0.43, 0.55, 0.42, 0.04, '#9fe8d8');
        box(x + 0.68, 1.2, z, 0.12, 1.3, 0.2, '#344650');
      }
      // Canopy lights, bollards, drums, tyre stacks and an air/water point.
      for (const x of [-8, 0, 8]) light(x, 6.1, 2, 0.5, 0.18, 0.5, '#fff2cc');
      for (const x of [-7, -3, 3, 7]) for (const z of [-2, 5.5]) {
        box(x, 0.5, z, 0.18, 1, 0.18, '#f7d674');
        box(x, 0.9, z, 0.22, 0.12, 0.22, '#30483d');
      }
      for (const [x, z, color] of [[-w / 2 + 2, -d / 2 + 6, '#b7674e'], [-w / 2 + 3.2, -d / 2 + 6.4, '#547e8a'], [w / 2 - 2, -d / 2 + 5.5, '#c9b18e']] as const) {
        box(x, 0.6, z, 0.8, 1.2, 0.8, color);
        box(x, 1.22, z, 0.86, 0.1, 0.86, '#3f4a4a');
      }
      for (const [x, z] of [[w / 2 - 3, -d / 2 + 7], [w / 2 - 4.3, -d / 2 + 7.2]] as const) {
        for (let i = 0; i < 3; i++) box(x, 0.2 + i * 0.34, z, 0.9, 0.28, 0.9, '#3f4a4a');
      }
      box(-w / 2 + 2, 0.8, d / 2 + 1, 0.8, 1.6, 0.8, '#547e8a');
      light(-w / 2 + 2, 1.3, d / 2 + 1.44, 0.35, 0.25, 0.05, '#9fe8d8');
      box(-w / 2, 4.6, d / 2 + 2, 0.4, 9, 0.4, '#49666d');
      sign('FUEL / 24', -w / 2, 8, d / 2 + 2.25, 5.2, '#b7674e');
      sign('VALLEY FUEL', 0, 6.5, 8.16, 9, '#b7674e');
      light(-w / 2, 8.55, d / 2 + 2.27, 4.4, 0.18, 0.05, '#ffe0a0');
    } else {
      box(0, h / 2, 0, w, h, d, site.color);
      box(0, 0.4, 0, w + 0.2, 0.8, d + 0.2, '#acaa99');
      box(0, h - 0.12, 0, w + 0.5, 0.28, d + 0.5, '#f5ead4');
      if (kind !== 'apartment') {
        // Alpine chalet timber: corner posts, sill beams and facade studs.
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * (w / 2 + 0.06), h / 2, sz * (d / 2 + 0.06), 0.22, h, 0.22, '#7a5a3e');
        box(0, h - 0.38, d / 2 + 0.08, w + 0.2, 0.22, 0.12, '#7a5a3e');
        box(0, 0.95, d / 2 + 0.08, w + 0.2, 0.18, 0.12, '#7a5a3e');
        box(0, h - 0.38, -d / 2 - 0.08, w + 0.2, 0.22, 0.12, '#7a5a3e');
        box(0, 0.95, -d / 2 - 0.08, w + 0.2, 0.18, 0.12, '#7a5a3e');
        for (const sx of [-1, 1]) {
          box(sx * (w / 2 + 0.08), h - 0.38, 0, 0.12, 0.22, d + 0.2, '#7a5a3e');
          box(sx * (w / 2 + 0.08), 0.95, 0, 0.12, 0.18, d + 0.2, '#7a5a3e');
        }
        const studs = kind === 'station' ? 6 : kind === 'house' ? 2 : 3;
        for (let column = 0; column < studs - 1; column++) {
          const x = ((column + 0.5) - (studs - 1) / 2) * (w - 3) / studs;
          box(x, h / 2, d / 2 + 0.08, 0.16, h - 0.6, 0.12, '#7a5a3e');
        }
      }
      if (kind === 'apartment') {
        box(0, h + 0.22, 0, w + 0.8, 0.48, d + 0.8, site.roof);
        box(-w / 3, h + 0.65, -d / 4, 2.7, 0.9, 2.2, '#9da79d');
        box(-w / 3, h + 1.2, -d / 4, 0.8, 1.1, 0.8, '#8f7560');
        chimney(-w / 3, h + 1.85, -d / 4);
        box(0, h + 2.2, 0, 0.06, 2.4, 0.06, '#48616a');
        box(0, h + 2.9, 0, 1.2, 0.06, 0.06, '#48616a');
        box(0, h + 2.5, 0, 0.8, 0.06, 0.06, '#48616a');
      } else {
        roof(0, h, 0, w + 1.5, kind === 'station' ? 3 : 2.5, d + 1.5);
        box(-w / 3, h + 1.5, -d / 4, 0.9, 3.2, 0.9, '#bc9b7c');
        box(-w / 3, h + 3.15, -d / 4, 1.1, 0.2, 1.1, '#8f7560');
        chimney(-w / 3, h + 3.35, -d / 4);
        box(0, kind === 'station' ? h + 3.05 : h + 2.55, 0, w + 1.7, 0.18, 0.18, '#6d4f3a');
        if (kind === 'house') {
          // Timber balcony under the upper windows.
          box(0, h * 0.62, d / 2 + 0.9, w - 1.5, 0.16, 1.4, '#8a6a45');
          box(0, h * 0.62 + 0.5, d / 2 + 1.55, w - 1.5, 0.08, 0.08, '#7a5a3e');
          for (const x of [-w / 2 + 0.9, w / 2 - 0.9]) box(x, h * 0.62 + 0.25, d / 2 + 1.55, 0.08, 0.5, 0.08, '#7a5a3e');
          box(0, h * 0.62 + 0.55, d / 2 + 1.55, 1.4, 0.16, 0.3, '#8a5a3b');
          for (const [i, f] of [-0.5, 0, 0.5].entries()) flower(f, h * 0.62 + 0.7, d / 2 + 1.57, 0.15, flowers[(i + 3) % flowers.length]);
        }
        if (kind === 'house' || kind === 'shop') {
          // A dormer breaks up the roof silhouette.
          box(0, h + 1.15, d / 2 + 0.75, 2.2, 1.5, 1.2, site.color);
          box(0, h + 1.15, d / 2 + 1.37, 1.4, 1.05, 0.06, '#547f8d');
          roof(0, h + 1.9, d / 2 + 0.75, 2.6, 1.1, 1.6);
        }
      }
      const floors = kind === 'apartment' ? 4 : 2, columns = kind === 'station' ? 6 : kind === 'house' ? 2 : 3;
      for (let floor = 0; floor < floors; floor++) for (let column = 0; column < columns; column++) {
        if (floor === 0 && column === Math.floor(columns / 2)) continue;
        const x = (column - (columns - 1) / 2) * (w - 3) / columns, y = 1.9 + floor * (h - 2.8) / floors;
        for (const front of [-1, 1]) {
          const z = front * (d / 2 + 0.06);
          box(x, y, z, 1.8, 1.9, 0.18, '#f8edd8');
          if (front === 1 && (floor + column) % 4 === 0) light(x, y, z + 0.16, 1.42, 1.52, 0.06, '#ffe0a0');
          else box(x, y, z + front * 0.11, 1.45, 1.55, 0.09, '#547f8d');
          box(x, y, z + front * 0.18, 0.08, 1.6, 0.08, '#efdfbf');
          box(x, y - 1.02, z, 2.05, 0.16, 0.48, '#f4e8d0');
          if (front === 1) {
            box(x, y - 1.16, z + 0.3, 1.7, 0.22, 0.4, '#8a5a3b');
            for (const f of [-0.55, 0, 0.55]) flower(x + f, y - 0.98, z + 0.32, 0.17, flowers[(column + floor + 1) % flowers.length]);
          }
          if (kind === 'house') {
            for (const shutter of [-1, 1]) box(x + shutter * 1.13, y, z, 0.32, 1.85, 0.2, '#567e73');
          }
        }
        if (kind === 'apartment' && floor > 0) {
          box(0, y - 1.22, d / 2 + 0.8, w - 2, 0.18, 1.25, '#d8cbb4');
          box(0, y - 0.72, d / 2 + 1.38, w - 2.4, 0.08, 0.08, '#6d7b72');
          for (const xr of [-w / 2 + 1.2, w / 2 - 1.2]) box(xr, y - 0.72, d / 2 + 1.38, 0.08, 0.9, 0.08, '#6d7b72');
          box(0, y - 0.92, d / 2 + 1.3, 1.8, 0.16, 0.3, '#8a5a3b');
          for (const f of [-0.6, 0, 0.6]) flower(f, y - 0.78, d / 2 + 1.32, 0.16, flowers[(floor + column + 2) % flowers.length]);
        }
      }
      for (const side of [-1, 1]) for (const z of [-d / 4, d / 4]) {
        box(side * (w / 2 + 0.04), h * 0.58, z, 0.14, 1.9, 1.65, '#f5ead4');
        box(side * (w / 2 + 0.12), h * 0.58, z, 0.09, 1.55, 1.3, '#547f8d');
      }
      box(0, 1.5, d / 2 + 0.13, 1.8, 3, 0.23, '#44615f');
      box(0.55, 1.45, d / 2 + 0.28, 0.12, 0.12, 0.1, '#e1ba74');
      box(0, 0.12, d / 2 + 0.65, 3, 0.25, 1.1, '#e9ddc6');
      light(0.95, 2.3, d / 2 + 0.4, 0.2, 0.32, 0.2, '#ffe0a0');
      if (kind === 'shop') {
        box(0, 3.1, d / 2 + 0.85, w - 0.8, 0.32, 1.8, '#54857e');
        for (let stripe = 0; stripe < 7; stripe++) box((stripe - 3) * (w - 0.8) / 7, 3.29, d / 2 + 0.85, (w - 0.8) / 14, 0.08, 1.8, '#f4e4be');
        sign(site.progress < 0.2 ? 'VALLEY CAFE' : 'MARKET', 0, 4.1, d / 2 + 0.2, 7.2);
        // Pavement cafe: two tables, chairs and striped umbrellas.
        for (const [tx, color] of [[-w / 4, '#d87958'], [w / 4, '#54857e']] as const) {
          const tz = d / 2 + 2.6;
          box(tx, 0.55, tz, 0.8, 0.1, 0.8, '#e8dfcc');
          box(tx, 0.28, tz, 0.12, 0.55, 0.12, '#6d7b72');
          for (const [cx, cz] of [[-0.8, 0], [0.8, 0], [0, -0.8], [0, 0.8]] as const) {
            box(tx + cx, 0.35, tz + cz, 0.45, 0.1, 0.45, '#c9b18e');
            box(tx + cx, 0.65, tz + cz + (cz ? Math.sign(cz) * 0.2 : 0), 0.45, 0.5, 0.08, '#c9b18e');
          }
          box(tx, 1.55, tz, 0.08, 2, 0.08, '#6d7b72');
          umbrella(tx, 2.65, tz, 1.7, 0.65, color);
        }
        box(-w / 2 + 1.2, 0.8, d / 2 + 2.2, 0.9, 1.4, 0.12, '#4e5b52');
        box(-w / 2 + 1.2, 0.8, d / 2 + 2.27, 0.7, 1.1, 0.05, '#e8dfcc');
      }
      if (kind === 'station') {
        sign('VALLEY STATION', 0, 5.9, d / 2 + 0.15, 12);
        // Station clock and facade details.
        box(0, 6.65, d / 2 + 0.2, 1.3, 1.3, 0.12, '#f8edd8');
        box(0, 6.65, d / 2 + 0.28, 0.08, 0.55, 0.04, '#30483d');
        box(0.2, 6.8, d / 2 + 0.28, 0.45, 0.08, 0.04, '#30483d');
        box(0, 0.35, -d / 2 - 3, 60, 0.7, 4, '#c9bfa9');
        box(0, 4.1, -d / 2 - 3, 50, 0.4, 4.8, '#5b7d79');
        for (const x of [-22, -11, 0, 11, 22]) box(x, 2, -d / 2 - 3, 0.25, 4, 0.25, '#45605c');
        for (const x of [-18, -6, 6, 18]) light(x, 3.85, -d / 2 - 3, 0.3, 0.3, 0.3, '#ffe0a0');
        for (const z of [-d / 2 - 6.3, -d / 2 - 8.5]) box(0, 0.07, z, 60, 0.2, 0.16, '#617074');
        box(0, 0.72, -d / 2 - 4.75, 60, 0.06, 0.3, '#f7d674');
        for (let i = 0; i < 42; i++) box((i - 20.5) * 1.4, -0.02, -d / 2 - 7.4, 0.28, 0.14, 3.4, '#9a8067');
        // A parked two-car regional train makes the platform recognizable from the road.
        for (const x of [-9, 9]) {
          box(x, 1.65, -d / 2 - 7.4, 16.6, 3, 3, '#587f80');
          box(x, 3.24, -d / 2 - 7.4, 16.8, 0.3, 3.1, '#e6e1cd');
          box(x, 0.7, -d / 2 - 7.4, 16.8, 0.5, 3.1, '#dbb373');
          box(x, 1.15, -d / 2 - 7.4, 16.8, 0.18, 3.08, '#c05a4a');
          for (let i = 0; i < 7; i++) box(x + (i - 3) * 2, 2.2, -d / 2 - 5.86, 1.35, 1.1, 0.09, '#c0d6d7');
        }
        // Platform benches, lamps, luggage, signal and planters.
        for (const x of [-18, -6, 6, 18]) {
          box(x, 0.75, -d / 2 - 1.2, 2.2, 0.15, 0.6, '#a57b55');
          box(x, 1.05, -d / 2 - 1.5, 2.2, 0.55, 0.12, '#a57b55');
          box(x - 0.9, 0.4, -d / 2 - 1.2, 0.12, 0.6, 0.5, '#48616a');
          box(x + 0.9, 0.4, -d / 2 - 1.2, 0.12, 0.6, 0.5, '#48616a');
        }
        for (const x of [-24, -12, 0, 12, 24]) {
          box(x, 2.2, -d / 2 - 1.1, 0.15, 4.4, 0.15, '#48616a');
          light(x, 4.5, -d / 2 - 1.1, 0.4, 0.4, 0.4, '#ffe0a0');
        }
        for (const [x, z, color] of [[-15, -d / 2 - 1.7, '#b7674e'], [-13.5, -d / 2 - 1.9, '#547e8a'], [15, -d / 2 - 1.6, '#c9b18e']] as const) box(x, 0.5, z, 1, 0.8, 0.8, color);
        box(28, 2.5, -d / 2 - 6, 0.2, 5, 0.2, '#48616a');
        light(28, 5.1, -d / 2 - 6, 0.35, 0.35, 0.35, '#ff6b5e');
        light(28, 4.5, -d / 2 - 6, 0.35, 0.35, 0.35, '#7ddc8a');
        for (const x of [-20, 20]) {
          box(x, 0.9, -d / 2 - 1, 1.2, 0.8, 1.2, '#a57b55');
          crowns.push({ position: townPosition(site, x, 1.5, -d / 2 - 1), scale: [0.8, 0.6, 0.8], rotation: 0, color: '#78965f' });
        }
      }
    }
    // Each lot has a pavement connection, bench, planters and a street lamp.
    box(0, 0.025, d / 2 + 6.4, 2, 0.1, 3.2, '#d4c8b2');
    box(0, 0.35, d / 2 + 6.4, 2.2, 0.12, 0.6, '#a57b55');
    box(0, 0.65, d / 2 + 6.7, 2.2, 0.5, 0.12, '#a57b55');
    box(-0.9, 0.2, d / 2 + 6.4, 0.12, 0.4, 0.5, '#48616a');
    box(0.9, 0.2, d / 2 + 6.4, 0.12, 0.4, 0.5, '#48616a');
    box(w / 2 - 0.5, 1.1, d / 2 + 6.4, 0.12, 2.2, 0.12, '#48616a');
    box(w / 2 - 0.5, 2.1, d / 2 + 6.4, 1.2, 0.4, 0.08, '#f4d89b');
    box(-w / 2 + 1.2, 0.4, d / 2 + 6.4, 1.2, 0.6, 0.8, '#c6b598');
    for (const [i, f] of [-0.3, 0, 0.3].entries()) flower(-w / 2 + 1.2 + f, 0.85, d / 2 + 6.4, 0.15, flowers[(i + 1) % flowers.length]);
    for (const x of [-w / 2 - 0.7, w / 2 + 0.7]) {
      box(x, 0.35, d / 2 + 1.5, 1.5, 0.65, 1.5, '#c6b598');
      crowns.push({ position: townPosition(site, x, 1.05, d / 2 + 1.5), scale: [1, 0.75, 1], rotation: 0, color: '#78965f' });
      for (const [i, f] of [-0.4, 0, 0.4].entries()) flower(x + f, 1.72, d / 2 + 1.5, 0.15, flowers[(i + 2) % flowers.length]);
    }
    box(w / 2, 3.8, d / 2 + 3, 0.18, 7.5, 0.18, '#48616a');
    box(w / 2 - 0.65, 7.45, d / 2 + 3, 1.5, 0.16, 0.23, '#48616a');
    box(w / 2 - 1.2, 7.32, d / 2 + 3, 0.85, 0.18, 0.5, '#f4d89b');
    light(w / 2 - 1.2, 7.32, d / 2 + 3.27, 0.8, 0.16, 0.06, '#ffe0a0');
    if (kind !== 'fuel') {
      box(-w / 2 + 1, 0.65, d / 2 + 3, 2.6, 0.16, 0.75, '#a57b55');
      box(-w / 2 + 1, 1.05, d / 2 + 2.72, 2.6, 0.65, 0.14, '#a57b55');
      for (const x of [-w / 2 + 0.1, -w / 2 + 1.9]) box(x, 0.28, d / 2 + 3, 0.15, 0.56, 0.6, '#48616a');
    }
    // Garden fence, gate, mailbox and shrubs frame the front of every home.
    if (kind !== 'station' && kind !== 'fuel') {
      const gardenZ = d / 2 + 4.2;
      for (let x = -w / 2; x <= w / 2 + 0.01; x += 1.2) {
        if (Math.abs(x) < 1.3) continue;
        box(x, 0.5, gardenZ, 0.14, 1, 0.14, '#d9c7a6');
      }
      box(-w / 4 - 0.6, 0.78, gardenZ, w / 2 - 1.2, 0.1, 0.1, '#d9c7a6');
      box(w / 4 + 0.6, 0.78, gardenZ, w / 2 - 1.2, 0.1, 0.1, '#d9c7a6');
      box(-1.4, 0.6, gardenZ, 0.2, 1.2, 0.2, '#c9b18e');
      box(1.4, 0.6, gardenZ, 0.2, 1.2, 0.2, '#c9b18e');
      for (const x of [-w / 2 - 1.4, w / 2 + 1.4]) crowns.push({ position: townPosition(site, x, 0.9, d / 2 + 3.4), scale: [0.9, 0.7, 0.9], rotation: 0, color: '#78965f' });
      box(-w / 2 + 0.6, 0.7, d / 2 + 4.0, 0.3, 1.2, 0.3, '#48616a');
      box(-w / 2 + 0.6, 1.4, d / 2 + 4.0, 0.5, 0.35, 0.35, '#d87958');
    }
    // A crate and a barrel add lived-in clutter beside the lamp.
    box(w / 2 - 1.6, 0.45, d / 2 + 2.2, 0.8, 0.9, 0.8, '#b08a5c');
    box(w / 2 - 1.6, 0.95, d / 2 + 2.2, 0.84, 0.12, 0.84, '#8a6a45');
    box(w / 2 - 2.8, 0.55, d / 2 + 2.0, 0.7, 1.1, 0.7, '#547e8a');
  }
  return { boxes, gables, crowns, signs, glow, umbrellas, smoke };
}
