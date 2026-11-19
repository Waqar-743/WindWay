import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, useTexture } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { CHECKPOINTS, ROAD_WIDTH, START, TRACK_POINTS, nearestTrackPoint, ribbonGeometry, seededRandom, trackFrame } from './track';
import { SNOW_HURDLES, SNOW_ICE_ZONES } from './snowCourse';
import { CheckpointGates, Instances, TrackSurface } from './World';
import { useGame } from './store';
import { worldSurfaceUV } from './surfaceDetail';
import { CornerApexKit, CurveChevrons, GlowInstances, ProgressMarkers, RailDressUp, RestStop, Snowbanks, type RestStopPalette, type RoadPoint, type TrackFrame } from './RoadsideDetails';

const snowArt = (name: string) => `${import.meta.env.BASE_URL}snow-pack/${name}.svg`;
const signs = ['snowman', 'snowy-tree', 'arctic-fox', 'mountain-hut', 'summit-flag', 'ice-warning', 'slalom-gate'];
const texturesToLoad = signs.map(snowArt);

const terrainHeight = (x: number, z: number) => {
  const nearest = nearestTrackPoint(x, z);
  const hills = Math.sin(x * 0.011 + 0.6) * Math.cos(z * 0.009) * Math.min(24, nearest.distance * 0.14)
    + Math.sin(x * 0.023 - z * 0.018) * Math.min(8, nearest.distance * 0.06);
  return Math.max(-4, nearest.point.y - 6.5 - Math.min(58, nearest.distance * 0.24) + hills);
};

/* ------------------------------------------------------------------ */
/* Procedural textures                                                 */
/* ------------------------------------------------------------------ */

/** Rich alpine mountain ground: snow patches mixed with exposed granite, pine earth and blue shadow drifts. */
function snowGroundTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#cfdce6';
  context.fillRect(0, 0, size, size);
  const random = seededRandom(8123);
  const palette = ['#dce8f1', '#b4c6d4', '#8ea1b0', '#e8f1f7', '#9cb2c2', '#6f8291', '#7d9288'];
  for (let i = 0; i < 240; i++) {
    const x = random() * size, y = random() * size, radius = 12 + random() * 68;
    const color = palette[Math.floor(random() * palette.length)];
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color + 'cc');
    gradient.addColorStop(0.55, color + '55');
    gradient.addColorStop(1, color + '00');
    context.fillStyle = gradient;
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  }
  for (let i = 0; i < 110; i++) {
    const x = random() * size, y = random() * size, w = 35 + random() * 140;
    context.fillStyle = `rgba(245,250,255,${0.08 + random() * 0.14})`;
    context.beginPath(); context.ellipse(x, y, w, 1.5 + random() * 3.5, (random() - 0.5) * 0.3, 0, Math.PI * 2); context.fill();
  }
  for (let i = 0; i < 950; i++) {
    const x = random() * size, y = random() * size;
    context.fillStyle = random() < 0.55 ? 'rgba(255,255,255,0.55)' : 'rgba(130,175,205,0.35)';
    context.fillRect(x, y, 1 + random() * 1.5, 1 + random() * 1.5);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Stone-masonry retaining wall texture for the mountain pass foundation. */
function retainingWallTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3b4954';
  ctx.fillRect(0, 0, size, size);
  const random = seededRandom(5519);
  const rows = 8, rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * 32;
    for (let x = -32; x < size + 32; x += 64) {
      const shade = 58 + Math.floor(random() * 34);
      ctx.fillStyle = `rgb(${shade},${shade + 10},${shade + 19})`;
      ctx.fillRect(x + offset + 2, r * rowH + 2, 60, rowH - 4);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function snowflakeTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(225,244,255,0.75)');
  grad.addColorStop(1, 'rgba(225,244,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Mountain terrain, sculpted hills & engineered stone pass foundation */
/* ------------------------------------------------------------------ */

function SnowTerrain({ low }: { low: boolean }) {
  const snowTexture = useMemo(snowGroundTexture, []);
  const wallTexture = useMemo(retainingWallTexture, []);
  useEffect(() => () => { snowTexture.dispose(); wallTexture.dispose(); }, [snowTexture, wallTexture]);

  const terrain = useMemo(() => {
    const g = new THREE.PlaneGeometry(2600, 3100, low ? 72 : 112, low ? 86 : 132);
    g.rotateX(-Math.PI / 2); g.translate(0, 0, -150);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    const normals = g.attributes.normal;
    const colors = new Float32Array(p.count * 3);
    const snowColor = new THREE.Color('#eef5fa');
    const slateRock = new THREE.Color('#475766');
    const darkCliff = new THREE.Color('#2f3c48');
    const pineEarth = new THREE.Color('#445e52');
    const glacierBlue = new THREE.Color('#8ec3dc');
    const tint = new THREE.Color();
    const random = seededRandom(77);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), x = p.getX(i), z = p.getZ(i);
      const steep = THREE.MathUtils.clamp((0.89 - normals.getY(i)) / 0.28, 0, 1);
      const lowValley = THREE.MathUtils.clamp(1 - y / 135, 0, 1);
      const ridgeWave = (Math.sin(x * 0.014) * Math.cos(z * 0.012) + 1) * 0.5;
      tint.copy(snowColor);
      // Lower slopes show rich evergreen pine-earth patches peeking through snow
      tint.lerp(pineEarth, lowValley * ridgeWave * 0.52);
      // Steep cuts reveal rugged dark alpine granite cliffs
      tint.lerp(slateRock, steep * 0.85);
      if (steep > 0.55) tint.lerp(darkCliff, (steep - 0.55) * 1.1);
      // Higher altitudes get glacial icy-blue shadow striations
      if (y > 140) tint.lerp(glacierBlue, (1 - ridgeWave) * 0.24);
      tint.offsetHSL(0, 0, (random() - 0.5) * 0.04);
      colors[i * 3] = tint.r; colors[i * 3 + 1] = tint.g; colors[i * 3 + 2] = tint.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return worldSurfaceUV(g, 18);
  }, [low]);

  const { foundation, buttresses } = useMemo(() => {
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    const buttresses: RoadPoint[] = [];
    TRACK_POINTS.forEach(({ point, right, yaw }, i) => {
      for (const side of [-1, 1]) {
        const p = point.clone().addScaledVector(right, side * (ROAD_WIDTH / 2 + 1.55));
        positions.push(p.x, p.y - 0.08, p.z, p.x, p.y - 11.5, p.z);
        uvs.push(i * 0.45, 0, i * 0.45, 2.2);
        if (i % (low ? 22 : 12) === 0) {
          const bp = point.clone().addScaledVector(right, side * (ROAD_WIDTH / 2 + 1.85));
          buttresses.push({ position: [bp.x, point.y - 5.2, bp.z], scale: [0.85, 10.4, 1.05], rotation: yaw });
        }
      }
      if (i < TRACK_POINTS.length - 1) {
        const v = i * 4;
        indices.push(v, v + 1, v + 4, v + 1, v + 5, v + 4, v + 2, v + 6, v + 3, v + 3, v + 6, v + 7);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return { foundation: g, buttresses };
  }, [low]);

  useEffect(() => () => { terrain.dispose(); foundation.dispose(); }, [terrain, foundation]);
  return <>
    <mesh geometry={terrain} receiveShadow><meshLambertMaterial map={snowTexture} vertexColors /></mesh>
    <mesh geometry={foundation} receiveShadow><meshStandardMaterial map={wallTexture} roughness={0.9} metalness={0.05} side={THREE.DoubleSide} /></mesh>
    <Instances points={buttresses} kind="box" color="#53626e" colors={['#485763', '#5a6a76', '#3f4d58']} shadows={false} />
  </>;
}

/** Layered rolling forested hills, granite outcrops, snow-dusted evergreens, and towering alpine peaks. */
const SnowForestAndHills = memo(function SnowForestAndHills({ low }: { low: boolean }) {
  const { trees, rollingHills, hillCaps, graniteOutcrops, peaks, peakCaps } = useMemo(() => {
    const random = seededRandom(171224);
    const trees: { x: number; z: number; y: number; size: number }[] = [];
    for (let i = 0; i < (low ? 700 : 1450); i++) {
      const x = (random() - 0.5) * 1400, z = (random() - 0.5) * 2300 - 100;
      const nearest = nearestTrackPoint(x, z);
      if (nearest.distance < 15 || nearest.distance > 310) continue;
      trees.push({ x, z, y: terrainHeight(x, z), size: 0.95 + random() * 1.55 });
    }

    // Rolling sculptural alpine hills flanking the climb so the vista has warm depth and shadow
    const rollingHills: RoadPoint[] = [], hillCaps: RoadPoint[] = [];
    for (let i = 0; i < (low ? 32 : 58); i++) {
      const progress = (i + 0.3) / (low ? 32 : 58);
      const frame = trackFrame(progress);
      const side = i % 2 ? 1 : -1;
      const dist = 85 + random() * 190;
      const p = frame.point.clone().addScaledVector(frame.right, side * dist);
      if (nearestTrackPoint(p.x, p.z).distance < 52) continue;
      const w = 55 + random() * 90;
      const h = 38 + random() * 78;
      const baseY = terrainHeight(p.x, p.z);
      rollingHills.push({ position: [p.x, baseY + h * 0.38, p.z], scale: [w, h, w * (0.85 + random() * 0.3)], rotation: random() * Math.PI });
      hillCaps.push({ position: [p.x, baseY + h * 0.66, p.z], scale: [w * 0.44, h * 0.36, w * 0.44], rotation: random() * Math.PI });
    }

    // Exposed granite crags & cliff boulders beside switchbacks
    const graniteOutcrops: RoadPoint[] = [];
    for (let i = 0; i < (low ? 55 : 130); i++) {
      const progress = random();
      const frame = trackFrame(progress);
      const side = random() < 0.5 ? -1 : 1;
      const dist = 16 + random() * 72;
      const p = frame.point.clone().addScaledVector(frame.right, side * dist);
      if (nearestTrackPoint(p.x, p.z).distance < 14) continue;
      const s = 3.2 + random() * 7.5;
      const y = terrainHeight(p.x, p.z);
      graniteOutcrops.push({ position: [p.x, y + s * 0.45, p.z], scale: [s * 1.3, s * 0.95, s * 1.1], rotation: random() * Math.PI });
    }

    // Towering alpine massifs with crisp snow peaks
    const peaks: RoadPoint[] = [], peakCaps: RoadPoint[] = [];
    for (let i = 0; i < 28; i++) {
      const x = (i % 2 ? -1 : 1) * (580 + random() * 340);
      const z = -1450 + (i / 28) * 2650;
      const height = 210 + random() * 330;
      const width = 180 + random() * 145;
      peaks.push({ position: [x, 70 + height * 0.45, z], scale: [width, height, width * 0.95], rotation: random() * Math.PI });
      peakCaps.push({ position: [x, 70 + height * 0.81, z], scale: [width * 0.34, height * 0.32, width * 0.34], rotation: random() * Math.PI });
    }
    return { trees, rollingHills, hillCaps, graniteOutcrops, peaks, peakCaps };
  }, [low]);

  const trunks = useMemo(() => trees.map(({ x, z, y, size }) => ({ position: [x, y + 2 * size, z] as [number, number, number], scale: [0.65 * size, 4 * size, 0.65 * size] as [number, number, number] })), [trees]);
  const branches = useMemo(() => trees.flatMap(({ x, z, y, size }) => [0, 1, 2].map((level) => ({ position: [x, y + (3.7 + level * 1.8) * size, z] as [number, number, number], scale: [(3.5 - level * 0.7) * size, 4.8 * size, (3.5 - level * 0.7) * size] as [number, number, number] }))), [trees]);
  const caps = useMemo(() => branches.map(({ position, scale }) => ({ position: [position[0], position[1] + scale[1] * 0.14, position[2]] as [number, number, number], scale: [scale[0] * 0.86, scale[1] * 0.72, scale[2] * 0.86] as [number, number, number] })), [branches]);

  return <>
    <Instances points={peaks} kind="cone" color="#526c82" colors={['#455f75', '#5d788f', '#4e667a', '#688299']} shadows={false} />
    <Instances points={peakCaps} kind="cone" color="#f3f8fc" colors={['#f3f8fc', '#ffe9d8', '#e6f2fa']} shadows={false} />
    <Instances points={rollingHills} kind="rock" color="#4d6460" colors={['#425a55', '#52686c', '#5e7378', '#3c524d']} shadows={false} />
    <Instances points={hillCaps} kind="rock" color="#e4eff7" colors={['#e4eff7', '#d8e7f2', '#f2f7fb']} shadows={false} />
    <Instances points={graniteOutcrops} kind="rock" color="#4b5a66" colors={['#3e4d59', '#576673', '#677783', '#46525c']} shadows={false} />
    <Instances points={trunks} kind="box" color="#573f2d" />
    <Instances points={branches} kind="cone" color="#1e4a3d" colors={['#1a4338', '#245244', '#2b5e4c', '#1c3e45']} />
    <Instances points={caps} kind="cone" color="#e4f0f8" />
  </>;
});

/* ------------------------------------------------------------------ */
/* Cozy Nordic alpine homes, village clusters & warm streetlamps       */
/* ------------------------------------------------------------------ */

interface ChaletSite {
  position: [number, number, number];
  yaw: number;
  wall: string;
  roof: string;
  scale: number;
}

function AlpineChalet({ site, index }: { site: ChaletSite; index: number }) {
  const smokeRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!smokeRef.current) return;
    const t = clock.elapsedTime + index * 1.7;
    smokeRef.current.children.forEach((puff, i) => {
      const cycle = (t * 0.35 + i * 0.33) % 1;
      puff.position.set(Math.sin(t + i) * 0.35, cycle * 3.8, Math.cos(t * 0.8 + i) * 0.25);
      const s = 0.28 + cycle * 0.55;
      puff.scale.setScalar(s * (1 - cycle * 0.45));
    });
  });
  return <group position={site.position} rotation={[0, site.yaw, 0]} scale={site.scale}>
    {/* Stone foundation plinth */}
    <mesh position={[0, 0.55, 0]} castShadow receiveShadow><boxGeometry args={[7.4, 1.1, 6.2]} /><meshLambertMaterial color="#515f6b" /></mesh>
    {/* Timber / painted plaster house body */}
    <mesh position={[0, 2.75, 0]} castShadow receiveShadow><boxGeometry args={[6.8, 3.4, 5.6]} /><meshLambertMaterial color={site.wall} /></mesh>
    {/* Corner timber trim beams */}
    {[-3.42, 3.42].flatMap((x) => [-2.82, 2.82].map((z) => <mesh key={`${x}-${z}`} position={[x, 2.75, z]}><boxGeometry args={[0.24, 3.45, 0.24]} /><meshLambertMaterial color="#3c2b21" /></mesh>))}
    {/* Steep pitched alpine roof + snowy cap */}
    <mesh position={[0, 5.85, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[5.7, 3.1, 4]} /><meshLambertMaterial color={site.roof} flatShading /></mesh>
    <mesh position={[0, 6.08, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[5.45, 2.85, 4]} /><meshLambertMaterial color="#eef6fb" flatShading /></mesh>
    {/* Stone chimney + animated cozy smoke */}
    <mesh position={[1.9, 6.1, -1.1]} castShadow><boxGeometry args={[0.85, 2.6, 0.85]} /><meshLambertMaterial color="#4e5c66" /></mesh>
    <group ref={smokeRef} position={[1.9, 7.5, -1.1]}>
      {[0, 1, 2].map((i) => <mesh key={i}><icosahedronGeometry args={[0.5, 0]} /><meshBasicMaterial color="#e6eef4" transparent opacity={0.42} depthWrite={false} /></mesh>)}
    </group>
    {/* Front door & warm porch roof */}
    <mesh position={[0, 2.05, 2.84]}><boxGeometry args={[1.35, 2.2, 0.12]} /><meshLambertMaterial color="#462e20" /></mesh>
    <mesh position={[0, 3.45, 3.35]} rotation={[0.22, 0, 0]}><boxGeometry args={[2.5, 0.18, 1.3]} /><meshLambertMaterial color="#dce9f2" /></mesh>
    {/* Glowing amber windows (front + sides) */}
    {[-2.05, 2.05].map((wx) => <group key={wx} position={[wx, 2.8, 2.84]}>
      <mesh><boxGeometry args={[1.3, 1.25, 0.08]} /><meshLambertMaterial color="#3b2c22" /></mesh>
      <mesh position={[0, 0, 0.05]}><planeGeometry args={[1.05, 1.0]} /><meshBasicMaterial color="#ffd87a" toneMapped={false} /></mesh>
    </group>)}
    {[-1.2, 1.2].map((wz) => <group key={wz} position={[3.44, 2.8, wz]} rotation={[0, Math.PI / 2, 0]}>
      <mesh><boxGeometry args={[1.2, 1.15, 0.08]} /><meshLambertMaterial color="#3b2c22" /></mesh>
      <mesh position={[0, 0, 0.05]}><planeGeometry args={[0.98, 0.92]} /><meshBasicMaterial color="#ffd87a" toneMapped={false} /></mesh>
    </group>)}
    {/* Porch lantern */}
    <mesh position={[1.05, 3.05, 3.15]}><boxGeometry args={[0.22, 0.3, 0.22]} /><meshBasicMaterial color="#ffe49e" toneMapped={false} /></mesh>
    {/* Stacked firewood beside wall */}
    <mesh position={[-3.75, 1.45, 0.6]}><boxGeometry args={[0.7, 0.85, 1.9]} /><meshLambertMaterial color="#7d5838" /></mesh>
  </group>;
}

const SnowVillage = memo(function SnowVillage({ low }: { low: boolean }) {
  const { chalets, lampPosts, lampGlows } = useMemo(() => {
    const walls = ['#8a4b3c', '#7c5c43', '#496375', '#a67b4d', '#6e4c3b', '#3f6359'];
    const roofs = ['#2c3a44', '#632e27', '#2f4942', '#3a4652'];
    const anchors = [0.012, 0.032, 0.055, 0.145, 0.23, 0.34, 0.44, 0.56, 0.67, 0.78, 0.87, 0.955];
    const chalets: ChaletSite[] = [];
    const lampPosts: RoadPoint[] = [], lampGlows: RoadPoint[] = [];
    const random = seededRandom(9091);

    anchors.forEach((anchor, idx) => {
      if (low && idx % 2 === 1) return;
      for (let attempt = 0; attempt < 14; attempt++) {
        const progress = Math.min(0.985, anchor + attempt * 0.008);
        const frame = trackFrame(progress);
        const side = (idx + attempt) % 2 ? 1 : -1;
        const dist = ROAD_WIDTH / 2 + 12.5 + random() * 6;
        const p = frame.point.clone().addScaledVector(frame.right, side * dist);
        // Never intrude onto any switchback leg
        if (nearestTrackPoint(p.x, p.z).distance < ROAD_WIDTH / 2 + 10.5) continue;
        if (chalets.some((c) => Math.hypot(c.position[0] - p.x, c.position[2] - p.z) < 16)) continue;
        const groundY = Math.max(frame.point.y - 2.6, terrainHeight(p.x, p.z));
        const faceRoad = Math.atan2(-side * frame.right.x, -side * frame.right.z);
        chalets.push({
          position: [p.x, groundY, p.z],
          yaw: faceRoad + (random() - 0.5) * 0.28,
          wall: walls[idx % walls.length],
          roof: roofs[idx % roofs.length],
          scale: 0.92 + random() * 0.32,
        });
        // Warm streetlamp near the roadside facing each village home
        const lp = frame.point.clone().addScaledVector(frame.right, side * (ROAD_WIDTH / 2 + 3.2));
        lampPosts.push({ position: [lp.x, frame.point.y + 2.1, lp.z], scale: [0.16, 4.2, 0.16], rotation: frame.yaw });
        lampGlows.push({ position: [lp.x, frame.point.y + 4.35, lp.z], scale: [0.46, 0.42, 0.46], rotation: frame.yaw });
        break;
      }
    });
    return { chalets, lampPosts, lampGlows };
  }, [low]);

  return <group>
    {chalets.map((site, i) => <AlpineChalet key={i} site={site} index={i} />)}
    <Instances points={lampPosts} kind="box" color="#2e3a42" shadows={false} />
    <GlowInstances points={lampGlows} color="#ffd97d" />
  </group>;
});

/* ------------------------------------------------------------------ */
/* 3D Animated Polar Bears, Penguins, Snowmen & Alpine Gondola Lift    */
/* ------------------------------------------------------------------ */

function PolarBear({ position, rotation = 0, scale = 1, phase = 0 }: { position: [number, number, number]; rotation?: number; scale?: number; phase?: number }) {
  const headRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(t * 0.75) * 0.24;
      headRef.current.rotation.x = Math.sin(t * 1.1) * 0.06;
    }
    if (bodyRef.current) {
      bodyRef.current.position.y = Math.sin(t * 1.6) * 0.04;
    }
  });
  return <group position={position} rotation={[0, rotation, 0]} scale={scale}>
    {/* Ice/granite perch ledge under bear */}
    <mesh position={[0, -0.22, 0]} receiveShadow><cylinderGeometry args={[2.1, 2.6, 0.45, 7]} /><meshLambertMaterial color="#c4d9e8" flatShading /></mesh>
    <group ref={bodyRef}>
      {/* Torso */}
      <mesh position={[0, 1.38, 0]} scale={[0.95, 0.88, 1.58]} castShadow><sphereGeometry args={[1, 12, 10]} /><meshLambertMaterial color="#f6f9fb" flatShading /></mesh>
      {/* Shoulder hump */}
      <mesh position={[0, 1.72, 0.7]} scale={[0.78, 0.65, 0.75]} castShadow><sphereGeometry args={[1, 10, 8]} /><meshLambertMaterial color="#eef4f8" flatShading /></mesh>
      {/* 4 sturdy legs + paws */}
      {[-0.58, 0.58].flatMap((lx) => [-0.95, 0.88].map((lz) => <group key={`${lx}-${lz}`} position={[lx, 0.6, lz]}>
        <mesh castShadow><boxGeometry args={[0.46, 1.2, 0.5]} /><meshLambertMaterial color="#e6eff5" /></mesh>
        <mesh position={[0, -0.52, 0.12]}><boxGeometry args={[0.48, 0.22, 0.64]} /><meshLambertMaterial color="#d2e0ea" /></mesh>
      </group>))}
      {/* Tail */}
      <mesh position={[0, 1.48, -1.56]}><sphereGeometry args={[0.24, 8, 6]} /><meshLambertMaterial color="#f6f9fb" /></mesh>
      {/* Animated head & muzzle */}
      <group ref={headRef} position={[0, 1.85, 1.55]}>
        <mesh scale={[0.62, 0.56, 0.72]} castShadow><sphereGeometry args={[1, 10, 8]} /><meshLambertMaterial color="#f9fbfd" flatShading /></mesh>
        {/* Snout */}
        <mesh position={[0, -0.08, 0.66]} scale={[0.38, 0.3, 0.48]}><sphereGeometry args={[1, 8, 6]} /><meshLambertMaterial color="#ebf2f7" /></mesh>
        {/* Glossy black nose */}
        <mesh position={[0, -0.02, 1.1]}><sphereGeometry args={[0.14, 8, 6]} /><meshBasicMaterial color="#18222a" /></mesh>
        {/* Rounded ears */}
        {[-0.4, 0.4].map((ex) => <mesh key={ex} position={[ex, 0.44, -0.1]}><sphereGeometry args={[0.18, 8, 6]} /><meshLambertMaterial color="#e8f1f7" /></mesh>)}
        {/* Eyes */}
        {[-0.28, 0.28].map((ex) => <mesh key={ex} position={[ex, 0.14, 0.54]}><sphereGeometry args={[0.075, 6, 5]} /><meshBasicMaterial color="#18222a" /></mesh>)}
      </group>
    </group>
  </group>;
}

function ArcticPenguin({ position, rotation = 0, phase = 0 }: { position: [number, number, number]; rotation?: number; phase?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 3.2 + phase) * 0.12;
  });
  return <group ref={ref} position={position} rotation={[0, rotation, 0]} scale={1.15}>
    <mesh position={[0, 0.68, 0]} scale={[0.42, 0.68, 0.38]} castShadow><sphereGeometry args={[1, 8, 8]} /><meshLambertMaterial color="#1d2d3a" flatShading /></mesh>
    <mesh position={[0, 0.62, 0.22]} scale={[0.3, 0.52, 0.24]}><sphereGeometry args={[1, 8, 6]} /><meshLambertMaterial color="#f5f9fc" /></mesh>
    <mesh position={[0, 1.38, 0]}><sphereGeometry args={[0.32, 8, 6]} /><meshLambertMaterial color="#1d2d3a" /></mesh>
    <mesh position={[0, 1.34, 0.34]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.11, 0.34, 5]} /><meshLambertMaterial color="#f08b46" /></mesh>
    {[-0.16, 0.16].map((fx) => <mesh key={fx} position={[fx, 0.06, 0.14]}><boxGeometry args={[0.18, 0.08, 0.32]} /><meshLambertMaterial color="#f08b46" /></mesh>)}
  </group>;
}

function Snowman3D({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return <group position={position} rotation={[0, rotation, 0]} scale={1.2}>
    <mesh position={[0, 0.65, 0]} castShadow><sphereGeometry args={[0.72, 10, 8]} /><meshLambertMaterial color="#f4f9fc" flatShading /></mesh>
    <mesh position={[0, 1.62, 0]} castShadow><sphereGeometry args={[0.52, 10, 8]} /><meshLambertMaterial color="#f4f9fc" flatShading /></mesh>
    <mesh position={[0, 2.38, 0]} castShadow><sphereGeometry args={[0.36, 10, 8]} /><meshLambertMaterial color="#f8fbfe" flatShading /></mesh>
    {/* Coral scarf */}
    <mesh position={[0, 2.02, 0]}><cylinderGeometry args={[0.4, 0.42, 0.18, 10]} /><meshLambertMaterial color="#e0624c" /></mesh>
    {/* Top hat */}
    <mesh position={[0, 2.7, 0]}><cylinderGeometry args={[0.46, 0.46, 0.08, 10]} /><meshLambertMaterial color="#212d36" /></mesh>
    <mesh position={[0, 2.95, 0]}><cylinderGeometry args={[0.28, 0.3, 0.46, 10]} /><meshLambertMaterial color="#212d36" /></mesh>
    {/* Carrot nose */}
    <mesh position={[0, 2.38, 0.44]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.08, 0.42, 6]} /><meshLambertMaterial color="#f07e3a" /></mesh>
  </group>;
}

/** Animated alpine gondola ski-lift gliding over the mountainside. */
function AlpineGondola({ low }: { low: boolean }) {
  const cabinsRef = useRef<THREE.Group[]>([]);
  const lift = useMemo(() => {
    const startF = trackFrame(0.08), endF = trackFrame(0.54);
    const a = startF.point.clone().addScaledVector(startF.right, -38).add(new THREE.Vector3(0, 18, 0));
    const b = endF.point.clone().addScaledVector(endF.right, -44).add(new THREE.Vector3(0, 32, 0));
    const pylons = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const p = a.clone().lerp(b, t);
      const gy = terrainHeight(p.x, p.z);
      return { x: p.x, y: p.y, z: p.z, h: Math.max(10, p.y - gy) };
    });
    const dist = a.distanceTo(b);
    const mid = a.clone().lerp(b, 0.5);
    const dir = b.clone().sub(a).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return { a, b, pylons, dist, mid, quat };
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.032;
    cabinsRef.current.forEach((group, i) => {
      if (!group) return;
      const u = (t + i / 5) % 1;
      group.position.lerpVectors(lift.a, lift.b, u);
      group.position.y -= 2.2;
    });
  });

  if (low) return null;
  const cabinColors = ['#e05a44', '#f0b849', '#3d99b8', '#e05a44', '#57b892'];
  return <group>
    {lift.pylons.map((py, i) => <group key={i} position={[py.x, py.y, py.z]}>
      <mesh position={[0, -py.h / 2, 0]}><boxGeometry args={[0.9, py.h, 0.9]} /><meshLambertMaterial color="#364652" /></mesh>
      <mesh position={[0, 0.2, 0]}><boxGeometry args={[6.2, 0.6, 0.7]} /><meshLambertMaterial color="#485a68" /></mesh>
    </group>)}
    <mesh position={lift.mid} quaternion={lift.quat}>
      <cylinderGeometry args={[0.09, 0.09, lift.dist, 5]} />
      <meshBasicMaterial color="#1f2a33" />
    </mesh>
    {cabinColors.map((color, i) => <group key={i} ref={(n) => { if (n) cabinsRef.current[i] = n; }}>
      <mesh position={[0, 1.1, 0]}><boxGeometry args={[0.12, 2.2, 0.12]} /><meshLambertMaterial color="#27323b" /></mesh>
      <mesh castShadow><boxGeometry args={[2.1, 2.2, 2.4]} /><meshStandardMaterial color={color} roughness={0.35} metalness={0.25} /></mesh>
      <mesh position={[0, 0.2, 0]}><boxGeometry args={[2.16, 0.9, 1.9]} /><meshBasicMaterial color="#ffe49e" toneMapped={false} /></mesh>
    </group>)}
  </group>;
}

/** Shimmering Aurora Borealis ribbons glowing high above the summit horizon. */
function AuroraRibbons({ low }: { low: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.position.x = Math.sin(clock.elapsedTime * 0.14) * 35;
  });
  if (low) return null;
  return <group ref={groupRef} position={[0, 490, -1180]}>
    {[
      { x: -160, y: 0, z: 0, w: 620, h: 110, rot: 0.12, color: '#58e8b8' },
      { x: 140, y: 45, z: -40, w: 540, h: 95, rot: -0.09, color: '#78d4ff' },
    ].map((band, i) => <mesh key={i} position={[band.x, band.y, band.z]} rotation={[0, band.rot, 0.06]}>
      <planeGeometry args={[band.w, band.h]} />
      <meshBasicMaterial color={band.color} transparent opacity={0.14} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
    </mesh>)}
  </group>;
}

const SnowWildlifeAndLakes = memo(function SnowWildlifeAndLakes({ low }: { low: boolean }) {
  const { bears, penguins, snowmen, lakes } = useMemo(() => {
    const placeClear = (progress: number, side: 1 | -1, dist: number) => {
      const frame = trackFrame(progress);
      const p = frame.point.clone().addScaledVector(frame.right, side * dist);
      const y = Math.max(frame.point.y - 1.2, terrainHeight(p.x, p.z));
      const yaw = Math.atan2(-side * frame.right.x, -side * frame.right.z);
      return { pos: [p.x, y, p.z] as [number, number, number], yaw };
    };

    const bearSpots: { pos: [number, number, number]; yaw: number; scale: number; phase: number }[] = [];
    // Mother polar bear & cub right near Base Camp so the player spots them early!
    const baseBear = placeClear(0.022, 1, ROAD_WIDTH / 2 + 6.5);
    bearSpots.push({ ...baseBear, scale: 1.32, phase: 0 });
    bearSpots.push({ pos: [baseBear.pos[0] + 2.8, baseBear.pos[1] - 0.1, baseBear.pos[2] + 2.1], yaw: baseBear.yaw - 0.5, scale: 0.76, phase: 1.4 });
    // Additional polar bears along scenic mountain bends and summit approach
    for (const [prog, side, sc, ph] of [[0.18, -1, 1.38, 2.2], [0.39, 1, 1.28, 3.5], [0.63, -1, 1.42, 4.8], [0.85, 1, 1.35, 1.1], [0.97, -1, 1.45, 0.6]] as const) {
      if (low && prog > 0.4 && prog < 0.9) continue;
      const spot = placeClear(prog, side, ROAD_WIDTH / 2 + 7.2);
      if (nearestTrackPoint(spot.pos[0], spot.pos[2]).distance >= ROAD_WIDTH / 2 + 5.5) {
        bearSpots.push({ ...spot, scale: sc, phase: ph });
      }
    }

    const penguins = [
      { ...placeClear(0.048, -1, ROAD_WIDTH / 2 + 5.6), phase: 0 },
      { ...placeClear(0.052, -1, ROAD_WIDTH / 2 + 7.2), phase: 1.2 },
      { ...placeClear(0.29, 1, ROAD_WIDTH / 2 + 6.2), phase: 2.4 },
      { ...placeClear(0.74, -1, ROAD_WIDTH / 2 + 6.4), phase: 0.8 },
    ];

    const snowmen = [
      placeClear(0.015, -1, ROAD_WIDTH / 2 + 5.5),
      placeClear(0.24, 1, ROAD_WIDTH / 2 + 6.5),
      placeClear(0.57, -1, ROAD_WIDTH / 2 + 6.0),
      placeClear(0.96, 1, ROAD_WIDTH / 2 + 6.5),
    ];

    // Frozen glacial lakes tucked into valley basins beside the lower/mid climb
    const lakes = [0.055, 0.48].map((prog, idx) => {
      const side: 1 | -1 = idx === 0 ? -1 : 1;
      const frame = trackFrame(prog);
      const p = frame.point.clone().addScaledVector(frame.right, side * 34);
      const y = terrainHeight(p.x, p.z) + 0.6;
      return { pos: [p.x, y, p.z] as [number, number, number], radius: idx === 0 ? 22 : 26 };
    });

    return { bears: bearSpots, penguins, snowmen, lakes };
  }, [low]);

  return <group>
    {bears.map((b, i) => <PolarBear key={i} position={b.pos} rotation={b.yaw} scale={b.scale} phase={b.phase} />)}
    {penguins.map((pg, i) => <ArcticPenguin key={i} position={pg.pos} rotation={pg.yaw} phase={pg.phase} />)}
    {snowmen.map((sm, i) => <Snowman3D key={i} position={sm.pos} rotation={sm.yaw} />)}
    {lakes.map((lake, i) => <mesh key={i} position={lake.pos} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[lake.radius, 24]} />
      <meshStandardMaterial color="#7ac2e0" roughness={0.08} metalness={0.38} envMapIntensity={1.2} />
    </mesh>)}
  </group>;
});

/* ------------------------------------------------------------------ */
/* Ice zones, hurdles, signs & falling snow                            */
/* ------------------------------------------------------------------ */

function IceAndHurdles() {
  const ice = useMemo(() => SNOW_ICE_ZONES.map(([from, to]) => ribbonGeometry(ROAD_WIDTH - 0.8, 0, 0.035, from, to)), []);
  const iceBeacons = useMemo(() => {
    const markers: RoadPoint[] = [];
    for (const [from, to] of SNOW_ICE_ZONES) {
      for (const p of [from, (from + to) / 2, to]) {
        const frame = trackFrame(p);
        for (const side of [-1, 1]) {
          const pos = frame.point.clone().addScaledVector(frame.right, side * (ROAD_WIDTH / 2 + 0.5));
          markers.push({ position: [pos.x, pos.y + 0.65, pos.z], scale: [0.16, 0.28, 0.16], rotation: frame.yaw });
        }
      }
    }
    return markers;
  }, []);
  useEffect(() => () => ice.forEach((g) => g.dispose()), [ice]);
  return <>
    {ice.map((geometry, i) => <mesh key={i} geometry={geometry} receiveShadow><meshStandardMaterial color="#7cc4e6" emissive="#2a7ca3" emissiveIntensity={0.22} roughness={0.08} metalness={0.38} envMapIntensity={1.2} transparent opacity={0.86} depthWrite={false} /></mesh>)}
    <GlowInstances points={iceBeacons} color="#8bdcff" />
    <RigidBody type="fixed" colliders={false} name="barriers">
      {SNOW_HURDLES.map((hurdle) => <group key={hurdle.id}>
        <CuboidCollider position={hurdle.position} rotation={[0, hurdle.yaw, 0]} args={hurdle.halfExtents} friction={0} restitution={0} />
        <group position={hurdle.position} rotation={[0, hurdle.yaw, 0]}>
          <mesh castShadow receiveShadow><boxGeometry args={[2.7, 1.5, 3.2]} /><meshStandardMaterial color="#d8e7f2" roughness={0.55} metalness={0.08} /></mesh>
          <mesh position={[0, 0.78, 0]}><boxGeometry args={[2.85, 0.16, 3.35]} /><meshLambertMaterial color="#f5fbff" /></mesh>
          <mesh position={[0, 0, -1.62]}><boxGeometry args={[2.35, 0.42, 0.06]} /><meshBasicMaterial color="#f06f56" toneMapped={false} /></mesh>
          <mesh position={[0, 0, 1.62]}><boxGeometry args={[2.35, 0.42, 0.06]} /><meshBasicMaterial color="#f06f56" toneMapped={false} /></mesh>
        </group>
      </group>)}
    </RigidBody>
    {SNOW_ICE_ZONES.map(([from], i) => <WinterSign key={i} name="ice-warning" progress={from - 0.004} side={i % 2 ? 1 : -1} size={3.2} />)}
  </>;
}

function WinterSign({ name, progress, side, size = 5 }: { name: string; progress: number; side: number; size?: number }) {
  const texture = useTexture(snowArt(name)), frame = trackFrame(progress), p = frame.point.clone().addScaledVector(frame.right, side * (ROAD_WIDTH / 2 + size * 0.6 + 2));
  return <Billboard position={[p.x, p.y + size / 2, p.z]} follow lockX lockZ><mesh><planeGeometry args={[size, size]} /><meshBasicMaterial map={texture} transparent alphaTest={0.08} side={THREE.DoubleSide} /></mesh></Billboard>;
}

function FallingSnow({ low }: { low: boolean }) {
  const points = useRef<THREE.Points>(null), cloud = useRef<THREE.Group>(null);
  const effects = useGame((state) => state.settings.effects), calm = useGame((state) => state.settings.reducedMotion);
  const flakeTex = useMemo(snowflakeTexture, []);
  const geometry = useMemo(() => {
    const random = seededRandom(5411), data = new Float32Array((low ? 320 : 780) * 3);
    for (let i = 0; i < data.length; i += 3) { data[i] = (random() - 0.5) * 160; data[i + 1] = random() * 80; data[i + 2] = (random() - 0.5) * 160; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(data, 3)); return g;
  }, [low]);
  useEffect(() => () => { geometry.dispose(); flakeTex.dispose(); }, [geometry, flakeTex]);
  useFrame(({ camera, clock }, delta) => {
    if (!cloud.current || !points.current || !effects) return;
    cloud.current.position.set(camera.position.x, camera.position.y - 15, camera.position.z);
    if (calm) return;
    const dt = Math.min(delta, 0.05);
    const wind = Math.sin(clock.elapsedTime * 0.5) * 2.2 * dt;
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i) - dt * 5.8;
      let x = positions.getX(i) + wind;
      if (x > 80) x -= 160; else if (x < -80) x += 160;
      positions.setXY(i, x, y < 0 ? y + 80 : y);
    }
    positions.needsUpdate = true;
  });
  if (!effects) return null;
  return <group ref={cloud}><points ref={points} geometry={geometry} frustumCulled={false}><pointsMaterial map={flakeTex} color="#ffffff" size={0.55} transparent opacity={0.78} depthWrite={false} /></points></group>;
}

const SNOW_LODGE: RestStopPalette = {
  wall: '#7a543c', roof: '#eef6fb', trim: '#3e2e24', glow: '#ffd98a',
  deck: '#5c6b75', post: '#4f3c2e', paper: '#f3f8fb', accent: '#f08b5b',
};
const KILOMETRES = Array.from({ length: 6 }, (_, index) => ({ small: 'WHITEOUT RIDGE', big: `${index + 1} KM` }));

export default memo(function SnowWorld({ low }: { low: boolean }) {
  const textures = useTexture(texturesToLoad);
  useEffect(() => { textures.forEach((texture) => { texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; }); }, [textures]);
  const summit = CHECKPOINTS[CHECKPOINTS.length - 1];
  const chevronGround = useMemo(() => (frame: TrackFrame) => frame.point.y - 0.08, []);
  const lodges = useMemo(() => {
    const find = (anchor: number) => {
      for (let attempt = 0; attempt < 24; attempt++) {
        const frame = trackFrame(anchor + attempt * 0.012);
        for (const side of [-1, 1] as const) {
          const distance = ROAD_WIDTH / 2 + 6.5;
          const p = frame.point.clone().addScaledVector(frame.right, side * distance);
          if (nearestTrackPoint(p.x, p.z).distance < distance + 1.5) continue;
          const ground = terrainHeight(p.x, p.z);
          return { position: [p.x, ground, p.z] as [number, number, number], yaw: frame.yaw, side, deckTop: Math.max(ground + 0.45, frame.point.y - 0.25) };
        }
      }
      return null;
    };
    return [find(0.3), find(0.72)].filter((lodge): lodge is NonNullable<typeof lodge> => lodge !== null);
  }, []);
  return <>
    <RigidBody type="fixed" colliders={false}><CuboidCollider args={[1400, 5, 1600]} position={[0, -8, -150]} restitution={0} /></RigidBody>
    <SnowTerrain low={low} />
    <SnowForestAndHills low={low} />
    <SnowVillage low={low} />
    <SnowWildlifeAndLakes low={low} />
    <AlpineGondola low={low} />
    <AuroraRibbons low={low} />
    <Snowbanks low={low} />
    <RailDressUp snow accent="#8bdcff" low={low} />
    <CurveChevrons accent="#f08b5b" distance={1.1} boardY={2.05} groundY={chevronGround} />
    <CornerApexKit accent="#f08b5b" low={low} groundY={chevronGround} />
    <ProgressMarkers labels={KILOMETRES} accent="#8bdcff" distance={1.1} groundY={chevronGround} />
    {lodges.map((lodge, index) => <RestStop key={index} position={lodge.position} yaw={lodge.yaw} side={lodge.side} low={low} palette={SNOW_LODGE} kind="lodge" deckTop={lodge.deckTop} />)}
    <TrackSurface /><IceAndHurdles /><CheckpointGates />
    <WinterSign name="snowman" progress={0.008} side={1} size={5.2} /><WinterSign name="mountain-hut" progress={0.005} side={-1} size={7} />
    <WinterSign name="arctic-fox" progress={0.32} side={1} /><WinterSign name="snowman" progress={0.58} side={-1} />
    <WinterSign name="slalom-gate" progress={0.067} side={-1} size={3.8} />
    <WinterSign name="summit-flag" progress={0.987} side={1} size={7} /><WinterSign name="snowy-tree" progress={0.80} side={1} size={6} />
    {/* Granite summit terrace & warm beacon platform */}
    <mesh position={[summit.point.x, summit.point.y - 1.5, summit.point.z]} receiveShadow><cylinderGeometry args={[24, 34, 2.8, 16]} /><meshLambertMaterial color="#556673" /></mesh>
    <mesh position={[START.point.x, START.point.y - 2, START.point.z]}><cylinderGeometry args={[22, 32, 3.5, 14]} /><meshLambertMaterial color="#4e5f6c" /></mesh>
    <FallingSnow low={low} />
  </>;
});
