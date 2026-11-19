import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, useTexture } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { CHECKPOINTS, ROAD_WIDTH, TRACK_CLOSED, TRACK_POINTS, nearestTrackPoint, ribbonGeometry, roadHalfWidthAt, seededRandom, trackFrame } from './track';
import { BOOST_JUMP, JUMP_STRIPES, jumpRampGeometry } from './trackFeatures';
import { art } from './config';
import { useGame } from './store';
import { BRIDGE_DECK_SEGMENTS, BRIDGE_SUPPORTS, TRACK_BARRIERS } from './trackBarriers';
import { currentMap } from './maps';
import { surfaceTexture, roadRoughnessTexture, worldSurfaceUV } from './surfaceDetail';
import AlpineTown from './AlpineTown';
import { buildAlpineTown, isTownLot, type TownSite } from './alpineVillage';
import { CornerApexKit, CurveChevrons, ProgressMarkers, RailDressUp, type TrackFrame } from './RoadsideDetails';

const INK = '#30483d';
const LIME = '#d5fc58';
const GRAPHITE = '#20262a';
const ROUTE_ACCENTS = { alpine: '#f08b5b', jungle: '#6bdeb1', snow: '#8bdcff' } as const;
type InstancePoint = { position: [number, number, number]; scale: [number, number, number]; rotation?: number };

export function Instances({ points, kind, color, colors, shadows }: { points: InstancePoint[]; kind: 'cone' | 'box' | 'rock' | 'sphere'; color: string; colors?: string[]; shadows?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current) return;
    const object = new THREE.Object3D(); const tint = new THREE.Color();
    points.forEach((point, index) => {
      object.position.fromArray(point.position); object.scale.fromArray(point.scale); object.rotation.set(0, point.rotation ?? 0, 0); object.updateMatrix();
      ref.current!.setMatrixAt(index, object.matrix);
      if (colors) ref.current!.setColorAt(index, tint.set(colors[index % colors.length]));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [points, colors]);
  return <instancedMesh ref={ref} args={[undefined, undefined, points.length]} castShadow={shadows ?? kind === 'cone'} receiveShadow>
    {kind === 'cone' ? <coneGeometry args={[1, 1, 9]} /> : kind === 'rock' ? <icosahedronGeometry args={[1, 1]} /> : kind === 'sphere' ? <sphereGeometry args={[1, 10, 7]} /> : <boxGeometry args={[1, 1, 1]} />}
    <meshLambertMaterial color={colors ? '#ffffff' : color} flatShading />
  </instancedMesh>;
}

/** Height of the alpine verge, matching the sloped mesh in AlpineTown. */
function alpineVergeHeight(trackY: number, distance: number) {
  const mid = ROAD_WIDTH / 2 + 5, outer = ROAD_WIDTH / 2 + 30;
  if (distance <= mid) return trackY - 0.15;
  const t = THREE.MathUtils.clamp((distance - mid) / (outer - mid), 0, 1);
  return (trackY - 0.15) * (1 - t) - 0.04 * t;
}

/* ------------------------------------------------------------------ */
/* Procedural textures                                                 */
/* ------------------------------------------------------------------ */

function alpineGroundTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#6f8f55';
  context.fillRect(0, 0, size, size);
  const random = seededRandom(9163);
  const palette = ['#7a9a5e', '#5f7d4a', '#8aa76a', '#9b8a5c', '#6b8a52', '#556f42', '#a89a6a'];
  for (let i = 0; i < 260; i++) {
    const x = random() * size, y = random() * size, radius = 8 + random() * 50;
    const color = palette[Math.floor(random() * palette.length)];
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color + 'cc');
    gradient.addColorStop(0.6, color + '66');
    gradient.addColorStop(1, color + '00');
    context.fillStyle = gradient;
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  }
  for (let i = 0; i < 900; i++) {
    const x = random() * size, y = random() * size;
    context.fillStyle = ['rgba(247,214,116,0.5)', 'rgba(255,247,232,0.45)', 'rgba(199,125,187,0.35)'][i % 3];
    context.beginPath(); context.arc(x, y, 0.6 + random() * 1.4, 0, Math.PI * 2); context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 12);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function waterNormalTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = Math.sin(x * 0.1 + y * 0.05) * 0.5 + Math.sin(x * 0.032 - y * 0.085) * 0.5;
    const ny = Math.cos(x * 0.075 - y * 0.11) * 0.5 + Math.cos(x * 0.046 + y * 0.038) * 0.5;
    const index = (y * size + x) * 4;
    data[index] = Math.round(128 + nx * 40);
    data[index + 1] = Math.round(128 + ny * 40);
    data[index + 2] = 255;
    data[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 2);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function waterColorTexture() {
  const width = 512, height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#8fd6d6');
  gradient.addColorStop(0.18, '#5ab6bf');
  gradient.addColorStop(0.5, '#2f7f8c');
  gradient.addColorStop(0.82, '#5ab6bf');
  gradient.addColorStop(1, '#8fd6d6');
  context.fillStyle = gradient; context.fillRect(0, 0, width, height);
  const random = seededRandom(3318);
  for (let i = 0; i < 90; i++) {
    const x = random() * width, y = random() * height, w = 30 + random() * 150;
    context.fillStyle = `rgba(210,245,245,${0.05 + random() * 0.09})`;
    context.beginPath(); context.ellipse(x, y, w, 1.2 + random() * 2.2, 0, 0, Math.PI * 2); context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function foamTexture() {
  const width = 512, height = 96;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  const random = seededRandom(4417);
  for (let i = 0; i < 150; i++) {
    const x = random() * width, y = height * (0.25 + random() * 0.5);
    context.fillStyle = `rgba(240,252,250,${0.12 + random() * 0.38})`;
    context.beginPath(); context.ellipse(x, y, 8 + random() * 52, 0.8 + random() * 3, 0, 0, Math.PI * 2); context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function fallTexture() {
  const width = 128, height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  const random = seededRandom(8812);
  for (let i = 0; i < 240; i++) {
    const x = random() * width, y = random() * height;
    context.fillStyle = `rgba(228,250,250,${0.08 + random() * 0.3})`;
    context.fillRect(x, y, 0.6 + random() * 2.2, 8 + random() * 56);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function softTexture(inner: string, outer: string) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.55, inner.replace(/[\d.]+\)$/, '0.35)'));
  gradient.addColorStop(1, outer);
  context.fillStyle = gradient; context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function shaftTexture() {
  const width = 128, height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  const vertical = context.createLinearGradient(0, 0, 0, height);
  vertical.addColorStop(0, 'rgba(255,246,214,0)');
  vertical.addColorStop(0.25, 'rgba(255,246,214,0.5)');
  vertical.addColorStop(0.7, 'rgba(255,246,214,0.16)');
  vertical.addColorStop(1, 'rgba(255,246,214,0)');
  context.fillStyle = vertical; context.fillRect(0, 0, width, height);
  const horizontal = context.createLinearGradient(0, 0, width, 0);
  horizontal.addColorStop(0, 'rgba(0,0,0,0)');
  horizontal.addColorStop(0.5, 'rgba(255,255,255,1)');
  horizontal.addColorStop(1, 'rgba(0,0,0,0)');
  context.globalCompositeOperation = 'destination-in';
  context.fillStyle = horizontal; context.fillRect(0, 0, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function balloonTexture(color: string) {
  const width = 256, height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  const stripe = width / 8;
  for (let i = 0; i < 8; i++) {
    context.fillStyle = i % 2 ? '#f7edd8' : color;
    context.fillRect(i * stripe, 0, stripe + 1, height);
  }
  const band = context.createLinearGradient(0, 0, 0, height);
  band.addColorStop(0, 'rgba(255,255,255,0.25)');
  band.addColorStop(0.55, 'rgba(255,255,255,0)');
  band.addColorStop(1, 'rgba(0,0,0,0.18)');
  context.fillStyle = band; context.fillRect(0, 0, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ------------------------------------------------------------------ */
/* Forest and mountains                                                */
/* ------------------------------------------------------------------ */

const Forest = memo(({ low, sites }: { low: boolean; sites: TownSite[] }) => {
  const forest = useMemo(() => {
    const random = seededRandom(3219);
    const trees: { x: number; z: number; size: number; broadleaf: boolean }[] = [];
    for (let i = 0; i < (low ? 380 : 850); i++) {
      const x = (random() - 0.5) * 900; const z = (random() - 0.5) * 800;
      const size = 0.8 + random() * 1.3;
      if (Math.abs(z) < 33 || nearestTrackPoint(x, z).distance < 19 || isTownLot(x, z, sites)) continue;
      trees.push({ x, z, size, broadleaf: random() < 0.3 });
    }
    const bushes: InstancePoint[] = [];
    for (let i = 0; i < (low ? 80 : 220); i++) {
      const x = (random() - 0.5) * 760, z = (random() - 0.5) * 680;
      if (Math.abs(z) < 35 || nearestTrackPoint(x, z).distance < 12 || isTownLot(x, z, sites, 2)) continue;
      const size = 0.7 + random() * 1.2;
      bushes.push({ position: [x, size * 0.45, z], scale: [size * 1.2, size * 0.8, size * 1.2], rotation: random() * Math.PI });
    }
    return { trees, bushes };
  }, [low, sites]);
  const trunks = useMemo(() => forest.trees.map(({ x, z, size, broadleaf }) => ({ position: [x, size * 2, z] as [number, number, number], scale: [size * (broadleaf ? 0.5 : 0.7), size * 4, size * (broadleaf ? 0.5 : 0.7)] as [number, number, number] })), [forest.trees]);
  const pineTops = useMemo(() => forest.trees.filter((tree) => !tree.broadleaf).flatMap(({ x, z, size }) => [0, 1, 2].map((level) => ({ position: [x, size * (3.5 + level * 1.7), z] as [number, number, number], scale: [size * (3.1 - level * 0.65), size * 4.4, size * (3.1 - level * 0.65)] as [number, number, number] }))), [forest.trees]);
  const broadleafCrowns = useMemo(() => forest.trees.filter((tree) => tree.broadleaf).flatMap(({ x, z, size }) => [0, 1, 2].map((level) => ({ position: [x + (level - 1) * size * 0.9, size * (3.8 + level * 0.75), z + (level % 2 ? size * 0.7 : -size * 0.6)] as [number, number, number], scale: [size * (2.8 - level * 0.35), size * (2.2 - level * 0.25), size * (2.8 - level * 0.35)] as [number, number, number], rotation: level * 0.8 }))), [forest.trees]);
  return <>
    <Instances points={trunks} kind="box" color="#684b33" />
    <Instances points={pineTops} kind="cone" color="#2d543a" colors={['#3b6b50', '#507c59', '#648c60', '#799c67']} />
    <Instances points={broadleafCrowns} kind="rock" color="#5f8a4d" colors={['#4f7a45', '#5f8a4d', '#6f9a55', '#7aa85e', '#8aa85e']} />
    <Instances points={forest.bushes} kind="rock" color="#6f8f55" colors={['#5f7d4a', '#6f8f55', '#7a9a5e', '#8aa76a']} shadows={false} />
  </>;
});

const Mountains = memo(() => {
  const ranges = useMemo(() => {
    const random = seededRandom(892);
    const main = Array.from({ length: 24 }, (_, index) => {
      const angle = index / 24 * Math.PI * 2; const radius = 490 + random() * 55; const height = 55 + random() * 80;
      return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, height, width: 45 + random() * 38 };
    });
    const foothills = Array.from({ length: 18 }, (_, index) => {
      const angle = index / 18 * Math.PI * 2 + random() * 0.18; const radius = 360 + random() * 90; const height = 25 + random() * 35;
      return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, height, width: 50 + random() * 40 };
    });
    const distant = Array.from({ length: 20 }, (_, index) => {
      const angle = index / 20 * Math.PI * 2 + random() * 0.14; const radius = 620 + random() * 140; const height = 90 + random() * 70;
      return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, height, width: 60 + random() * 40 };
    });
    return { main, foothills, distant };
  }, []);
  const bodies = useMemo(() => ranges.main.map((m) => ({ position: [m.x, m.height / 2 - 9, m.z] as [number, number, number], scale: [m.width, m.height, m.width] as [number, number, number] })), [ranges.main]);
  const peaks = useMemo(() => ranges.main.map((m) => ({ position: [m.x, m.height * 0.86 - 9, m.z] as [number, number, number], scale: [m.width * 0.29, m.height * 0.29, m.width * 0.29] as [number, number, number] })), [ranges.main]);
  const foothillBodies = useMemo(() => ranges.foothills.map((m) => ({ position: [m.x, m.height / 2 - 6, m.z] as [number, number, number], scale: [m.width, m.height, m.width] as [number, number, number] })), [ranges.foothills]);
  const foothillCaps = useMemo(() => ranges.foothills.filter((m) => m.height > 48).map((m) => ({ position: [m.x, m.height * 0.84 - 6, m.z] as [number, number, number], scale: [m.width * 0.24, m.height * 0.2, m.width * 0.24] as [number, number, number] })), [ranges.foothills]);
  const distantBodies = useMemo(() => ranges.distant.map((m) => ({ position: [m.x, m.height / 2 - 10, m.z] as [number, number, number], scale: [m.width, m.height, m.width] as [number, number, number] })), [ranges.distant]);
  const distantCaps = useMemo(() => ranges.distant.map((m) => ({ position: [m.x, m.height * 0.84 - 10, m.z] as [number, number, number], scale: [m.width * 0.22, m.height * 0.22, m.width * 0.22] as [number, number, number] })), [ranges.distant]);
  return <>
    <Instances points={foothillBodies} kind="cone" color="#6d8a62" colors={['#5d7d5a', '#6d8a62', '#7a966c', '#6b8478']} />
    <Instances points={foothillCaps} kind="cone" color="#eef3f2" />
    <Instances points={bodies} kind="cone" color="#708d98" colors={['#6b8994', '#7d99a2', '#8fa9b0']} />
    <Instances points={peaks} kind="cone" color="#f5f0e4" />
    <Instances points={distantBodies} kind="cone" color="#9db3bd" colors={['#8ba3b0', '#9db3bd', '#aec2ca']} />
    <Instances points={distantCaps} kind="cone" color="#eef3f2" />
  </>;
});

/* ------------------------------------------------------------------ */
/* Meadow, river and atmosphere                                        */
/* ------------------------------------------------------------------ */

const AlpineMeadow = memo(function AlpineMeadow({ low, sites }: { low: boolean; sites: TownSite[] }) {
  const meadow = useMemo(() => {
    const random = seededRandom(55118);
    const grass: InstancePoint[] = [], stems: InstancePoint[] = [], blooms: InstancePoint[] = [];
    const rocks: InstancePoint[] = [], bushes: InstancePoint[] = [], mushroomStems: InstancePoint[] = [], mushroomCaps: InstancePoint[] = [];
    const flowerColors = ['#f7d674', '#fff7e8', '#c77dbb', '#e98254', '#70b9c7'];
    const nearRoad = (target: number, callback: (x: number, z: number, y: number, size: number, angle: number) => void) => {
      let placed = 0;
      for (let attempt = 0; attempt < target * 4 && placed < target; attempt++) {
        const progress = random();
        const frame = trackFrame(progress);
        const side = random() < 0.5 ? -1 : 1;
        const distance = ROAD_WIDTH / 2 + 2.5 + random() * 22;
        const p = frame.point.clone().addScaledVector(frame.right, side * distance);
        if (Math.abs(p.z) < 35 || isTownLot(p.x, p.z, sites, 2) || nearestTrackPoint(p.x, p.z).distance < ROAD_WIDTH / 2 + 2) continue;
        callback(p.x, p.z, alpineVergeHeight(frame.point.y, distance), 0.6 + random() * 0.9, random() * Math.PI * 2);
        placed++;
      }
    };
    nearRoad(low ? 180 : 620, (x, z, y, size, angle) => {
      grass.push({ position: [x, y + 0.02, z], scale: [size * 0.16, size * (0.55 + random() * 0.55), size * 0.16], rotation: angle });
    });
    nearRoad(low ? 70 : 240, (x, z, y, size, angle) => {
      const height = 0.25 + size * 0.35;
      stems.push({ position: [x, y + height / 2, z], scale: [0.035, height, 0.035], rotation: angle });
      blooms.push({ position: [x + (random() - 0.5) * 0.25, y + height + 0.04, z + (random() - 0.5) * 0.25], scale: [0.1 + random() * 0.07, 0.08 + random() * 0.06, 0.1 + random() * 0.07], rotation: angle });
    });
    nearRoad(low ? 24 : 70, (x, z, y, size, angle) => {
      const s = 0.5 + size * 0.9;
      rocks.push({ position: [x, y + s * 0.28, z], scale: [s * 1.3, s * 0.6, s], rotation: angle });
    });
    nearRoad(low ? 36 : 110, (x, z, y, size, angle) => {
      const s = 0.65 + size * 0.8;
      bushes.push({ position: [x, y + s * 0.5, z], scale: [s * 1.2, s * 0.8, s * 1.2], rotation: angle });
    });
    for (let attempt = 0; attempt < (low ? 120 : 360); attempt++) {
      const x = (random() - 0.5) * 760, z = (random() - 0.5) * 680;
      if (Math.abs(z) < 35 || nearestTrackPoint(x, z).distance < 20 || isTownLot(x, z, sites, 2)) continue;
      const s = 0.12 + random() * 0.12;
      mushroomStems.push({ position: [x, 0.12, z], scale: [0.04, 0.24, 0.04], rotation: 0 });
      mushroomCaps.push({ position: [x, 0.28, z], scale: [s, s * 0.55, s], rotation: random() * Math.PI });
      if (mushroomCaps.length > (low ? 24 : 70)) break;
    }
    return { grass, stems, blooms, rocks, bushes, mushroomStems, mushroomCaps, flowerColors };
  }, [low, sites]);
  return <>
    <Instances points={meadow.grass} kind="cone" color="#6f9a55" colors={['#5f8a4d', '#6f9a55', '#7aa85e', '#86b266']} shadows={false} />
    <Instances points={meadow.stems} kind="box" color="#4f7a3a" shadows={false} />
    <Instances points={meadow.blooms} kind="sphere" color="#ffffff" colors={meadow.flowerColors} shadows={false} />
    <Instances points={meadow.rocks} kind="rock" color="#7a8a82" colors={['#6d8176', '#839080', '#778578', '#8f9a88']} shadows={false} />
    <Instances points={meadow.bushes} kind="rock" color="#6f8f55" colors={['#5f7d4a', '#6f8f55', '#7a9a5e', '#8aa76a']} shadows={false} />
    <Instances points={meadow.mushroomStems} kind="box" color="#e8dfcc" shadows={false} />
    <Instances points={meadow.mushroomCaps} kind="sphere" color="#c05a4a" colors={['#c05a4a', '#e98254', '#f3e7cb']} shadows={false} />
  </>;
});

function Ducks({ low }: { low: boolean }) {
  const ducks = useRef<THREE.Group[]>([]);
  const positions = useMemo(() => [[-60, -4], [40, 5], [180, -3], [320, 4]].slice(0, low ? 2 : 4), [low]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    ducks.current.forEach((duck, index) => {
      if (!duck) return;
      const [x, z] = positions[index];
      duck.position.set(x + Math.sin(t * 0.12 + index) * 3, -0.86 + Math.sin(t * 1.4 + index) * 0.05, z + Math.cos(t * 0.1 + index) * 2);
      duck.rotation.y = Math.sin(t * 0.12 + index) * 0.4;
    });
  });
  return <>{positions.map(([x, z], index) => <group key={index} ref={(node) => { if (node) ducks.current[index] = node; }} position={[x, -0.86, z]}>
    <mesh scale={[0.5, 0.34, 0.7]}><sphereGeometry args={[1, 10, 7]} /><meshLambertMaterial color="#f3e7cb" flatShading /></mesh>
    <mesh position={[0, 0.36, 0.44]}><sphereGeometry args={[0.22, 8, 6]} /><meshLambertMaterial color="#f3e7cb" flatShading /></mesh>
    <mesh position={[0, 0.32, 0.64]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.1, 0.28, 5]} /><meshLambertMaterial color="#e98254" /></mesh>
    <mesh position={[0, 0.12, -0.6]} rotation={[0, 0, -0.4]} scale={[0.2, 0.12, 0.35]}><boxGeometry /><meshLambertMaterial color="#d8cdb8" /></mesh>
  </group>)}</>;
}

function AlpineRiver({ low }: { low: boolean }) {
  const normal = useMemo(waterNormalTexture, []);
  const color = useMemo(waterColorTexture, []);
  const foam = useMemo(foamTexture, []);
  const fall = useMemo(fallTexture, []);
  const shimmer = useMemo(() => softTexture('rgba(255,255,245,0.9)', 'rgba(220,255,245,0)'), []);
  const mist = useMemo(() => softTexture('rgba(235,250,245,0.55)', 'rgba(235,250,245,0)'), []);
  const normalScale = useMemo(() => new THREE.Vector2(0.45, 0.45), []);
  const current = useRef<THREE.Group>(null);
  const foamGroup = useRef<THREE.Group>(null);
  const fallMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const mistGroup = useRef<THREE.Group>(null);
  useEffect(() => () => {
    normal.dispose(); color.dispose(); foam.dispose(); fall.dispose(); shimmer.dispose(); mist.dispose();
  }, [normal, color, foam, fall, shimmer, mist]);
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    normal.offset.x = (normal.offset.x + delta * 0.016) % 1;
    normal.offset.y = (normal.offset.y + delta * 0.005) % 1;
    foam.offset.x = (foam.offset.x + delta * 0.03) % 1;
    fall.offset.y = (fall.offset.y - delta * 0.45) % 1;
    if (current.current) current.current.position.x = (t * 1.6) % 26;
    if (foamGroup.current) foamGroup.current.position.x = (t * 0.9) % 48;
    if (fallMaterial.current) fallMaterial.current.opacity = 0.58 + Math.sin(t * 2.2) * 0.08;
    if (mistGroup.current) mistGroup.current.position.x = Math.sin(t * 0.07) * 7;
  });
  const reeds = useMemo(() => {
    const random = seededRandom(6612);
    const result: InstancePoint[] = [];
    for (let i = 0; i < (low ? 40 : 120); i++) {
      const x = (random() - 0.5) * 900;
      const side = random() < 0.5 ? -1 : 1;
      const z = side * (24 + random() * 5);
      const size = 0.6 + random() * 0.8;
      const height = size * (1.1 + random() * 1.1);
      result.push({ position: [x, height / 2, z], scale: [size * 0.1, height, size * 0.1], rotation: random() * Math.PI });
    }
    return result;
  }, [low]);
  const bankRocks = useMemo(() => {
    const random = seededRandom(6613);
    const result: InstancePoint[] = [];
    for (let i = 0; i < (low ? 24 : 64); i++) {
      const x = (random() - 0.5) * 920;
      const side = random() < 0.5 ? -1 : 1;
      const z = side * (25 + random() * 5);
      const size = 0.4 + random() * 1.4;
      result.push({ position: [x, size * 0.35 - 0.05, z], scale: [size * 1.3, size * 0.65, size], rotation: random() * Math.PI });
    }
    return result;
  }, [low]);
  const riverbank = useMemo(() => {
    const random = seededRandom(6614);
    const trunks: InstancePoint[] = [], crowns: InstancePoint[] = [];
    for (let attempt = 0; attempt < (low ? 30 : 80); attempt++) {
      const x = (random() - 0.5) * 860;
      const side = random() < 0.5 ? -1 : 1;
      const z = side * (31 + random() * 11);
      if (nearestTrackPoint(x, z).distance < 16) continue;
      const size = 0.8 + random() * 0.8;
      trunks.push({ position: [x, size * 1.8, z], scale: [size * 0.45, size * 3.6, size * 0.45] });
      crowns.push({ position: [x, size * 4.1, z], scale: [size * 2.5, size * 1.9, size * 2.5], rotation: random() * Math.PI });
      if (crowns.length > (low ? 8 : 18)) break;
    }
    return { trunks, crowns };
  }, [low]);
  const waterfallRocks = useMemo(() => {
    const random = seededRandom(6615);
    const result: InstancePoint[] = [];
    for (let i = 0; i < 14; i++) {
      const z = -24 + i * 3.7 + (random() - 0.5) * 2;
      const size = 5 + random() * 4.5;
      result.push({ position: [380 + (random() - 0.5) * 8, 2 + random() * 8, z], scale: [size, size * (1.1 + random() * 0.5), size * 0.9], rotation: random() * Math.PI });
    }
    return result;
  }, []);
  return <>
    <mesh position={[0, -1.35, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[1000, 51]} /><meshLambertMaterial color="#1f4a4d" /></mesh>
    <mesh position={[0, -1.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[1000, 47]} />
      <meshStandardMaterial map={color} normalMap={normal} normalScale={normalScale} roughness={0.17} metalness={0.32} envMapIntensity={0.95} />
    </mesh>
    <group ref={foamGroup}>
      {[-1, 1].map((side) => <mesh key={side} position={[0, -1.02, side * 22.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[960, 2.8]} />
        <meshBasicMaterial map={foam} transparent opacity={0.48} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>)}
    </group>
    <group ref={current}>{Array.from({ length: low ? 16 : 28 }, (_, index) => <mesh key={index} position={[(index % 8) * 55 - 220, -1.035, Math.floor(index / 8) * 11 - 11]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[10 + index % 5, 1.1 + index % 3]} />
      <meshBasicMaterial map={shimmer} transparent opacity={0.24} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>)}</group>
    {[-1, 1].map((side) => <mesh key={side} position={[0, -0.1, side * 27]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[960, 6]} /><meshLambertMaterial color="#6f8f55" /></mesh>)}
    <Instances points={reeds} kind="cone" color="#6f9a5a" colors={['#5f8a4d', '#6f9a5a', '#7aa85e']} shadows={false} />
    <Instances points={bankRocks} kind="rock" color="#7a8a82" colors={['#6d8176', '#839080', '#778578', '#8f9a88']} shadows={false} />
    <Instances points={riverbank.trunks} kind="box" color="#6e5435" />
    <Instances points={riverbank.crowns} kind="rock" color="#6f9a55" colors={['#5f8a4d', '#6f9a55', '#7aa85e', '#86b266']} />
    <Instances points={waterfallRocks} kind="rock" color="#5f7a78" colors={['#5f7a78', '#6f8a86', '#7a9690']} shadows={false} />
    {[-5, 0, 5].map((z, index) => <mesh key={z} position={[376.5, 8 + index * 0.25, z]} rotation={[0, -Math.PI / 2, 0]}>
      <planeGeometry args={[4.8, 16]} />
      <meshBasicMaterial ref={index === 1 ? fallMaterial : undefined} map={fall} transparent opacity={0.58} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>)}
    <group ref={mistGroup}>
      <mesh position={[372, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[32, 20]} />
        <meshBasicMaterial map={mist} transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
    <Ducks low={low} />
  </>;
}

function ValleyMist({ low }: { low: boolean }) {
  const texture = useMemo(() => softTexture('rgba(240,248,245,0.5)', 'rgba(240,248,245,0)'), []);
  const group = useRef<THREE.Group>(null);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ clock }) => { if (group.current) group.current.position.x = Math.sin(clock.elapsedTime * 0.05) * 12; });
  return <group ref={group}>{Array.from({ length: low ? 3 : 6 }, (_, index) => <mesh key={index} position={[(index - 2.5) * 90, 0.4 + (index % 3) * 0.3, (index % 2 ? 1 : -1) * (10 + index % 3 * 6)]} rotation={[-Math.PI / 2, 0, 0]}>
    <planeGeometry args={[80 + index % 3 * 20, 26 + index % 4 * 8]} />
    <meshBasicMaterial map={texture} transparent opacity={0.14} depthWrite={false} side={THREE.DoubleSide} />
  </mesh>)}</group>;
}

function AlpineLightShafts({ low }: { low: boolean }) {
  const texture = useMemo(shaftTexture, []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    map: texture, transparent: true, opacity: 0.08, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }), [texture]);
  useEffect(() => () => { texture.dispose(); material.dispose(); }, [texture, material]);
  useFrame(({ clock }) => { material.opacity = 0.08 + Math.sin(clock.elapsedTime * 0.3) * 0.025; });
  const shafts = useMemo(() => {
    const result: { position: [number, number, number]; rotation: [number, number, number] }[] = [];
    const count = low ? 2 : 4;
    for (let i = 0; i < count; i++) {
      const progress = 0.1 + i * 0.24;
      const frame = trackFrame(progress);
      const side = i % 2 ? 1 : -1;
      const p = frame.point.clone().addScaledVector(frame.right, side * (8 + i * 2));
      result.push({ position: [p.x, frame.point.y + 15, p.z], rotation: [0, frame.yaw, 0.14] });
    }
    return result;
  }, [low]);
  return <>{shafts.map((shaft, index) => <mesh key={index} position={shaft.position} rotation={shaft.rotation}>
    <planeGeometry args={[9, 30]} />
    <primitive object={material} attach="material" />
  </mesh>)}</>;
}

function AlpinePollen({ low }: { low: boolean }) {
  const texture = useMemo(() => softTexture('rgba(255,248,214,1)', 'rgba(255,248,214,0)'), []);
  const count = low ? 45 : 110;
  const { geometry, base, phase } = useMemo(() => {
    const random = seededRandom(9912);
    const base = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const progress = random();
      const frame = trackFrame(progress);
      const side = random() < 0.5 ? -1 : 1;
      const distance = 6 + random() * 30;
      const p = frame.point.clone().addScaledVector(frame.right, side * distance);
      base[i * 3] = p.x;
      base[i * 3 + 1] = Math.max(1.2, frame.point.y + 1 + random() * 8);
      base[i * 3 + 2] = p.z;
      phase[i] = random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(base), 3));
    return { geometry, base, phase };
  }, [count]);
  const points = useRef<THREE.Points>(null);
  useEffect(() => () => { geometry.dispose(); texture.dispose(); }, [geometry, texture]);
  useFrame(({ clock }) => {
    if (!points.current) return;
    const attribute = points.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const p = phase[i];
      array[i * 3] = base[i * 3] + Math.sin(t * 0.25 + p) * 1.4;
      array[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.4 + p * 1.6) * 0.8;
      array[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.22 + p) * 1.2;
    }
    attribute.needsUpdate = true;
  });
  return <points ref={points} geometry={geometry}>
    <pointsMaterial map={texture} color="#fff0b8" size={0.28} sizeAttenuation transparent opacity={0.65} depthWrite={false} blending={THREE.AdditiveBlending} />
  </points>;
}

function Butterflies({ low }: { low: boolean }) {
  const count = low ? 3 : 8;
  const data = useMemo(() => {
    const random = seededRandom(7721);
    return Array.from({ length: count }, () => {
      const progress = random();
      const frame = trackFrame(progress);
      const side = random() < 0.5 ? -1 : 1;
      const distance = 10 + random() * 18;
      const p = frame.point.clone().addScaledVector(frame.right, side * distance);
      return {
        x: p.x,
        y: Math.max(0.8, alpineVergeHeight(frame.point.y, distance) + 0.8 + random() * 1.2),
        z: p.z,
        phase: random() * Math.PI * 2,
        speed: 0.5 + random() * 0.5,
        color: ['#e98254', '#f7d674', '#fff7e8', '#70b9c7'][Math.floor(random() * 4)],
      };
    });
  }, [count]);
  const groups = useRef<THREE.Group[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    groups.current.forEach((group, index) => {
      const d = data[index];
      if (!d || !group) return;
      group.position.set(d.x + Math.sin(t * d.speed + d.phase) * 2.2, d.y + Math.sin(t * d.speed * 1.7 + d.phase) * 0.5, d.z + Math.cos(t * d.speed * 0.8 + d.phase) * 2.2);
      group.rotation.y = t * d.speed + d.phase;
      const flap = Math.sin(t * 10 + d.phase) * 0.8;
      if (group.children[0]) group.children[0].rotation.z = flap;
      if (group.children[1]) group.children[1].rotation.z = -flap;
    });
  });
  return <>{data.map((d, index) => <group key={index} ref={(node) => { if (node) groups.current[index] = node; }}>
    <mesh position={[-0.18, 0, 0]}><planeGeometry args={[0.36, 0.28]} /><meshBasicMaterial color={d.color} side={THREE.DoubleSide} transparent opacity={0.9} /></mesh>
    <mesh position={[0.18, 0, 0]}><planeGeometry args={[0.36, 0.28]} /><meshBasicMaterial color={d.color} side={THREE.DoubleSide} transparent opacity={0.9} /></mesh>
    <mesh><sphereGeometry args={[0.06, 6, 4]} /><meshBasicMaterial color="#3a3328" /></mesh>
  </group>)}</>;
}

function HotAirBalloon({ position, scale = 1, color = '#d87958', offset = 0 }: { position: [number, number, number]; scale?: number; color?: string; offset?: number }) {
  const group = useRef<THREE.Group>(null);
  const texture = useMemo(() => balloonTexture(color), [color]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime * 0.05 + offset;
    group.current.position.set(position[0] + Math.sin(t) * 9, position[1] + Math.sin(t * 1.6) * 2, position[2] + Math.cos(t) * 9);
  });
  return <group ref={group} position={position} scale={scale}>
    <mesh position={[0, 7, 0]} scale={[5, 6, 5]}><sphereGeometry args={[1, 16, 12]} /><meshLambertMaterial map={texture} /></mesh>
    <mesh position={[0, 2.2, 0]}><boxGeometry args={[1.4, 1.2, 1.4]} /><meshLambertMaterial color="#8a6a45" /></mesh>
    {[-0.6, 0.6].map((x) => <mesh key={x} position={[x, 4.5, 0]} rotation={[0, 0, x * 0.15]}><boxGeometry args={[0.05, 3.5, 0.05]} /><meshLambertMaterial color="#5b4a38" /></mesh>)}
    <mesh position={[0, 5.2, 0]}><sphereGeometry args={[0.25, 8, 6]} /><meshBasicMaterial color="#ffcf7a" /></mesh>
  </group>;
}

function Eagle({ offset = 0, scale = 1.7 }: { offset?: number; scale?: number }) {
  const group = useRef<THREE.Group>(null); const left = useRef<THREE.Group>(null); const right = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.09 + offset;
    if (group.current) { group.current.position.set(Math.sin(t) * 95, 27 + Math.sin(t * 2) * 5, Math.cos(t) * 80); group.current.rotation.y = t + Math.PI / 2; }
    if (left.current && right.current) { left.current.rotation.z = Math.sin(clock.elapsedTime * 2.2 + offset) * 0.2; right.current.rotation.z = -left.current.rotation.z; }
  });
  return <group ref={group} scale={scale}>
    <mesh scale={[0.3, 0.28, 0.85]}><sphereGeometry args={[1, 8, 6]} /><meshLambertMaterial color="#765843" flatShading /></mesh>
    <mesh position={[0, 0.15, 0.75]}><sphereGeometry args={[0.3, 8, 6]} /><meshLambertMaterial color="#fff7e8" /></mesh>
    <mesh position={[0, 0.1, 1.03]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.16, 0.4, 4]} /><meshLambertMaterial color="#edbc59" /></mesh>
    <group ref={left}><mesh position={[-1, 0, 0]} rotation={[0, 0, -0.08]} scale={[2, 0.1, 0.8]}><boxGeometry /><meshLambertMaterial color="#8c694b" /></mesh></group>
    <group ref={right}><mesh position={[1, 0, 0]} rotation={[0, 0, 0.08]} scale={[2, 0.1, 0.8]}><boxGeometry /><meshLambertMaterial color="#8c694b" /></mesh></group>
  </group>;
}

function Goat({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const head = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (head.current) head.current.rotation.z = Math.sin(clock.elapsedTime * 0.8) * 0.08; });
  return <group position={position} rotation={[0, rotation, 0]} scale={1.1}>
    <mesh position={[0, 1, 0]} scale={[0.65, 0.65, 1.1]} castShadow><sphereGeometry args={[1, 10, 8]} /><meshLambertMaterial color="#f3e7cb" flatShading /></mesh>
    {[-0.4, 0.4].flatMap((x) => [-0.7, 0.6].map((z) => <mesh key={`${x}-${z}`} position={[x, 0.4, z]}><boxGeometry args={[0.2, 0.8, 0.22]} /><meshLambertMaterial color="#cbbd9d" /></mesh>))}
    <group ref={head} position={[0, 1.4, 0.9]}>
      <mesh scale={[0.45, 0.6, 0.45]}><sphereGeometry args={[1, 8, 6]} /><meshLambertMaterial color="#fff7e8" flatShading /></mesh>
      <mesh position={[0, -0.15, 0.36]} scale={[0.3, 0.22, 0.2]}><sphereGeometry args={[1, 8, 6]} /><meshLambertMaterial color="#cfb594" /></mesh>
      {[-1, 1].map((side) => <group key={side}>
        <mesh position={[side * 0.22, 0.64, -0.08]} rotation={[0.2, 0, side * -0.2]}><coneGeometry args={[0.12, 0.65, 6]} /><meshLambertMaterial color="#9a8467" /></mesh>
        <mesh position={[side * 0.42, 0.15, 0.1]} rotation={[0, 0, side * 0.6]}><boxGeometry args={[0.4, 0.17, 0.22]} /><meshLambertMaterial color="#f3e7cb" /></mesh>
        <mesh position={[side * 0.25, 0.12, 0.4]}><sphereGeometry args={[0.065, 6, 4]} /><meshBasicMaterial color={INK} /></mesh>
      </group>)}
      <mesh position={[0, -0.5, 0.2]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.13, 0.35, 5]} /><meshLambertMaterial color="#fff7e8" /></mesh>
    </group>
  </group>;
}

function CharacterSign({ name, position }: { name: string; position: [number, number, number] }) {
  const texture = useTexture(art(name));
  useEffect(() => { texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; }, [texture]);
  return <group position={position}>
    <mesh position={[0, 1, 0]}><boxGeometry args={[0.18, 2, 0.18]} /><meshLambertMaterial color="#a88057" /></mesh>
    <Billboard position={[0, 3.1, 0]}><mesh><planeGeometry args={[4.4, 4.4]} /><meshBasicMaterial map={texture} transparent alphaTest={0.1} side={THREE.DoubleSide} /></mesh></Billboard>
  </group>;
}

function gateLabelTexture(label: string, accent: string, finish: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#12191e'; context.fillRect(0, 0, 1024, 256);
  context.fillStyle = '#1b242a'; context.fillRect(14, 14, 996, 228);
  context.fillStyle = accent; context.fillRect(0, 0, 18, 256); context.fillRect(0, 240, 1024, 16);
  context.fillStyle = LIME; context.fillRect(52, 46, 10, 56);
  context.fillStyle = '#9db0a8'; context.font = '600 36px "JetBrains Mono", Arial, sans-serif'; context.textAlign = 'left';
  context.fillText('WINDWAY / RACE CONTROL', 84, 86);
  context.fillStyle = '#f5f7f1'; context.font = '800 94px "Barlow Condensed", Arial, sans-serif';
  context.fillText(finish ? 'START / FINISH' : label, 52, 194);
  if (finish) {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      context.fillStyle = (x + y) % 2 ? '#f3f5ef' : '#12191e';
      context.fillRect(844 + x * 34, 48 + y * 34, 34, 34);
    }
  } else {
    context.fillStyle = accent;
    for (let i = 0; i < 3; i++) {
      const cx = 820 + i * 54;
      context.beginPath();
      context.moveTo(cx, 72); context.lineTo(cx + 30, 128); context.lineTo(cx, 184); context.lineTo(cx + 16, 128);
      context.closePath(); context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function CheckpointGates() {
  const checkpoint = useGame((state) => state.telemetry.checkpoint);
  const status = useGame((state) => state.status);
  const countdown = useGame((state) => state.countdown);
  const elapsed = useGame((state) => state.telemetry.elapsed);
  const { theme, id } = currentMap;
  const accent = ROUTE_ACCENTS[id];
  const gateWidth = ROAD_WIDTH + 2.2;
  const labels = useMemo(() => CHECKPOINTS.map((_, index) => gateLabelTexture(`SECTOR ${String(index + 1).padStart(2, '0')}`, ROUTE_ACCENTS[currentMap.id], TRACK_CLOSED ? index === 0 : index === CHECKPOINTS.length - 1)), [id, accent]);
  useEffect(() => () => labels.forEach((texture) => texture.dispose()), [labels]);
  const overheads = useRef<(THREE.Group | null)[]>([]);
  const cameraWorld = useMemo(() => new THREE.Vector3(), []);
  const cameraLocal = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    camera.getWorldPosition(cameraWorld);
    for (const overhead of overheads.current) {
      if (!overhead) continue;
      overhead.worldToLocal(cameraLocal.copy(cameraWorld));
      // Distance to the actual bar bounds, including the finish checker panels.
      // A checkpoint respawn can put the chase camera just behind this beam;
      // at that distance it would cover the racing line across the entire view.
      const dx = Math.max(0, Math.abs(cameraLocal.x) - (gateWidth + 0.6) / 2);
      const dy = Math.max(0, Math.abs(cameraLocal.y) - 0.55);
      const dz = Math.max(0, -0.45 - cameraLocal.z, cameraLocal.z - 0.48);
      overhead.visible = dx * dx + dy * dy + dz * dz > 16;
    }
  });
  return <group>{CHECKPOINTS.map(({ point, yaw }, index) => {
    const active = index === (TRACK_CLOSED ? (checkpoint + 1) % CHECKPOINTS.length : Math.min(CHECKPOINTS.length - 1, checkpoint + 1));
    const passed = index > 0 && index <= checkpoint;
    const finish = TRACK_CLOSED ? index === 0 : index === CHECKPOINTS.length - 1;
    const isStartLine = index === 0;
    const color = active ? LIME : passed ? '#5d7a6e' : accent;
    return <group key={index} position={point} rotation={[0, yaw, 0]}>
      {[-gateWidth / 2, gateWidth / 2].map((x) => <group key={x} position={[x, 0, 0]}>
        <mesh position={[0, 0.2, 0]} castShadow><boxGeometry args={[1.15, 0.4, 1.24]} /><meshStandardMaterial color="#192126" roughness={0.72} metalness={0.35} /></mesh>
        <mesh position={[0, 0.44, 0]}><boxGeometry args={[1.02, 0.1, 1.1]} /><meshBasicMaterial color={color} /></mesh>
        <mesh position={[0, 2.85, 0]} castShadow><boxGeometry args={[0.64, 5.5, 0.82]} /><meshStandardMaterial color={GRAPHITE} roughness={0.52} metalness={0.48} /></mesh>
        <mesh position={[x > 0 ? -0.34 : 0.34, 4.95, 0]} rotation={[0, 0, x > 0 ? 0.45 : -0.45]}><boxGeometry args={[0.18, 1.35, 0.52]} /><meshStandardMaterial color="#2a353c" roughness={0.5} metalness={0.45} /></mesh>
        <mesh position={[0, 2.86, 0.422]}><boxGeometry args={[0.3, 4.7, 0.025]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.5 : 0.08} roughness={0.35} metalness={0.15} /></mesh>
        <mesh position={[0, 2.86, -0.422]}><boxGeometry args={[0.3, 4.7, 0.025]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.5 : 0.08} roughness={0.35} metalness={0.15} /></mesh>
        {[1.4, 3.6].map((y) => <mesh key={y} position={[0, y, 0.44]}><boxGeometry args={[0.5, 0.1, 0.04]} /><meshBasicMaterial color={theme.paper} /></mesh>)}
        <mesh position={[0, 5.15, 0]}><boxGeometry args={[0.72, 0.14, 0.88]} /><meshBasicMaterial color={color} /></mesh>
      </group>)}
      <group ref={(group) => { overheads.current[index] = group; }} position={[0, 5.55, 0]}>
        <mesh castShadow><boxGeometry args={[gateWidth + 0.65, 0.82, 0.78]} /><meshStandardMaterial color="#182026" roughness={0.48} metalness={0.52} /></mesh>
        <mesh position={[0, 0.52, 0]}><boxGeometry args={[gateWidth + 0.25, 0.12, 0.44]} /><meshStandardMaterial color="#28343c" roughness={0.48} metalness={0.55} /></mesh>
        {[-1, 1].map((side) => <group key={side}>
          <mesh position={[0, 0.34, side * 0.398]}><boxGeometry args={[gateWidth - 0.5, 0.085, 0.02]} /><meshBasicMaterial color={color} /></mesh>
          <mesh position={[0, -0.35, side * 0.398]}><boxGeometry args={[gateWidth - 0.5, 0.055, 0.02]} /><meshBasicMaterial color={active ? LIME : '#3c4d54'} /></mesh>
          <mesh position={[0, -0.01, side * 0.412]} rotation={[0, side < 0 ? Math.PI : 0, 0]}><planeGeometry args={[5.3, 0.64]} /><meshBasicMaterial map={labels[index]} toneMapped={false} /></mesh>
        </group>)}
        {[-1, 1].map((side) => <mesh key={side} position={[side * (gateWidth / 2 - 0.35), 0, 0]}><boxGeometry args={[0.58, 0.84, 0.8]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.35 : 0.05} roughness={0.4} /></mesh>)}
        {finish && [-1, 1].map((side) => Array.from({ length: 16 }, (_, i) => {
          if (i >= 5 && i <= 10) return null;
          return <mesh key={`${side}-${i}`} position={[(i - 7.5) * gateWidth / 16, -0.04, side * 0.408]} rotation={[0, side < 0 ? Math.PI : 0, 0]}><planeGeometry args={[gateWidth / 16 - 0.03, 0.46]} /><meshBasicMaterial color={i % 2 ? theme.paper : theme.ink} side={THREE.DoubleSide} /></mesh>;
        }))}
        {isStartLine && <group position={[0, -0.58, 0]}>
          {[-2.2, -1.1, 0, 1.1, 2.2].map((lx, podIdx) => {
            const litRed = status === 'countdown' && ((countdown === 3 && podIdx < 2) || (countdown === 2 && podIdx < 4) || (countdown === 1));
            const litGreen = status === 'running' && elapsed < 2.2;
            const podColor = litGreen ? LIME : litRed ? '#ff3b30' : '#232c31';
            return <group key={lx} position={[lx, 0, 0]}>
              <mesh><boxGeometry args={[0.56, 0.34, 0.38]} /><meshStandardMaterial color="#10161a" roughness={0.5} metalness={0.5} /></mesh>
              <mesh position={[0, 0, 0.2]}><circleGeometry args={[0.11, 12]} /><meshBasicMaterial color={podColor} toneMapped={false} /></mesh>
              <mesh position={[0, 0, -0.2]} rotation={[0, Math.PI, 0]}><circleGeometry args={[0.11, 12]} /><meshBasicMaterial color={podColor} toneMapped={false} /></mesh>
            </group>;
          })}
        </group>}
      </group>
    </group>;
  })}</group>;
}

export const TrackSurface = memo(() => {
  const { theme, id } = currentMap;
  const jungle = id === 'jungle', snow = id === 'snow';
  const accent = ROUTE_ACCENTS[id];
  const gl = useThree((state) => state.gl);
  const asphalt = useMemo(() => surfaceTexture('asphalt', gl.capabilities.getMaxAnisotropy()), [gl]);
  const roughnessMap = useMemo(() => roadRoughnessTexture(gl.capabilities.getMaxAnisotropy()), [gl]);
  const road = useMemo(() => worldSurfaceUV(ribbonGeometry(ROAD_WIDTH), 5), []);
  const shoulder = useMemo(() => ribbonGeometry(ROAD_WIDTH + 3, 0, -0.09), []);
  const leftLine = useMemo(() => ribbonGeometry(0.24, -ROAD_WIDTH / 2 + 0.4, 0.035), []);
  const rightLine = useMemo(() => ribbonGeometry(0.24, ROAD_WIDTH / 2 - 0.4, 0.035), []);
  const tireTracks = useMemo(() => [-1, 1].map((side) => ribbonGeometry(0.48, side * 1.85, 0.014)), []);
  const outerStrips = useMemo(() => [-1, 1].map((side) => ribbonGeometry(0.12, side * (ROAD_WIDTH / 2 + 1.28), -0.045)), []);
  const marks = useMemo(() => TRACK_POINTS.filter((_, i) => i % 4 === 0).map(({ point, yaw }) => ({ position: [point.x, point.y + 0.038, point.z] as [number, number, number], scale: [0.18, 0.025, 2.6] as [number, number, number], rotation: yaw })), []);
  const delineators = useMemo(() => {
    const posts: InstancePoint[] = [], reflectors: InstancePoint[] = [];
    const stride = id === 'snow' ? 18 : 12;
    TRACK_POINTS.forEach(({ point, right, yaw }, index) => {
      if (index % stride) return;
      const progress = index / (TRACK_POINTS.length - (TRACK_CLOSED ? 0 : 1));
      for (const side of [-1, 1]) {
        const p = point.clone().addScaledVector(right, side * (roadHalfWidthAt(progress) + 1.18));
        posts.push({ position: [p.x, p.y + 0.23, p.z], scale: [0.11, 0.46, 0.11], rotation: yaw });
        reflectors.push({ position: [p.x, p.y + 0.39, p.z], scale: [0.18, 0.09, 0.13], rotation: yaw });
      }
    });
    return { posts, reflectors };
  }, [id]);
  const startFrame = TRACK_CLOSED ? trackFrame(0) : CHECKPOINTS[CHECKPOINTS.length - 1];
  const kerbs = useMemo(() => [-1, 1].map((side) => {
    const indexed = ribbonGeometry(0.52, side * (ROAD_WIDTH / 2 - 0.15), 0.04);
    const geometry = indexed.toNonIndexed(); indexed.dispose();
    const positions = geometry.attributes.position, colors = new Float32Array(positions.count * 3);
    const accent = new THREE.Color(ROUTE_ACCENTS[currentMap.id]), pale = new THREE.Color('#d8dfda');
    let distance = 0, previousX = positions.getX(0), previousZ = positions.getZ(0);
    for (let i = 0; i < positions.count; i += 6) {
      const x = positions.getX(i), z = positions.getZ(i);
      distance += Math.hypot(x - previousX, z - previousZ); previousX = x; previousZ = z;
      const color = Math.floor(distance / 4) % 2 ? pale : accent;
      for (let vertex = i; vertex < i + 6; vertex++) color.toArray(colors, vertex * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }), []);
  const bridgePlanks = useMemo(() => BRIDGE_DECK_SEGMENTS.map(({ position, yaw, halfExtents }) => ({ position, rotation: yaw, scale: halfExtents.map((value) => value * 2) as [number, number, number] })), []);
  const bridgeWalls = useMemo(() => TRACK_BARRIERS.filter(({ kind }) => kind === 'bridge').map(({ position, yaw, halfExtents }) => ({ position, rotation: yaw, scale: halfExtents.map((value) => value * 2) as [number, number, number] })), []);
  const bridgeCaps = useMemo(() => TRACK_BARRIERS.filter(({ kind }) => kind === 'bridge').map(({ position, yaw, halfExtents }) => ({ position: [position[0], position[1] + halfExtents[1] + 0.06, position[2]] as [number, number, number], rotation: yaw, scale: [0.72, 0.12, halfExtents[2] * 2] as [number, number, number] })), []);
  const roadsideWalls = useMemo(() => TRACK_BARRIERS.filter(({ kind }) => kind === 'roadside').map(({ position, yaw, halfExtents }) => ({ position, rotation: yaw, scale: halfExtents.map((value) => value * 2) as [number, number, number] })), []);
  const roadsideStripes = useMemo(() => TRACK_BARRIERS.filter(({ kind }) => kind === 'roadside').map(({ position, yaw, halfExtents }) => ({ position: [position[0], position[1] + 0.1, position[2]] as [number, number, number], rotation: yaw, scale: [0.72, 0.28, halfExtents[2] * 2 + 0.05] as [number, number, number] })), []);
  useEffect(() => () => { asphalt.dispose(); roughnessMap.dispose(); }, [asphalt, roughnessMap]);
  useEffect(() => () => { road.dispose(); shoulder.dispose(); leftLine.dispose(); rightLine.dispose(); tireTracks.forEach((geometry) => geometry.dispose()); outerStrips.forEach((geometry) => geometry.dispose()); kerbs.forEach((geometry) => geometry.dispose()); }, [road, shoulder, leftLine, rightLine, tireTracks, outerStrips, kerbs]);
  return <>
    <mesh geometry={shoulder} receiveShadow><meshStandardMaterial color={snow ? '#4b5b67' : jungle ? '#46503e' : '#8e8878'} roughness={0.94} metalness={0.04} /></mesh>
    <RigidBody type="fixed" colliders="trimesh" friction={0.8}><mesh geometry={road} receiveShadow><meshStandardMaterial color={snow ? '#25303a' : jungle ? '#2a3531' : '#323940'} map={asphalt} bumpMap={asphalt} bumpScale={snow ? 0.036 : 0.044} roughnessMap={roughnessMap} roughness={snow ? 0.54 : 0.88} metalness={snow ? 0.08 : 0.05} envMapIntensity={snow ? 0.62 : 0.44} side={THREE.DoubleSide} /></mesh></RigidBody>
    {tireTracks.map((geometry, index) => <mesh key={index} geometry={geometry}><meshBasicMaterial color={snow ? '#111a22' : '#0f1615'} transparent opacity={snow ? 0.24 : 0.22} depthWrite={false} /></mesh>)}
    {outerStrips.map((geometry, index) => <mesh key={index} geometry={geometry}><meshBasicMaterial color={snow ? '#f08b5b' : accent} transparent opacity={snow ? 0.78 : 0.62} /></mesh>)}
    <mesh geometry={leftLine}><meshBasicMaterial color="#f5f8f2" /></mesh><mesh geometry={rightLine}><meshBasicMaterial color="#f5f8f2" /></mesh>
    {kerbs.map((geometry, index) => <mesh key={index} geometry={geometry} receiveShadow><meshLambertMaterial vertexColors /></mesh>)}
    <Instances points={marks} kind="box" color={snow ? '#f7c95c' : jungle ? '#d6e8a7' : '#e8ddaf'} />
    <Instances points={delineators.posts} kind="box" color={GRAPHITE} shadows={false} />
    <Instances points={delineators.reflectors} kind="box" color={accent} colors={[accent, LIME]} shadows={false} />
    <Instances points={bridgePlanks} kind="box" color={jungle ? '#8b9564' : '#b98e60'} />
    <Instances points={bridgeWalls} kind="box" color={jungle ? '#287451' : '#a67d53'} />
    <Instances points={bridgeCaps} kind="box" color={jungle ? '#d6e8a7' : '#f5e7c5'} />
    <Instances points={BRIDGE_SUPPORTS} kind="box" color={jungle ? '#456b51' : '#99724d'} />
    <Instances points={roadsideWalls} kind="box" color={accent} colors={[accent, theme.paper]} />
    <Instances points={roadsideStripes} kind="box" color={theme.paper} colors={[theme.paper, accent]} />
    <RigidBody type="fixed" colliders={false} name="bridge-decks">
      {BRIDGE_DECK_SEGMENTS.map(({ id, position, yaw, halfExtents }) => <CuboidCollider key={id} position={position} rotation={[0, yaw, 0]} args={halfExtents} friction={0.8} restitution={0} />)}
    </RigidBody>
    <RigidBody type="fixed" colliders={false} name="barriers">
      {TRACK_BARRIERS.map(({ id, position, yaw, halfExtents }) => <CuboidCollider key={id} position={position} rotation={[0, yaw, 0]} args={halfExtents} friction={0.2} restitution={0} />)}
    </RigidBody>
    <group position={startFrame.point} rotation={[0, startFrame.yaw, 0]}>
      {[-1, 1].map((row) => Array.from({ length: 16 }, (_, index) => <mesh key={`${row}-${index}`} position={[(index - 7.5) * ROAD_WIDTH / 16, 0.045, row * 0.225]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[ROAD_WIDTH / 16, 0.45]} /><meshBasicMaterial color={(index + (row > 0 ? 1 : 0)) % 2 ? theme.paper : theme.ink} /></mesh>))}
      {[-1, 1].map((side) => <mesh key={side} position={[0, 0.043, side * 0.52]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[ROAD_WIDTH, 0.075]} /><meshBasicMaterial color={LIME} /></mesh>)}
      {/* Pole-position starting grid box behind the line */}
      {TRACK_CLOSED && <group position={[0, 0.042, -6.4]}>
        <mesh position={[0, 0, 2.3]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[3.2, 0.14]} /><meshBasicMaterial color={LIME} /></mesh>
        {[-1.53, 1.53].map((gx) => <mesh key={gx} position={[gx, 0, 1.4]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.14, 1.8]} /><meshBasicMaterial color="#eff2ea" transparent opacity={0.85} /></mesh>)}
      </group>}
    </group>
  </>;
});

export function JumpRamp() {
  const geometry = useMemo(jumpRampGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const glowRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 5;
    glowRefs.current.forEach((mat, i) => {
      if (!mat) return;
      const wave = 0.55 + 0.45 * Math.sin(t - i * 0.9);
      mat.opacity = 0.5 + wave * 0.5;
    });
  });
  return <group>
    <RigidBody type="fixed" colliders="trimesh"><mesh geometry={geometry} castShadow><meshStandardMaterial color={currentMap.theme.accent} roughness={0.45} metalness={0.18} side={THREE.DoubleSide} flatShading /></mesh></RigidBody>
    {JUMP_STRIPES.map(({ position, yaw, slope }, i) => <group key={i} position={position} rotation={[0, yaw, 0]}>
      <mesh rotation={[-Math.PI / 2 - slope, 0, 0]}>
        <planeGeometry args={[BOOST_JUMP.width - 0.5, 0.44]} />
        <meshBasicMaterial ref={(m) => { glowRefs.current[i] = m; }} color={currentMap.id === 'jungle' ? '#fff4b0' : LIME} transparent opacity={0.92} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>)}
  </group>;
}

const ALPINE_SECTORS = Array.from({ length: 8 }, (_, index) => ({ small: 'ALPINE LOOP', big: `S${index + 1}` }));

export default memo(function World({ low }: { low: boolean }) {
  const sites = useMemo(buildAlpineTown, []);
  const ground = useMemo(alpineGroundTexture, []);
  useEffect(() => () => ground.dispose(), [ground]);
  const chevronGround = useMemo(() => (frame: TrackFrame, distance: number) => alpineVergeHeight(frame.point.y, ROAD_WIDTH / 2 + distance), []);
  const roadsideBlocked = useMemo(() => (x: number, z: number) => Math.abs(z) <= 34 || isTownLot(x, z, sites, 1.5), [sites]);
  const rocks = useMemo(() => {
    const random = seededRandom(418); const points = [];
    for (let i = 0; i < 100; i++) { const x = (random() - 0.5) * 900; const z = (random() - 0.5) * 800; const s = 1 + random() * 3; if (Math.abs(z) > 32 && nearestTrackPoint(x, z).distance > 23 && !isTownLot(x, z, sites)) points.push({ position: [x, s * 0.3, z] as [number, number, number], scale: [s, s * 0.65, s * 0.8] as [number, number, number], rotation: random() * Math.PI }); }
    return points;
  }, [sites]);
  return <>
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider position={[0, -1, -236]} args={[480, 1, 212]} friction={0.9} /><CuboidCollider position={[0, -1, 236]} args={[480, 1, 212]} friction={0.9} />
      <CuboidCollider position={[0, -6, 0]} args={[480, 1, 480]} />
    </RigidBody>
    {[-1, 1].map((side) => <mesh key={side} position={[0, -0.035, side * 236]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[960, 424]} /><meshLambertMaterial map={ground} color={side > 0 ? '#e2ecd4' : '#d0dfc0'} /></mesh>)}
    <Mountains /><Forest low={low} sites={sites} /><Instances points={rocks} kind="rock" color="#6d8176" colors={['#5b706b', '#839080', '#778578']} />
    <AlpineMeadow low={low} sites={sites} />
    <AlpineRiver low={low} /><ValleyMist low={low} /><AlpineLightShafts low={low} /><AlpinePollen low={low} /><Butterflies low={low} />
    <RailDressUp snow={false} accent="#f08b5b" low={low} />
    <CurveChevrons accent="#f08b5b" distance={1.75} boardY={1.85} groundY={chevronGround} blocked={roadsideBlocked} />
    <CornerApexKit accent="#f08b5b" low={low} groundY={chevronGround} blocked={roadsideBlocked} />
    <ProgressMarkers labels={ALPINE_SECTORS} accent="#f08b5b" distance={2.1} groundY={chevronGround} />
    <TrackSurface /><CheckpointGates /><AlpineTown sites={sites} low={low} /><JumpRamp />
    <HotAirBalloon position={[160, 4, 200]} color="#d87958" />
    {!low && <HotAirBalloon position={[80, 14, 255]} scale={0.7} color="#547e8a" offset={2.4} />}
    <Goat position={[144, 0, 294]} rotation={-1} /><Goat position={[-162, 0, -278]} rotation={1.8} /><Goat position={[210, 0, 120]} rotation={-0.8} />
    <Eagle /><Eagle offset={2.5} /><Eagle offset={5} scale={0.7} />{!low && <Eagle offset={8} scale={0.55} />}
    <CharacterSign name="wild-haired-driver" position={roadsidePosition(0.01, -12)} /><CharacterSign name="crying-driver" position={roadsidePosition(0.79, 12)} />
  </>;
});

function roadsidePosition(progress: number, offset: number): [number, number, number] {
  const frame = trackFrame(progress), p = frame.point.clone().addScaledVector(frame.right, offset);
  return [p.x, p.y, p.z];
}
