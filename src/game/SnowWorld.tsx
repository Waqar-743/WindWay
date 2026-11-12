import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, useTexture } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { CHECKPOINTS, ROAD_WIDTH, START, TRACK_POINTS, nearestTrackPoint, ribbonGeometry, seededRandom, trackFrame } from './track';
import { SNOW_HURDLES, SNOW_ICE_ZONES } from './snowCourse';
import { CheckpointGates, Instances, TrackSurface } from './World';
import { useGame } from './store';
import { surfaceTexture, worldSurfaceUV } from './surfaceDetail';

const snowArt = (name: string) => `${import.meta.env.BASE_URL}snow-pack/${name}.svg`;
const signs = ['snowman', 'snowy-tree', 'arctic-fox', 'mountain-hut', 'summit-flag', 'ice-warning', 'slalom-gate'];
const texturesToLoad = signs.map(snowArt);
const terrainHeight = (x: number, z: number) => {
  const nearest = nearestTrackPoint(x, z);
  return Math.max(-3, nearest.point.y - 9 - Math.min(72, nearest.distance * 0.32) + Math.sin(x * 0.015) * Math.sin(z * 0.013) * Math.min(6, nearest.distance * 0.04));
};

function SnowTerrain({ low }: { low: boolean }) {
  const terrain = useMemo(() => {
    const g = new THREE.PlaneGeometry(2500, 3000, low ? 66 : 100, low ? 80 : 120);
    g.rotateX(-Math.PI / 2); g.translate(0, 0, -150);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)));
    g.computeVertexNormals(); return worldSurfaceUV(g, 16);
  }, [low]);
  const foundation = useMemo(() => {
    const positions: number[] = [], indices: number[] = [];
    TRACK_POINTS.forEach(({ point, right }, i) => {
      for (const side of [-1, 1]) {
        const p = point.clone().addScaledVector(right, side * (ROAD_WIDTH / 2 + 1.5));
        positions.push(p.x, p.y - 0.1, p.z, p.x, p.y - 12, p.z);
      }
      if (i < TRACK_POINTS.length - 1) { const v = i * 4; indices.push(v, v + 1, v + 4, v + 1, v + 5, v + 4, v + 2, v + 6, v + 3, v + 3, v + 6, v + 7); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
  }, []);
  const snow = useMemo(() => surfaceTexture('ground'), []);
  useEffect(() => () => snow.dispose(), [snow]);
  useEffect(() => () => { terrain.dispose(); }, [terrain]);
  useEffect(() => () => foundation.dispose(), [foundation]);
  return <><mesh geometry={terrain} receiveShadow><meshLambertMaterial map={snow} color="#bfd3e0" /></mesh><mesh geometry={foundation} receiveShadow><meshLambertMaterial color="#8da6b8" side={THREE.DoubleSide} flatShading /></mesh></>;
}

const SnowForest = memo(function SnowForest({ low }: { low: boolean }) {
  const trees = useMemo(() => {
    const random = seededRandom(171224); const result = [];
    for (let i = 0; i < (low ? 750 : 1500); i++) {
      const x = (random() - 0.5) * 1300, z = (random() - 0.5) * 2200 - 100;
      const nearest = nearestTrackPoint(x, z);
      if (nearest.distance < 17 || nearest.distance > 280) continue;
      result.push({ x, z, y: terrainHeight(x, z), size: 0.9 + random() * 1.4 });
    } return result;
  }, [low]);
  const trunks = useMemo(() => trees.map(({ x, z, y, size }) => ({ position: [x, y + 2 * size, z] as [number, number, number], scale: [0.65 * size, 4 * size, 0.65 * size] as [number, number, number] })), [trees]);
  const branches = useMemo(() => trees.flatMap(({ x, z, y, size }) => [0, 1, 2].map((level) => ({ position: [x, y + (3.7 + level * 1.8) * size, z] as [number, number, number], scale: [(3.5 - level * 0.7) * size, 4.8 * size, (3.5 - level * 0.7) * size] as [number, number, number] }))), [trees]);
  const caps = useMemo(() => branches.map(({ position, scale }) => ({ position: [position[0], position[1] + scale[1] * 0.13, position[2]] as [number, number, number], scale: [scale[0] * 0.9, scale[1] * 0.8, scale[2] * 0.9] as [number, number, number] })), [branches]);
  const peaks = useMemo(() => {
    const random = seededRandom(9876);
    return Array.from({ length: 22 }, (_, i) => {
      const x = (i % 2 ? -1 : 1) * (650 + random() * 250), z = -1300 + i / 22 * 2300, height = 160 + random() * 290;
      return { position: [x, 80 + height / 2, z] as [number, number, number], scale: [160 + random() * 120, height, 190] as [number, number, number], rotation: random() };
    });
  }, []);
  return <><Instances points={peaks} kind="cone" color="#84a2ba" colors={['#6f8ea6', '#94aec2', '#64839c']} /><Instances points={trunks} kind="box" color="#465660" /><Instances points={branches} kind="cone" color="#234559" /><Instances points={caps} kind="cone" color="#dcebf3" /></>;
});

function IceAndHurdles() {
  const ice = useMemo(() => SNOW_ICE_ZONES.map(([from, to]) => ribbonGeometry(ROAD_WIDTH - 0.8, 0, 0.035, from, to)), []);
  useEffect(() => () => ice.forEach((g) => g.dispose()), [ice]);
  return <>
    {ice.map((geometry, i) => <mesh key={i} geometry={geometry} receiveShadow><meshStandardMaterial color="#76b8d6" roughness={0.12} metalness={0.28} envMapIntensity={0.85} transparent opacity={0.82} depthWrite={false} /></mesh>)}
    <RigidBody type="fixed" colliders={false} name="barriers">
      {SNOW_HURDLES.map((hurdle) => <group key={hurdle.id}>
        <CuboidCollider position={hurdle.position} rotation={[0, hurdle.yaw, 0]} args={hurdle.halfExtents} friction={0} restitution={0} />
        <group position={hurdle.position} rotation={[0, hurdle.yaw, 0]}>
          <mesh castShadow receiveShadow><boxGeometry args={[2.7, 1.5, 3.2]} /><meshLambertMaterial color="#e5f0f6" /></mesh>
          <mesh position={[0, 0.78, 0]}><boxGeometry args={[2.85, 0.14, 3.35]} /><meshLambertMaterial color="#f9fcff" /></mesh>
          <mesh position={[0, 0, -1.62]}><boxGeometry args={[2.35, 0.38, 0.06]} /><meshLambertMaterial color="#d47762" /></mesh>
          <mesh position={[0, 0, 1.62]}><boxGeometry args={[2.35, 0.38, 0.06]} /><meshLambertMaterial color="#d47762" /></mesh>
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
  const geometry = useMemo(() => {
    const random = seededRandom(5411), data = new Float32Array((low ? 300 : 700) * 3);
    for (let i = 0; i < data.length; i += 3) { data[i] = (random() - 0.5) * 160; data[i + 1] = random() * 80; data[i + 2] = (random() - 0.5) * 160; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(data, 3)); return g;
  }, [low]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ camera }, delta) => {
    if (!cloud.current || !points.current || !effects) return;
    cloud.current.position.set(camera.position.x, camera.position.y - 15, camera.position.z);
    if (calm) return;
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) { const y = positions.getY(i) - Math.min(delta, 0.05) * 6; positions.setY(i, y < 0 ? y + 80 : y); }
    positions.needsUpdate = true;
  });
  if (!effects) return null;
  return <group ref={cloud}><points ref={points} geometry={geometry} frustumCulled={false}><pointsMaterial color="#ffffff" size={0.3} transparent opacity={0.7} depthWrite={false} /></points></group>;
}

export default memo(function SnowWorld({ low }: { low: boolean }) {
  const textures = useTexture(texturesToLoad);
  useEffect(() => { textures.forEach((texture) => { texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; }); }, [textures]);
  const summit = CHECKPOINTS[CHECKPOINTS.length - 1];
  return <>
    <RigidBody type="fixed" colliders={false}><CuboidCollider args={[1400, 5, 1600]} position={[0, -8, -150]} restitution={0} /></RigidBody>
    <SnowTerrain low={low} /><SnowForest low={low} /><TrackSurface /><IceAndHurdles /><CheckpointGates />
    <WinterSign name="snowman" progress={0.008} side={1} size={5.2} /><WinterSign name="mountain-hut" progress={0.005} side={-1} size={7} />
    <WinterSign name="arctic-fox" progress={0.32} side={1} /><WinterSign name="snowman" progress={0.58} side={-1} />
    <WinterSign name="slalom-gate" progress={0.067} side={-1} size={3.8} />
    <WinterSign name="summit-flag" progress={0.987} side={1} size={7} /><WinterSign name="snowy-tree" progress={0.80} side={1} size={6} />
    <mesh position={[summit.point.x, summit.point.y - 1.5, summit.point.z]} receiveShadow><cylinderGeometry args={[24, 32, 2.8, 16]} /><meshLambertMaterial color="#f3f8fb" /></mesh>
    <mesh position={[START.point.x, START.point.y - 2, START.point.z]}><cylinderGeometry args={[20, 28, 3.5, 12]} /><meshLambertMaterial color="#edf5f8" /></mesh>
    <FallingSnow low={low} />
  </>;
});
