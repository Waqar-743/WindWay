import { ROAD_WIDTH, TRACK_LENGTH, nearestTrackPoint, trackFrame } from './track';
import { townPosition, type TownSite, type TownPart } from './alpineVillage';

/** Tropical construction: raised decks, bamboo walls and shaded verandas. */
export function buildJungleVillage() {
  const sites: TownSite[] = [];
  const count = Math.floor(TRACK_LENGTH / 48);
  for (let i = 0; i < count; i++) for (const side of [-1, 1]) {
    const progress = (i + 0.35) / count;
    if (progress > 0.92 && side === -1) continue;
    const frame = trackFrame(progress), variant = i % 3;
    const width = variant === 1 ? 17 : variant === 2 ? 11 : 9;
    const depth = variant === 2 ? 12 : 9;
    const p = frame.point.clone().addScaledVector(frame.right, side * (ROAD_WIDTH / 2 + 11 + depth / 2));
    const site: TownSite = { id: 'jungle-home-' + i + '-' + side, kind: 'house', progress, side,
      position: [p.x, frame.point.y + 1.1, p.z], yaw: frame.yaw - side * Math.PI / 2,
      width, depth, height: variant === 1 ? 4.5 : 5.7, plotWidth: width + 4, plotDepth: depth + 8,
      color: ['#c29360', '#e0c48a', '#92b8a2'][variant], roof: ['#50796e', '#a67848', '#b36f57'][variant] };
    const corners = [-site.plotWidth / 2, site.plotWidth / 2].flatMap(x => [-site.plotDepth / 2, site.plotDepth / 2].map(z => townPosition(site, x, 0, z)));
    if (corners.some(p => Math.abs(p[2]) < 41 || nearestTrackPoint(p[0], p[2]).distance < ROAD_WIDTH / 2 + 2)) continue;
    if (sites.some(other => Math.hypot(p.x - other.position[0], p.z - other.position[2]) < (site.plotWidth + other.plotWidth) / 2 + 6)) continue;
    sites.push(site);
  }
  return sites;
}

export function buildJungleHouseParts(sites: TownSite[]) {
  const boxes: TownPart[] = [], roofs: TownPart[] = [];
  for (const site of sites) {
    const { width: w, depth: d, height: h } = site;
    const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string) => boxes.push({ position: townPosition(site, x, y, z), scale: [sx, sy, sz], rotation: site.yaw, color });
    // Stilts reach the valley floor. The deck sits just above the roadside.
    const stilts = site.position[1] + 0.3;
    for (const x of [-w / 2, 0, w / 2]) for (const z of [-d / 2, d / 2 + 2]) box(x, -stilts / 2, z, 0.4, stilts, 0.4, '#775c3b');
    box(0, 0, 1, w + 2.5, 0.4, d + 4, '#9c754d');
    box(0, h / 2, -0.7, w, h, d - 1.4, site.color);
    for (let slat = 0; slat < 12; slat++) box((slat - 5.5) * w / 12, h / 2, d / 2 - 1.35, 0.09, h - 0.2, 0.13, '#a8804e');
    roofs.push({ position: townPosition(site, 0, h, 0.2), scale: [w + 3.4, 2.9, d + 5], rotation: site.yaw, color: site.roof });
    // Veranda posts and rails, with a clear entrance in the middle.
    for (const x of [-w / 2, w / 2]) {
      box(x, h / 2, d / 2 + 2, 0.24, h, 0.24, '#725b3e');
      box(x, 0.8, 1, 0.16, 0.16, d + 2, '#e0c48a');
      box(x / 2 + Math.sign(x) * 0.65, 0.85, d / 2 + 2, w / 2 - 1.3, 0.16, 0.18, '#e0c48a');
      box(x / 2, 0.5, d / 2 + 2, 0.14, 0.9, 0.14, '#725b3e');
    }
    box(0, 1.45, d / 2 - 1.25, 1.6, 2.9, 0.18, '#3f6253');
    for (const x of [-w * 0.3, w * 0.3]) {
      box(x, 2.7, d / 2 - 1.15, 2.1, 1.9, 0.18, '#eff0ce');
      box(x, 2.7, d / 2 - 1.02, 1.7, 1.55, 0.12, '#567d7b');
      for (const side of [-1, 1]) box(x + side * 1.3, 2.7, d / 2 - 1.12, 0.42, 1.9, 0.18, '#426f5a');
    }
    for (let step = 0; step < 4; step++) box(0, -0.2 - step * 0.3, d / 2 + 2.5 + step * 0.5, 2.4, 0.25, 0.65, '#bf9e6e');
    for (const x of [-w / 2, w / 2]) {
      box(x, 0.4, d / 2 + 1.1, 0.9, 0.8, 0.9, '#a87853');
      box(x, 1.1, d / 2 + 1.1, 1.15, 0.8, 1.15, '#52835b');
    }
    // Bench and low veranda canopy make these homes distinct from Alpine shops.
    box(-w / 3, 0.65, d / 2 + 0.7, 2.4, 0.2, 0.7, '#755538');
    box(-w / 3, 1.1, d / 2 + 0.4, 2.4, 0.75, 0.16, '#755538');
  }
  return { boxes, roofs };
}
