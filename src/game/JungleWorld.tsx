import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, useTexture } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { nearestTrackPoint, seededRandom, trackFrame } from './track';
import { CheckpointGates, JumpRamp, TrackSurface } from './World';
import JungleVillage from './JungleVillage';
import { buildJungleVillage } from './jungleSettlement';
import { isTownLot, type TownSite } from './alpineVillage';

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

/** All repeated vegetation uses shared geometry and instancing, even in the dense preset. */
function VegetationInstances({ points, kind, color, colors, low = false }: {
  points: Point[];
  kind: 'trunk' | 'canopy' | 'leaf' | 'rock';
  color: string;
  colors?: string[];
  low?: boolean;
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
  return <instancedMesh ref={mesh} args={[leaf, undefined, points.length]} receiveShadow castShadow={kind === 'canopy' && !low}>
    {kind === 'trunk' && <cylinderGeometry args={[0.75, 1, 1, 6]} />}
    {kind === 'canopy' && <icosahedronGeometry args={[1, low ? 0 : 1]} />}
    {kind === 'rock' && <icosahedronGeometry args={[1, 0]} />}
    <meshLambertMaterial color={colors ? '#ffffff' : color} flatShading side={kind === 'leaf' ? THREE.DoubleSide : THREE.FrontSide} />
  </instancedMesh>;
}

const DenseJungle = memo(function DenseJungle({ low, sites }: { low: boolean; sites: TownSite[] }) {
  const foliage = useMemo(() => {
    const random = seededRandom(817420);
    const trunks: Point[] = [], crowns: Point[] = [], fronds: Point[] = [];
    const ferns: Point[] = [], vines: Point[] = [], rocks: Point[] = [];
    const station = stationFrame();
    const clearings = wildlife.map((animal) => wildlifePosition(animal.progress, animal.side, animal.width));
    const available = (x: number, z: number, margin: number) => Math.abs(z) > 29
      && nearestTrackPoint(x, z).distance > margin && !isTownLot(x, z, sites, 6)
      && Math.hypot(x - station.x, z - station.z) > 17
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
    for (let attempt = 0; attempt < (low ? 1450 : 2800); attempt++) {
      const x = (random() - 0.5) * 470, z = (random() - 0.5) * 430;
      if (!available(x, z, 10.7)) continue;
      const size = 0.65 + random() * 1.25;
      const angle = random() * Math.PI * 2;
      for (let i = 0; i < 4; i++) ferns.push({ position: [x, 0.17, z], scale: [size, size * 1.3, size], rotation: [-0.32, angle + i * Math.PI / 2, 0] });
      if (attempt % 13 === 0) rocks.push({ position: [x, size * 0.33, z], scale: [size * 1.4, size * 0.6, size], rotation: [0, angle, 0] });
    }
    return { trunks, crowns, fronds, ferns, vines, rocks };
  }, [low, sites]);
  return <>
    <VegetationInstances points={foliage.trunks} kind="trunk" color="#775e3d" low={low} />
    <VegetationInstances points={foliage.crowns} kind="canopy" color={LEAF} colors={['#1e6247', '#287451', '#3f8350', '#397747', '#5b9257']} low={low} />
    <VegetationInstances points={foliage.fronds} kind="leaf" color="#438b4e" low={low} />
    <VegetationInstances points={foliage.ferns} kind="leaf" color="#6b9c51" colors={['#487b42', '#86b960', '#5e9348']} low={low} />
    <VegetationInstances points={foliage.vines} kind="trunk" color="#567744" low={low} />
    <VegetationInstances points={foliage.rocks} kind="rock" color="#45674f" low={low} />
  </>;
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
  const position = useMemo(() => {
    const point = wildlifePosition(progress, side, width);
    return [point.x, lift + height / 2 + 0.1, point.z] as [number, number, number];
  }, [progress, side, width, height, lift]);
  return <Billboard position={position} follow lockX lockZ><mesh>
    <planeGeometry args={[width, height]} />
    <meshBasicMaterial map={texture} transparent alphaTest={0.08} side={THREE.DoubleSide} />
  </mesh></Billboard>;
}

function StopStation() {
  const frame = useMemo(stationFrame, []);
  const sign = useTexture(jungleArt('stop-station'));
  return <group position={[frame.x, 0, frame.z]} rotation={[0, frame.yaw + Math.PI / 2, 0]}>
    <RigidBody type="fixed" colliders={false} name="jungle-stop-station">
      <CuboidCollider args={[6.5, 3.3, 4.8]} position={[0, 3.3, 0]} restitution={0} />
    </RigidBody>
    <mesh position={[0, 0.05, 1.5]} receiveShadow><boxGeometry args={[18, 0.1, 16]} /><meshLambertMaterial color="#9d9970" /></mesh>
    <mesh position={[0, 3, 0]} receiveShadow castShadow><boxGeometry args={[13, 6, 9.6]} /><meshLambertMaterial color={MIST} /></mesh>
    <mesh position={[0, 6.45, 0]} castShadow><boxGeometry args={[15.5, 1, 12]} /><meshLambertMaterial color={JADE} /></mesh>
    <mesh position={[0, 6.95, 0]} castShadow><boxGeometry args={[8.5, 0.4, 7]} /><meshLambertMaterial color={LEAF} /></mesh>
    <mesh position={[0, 2.65, 4.84]}><planeGeometry args={[7.2, 5.3]} /><meshLambertMaterial color="#395e50" /></mesh>
    {Array.from({ length: 6 }, (_, index) => <mesh key={index} position={[0, 0.65 + index * 0.8, 4.9]}><boxGeometry args={[7.2, 0.08, 0.08]} /><meshLambertMaterial color="#6d8d67" /></mesh>)}
    <mesh position={[-5, 3.2, 4.86]}><planeGeometry args={[1.7, 2.1]} /><meshLambertMaterial color="#91bcb1" /></mesh>
    <mesh position={[5, 3.2, 4.87]}><planeGeometry args={[1.3, 2.1]} /><meshLambertMaterial color={GOLD} /></mesh>
    <mesh position={[0, 7.5, 6.1]}><planeGeometry args={[5.6, 5.6]} /><meshBasicMaterial map={sign} transparent alphaTest={0.08} side={THREE.DoubleSide} /></mesh>
    {[-1, 1].map((side) => <group key={side} position={[side * 8.1, 0, 5]}>
      <mesh position={[0, 1.5, 0]} castShadow><boxGeometry args={[1.4, 3, 1.1]} /><meshLambertMaterial color={side < 0 ? '#d97d73' : GOLD} /></mesh>
      <mesh position={[0, 2, 0.56]}><planeGeometry args={[1, 0.6]} /><meshBasicMaterial color={JADE} /></mesh>
      <mesh position={[0.4, 3.1, 0]} rotation={[0, 0, -0.3]}><boxGeometry args={[0.12, 0.8, 0.12]} /><meshLambertMaterial color={JADE} /></mesh>
    </group>)}
  </group>;
}

function JungleRiver({ low }: { low: boolean }) {
  const current = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (current.current) current.current.position.x = clock.elapsedTime * 1.4 % 24; });
  return <>
    <mesh position={[0, -1.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[1000, 47]} /><meshLambertMaterial color="#3e9290" /></mesh>
    <group ref={current}>{Array.from({ length: low ? 18 : 30 }, (_, index) => <mesh key={index} position={[(index % 10) * 45 - 240, -1.025, Math.floor(index / 10) * 13 - 13]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[9 + index % 4, 0.2]} /><meshBasicMaterial color="#a3c9b2" transparent opacity={0.45} />
    </mesh>)}</group>
    {[-1, 1].map((side) => <mesh key={side} position={[0, -0.1, side * 27]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[960, 6]} /><meshLambertMaterial color="#5f8250" /></mesh>)}
  </>;
}

function FlyingToucans() {
  const group = useRef<THREE.Group>(null);
  const left = useRef<THREE.Mesh>(null), right = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.12;
    if (group.current) {
      group.current.position.set(Math.sin(t) * 78, 19 + Math.sin(t * 1.5) * 3, 115 + Math.cos(t) * 32);
      group.current.rotation.y = t + Math.PI / 2;
    }
    if (left.current && right.current) {
      left.current.rotation.z = Math.sin(clock.elapsedTime * 5) * 0.45;
      right.current.rotation.z = -left.current.rotation.z;
    }
  });
  return <group ref={group}>
    <mesh scale={[0.32, 0.35, 0.8]}><sphereGeometry args={[1, 8, 6]} /><meshLambertMaterial color={JADE} flatShading /></mesh>
    <mesh position={[0, 0.25, 0.6]}><sphereGeometry args={[0.32, 8, 6]} /><meshLambertMaterial color={JADE} /></mesh>
    <mesh position={[0, 0.22, 1]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.22, 0.95, 5]} /><meshLambertMaterial color={GOLD} /></mesh>
    <mesh position={[0, 0.03, 0.78]} scale={[0.2, 0.25, 0.14]}><sphereGeometry args={[1, 8, 6]} /><meshLambertMaterial color={MIST} /></mesh>
    <mesh ref={left} position={[-0.85, 0.1, 0]} scale={[1.8, 0.1, 0.55]}><boxGeometry /><meshLambertMaterial color="#285343" /></mesh>
    <mesh ref={right} position={[0.85, 0.1, 0]} scale={[1.8, 0.1, 0.55]}><boxGeometry /><meshLambertMaterial color="#285343" /></mesh>
  </group>;
}

export default memo(function JungleWorld({ low }: { low: boolean }) {
  // Batch only this selected map's small, actually visible SVG textures. This
  // avoids serial suspense requests without loading either car or the other map.
  const sites = useMemo(buildJungleVillage, []);
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
    {[-1, 1].map((side) => <mesh key={side} position={[0, -0.035, side * 236]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[960, 424]} /><meshLambertMaterial color={side > 0 ? '#547a42' : '#436d3d'} /></mesh>)}
    <DenseJungle low={low} sites={sites} /><JungleVillage sites={sites} /><JungleRiver low={low} />
    <TrackSurface /><CheckpointGates /><JumpRamp /><StopStation />
    {wildlife.map((animal) => <JungleBillboard key={animal.name} {...animal} />)}
    <JungleBillboard name="finish-flag" progress={0.99} side={1} width={5.5} height={5.5} lift={0.8} />
    <JungleBillboard name="lap-badge" progress={0.027} side={-1} width={4.7} height={4.7} lift={0.8} />
    <FlyingToucans />
  </>;
});
