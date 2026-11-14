import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, useTexture } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { ROAD_WIDTH, TRACK_POINTS, nearestTrackPoint, seededRandom, trackFrame } from './track';
import { CheckpointGates, JumpRamp, TrackSurface } from './World';
import JungleVillage from './JungleVillage';
import { buildJungleVillage } from './jungleSettlement';

type Point = {
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
};

const JADE = '#153c35';
const LEAF = '#287451';
const GOLD = '#eac35a';
const MIST = '#e9efda';
const jungleArt = (name: string) => `${import.meta.env.BASE_URL}jungle-pack/${name}.svg`;
const wildlife = [
  { name: 'lion', progress: 0.07, side: -1, width: 5.8, height: 5.8 },
  { name: 'giraffe', progress: 0.16, side: 1, width: 7, height: 8.2 },
  { name: 'deer', progress: 0.28, side: -1, width: 5.5, height: 5.5 },
  { name: 'python', progress: 0.37, side: 1, width: 5.5, height: 5.5 },
  { name: 'elephant', progress: 0.45, side: -1, width: 7.6, height: 7.6 },
  { name: 'horse', progress: 0.56, side: 1, width: 6.2, height: 6.2 },
  { name: 'wolf', progress: 0.64, side: -1, width: 5.8, height: 5.8 },
  { name: 'monkey', progress: 0.74, side: 1, width: 4.5, height: 4.5, lift: 3.1 },
  { name: 'toucan', progress: 0.84, side: -1, width: 4.6, height: 4.6, lift: 4.5 },
  { name: 'waqar', progress: 0.015, side: 1, width: 5.5, height: 5.5 },
  { name: 'imran', progress: 0.34, side: -1, width: 5.5, height: 5.5 },
  { name: 'tatheer', progress: 0.68, side: 1, width: 5.5, height: 5.5 },
];
const sceneArtwork = [...wildlife.map(({ name }) => name), 'stop-station', 'finish-flag', 'lap-badge'].map(jungleArt);
function wildlifePosition(progress: number, side: number, width: number) {
  let frame = trackFrame(progress);
  if (Math.abs(frame.point.z) < 31) frame = trackFrame(progress + 0.045);
  return frame.point.clone().addScaledVector(frame.right, side * (18 + width * 0.3));
}

/** Height of the sloped jungle verge at a given distance from the track centre. */
function vergeHeight(trackY: number, distance: number) {
  const inner = ROAD_WIDTH / 2, outer = ROAD_WIDTH / 2 + 12;
  const t = THREE.MathUtils.clamp((distance - inner) / (outer - inner), 0, 1);
  return Math.max(0.02, (trackY - 0.12) * (1 - t));
}

/* ------------------------------------------------------------------ */
/* Small procedural textures keep the jungle rich without downloads.   */
/* ------------------------------------------------------------------ */

function jungleGroundTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#3f5f33';
  context.fillRect(0, 0, size, size);
  const random = seededRandom(60421);
  const palette = ['#4b6d38', '#35542c', '#57783d', '#6b5a35', '#456a3a', '#2f4b28', '#7a6a3f'];
  for (let i = 0; i < 240; i++) {
    const x = random() * size, y = random() * size, radius = 8 + random() * 46;
    const color = palette[Math.floor(random() * palette.length)];
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color + 'cc');
    gradient.addColorStop(0.6, color + '66');
    gradient.addColorStop(1, color + '00');
    context.fillStyle = gradient;
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  }
  for (let i = 0; i < 1800; i++) {
    const x = random() * size, y = random() * size, radius = 0.5 + random() * 2.2;
    context.fillStyle = random() < 0.5 ? 'rgba(120,100,58,0.34)' : 'rgba(28,48,24,0.34)';
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
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
    const nx = Math.sin(x * 0.11 + y * 0.05) * 0.5 + Math.sin(x * 0.035 - y * 0.09) * 0.5;
    const ny = Math.cos(x * 0.08 - y * 0.12) * 0.5 + Math.cos(x * 0.05 + y * 0.04) * 0.5;
    const index = (y * size + x) * 4;
    data[index] = Math.round(128 + nx * 42);
    data[index + 1] = Math.round(128 + ny * 42);
    data[index + 2] = 255;
    data[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(26, 2);
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
  gradient.addColorStop(0, '#5ab7a4');
  gradient.addColorStop(0.18, '#2f8f86');
  gradient.addColorStop(0.5, '#155f60');
  gradient.addColorStop(0.82, '#2f8f86');
  gradient.addColorStop(1, '#5ab7a4');
  context.fillStyle = gradient; context.fillRect(0, 0, width, height);
  const random = seededRandom(7712);
  for (let i = 0; i < 90; i++) {
    const x = random() * width, y = random() * height, w = 30 + random() * 160;
    context.fillStyle = `rgba(190,240,220,${0.04 + random() * 0.08})`;
    context.beginPath(); context.ellipse(x, y, w, 1.2 + random() * 2.4, 0, 0, Math.PI * 2); context.fill();
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
  const random = seededRandom(9917);
  for (let i = 0; i < 150; i++) {
    const x = random() * width, y = height * (0.25 + random() * 0.5);
    context.fillStyle = `rgba(235,252,242,${0.12 + random() * 0.4})`;
    context.beginPath(); context.ellipse(x, y, 8 + random() * 54, 0.8 + random() * 3.2, 0, 0, Math.PI * 2); context.fill();
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
  const random = seededRandom(2218);
  for (let i = 0; i < 240; i++) {
    const x = random() * width, y = random() * height;
    context.fillStyle = `rgba(225,248,242,${0.08 + random() * 0.3})`;
    context.fillRect(x, y, 0.6 + random() * 2.4, 8 + random() * 60);
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

function shimmerTexture() {
  return softTexture('rgba(255,255,245,0.9)', 'rgba(220,255,240,0)');
}

function shaftTexture() {
  const width = 128, height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  const vertical = context.createLinearGradient(0, 0, 0, height);
  vertical.addColorStop(0, 'rgba(255,244,200,0)');
  vertical.addColorStop(0.25, 'rgba(255,244,200,0.55)');
  vertical.addColorStop(0.7, 'rgba(255,244,200,0.18)');
  vertical.addColorStop(1, 'rgba(255,244,200,0)');
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

function shadowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(10,24,16,0.55)');
  gradient.addColorStop(0.55, 'rgba(10,24,16,0.28)');
  gradient.addColorStop(1, 'rgba(10,24,16,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ------------------------------------------------------------------ */
/* Instanced vegetation                                                */
/* ------------------------------------------------------------------ */

/** All repeated vegetation uses shared geometry and instancing, even in the dense preset. */
function VegetationInstances({ points, kind, color, colors, low = false, shadows }: {
  points: Point[];
  kind: 'trunk' | 'canopy' | 'leaf' | 'rock' | 'grass' | 'litter' | 'reed' | 'flower' | 'stem';
  color: string;
  colors?: string[];
  low?: boolean;
  shadows?: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const leaf = useMemo(() => {
    if (kind !== 'leaf') return undefined;
    const geometry = new THREE.BufferGeometry();
    // A bent, pointed frond. Its silhouette remains legible without expensive textures.
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, -0.5, 0.13, 0.8, 0.5, 0.13, 0.8,
      -0.5, 0.13, 0.8, -0.38, 0.08, 1.7, 0.38, 0.08, 1.7,
      0.5, 0.13, 0.8, -0.5, 0.13, 0.8, 0.38, 0.08, 1.7,
      -0.38, 0.08, 1.7, 0, -0.22, 2.8, 0.38, 0.08, 1.7,
    ], 3));
    geometry.computeVertexNormals();
    return geometry;
  }, [kind]);
  useEffect(() => () => leaf?.dispose(), [leaf]);
  useEffect(() => {
    if (!mesh.current) return;
    const object = new THREE.Object3D();
    const tint = new THREE.Color();
    points.forEach((point, index) => {
      object.position.fromArray(point.position);
      object.scale.fromArray(point.scale);
      const rotation = point.rotation ?? [0, 0, 0];
      object.rotation.set(rotation[0], rotation[1], rotation[2]);
      object.updateMatrix();
      mesh.current!.setMatrixAt(index, object.matrix);
      if (colors) mesh.current!.setColorAt(index, tint.set(colors[index % colors.length]));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [points, colors]);
  const doubleSide = kind === 'leaf' || kind === 'grass' || kind === 'litter';
  return <instancedMesh ref={mesh} args={[leaf, undefined, points.length]} receiveShadow castShadow={shadows ?? (kind === 'canopy' && !low)}>
    {kind === 'trunk' && <cylinderGeometry args={[0.75, 1, 1, 6]} />}
    {kind === 'canopy' && <icosahedronGeometry args={[1, low ? 0 : 1]} />}
    {kind === 'rock' && <icosahedronGeometry args={[1, 0]} />}
    {kind === 'grass' && <coneGeometry args={[0.12, 1, 3]} />}
    {kind === 'reed' && <coneGeometry args={[0.05, 1, 4]} />}
    {kind === 'litter' && <circleGeometry args={[1, 7]} />}
    {kind === 'flower' && <icosahedronGeometry args={[1, 0]} />}
    {kind === 'stem' && <cylinderGeometry args={[0.04, 0.05, 1, 4]} />}
    <meshLambertMaterial
      color={colors ? '#ffffff' : color}
      flatShading
      side={doubleSide ? THREE.DoubleSide : THREE.FrontSide}
      polygonOffset={kind === 'litter'}
      polygonOffsetFactor={kind === 'litter' ? -1 : 0}
      polygonOffsetUnits={kind === 'litter' ? -1 : 0}
    />
  </instancedMesh>;
}

const DenseJungle = memo(function DenseJungle({ low }: { low: boolean }) {
  const foliage = useMemo(() => {
    const random = seededRandom(817420);
    const trunks: Point[] = [], crowns: Point[] = [], fronds: Point[] = [];
    const ferns: Point[] = [], vines: Point[] = [], rocks: Point[] = [];
    const edgeFerns: Point[] = [], grass: Point[] = [], stems: Point[] = [], blooms: Point[] = [];
    const litter: Point[] = [], logs: Point[] = [], stumps: Point[] = [];
    const station = stationFrame();
    const clearings = wildlife.map((animal) => wildlifePosition(animal.progress, animal.side, animal.width));
    const waterfall = { x: 300, z: 0 };
    const available = (x: number, z: number, margin: number) => Math.abs(z) > 29
      && nearestTrackPoint(x, z).distance > margin
      && Math.hypot(x - station.x, z - station.z) > 17
      && Math.hypot(x - waterfall.x, z - waterfall.z) > 30
      && clearings.every((point) => Math.hypot(x - point.x, z - point.z) > 5.5);

    const treeTarget = low ? 820 : 1470;
    for (let attempt = 0; attempt < treeTarget * 3 && trunks.length < treeTarget; attempt++) {
      const x = (random() - 0.5) * 650, z = (random() - 0.5) * 590;
      const size = 0.8 + random() * 1.15;
      if (!available(x, z, 18)) continue;
      const palm = random() < 0.23;
      const height = (palm ? 10.5 : 7.5) * size;
      trunks.push({ position: [x, height / 2, z], scale: [size * (palm ? 0.38 : 0.7), height, size * (palm ? 0.38 : 0.7)] });
      if (palm) {
        for (let i = 0; i < 6; i++) fronds.push({ position: [x, height, z], scale: [size * 2.7, size * 3, size * 2.6], rotation: [0, i / 6 * Math.PI * 2 + random() * 0.2, 0] });
        crowns.push({ position: [x, height - 0.05, z], scale: [size * 1.3, size * 0.8, size * 1.3] });
      } else {
        crowns.push({ position: [x, height + size * 1.7, z], scale: [size * 5.6, size * 3.6, size * 4.8] });
        crowns.push({ position: [x + size * 1.6, height + size * 0.2, z - size * 0.8], scale: [size * 4.5, size * 2.5, size * 4.2] });
        if (attempt % 4 === 0) vines.push({ position: [x + size * 3.2, height - 1.5, z + size * 0.8], scale: [0.06, height - 2.5, 0.06] });
      }
    }

    // Emergent giants lean over the road to form a high canopy tunnel. Their
    // crowns stay well above the chase camera and never touch the racing line.
    const emergentCount = low ? 6 : 12;
    for (let i = 0; i < emergentCount; i++) {
      const progress = (i + 0.35) / emergentCount;
      const frame = trackFrame(progress);
      const side = i % 2 ? 1 : -1;
      const distance = 21 + random() * 6;
      const p = frame.point.clone().addScaledVector(frame.right, side * distance);
      if (Math.abs(p.z) < 31 || Math.hypot(p.x - station.x, p.z - station.z) < 20 || Math.hypot(p.x - waterfall.x, p.z - waterfall.z) < 34) continue;
      if (clearings.some((point) => Math.hypot(p.x - point.x, p.z - point.z) < 8)) continue;
      const height = 17 + random() * 7;
      const size = 0.9 + random() * 0.5;
      trunks.push({ position: [p.x, height / 2, p.z], scale: [size * 1.1, height, size * 1.1] });
      crowns.push({ position: [p.x, height + 1.5, p.z], scale: [size * 9.5, size * 5.2, size * 8.5] });
      crowns.push({ position: [p.x + side * 3.5, height - 0.5, p.z + 2.5], scale: [size * 6.5, size * 3.6, size * 6] });
      crowns.push({ position: [p.x - side * 2.5, height + 0.8, p.z - 3], scale: [size * 5.5, size * 3.2, size * 5.2] });
      for (let v = 0; v < (low ? 1 : 3); v++) {
        const vx = p.x + (random() - 0.5) * 8;
        const vz = p.z + (random() - 0.5) * 8;
        const top = height - 1.5 - random() * 2;
        const bottom = 3 + random() * 3;
        vines.push({ position: [vx, (top + bottom) / 2, vz], scale: [0.07, top - bottom, 0.07] });
      }
    }

    for (let attempt = 0; attempt < (low ? 1450 : 2800); attempt++) {
      const x = (random() - 0.5) * 470, z = (random() - 0.5) * 430;
      if (!available(x, z, 10.7)) continue;
      const size = 0.65 + random() * 1.25;
      const angle = random() * Math.PI * 2;
      for (let i = 0; i < 4; i++) ferns.push({ position: [x, 0.17, z], scale: [size, size * 1.3, size], rotation: [-0.32, angle + i * Math.PI / 2, 0] });
      if (attempt % 13 === 0) rocks.push({ position: [x, size * 0.33, z], scale: [size * 1.4, size * 0.6, size], rotation: [0, angle, 0] });
    }

    // A lush fringe hugs the road. It is deliberately outside the shoulder so
    // the driving line stays readable while the jungle feels close.
    for (let attempt = 0; attempt < (low ? 420 : 1100); attempt++) {
      const progress = random();
      const frame = trackFrame(progress);
      const side = random() < 0.5 ? -1 : 1;
      const distance = ROAD_WIDTH / 2 + 1.4 + random() * 5.5;
      const p = frame.point.clone().addScaledVector(frame.right, side * distance);
      if (Math.abs(p.z) < 33) continue;
      if (Math.hypot(p.x - station.x, p.z - station.z) < 16) continue;
      if (clearings.some((point) => Math.hypot(p.x - point.x, p.z - point.z) < 4.5)) continue;
      const y = vergeHeight(frame.point.y, distance);
      const size = 0.55 + random() * 0.9;
      const angle = random() * Math.PI * 2;
      if (random() < 0.72) grass.push({ position: [p.x, y + 0.02, p.z], scale: [size * 0.8, size * (0.7 + random() * 0.7), size * 0.8], rotation: [0, angle, 0] });
      if (random() < 0.34) {
        const fernSize = 0.7 + random() * 0.8;
        for (let i = 0; i < 3; i++) edgeFerns.push({ position: [p.x, y + 0.08, p.z], scale: [fernSize, fernSize * 1.25, fernSize], rotation: [-0.32, angle + i * Math.PI * 2 / 3, 0] });
      }
      if (random() < 0.28) {
        const stemHeight = 0.35 + random() * 0.6;
        const bx = p.x + (random() - 0.5) * 0.8;
        const bz = p.z + (random() - 0.5) * 0.8;
        stems.push({ position: [bx, y + stemHeight / 2, bz], scale: [1, stemHeight, 1] });
        blooms.push({ position: [bx, y + stemHeight + 0.04, bz], scale: [0.11 + random() * 0.09, 0.11 + random() * 0.09, 0.11 + random() * 0.09], rotation: [random(), random(), random()] });
      }
    }

    for (let attempt = 0; attempt < (low ? 260 : 620); attempt++) {
      const x = (random() - 0.5) * 620, z = (random() - 0.5) * 560;
      if (!available(x, z, 10.5)) continue;
      const size = 0.35 + random() * 0.9;
      const nearest = nearestTrackPoint(x, z);
      litter.push({ position: [x, vergeHeight(nearest.point.y, nearest.distance) + 0.035, z], scale: [size, size, size], rotation: [-Math.PI / 2, 0, 0] });
    }
    for (let i = 0; i < (low ? 4 : 10); i++) {
      const x = (random() - 0.5) * 500, z = (random() - 0.5) * 460;
      if (!available(x, z, 20)) continue;
      const length = 3.5 + random() * 4.5;
      logs.push({ position: [x, 0.32, z], scale: [0.45 + random() * 0.25, length, 0.45 + random() * 0.25], rotation: [0, random() * Math.PI, Math.PI / 2] });
    }
    for (let i = 0; i < (low ? 3 : 8); i++) {
      const x = (random() - 0.5) * 500, z = (random() - 0.5) * 460;
      if (!available(x, z, 20)) continue;
      const size = 0.6 + random() * 0.6;
      stumps.push({ position: [x, size * 0.5, z], scale: [size, size, size], rotation: [0, random() * Math.PI, 0] });
    }

    return { trunks, crowns, fronds, ferns, vines, rocks, edgeFerns, grass, stems, blooms, litter, logs, stumps };
  }, [low]);
  return <>
    <VegetationInstances points={foliage.trunks} kind="trunk" color="#6e5435" low={low} />
    <VegetationInstances points={foliage.crowns} kind="canopy" color={LEAF} colors={['#17583e', '#236e4b', '#347e4b', '#41874d', '#589756']} low={low} />
    <VegetationInstances points={foliage.fronds} kind="leaf" color="#3c8748" low={low} />
    <VegetationInstances points={foliage.ferns} kind="leaf" color="#669a4d" colors={['#43783d', '#82b85c', '#589043']} low={low} />
    <VegetationInstances points={foliage.vines} kind="trunk" color="#4e723e" low={low} />
    <VegetationInstances points={foliage.rocks} kind="rock" color="#3f6249" low={low} />
    <VegetationInstances points={foliage.edgeFerns} kind="leaf" color="#5f9a4d" colors={['#4f8a43', '#6aa85a', '#7ab85f']} low={low} />
    <VegetationInstances points={foliage.grass} kind="grass" color="#5f8a45" colors={['#4f7a3a', '#6b9a4e', '#7aa85a', '#8ab55f']} low={low} />
    <VegetationInstances points={foliage.stems} kind="stem" color="#4f7a3a" low={low} />
    <VegetationInstances points={foliage.blooms} kind="flower" color="#ffffff" colors={['#eac35a', '#d97d73', '#f3e7cb', '#c77dbb', '#f2b6c6']} low={low} />
    <VegetationInstances points={foliage.litter} kind="litter" color="#6b5a35" colors={['#6b5a35', '#7a6338', '#4f5f2f', '#8a7040']} low={low} />
    <VegetationInstances points={foliage.logs} kind="trunk" color="#5b6b3f" low={low} />
    <VegetationInstances points={foliage.stumps} kind="trunk" color="#6e5435" low={low} />
  </>;
});

const JungleCanopyBackdrop = memo(function JungleCanopyBackdrop({ low }: { low: boolean }) {
  const points = useMemo(() => {
    const random = seededRandom(55192);
    const result: Point[] = [];
    const count = low ? 26 : 54;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + random() * 0.12;
      const radius = 330 + random() * 95;
      const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
      if (Math.abs(z) < 34) continue;
      const size = 16 + random() * 18;
      result.push({ position: [x, 8 + random() * 16, z], scale: [size, size * (0.5 + random() * 0.25), size * (0.8 + random() * 0.4)] });
    }
    return result;
  }, [low]);
  return <VegetationInstances points={points} kind="canopy" color="#174a33" colors={['#123d2c', '#174a33', '#1d5539', '#235e3d']} low={low} shadows={false} />;
});

/** A sloped green verge joins the elevated road to the valley floor. */
const JungleVerge = memo(function JungleVerge() {
  const geometry = useMemo(() => {
    const positions: number[] = [], colors: number[] = [];
    const inner = new THREE.Color('#6f8f4c'), mid = new THREE.Color('#557a3c'), outer = new THREE.Color('#3b5a2f');
    const rows = [ROAD_WIDTH / 2 + 0.5, ROAD_WIDTH / 2 + 4.5, ROAD_WIDTH / 2 + 12];
    const count = TRACK_POINTS.length;
    for (let i = 0; i < count; i++) {
      const a = TRACK_POINTS[i], b = TRACK_POINTS[(i + 1) % count];
      if (Math.abs(a.point.z) < 35 || Math.abs(b.point.z) < 35) continue;
      for (const side of [-1, 1]) {
        for (let row = 0; row < 2; row++) {
          const vertices = [a, b].flatMap((frame) => [row, row + 1].map((r) => {
            const p = frame.point.clone().addScaledVector(frame.right, side * rows[r]);
            const y = r === 2 ? -0.02 : Math.max(0.02, frame.point.y - 0.12 - (frame.point.y - 0.12) * (r / 2));
            const color = r === 2 ? outer : r === 1 ? mid : inner;
            return { point: [p.x, y, p.z] as [number, number, number], color };
          }));
          const order = side > 0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3];
          for (const index of order) {
            positions.push(...vertices[index].point);
            colors.push(vertices[index].color.r, vertices[index].color.g, vertices[index].color.b);
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} receiveShadow><meshLambertMaterial vertexColors side={THREE.DoubleSide} /></mesh>;
});

function stationFrame() {
  const frame = trackFrame(0.975);
  const point = frame.point.clone().addScaledVector(frame.right, -29);
  return { x: point.x, z: point.z, yaw: frame.yaw };
}

/** Hand-drawn animals stay outside the road corridor; drivers never need to hit wildlife. */
function JungleBillboard({ name, progress, side, width = 5, height = 5, lift = 0 }: {
  name: string;
  progress: number;
  side: number;
  width?: number;
  height?: number;
  lift?: number;
}) {
  const texture = useTexture(jungleArt(name));
  const group = useRef<THREE.Group>(null);
  const phase = useMemo(() => progress * Math.PI * 2, [progress]);
  const position = useMemo(() => {
    const point = wildlifePosition(progress, side, width);
    return [point.x, lift + height / 2 + 0.1, point.z] as [number, number, number];
  }, [progress, side, width, height, lift]);
  useFrame(({ clock }) => {
    if (group.current) group.current.position.y = Math.sin(clock.elapsedTime * 0.8 + phase) * 0.1;
  });
  return <group ref={group}><Billboard position={position} follow lockX lockZ><mesh>
    <planeGeometry args={[width, height]} />
    <meshBasicMaterial map={texture} transparent alphaTest={0.08} side={THREE.DoubleSide} />
  </mesh></Billboard></group>;
}

/** Soft contact shadows ground the illustrated animals in the scene. */
function WildlifeShadows() {
  const texture = useMemo(shadowTexture, []);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const points = useMemo(() => wildlife.map((animal) => {
    const p = wildlifePosition(animal.progress, animal.side, animal.width);
    const nearest = nearestTrackPoint(p.x, p.z);
    return {
      position: [p.x, vergeHeight(nearest.point.y, nearest.distance) + 0.04, p.z] as [number, number, number],
      scale: [animal.width * 0.38, animal.width * 0.38, 1] as [number, number, number],
    };
  }), []);
  useEffect(() => {
    if (!mesh.current) return;
    const object = new THREE.Object3D();
    points.forEach((point, index) => {
      object.position.fromArray(point.position);
      object.rotation.set(-Math.PI / 2, 0, 0);
      object.scale.set(point.scale[0], point.scale[1], 1);
      object.updateMatrix();
      mesh.current!.setMatrixAt(index, object.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [points]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <instancedMesh ref={mesh} args={[undefined, undefined, points.length]}>
    <planeGeometry args={[1, 1]} />
    <meshBasicMaterial map={texture} transparent opacity={0.5} depthWrite={false} />
  </instancedMesh>;
}

function StopStation({ low }: { low: boolean }) {
  const frame = useMemo(stationFrame, []);
  const sign = useTexture(jungleArt('stop-station'));
  const bunting = useMemo(() => Array.from({ length: 7 }, (_, i) => ({
    x: -6 + i * 2,
    y: 5.7 - Math.cos((i / 6 - 0.5) * Math.PI) * 0.35,
    color: [GOLD, '#d97d73', MIST, LEAF][i % 4],
  })), []);
  return <group position={[frame.x, 0, frame.z]} rotation={[0, frame.yaw + Math.PI / 2, 0]}>
    <RigidBody type="fixed" colliders={false} name="jungle-stop-station">
      <CuboidCollider args={[6.5, 3.3, 4.8]} position={[0, 3.3, 0]} restitution={0} />
    </RigidBody>
    <mesh position={[0, 0.05, 1.5]} receiveShadow><boxGeometry args={[18, 0.1, 16]} /><meshLambertMaterial color="#9d9970" /></mesh>
    {Array.from({ length: 10 }, (_, index) => <mesh key={index} position={[0, 0.12, -3 + index * 1.05]} receiveShadow><boxGeometry args={[17.5, 0.04, 0.9]} /><meshLambertMaterial color={index % 2 ? '#b08a5c' : '#a57f52'} /></mesh>)}
    <mesh position={[0, 3, 0]} receiveShadow castShadow><boxGeometry args={[13, 6, 9.6]} /><meshLambertMaterial color={MIST} /></mesh>
    <mesh position={[0, 0.45, 0]} receiveShadow><boxGeometry args={[13.4, 0.9, 10]} /><meshLambertMaterial color="#6d8d67" /></mesh>
    <mesh position={[0, 6.45, 0]} castShadow><boxGeometry args={[15.5, 1, 12]} /><meshLambertMaterial color={JADE} /></mesh>
    <mesh position={[0, 7.9, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1, 1, 0.78]} castShadow>
      <coneGeometry args={[10.6, 3.4, 4]} />
      <meshLambertMaterial color="#8a6a3f" flatShading />
    </mesh>
    <mesh position={[0, 9.6, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1, 1, 0.78]} castShadow>
      <coneGeometry args={[6.2, 1.8, 4]} />
      <meshLambertMaterial color="#a07b48" flatShading />
    </mesh>
    <mesh position={[0, 10.6, 0]}><sphereGeometry args={[0.32, 8, 6]} /><meshLambertMaterial color={GOLD} /></mesh>
    <mesh position={[0, 2.65, 4.84]}><planeGeometry args={[7.2, 5.3]} /><meshLambertMaterial color="#395e50" /></mesh>
    {Array.from({ length: 6 }, (_, index) => <mesh key={index} position={[0, 0.65 + index * 0.8, 4.9]}><boxGeometry args={[7.2, 0.08, 0.08]} /><meshLambertMaterial color="#6d8d67" /></mesh>)}
    <mesh position={[-5, 3.2, 4.86]}><planeGeometry args={[1.7, 2.1]} /><meshStandardMaterial color="#91bcb1" emissive="#2b6b62" emissiveIntensity={0.18} /></mesh>
    <mesh position={[5, 3.2, 4.87]}><planeGeometry args={[1.3, 2.1]} /><meshStandardMaterial color={GOLD} emissive="#b8862e" emissiveIntensity={0.25} /></mesh>
    <mesh position={[0, 5.7, 6.4]}><planeGeometry args={[3, 3]} /><meshBasicMaterial map={sign} transparent alphaTest={0.08} side={THREE.DoubleSide} /></mesh>
    {[-5.6, 5.6].map((x) => <group key={x} position={[x, 4.6, 4.95]}>
      <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.06, 0.06, 0.5, 5]} /><meshLambertMaterial color={JADE} /></mesh>
      <mesh><sphereGeometry args={[0.28, 8, 6]} /><meshStandardMaterial color="#ffd98a" emissive="#ffb84d" emissiveIntensity={0.9} /></mesh>
      <mesh position={[0, 0.35, 0]}><coneGeometry args={[0.34, 0.25, 6]} /><meshLambertMaterial color={JADE} /></mesh>
    </group>)}
    {!low && <pointLight position={[0, 4.2, 6]} color="#ffcf7a" intensity={1.1} distance={15} decay={2} />}
    {bunting.map((flag, index) => <mesh key={index} position={[flag.x, flag.y, 5.05]} rotation={[0, 0, Math.PI / 4]}>
      <planeGeometry args={[0.55, 0.55]} />
      <meshBasicMaterial color={flag.color} side={THREE.DoubleSide} />
    </mesh>)}
    {[-6.2, 6.2].map((x) => <group key={x} position={[x, 0.35, 4.4]}>
      <mesh castShadow><cylinderGeometry args={[0.45, 0.35, 0.7, 7]} /><meshLambertMaterial color="#b56f4e" /></mesh>
      {[0, 1, 2, 3, 4].map((i) => <mesh key={i} position={[Math.cos(i / 5 * Math.PI * 2) * 0.35, 0.75, Math.sin(i / 5 * Math.PI * 2) * 0.35]} rotation={[0.35, i / 5 * Math.PI * 2, 0]}>
        <coneGeometry args={[0.12, 0.9, 4]} />
        <meshLambertMaterial color={i % 2 ? '#3f7a4a' : '#4f8a53'} />
      </mesh>)}
    </group>)}
    {[0, 1, 2].map((index) => <mesh key={index} position={[0, 0.12 + index * 0.16, 5.4 + index * 0.55]} receiveShadow><boxGeometry args={[3.2, 0.16, 0.6]} /><meshLambertMaterial color="#bf9e6e" /></mesh>)}
    {[-1, 1].map((side) => <group key={side} position={[side * 8.1, 0, 5]}>
      <mesh position={[0, 1.5, 0]} castShadow><boxGeometry args={[1.4, 3, 1.1]} /><meshLambertMaterial color={side < 0 ? '#d97d73' : GOLD} /></mesh>
      <mesh position={[0, 2, 0.56]}><planeGeometry args={[1, 0.6]} /><meshBasicMaterial color={JADE} /></mesh>
      <mesh position={[0.4, 3.1, 0]} rotation={[0, 0, -0.3]}><boxGeometry args={[0.12, 0.8, 0.12]} /><meshLambertMaterial color={JADE} /></mesh>
    </group>)}
  </group>;
}

function JungleRiver({ low }: { low: boolean }) {
  const waterNormal = useMemo(waterNormalTexture, []);
  const waterColor = useMemo(waterColorTexture, []);
  const foam = useMemo(foamTexture, []);
  const fall = useMemo(fallTexture, []);
  const shimmer = useMemo(shimmerTexture, []);
  const mist = useMemo(() => softTexture('rgba(235,250,240,0.55)', 'rgba(235,250,240,0)'), []);
  const normalScale = useMemo(() => new THREE.Vector2(0.55, 0.55), []);
  const current = useRef<THREE.Group>(null);
  const foamGroup = useRef<THREE.Group>(null);
  const fallMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const mistRef = useRef<THREE.Group>(null);
  useEffect(() => () => {
    waterNormal.dispose(); waterColor.dispose(); foam.dispose(); fall.dispose(); shimmer.dispose(); mist.dispose();
  }, [waterNormal, waterColor, foam, fall, shimmer, mist]);
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    waterNormal.offset.x = (waterNormal.offset.x + delta * 0.018) % 1;
    waterNormal.offset.y = (waterNormal.offset.y + delta * 0.006) % 1;
    foam.offset.x = (foam.offset.x + delta * 0.035) % 1;
    fall.offset.y = (fall.offset.y - delta * 0.5) % 1;
    if (current.current) current.current.position.x = (t * 1.4) % 24;
    if (foamGroup.current) foamGroup.current.position.x = (t * 0.8) % 48;
    if (fallMaterial.current) fallMaterial.current.opacity = 0.55 + Math.sin(t * 2.4) * 0.08;
    if (mistRef.current) mistRef.current.position.x = Math.sin(t * 0.08) * 6;
  });

  const lilies = useMemo(() => {
    const random = seededRandom(3341);
    const result: Point[] = [];
    for (let i = 0; i < (low ? 22 : 54); i++) {
      const x = (random() - 0.5) * 760;
      const side = random() < 0.5 ? -1 : 1;
      const z = side * (13 + random() * 9);
      const size = 0.5 + random() * 1.1;
      result.push({ position: [x, -1.0, z], scale: [size, size * 0.85, size], rotation: [-Math.PI / 2, 0, 0] });
    }
    return result;
  }, [low]);
  const lotus = useMemo(() => {
    const random = seededRandom(3342);
    const result: Point[] = [];
    for (let i = 0; i < (low ? 6 : 16); i++) {
      const x = (random() - 0.5) * 700;
      const side = random() < 0.5 ? -1 : 1;
      const z = side * (14 + random() * 7);
      result.push({ position: [x, -0.92, z], scale: [0.16 + random() * 0.1, 0.12 + random() * 0.08, 0.16 + random() * 0.1], rotation: [random(), random(), random()] });
    }
    return result;
  }, [low]);
  const reeds = useMemo(() => {
    const random = seededRandom(3343);
    const result: Point[] = [];
    for (let i = 0; i < (low ? 60 : 170); i++) {
      const x = (random() - 0.5) * 900;
      const side = random() < 0.5 ? -1 : 1;
      const z = side * (24 + random() * 4.5);
      const size = 0.6 + random() * 0.9;
      const height = size * (1.4 + random() * 1.2);
      result.push({ position: [x, height / 2, z], scale: [size * 0.8, height, size * 0.8], rotation: [0, random() * Math.PI, 0] });
    }
    return result;
  }, [low]);
  const bankRocks = useMemo(() => {
    const random = seededRandom(3344);
    const result: Point[] = [];
    for (let i = 0; i < (low ? 34 : 90); i++) {
      const x = (random() - 0.5) * 920;
      const side = random() < 0.5 ? -1 : 1;
      const z = side * (24.5 + random() * 5);
      const size = 0.4 + random() * 1.5;
      result.push({ position: [x, size * 0.35 - 0.05, z], scale: [size * 1.3, size * 0.7, size], rotation: [0, random() * Math.PI, 0] });
    }
    return result;
  }, [low]);
  const waterfallRocks = useMemo(() => {
    const random = seededRandom(3345);
    const result: Point[] = [];
    for (let i = 0; i < 14; i++) {
      const z = -24 + i * 3.7 + (random() - 0.5) * 2;
      const size = 5 + random() * 5;
      result.push({ position: [300 + (random() - 0.5) * 8, 2 + random() * 9, z], scale: [size, size * (1.1 + random() * 0.6), size * 0.9], rotation: [random(), random(), random()] });
    }
    return result;
  }, []);

  return <>
    <mesh position={[0, -1.35, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[1000, 51]} /><meshLambertMaterial color="#1b3f38" /></mesh>
    <mesh position={[0, -1.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[1000, 47]} />
      <meshStandardMaterial map={waterColor} normalMap={waterNormal} normalScale={normalScale} roughness={0.16} metalness={0.35} envMapIntensity={1.05} />
    </mesh>
    <group ref={foamGroup}>
      {[-1, 1].map((side) => <mesh key={side} position={[0, -1.02, side * 22.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[960, 2.8]} />
        <meshBasicMaterial map={foam} transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>)}
    </group>
    <group ref={current}>{Array.from({ length: low ? 16 : 28 }, (_, index) => <mesh key={index} position={[(index % 8) * 55 - 220, -1.035, Math.floor(index / 8) * 11 - 11]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[10 + index % 5, 1.1 + index % 3]} />
      <meshBasicMaterial map={shimmer} transparent opacity={0.28} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>)}</group>
    {[-1, 1].map((side) => <mesh key={side} position={[0, -0.1, side * 27]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[960, 6]} /><meshLambertMaterial color="#587d49" /></mesh>)}
    <VegetationInstances points={lilies} kind="litter" color="#3f8f53" colors={['#2f7d4a', '#3f8f53', '#5aa45e', '#6cb36a']} low={low} />
    <VegetationInstances points={lotus} kind="flower" color="#ffffff" colors={['#f2b6c6', '#f7d674', '#f3e7cb']} low={low} />
    <VegetationInstances points={reeds} kind="reed" color="#7a9a4e" colors={['#6d8f45', '#8aa85a', '#5f8040']} low={low} />
    <VegetationInstances points={bankRocks} kind="rock" color="#4a6b52" colors={['#4a6b52', '#5c7a5e', '#6b7f6a']} low={low} />
    <VegetationInstances points={waterfallRocks} kind="rock" color="#3d5a4a" colors={['#3d5a4a', '#4a6a55', '#35503f']} low={low} shadows={false} />
    {[-6, 0, 6].map((z, index) => <mesh key={z} position={[296.5, 8.5 + index * 0.3, z]} rotation={[0, -Math.PI / 2, 0]}>
      <planeGeometry args={[5.2, 17]} />
      <meshBasicMaterial ref={index === 1 ? fallMaterial : undefined} map={fall} transparent opacity={0.62} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>)}
    <group ref={mistRef}>
      <mesh position={[292, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[34, 22]} />
        <meshBasicMaterial map={mist} transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  </>;
}

function JungleMist({ low }: { low: boolean }) {
  const texture = useMemo(() => softTexture('rgba(240,252,245,0.6)', 'rgba(240,252,245,0)'), []);
  const group = useRef<THREE.Group>(null);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ clock }) => { if (group.current) group.current.position.x = Math.sin(clock.elapsedTime * 0.06) * 10; });
  return <group ref={group}>{Array.from({ length: low ? 3 : 7 }, (_, index) => <mesh key={index} position={[(index - 3) * 70 + 20, 0.35 + (index % 3) * 0.25, (index % 2 ? 1 : -1) * (8 + index % 4 * 4)]} rotation={[-Math.PI / 2, 0, 0]}>
    <planeGeometry args={[70 + index % 3 * 20, 22 + index % 4 * 6]} />
    <meshBasicMaterial map={texture} transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} />
  </mesh>)}</group>;
}

function JungleLightShafts({ low }: { low: boolean }) {
  const texture = useMemo(shaftTexture, []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    map: texture, transparent: true, opacity: 0.1, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }), [texture]);
  useEffect(() => () => { texture.dispose(); material.dispose(); }, [texture, material]);
  useFrame(({ clock }) => { material.opacity = 0.1 + Math.sin(clock.elapsedTime * 0.35) * 0.03; });
  const shafts = useMemo(() => {
    const result: { position: [number, number, number]; rotation: [number, number, number] }[] = [];
    const count = low ? 2 : 5;
    for (let i = 0; i < count; i++) {
      const progress = 0.08 + i * 0.18;
      const frame = trackFrame(progress);
      const side = i % 2 ? 1 : -1;
      const p = frame.point.clone().addScaledVector(frame.right, side * (7 + i * 1.5));
      result.push({ position: [p.x, frame.point.y + 13, p.z], rotation: [0, frame.yaw, 0.16] });
    }
    return result;
  }, [low]);
  return <>{shafts.map((shaft, index) => <mesh key={index} position={shaft.position} rotation={shaft.rotation}>
    <planeGeometry args={[7.5, 26]} />
    <primitive object={material} attach="material" />
  </mesh>)}</>;
}

function JunglePollen({ low }: { low: boolean }) {
  const texture = useMemo(() => softTexture('rgba(255,248,210,1)', 'rgba(255,248,210,0)'), []);
  const count = low ? 55 : 150;
  const { geometry, base, phase } = useMemo(() => {
    const random = seededRandom(8821);
    const base = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const progress = random();
      const frame = trackFrame(progress);
      const side = random() < 0.5 ? -1 : 1;
      const distance = 4 + random() * 34;
      const p = frame.point.clone().addScaledVector(frame.right, side * distance);
      base[i * 3] = p.x;
      base[i * 3 + 1] = Math.max(1.2, frame.point.y + 1 + random() * 9);
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
      array[i * 3] = base[i * 3] + Math.sin(t * 0.28 + p) * 1.6;
      array[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.45 + p * 1.7) * 0.9;
      array[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.24 + p) * 1.4;
    }
    attribute.needsUpdate = true;
  });
  return <points ref={points} geometry={geometry}>
    <pointsMaterial map={texture} color="#ffe9a8" size={0.32} sizeAttenuation transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} />
  </points>;
}

function FlyingToucans({ offset = 0, radius = 78, height = 19, speed = 0.12, centerZ = 115, bodyColor = JADE, beakColor = GOLD, wingColor = '#285343', scale = 1 }: {
  offset?: number;
  radius?: number;
  height?: number;
  speed?: number;
  centerZ?: number;
  bodyColor?: string;
  beakColor?: string;
  wingColor?: string;
  scale?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const left = useRef<THREE.Mesh>(null), right = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed + offset;
    if (group.current) {
      group.current.position.set(Math.sin(t) * radius, height + Math.sin(t * 1.5 + offset) * 3, centerZ + Math.cos(t) * radius * 0.42);
      group.current.rotation.y = t + Math.PI / 2;
    }
    if (left.current && right.current) {
      left.current.rotation.z = Math.sin(clock.elapsedTime * 5 + offset) * 0.45;
      right.current.rotation.z = -left.current.rotation.z;
    }
  });
  return <group ref={group} scale={scale}>
    <mesh scale={[0.32, 0.35, 0.8]}><sphereGeometry args={[1, 8, 6]} /><meshLambertMaterial color={bodyColor} flatShading /></mesh>
    <mesh position={[0, 0.25, 0.6]}><sphereGeometry args={[0.32, 8, 6]} /><meshLambertMaterial color={bodyColor} /></mesh>
    <mesh position={[0, 0.22, 1]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.22, 0.95, 5]} /><meshLambertMaterial color={beakColor} /></mesh>
    <mesh position={[0, 0.03, 0.78]} scale={[0.2, 0.25, 0.14]}><sphereGeometry args={[1, 8, 6]} /><meshLambertMaterial color={MIST} /></mesh>
    <mesh ref={left} position={[-0.85, 0.1, 0]} scale={[1.8, 0.1, 0.55]}><boxGeometry /><meshLambertMaterial color={wingColor} /></mesh>
    <mesh ref={right} position={[0.85, 0.1, 0]} scale={[1.8, 0.1, 0.55]}><boxGeometry /><meshLambertMaterial color={wingColor} /></mesh>
  </group>;
}

export default memo(function JungleWorld({ low }: { low: boolean }) {
  const sites = useMemo(() => buildJungleVillage(), []);
  const ground = useMemo(jungleGroundTexture, []);
  useEffect(() => () => ground.dispose(), [ground]);
  // Batch only this selected map's small, actually visible SVG textures. This
  // avoids serial suspense requests without loading either car or the other map.
  const textures = useTexture(sceneArtwork);
  useEffect(() => {
    textures.forEach((texture) => {
      if (texture.colorSpace !== THREE.SRGBColorSpace) { texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; }
    });
  }, [textures]);
  return <>
    <RigidBody type="fixed" colliders={false} name="jungle-ground">
      <CuboidCollider position={[0, -1, -236]} args={[480, 1, 212]} friction={0.9} restitution={0} />
      <CuboidCollider position={[0, -1, 236]} args={[480, 1, 212]} friction={0.9} restitution={0} />
      <CuboidCollider position={[0, -6, 0]} args={[480, 1, 480]} restitution={0} />
    </RigidBody>
    {[-1, 1].map((side) => <mesh key={side} position={[0, -0.045, side * 236]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[960, 424]} /><meshLambertMaterial map={ground} color={side > 0 ? '#dce8cc' : '#c8d8b8'} /></mesh>)}
    <JungleCanopyBackdrop low={low} />
    <JungleVerge />
    <DenseJungle low={low} /><JungleVillage sites={sites} /><JungleRiver low={low} />
    <JungleMist low={low} /><JungleLightShafts low={low} /><JunglePollen low={low} />
    <TrackSurface /><CheckpointGates /><JumpRamp /><StopStation low={low} />
    {wildlife.map((animal) => <JungleBillboard key={animal.name} {...animal} />)}
    <WildlifeShadows />
    <JungleBillboard name="finish-flag" progress={0.99} side={1} width={5.5} height={5.5} lift={0.8} />
    <JungleBillboard name="lap-badge" progress={0.027} side={-1} width={4.7} height={4.7} lift={0.8} />
    <FlyingToucans />
    {!low && <FlyingToucans offset={2.4} radius={118} height={27} speed={0.075} centerZ={-55} bodyColor="#2f6d7a" beakColor="#e98254" wingColor="#1f4b55" scale={0.85} />}
  </>;
});
