import { useId, useMemo } from 'react';
import * as THREE from 'three';
import { mapById, type GameMap } from './maps';
import { MAP_PATH, trackMapPoint } from './track';
import './route-map.css';
import './live-map.css';

type MapId = 'alpine' | 'jungle' | 'snow';
type Point = { x: number; y: number };

export type RouteMapProps = {
  mapId: MapId | string;
  className?: string;
  compact?: boolean;
  showTelemetry?: boolean;
  live?: boolean;
  x?: number;
  z?: number;
  checkpoint?: number;
};

type RouteProfile = {
  code: string;
  environment: string;
  road: string;
  discipline: string;
  startName: string;
  finishName: string;
  shortStart: string;
  shortFinish: string;
};

type RouteGeometry = {
  path: string;
  checkpoints: (Point & { number: number })[];
  start: Point;
  finish: Point;
  startAngle: number;
  direction: Point & { angle: number };
  distance: string;
  metresToMap: number;
  project: (x: number, z: number) => Point;
};

const PROFILES: Record<MapId, RouteProfile> = {
  alpine: {
    code: 'ALP–01', environment: 'Alpine valley', road: 'Asphalt circuit', discipline: 'Grand touring circuit',
    startName: 'Village start / finish', finishName: 'Village start / finish', shortStart: 'S / F', shortFinish: 'S / F',
  },
  jungle: {
    code: 'JNG–02', environment: 'Tropical reserve', road: 'Asphalt circuit', discipline: 'Canopy sprint circuit',
    startName: 'Ranger station start / finish', finishName: 'Ranger station start / finish', shortStart: 'S / F', shortFinish: 'S / F',
  },
  snow: {
    code: 'FRS–03', environment: 'Whiteout ridge', road: 'Packed snow / ice', discipline: 'One-way mountain ascent',
    startName: 'Start · Base camp', finishName: 'Finish · Summit', shortStart: 'Base', shortFinish: 'Summit',
  },
};

const CONTOURS = [
  'M-12 46C12 18 44 9 72 20s35 7 58-6 52-8 82 16',
  'M-9 55C16 29 40 21 65 29s38 10 62-4 49-9 78 10',
  'M-6 65C12 43 38 32 61 39s39 14 66-1 47-8 77 7',
  'M-18 158c28-27 58-29 81-13s45 16 72 1 51-12 80 6',
  'M-16 169c30-26 57-26 81-12s43 16 71 3 51-12 80 5',
  'M-12 181c27-24 55-24 78-11s47 17 77 3 49-10 72 4',
  'M142 72c15-17 39-19 53-4s12 34-3 45-39 7-50-9 0-32 0-32Z',
  'M148 78c11-12 28-13 38-3s8 24-3 32-27 5-35-6 0-23 0-23Z',
  'M154 84c7-8 18-8 24-2s5 15-2 20-18 3-23-4 1-14 1-14Z',
  'M-9 91c12-16 35-18 48-5s14 32 1 44-35 10-47-3 10-33-2-36Z',
  'M-3 96c9-11 24-12 33-4s9 22 0 29-24 7-32-2 7-21-1-23Z',
];

const TREE_SITES = [
  [24, 34], [34, 27], [45, 32], [166, 35], [176, 43], [158, 48],
  [27, 148], [37, 158], [48, 169], [158, 161], [171, 151], [177, 167],
] as const;

function makeCurve(map: GameMap) {
  const curve = new THREE.CatmullRomCurve3(map.points, map.mode !== 'ascent', 'catmullrom', map.mode === 'ascent' ? 0.55 : 0.35);
  curve.arcLengthDivisions = map.mode === 'ascent' ? 4000 : 200;
  return curve;
}

/** Read-only route sampling: activating a different race cannot redraw an existing map. */
function geometryFor(map: GameMap): RouteGeometry {
  const closed = map.mode !== 'ascent';
  const curve = makeCurve(map);
  const count = map.id === 'alpine' ? 720 : map.id === 'jungle' ? 360 : 1200;
  const stride = map.id === 'snow' ? 4 : 3;
  const samples = Array.from({ length: count + (closed ? 0 : 1) }, (_, index) => curve.getPointAt(index / count));
  const xs = samples.map(point => point.x), zs = samples.map(point => point.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const localScale = 172 / Math.max(maxX - minX, maxZ - minZ);
  const offsetX = 100 - (minX + maxX) / 2 * localScale;
  const offsetZ = 100 - (minZ + maxZ) / 2 * localScale;
  let project = (x: number, z: number): Point => ({ x: x * localScale + offsetX, y: z * localScale + offsetZ });
  let scale = localScale;
  let path = samples.filter((_, index) => index % stride === 0).map((point, index) => {
    const projected = project(point.x, point.z);
    return `${index ? 'L' : 'M'}${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
  }).join(' ') + (closed ? 'Z' : '');

  // Preserve the established minimap geometry when the shared track module has
  // the requested circuit's projection. Dynamic imports during a race still work.
  if (map.id === 'alpine' || map.id === 'jungle') {
    const origin = trackMapPoint(0, 0), unitX = trackMapPoint(1, 0), unitZ = trackMapPoint(0, 1);
    const nativeScale = unitX.x - origin.x, nativeScaleZ = unitZ.y - origin.y;
    const nativeStart = trackMapPoint(map.points[0].x, map.points[0].z);
    const firstPoint = MAP_PATH.match(/^M(-?[\d.]+),(-?[\d.]+)/);
    if (firstPoint && Math.abs(nativeScale - nativeScaleZ) < 0.00001
      && Math.abs(Number(firstPoint[1]) - nativeStart.x) < 0.15
      && Math.abs(Number(firstPoint[2]) - nativeStart.y) < 0.15) {
      path = MAP_PATH;
      scale = nativeScale;
      project = (x, z) => ({ x: x * nativeScale + origin.x, y: z * nativeScaleZ + origin.y });
    }
  }

  const gateCount = closed ? 8 : 17;
  const checkpoints = Array.from({ length: gateCount }, (_, index) => {
    const progress = closed ? index / gateCount : index / (gateCount - 1) * 0.99;
    const point = curve.getPointAt(progress);
    return { ...project(point.x, point.z), number: index + 1 };
  });
  const startWorld = curve.getPointAt(0), endWorld = curve.getPointAt(1);
  const nextWorld = curve.getPointAt(0.002);
  const start = project(startWorld.x, startWorld.z), next = project(nextWorld.x, nextWorld.z);
  const directionWorld = curve.getPointAt(0.43), directionNextWorld = curve.getPointAt(0.433);
  const direction = project(directionWorld.x, directionWorld.z), directionNext = project(directionNextWorld.x, directionNextWorld.z);
  return {
    path,
    checkpoints,
    start,
    finish: closed ? start : project(endWorld.x, endWorld.z),
    startAngle: Math.atan2(next.y - start.y, next.x - start.x) * 180 / Math.PI + 90,
    direction: { ...direction, angle: Math.atan2(directionNext.y - direction.y, directionNext.x - direction.x) * 180 / Math.PI },
    distance: `${(curve.getLength() / 1000).toFixed(2)} km`,
    metresToMap: scale,
    project,
  };
}

const GEOMETRY = new Map<MapId, RouteGeometry>();
function routeGeometry(map: GameMap) {
  const id = map.id as MapId;
  let geometry = GEOMETRY.get(id);
  if (!geometry) {
    geometry = geometryFor(map);
    GEOMETRY.set(id, geometry);
  }
  return geometry;
}

function AlpineTerrain() {
  return <g className="route-map__terrain route-map__terrain--alpine" aria-hidden="true">
    <path className="route-map__water" d="M-8 96Q42 79 90 101t118-6" />
    <path className="route-map__water-line" d="M-8 93Q42 76 90 98t118-6M-8 100Q42 83 90 105t118-6" />
    <g className="route-map__mountains">
      <path d="m9 54 20-30 17 22 15-34 24 42M135 47l17-28 18 22 10-15 19 27" />
      <path d="m21 38 8-14 7 11-7-3-3 7m28-10 7-17 11 18-10-6-4 9m101 1 10-14 9 13-9-4-4 7" />
    </g>
    {TREE_SITES.map(([x, y], index) => <g className="route-map__tree" key={index} transform={`translate(${x} ${y})`}>
      <path d="M0-5-3 0h1.8L-4 4h8L1.2 0H3Z" /><path d="M0 4v2" />
    </g>)}
    <text x="17" y="80" className="route-map__place">PINE RIDGE</text>
    <text x="145" y="129" className="route-map__place">WINDWAY STATION</text>
    <text x="83" y="112" className="route-map__water-label">RIVER CROSSING</text>
  </g>;
}

function JungleTerrain() {
  return <g className="route-map__terrain route-map__terrain--jungle" aria-hidden="true">
    <path className="route-map__water" d="M-9 89q46 31 91 4t126 8" />
    <path className="route-map__water-line" d="M-9 86q46 31 91 4t126 8M-9 94q46 31 91 4t126 8" />
    <g className="route-map__canopy">
      {[[18, 28, 13], [36, 20, 17], [59, 30, 12], [146, 24, 18], [170, 35, 15], [177, 64, 11], [20, 143, 16], [40, 171, 18], [68, 178, 12], [143, 169, 17], [171, 148, 16]].map(([x, y, radius], index) =>
        <g key={index} transform={`translate(${x} ${y})`}>
          <circle r={radius} /><circle cx={radius * 0.7} cy={radius * 0.22} r={radius * 0.7} /><circle cx={-radius * 0.55} cy={radius * 0.35} r={radius * 0.63} />
          <path d={`M${-radius * 0.6} 0q${radius * 0.6} ${-radius * 0.8} ${radius * 1.2} 0M0 ${-radius * 0.7}q${radius * 0.7} ${radius * 0.7} 0 ${radius * 1.4}`} />
        </g>)}
    </g>
    <path className="route-map__reserve" d="M9 65Q29 5 91 9t99 41M18 142q25 51 87 48t83-42" />
    <text x="18" y="66" className="route-map__place">UPPER CANOPY</text>
    <text x="136" y="125" className="route-map__place">RANGER SECTOR</text>
    <text x="73" y="111" className="route-map__water-label">JADE RIVER</text>
  </g>;
}

function SnowTerrain() {
  return <g className="route-map__terrain route-map__terrain--snow" aria-hidden="true">
    <g className="route-map__snow-ridges">
      <path d="m-8 67 37-46 25 29 31-47 40 58 25-37 54 57M-8 77l37-43 25 28 31-43 40 54 25-34 54 52" />
      <path d="m17 38 12-17 11 14-11-5-5 9M70 23 85 3l16 25-15-9-7 12m62 9 9-16 13 15-12-5-4 8" />
      <path d="M7 172 38 139l24 24 31-44 39 52 27-35 43 42" />
    </g>
    <g className="route-map__ice-fields">
      <path d="m17 108 15-8 15 7-5 12-19 3Z" /><path d="m152 82 17-8 14 11-8 13-17-2Z" /><path d="m127 153 17-7 15 10-8 12-18-3Z" />
      <path d="m21 111 15 4m-9-9 8 13m124-34 14 7m-8-13 5 18m-38 62 17 3" />
    </g>
    <text x="16" y="16" className="route-map__place">SUMMIT MASSIF / 365 M</text>
    <text x="130" y="115" className="route-map__place">ICE SECTOR</text>
    <text x="15" y="152" className="route-map__place">BASE RIDGE</text>
  </g>;
}

function Compass() {
  return <g className="route-map__compass" transform="translate(177 20)" aria-hidden="true">
    <circle r="10" /><circle r="7.2" />
    <path d="M0-13v3M0 10v3M-13 0h3M10 0h3" />
    <path className="route-map__compass-north" d="M0-6 2.4 3 0 1.5-2.4 3Z" />
    <path d="M0 6 2.4-3 0-1.5-2.4-3Z" />
    <text x="0" y="-15">N</text>
  </g>;
}

function Endpoint({ point, label, angle, finish = false }: { point: Point; label: string; angle?: number; finish?: boolean }) {
  const width = Math.max(18, label.length * 1.72 + 6);
  const anchor = point.x > 154 ? 'end' : point.x < 46 ? 'start' : 'middle';
  const x = Math.max(width / 2 + 5, Math.min(195 - width / 2, point.x));
  const y = point.y > 157 ? point.y - 12 : point.y + 13;
  const rectX = anchor === 'end' ? -width / 2 + 2 : anchor === 'start' ? width / 2 - 2 : 0;
  return <g className={`route-map__endpoint${finish ? ' route-map__endpoint--finish' : ''}`}>
    {finish ? <g transform={`translate(${point.x} ${point.y})`}>
      <circle r="3.4" className="route-map__endpoint-ring" />
      <path className="route-map__flag" d="M0 1v-10l7 2.2L0-4.5" />
    </g> : <g transform={`translate(${point.x} ${point.y}) rotate(${angle ?? 0})`}>
      <circle r="4" className="route-map__start-halo" transform={`rotate(${-(angle ?? 0)})`} />
      <rect x="-5.2" y="-1.25" width="10.4" height="2.5" className="route-map__grid-base" />
      {[-4.7, -2.35, 0, 2.35].map((offset, index) => <g key={offset}>
        <rect x={offset} y="-1.25" width="1.17" height="1.25" className={index % 2 ? 'route-map__grid-dark' : 'route-map__grid-light'} />
        <rect x={offset + 1.17} y="0" width="1.17" height="1.25" className={index % 2 ? 'route-map__grid-dark' : 'route-map__grid-light'} />
      </g>)}
    </g>}
    <g className="route-map__endpoint-label" transform={`translate(${x} ${y})`}>
      <rect x={rectX - width / 2} y="-4.2" width={width} height="7.5" rx="1.7" />
      <text x={rectX} y="0.4" textAnchor="middle">{label}</text>
    </g>
  </g>;
}

/** A dependency-free, presentation-ready technical map of a Windway route. */
export function RouteMap({ mapId, className = '', compact = false, showTelemetry = true, live = false, x, z, checkpoint = 0 }: RouteMapProps) {
  const map = mapById(mapId);
  const id = map.id as MapId;
  const profile = PROFILES[id] ?? PROFILES.alpine;
  const route = useMemo(() => routeGeometry(map), [map]);
  const reactId = useId();
  const uid = `route-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const titleId = `${uid}-title`, descriptionId = `${uid}-description`;
  const backgroundId = `${uid}-background`, roadId = `${uid}-road`, gridId = `${uid}-grid`, glowId = `${uid}-glow`;
  const accessibleLabel = live
    ? `Live ${map.name} minimap showing your position${map.mode === 'ascent' ? ' from base camp to summit' : ''}. ${Math.min(checkpoint + 1, route.checkpoints.length)} of ${route.checkpoints.length} checkpoints reached.`
    : `${map.name}, ${map.region}. ${profile.discipline}, ${route.distance}${map.laps > 1 ? ` per lap, ${map.laps} laps` : ''}. ${route.checkpoints.length} checkpoints.`;
  const gridLines = Array.from({ length: 9 }, (_, index) => 20 + index * 20);
  const classes = `route-map route-map--${id}${compact ? ' route-map--compact' : ''}${live ? ' route-map--live' : ''}${className ? ` ${className}` : ''}`;
  const player = live && Number.isFinite(x) && Number.isFinite(z) ? route.project(x!, z!) : null;
  const nextCheckpoint = map.mode === 'ascent' ? Math.min(route.checkpoints.length - 1, checkpoint + 1) : (checkpoint + 1) % route.checkpoints.length;

  return <figure className={classes} data-map={id}>
    {!compact && <figcaption className="route-map__header">
      <div className="route-map__heading">
        <span className="route-map__eyebrow">WINDWAY / ROUTE INTELLIGENCE</span>
        <strong>{map.name}</strong>
        <span className="route-map__region">{map.region}<i />{profile.discipline}</span>
      </div>
      <div className="route-map__code"><span>ROUTE CODE</span><strong>{profile.code}</strong><small><i />{map.mode === 'ascent' ? 'ONE WAY' : 'CLOSED LOOP'}</small></div>
    </figcaption>}

    <svg className={live ? 'track-map' : 'track-map route-map__svg'} viewBox="0 0 200 200" role="img" aria-label={accessibleLabel} aria-labelledby={titleId} aria-describedby={descriptionId} focusable="false">
      <title id={titleId}>{`${map.name} technical route map`}</title>
      <desc id={descriptionId}>{accessibleLabel} The marked route runs from {profile.startName}{map.mode === 'ascent' ? ` to ${profile.finishName}` : ''}. Numbered dots indicate ordered checkpoints.</desc>
      <defs>
        <linearGradient id={backgroundId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#101920" /><stop offset="0.52" stopColor="#0a1117" /><stop offset="1" stopColor="#060b10" />
        </linearGradient>
        <linearGradient id={roadId} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={id === 'snow' ? '#59717c' : id === 'jungle' ? '#40554e' : '#4a555e'} />
          <stop offset="0.48" stopColor={id === 'snow' ? '#3e5562' : id === 'jungle' ? '#293e38' : '#303b44'} />
          <stop offset="1" stopColor="#202b33" />
        </linearGradient>
        <pattern id={gridId} width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0H0v10" fill="none" stroke="currentColor" strokeWidth="0.18" />
          <circle cx="0" cy="0" r="0.42" fill="currentColor" />
        </pattern>
        <filter id={glowId} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      <rect width="200" height="200" fill={`url(#${backgroundId})`} />
      <rect width="200" height="200" className="route-map__grid" fill={`url(#${gridId})`} />
      <g className="route-map__graticule" aria-hidden="true">
        {gridLines.map(line => <path key={line} d={`M${line} 0v200M0 ${line}h200`} />)}
      </g>
      <g className="route-map__contours" aria-hidden="true">{CONTOURS.map((contour, index) => <path d={contour} key={index} />)}</g>

      {id === 'alpine' ? <AlpineTerrain /> : id === 'jungle' ? <JungleTerrain /> : <SnowTerrain />}

      <g className="route-map__road" fill="none" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
        <path d={route.path} className="route-map__road-glow" filter={`url(#${glowId})`} />
        <path d={route.path} className="route-map__road-casing" />
        <path d={route.path} className="route-map__road-shoulder" />
        <path d={route.path} stroke={`url(#${roadId})`} className="route-map__road-surface" />
        <path d={route.path} className="route-map__road-edge" />
        <path d={route.path} className="route-map__road-centre" />
      </g>

      <g className="route-map__direction" transform={`translate(${route.direction.x} ${route.direction.y}) rotate(${route.direction.angle})`} aria-hidden="true">
        <path d="m-2-1.7 4 1.7-4 1.7" />
      </g>

      <g className="route-map__checkpoints" aria-hidden="true">
        {route.checkpoints.slice(1).map(point => {
          const index = point.number - 1;
          const state = index === nextCheckpoint && live ? 'next' : live && index <= checkpoint ? 'passed' : '';
          return <g key={point.number} className={state ? `route-map__checkpoint--${state}` : ''} transform={`translate(${point.x} ${point.y})`}>
            {live && index === nextCheckpoint && <circle className="route-map__checkpoint-pulse" r="5.6" />}
            <circle r={compact ? 2.15 : 2.65} />
            {!compact && <text x="0" y="1.05" textAnchor="middle">{String(point.number).padStart(2, '0')}</text>}
          </g>;
        })}
      </g>

      <Endpoint point={route.start} label={compact ? profile.shortStart : profile.startName} angle={route.startAngle} />
      {map.mode === 'ascent' && <Endpoint point={route.finish} label={compact ? profile.shortFinish : profile.finishName} finish />}
      {player && <g className="route-map__player" transform={`translate(${player.x} ${player.y})`} aria-hidden="true">
        <circle className="route-map__player-pulse" r="8" />
        <circle className="route-map__player-halo" r="5.4" />
        <path d="M0-4 3 3 0 1.8-3 3Z" />
      </g>}
      <Compass />

      <g className="route-map__map-meta" aria-hidden="true">
        <text x="13" y="14">{compact ? profile.code : `${profile.code} / PLAN VIEW`}</text>
        <path d="M13 18h15" />
      </g>
      <g className="route-map__scale" transform="translate(13 190)" aria-hidden="true">
        <path d={`M0-2v4M0 0h${(route.metresToMap * 100).toFixed(1)}M${(route.metresToMap * 100).toFixed(1)}-2v4`} />
        <text x="0" y="-3">100 M</text>
      </g>
      <path className="route-map__frame" d="M6 16V6h10M184 6h10v10M194 184v10h-10M16 194H6v-10" aria-hidden="true" />
    </svg>

    {!compact && !live && showTelemetry && <footer className="route-map__telemetry" aria-label="Route telemetry">
      <dl>
        <div><dt>ROUTE LENGTH</dt><dd>{route.distance}<small>{map.mode === 'ascent' ? 'ONE WAY' : `${map.laps} ${map.laps === 1 ? 'LAP' : 'LAPS'}`}</small></dd></div>
        <div><dt>ENVIRONMENT</dt><dd>{profile.environment}<small>{profile.code} / VERIFIED</small></dd></div>
        <div><dt>ROAD SURFACE</dt><dd>{profile.road}<small>{map.mode === 'ascent' ? '+361 M ASCENT' : '14 M NOMINAL WIDTH'}</small></dd></div>
      </dl>
    </footer>}
  </figure>;
}
