import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, useTexture } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { CHECKPOINTS, ROAD_WIDTH, TRACK_CLOSED, TRACK_POINTS, nearestTrackPoint, ribbonGeometry, seededRandom, trackFrame } from './track';
import { BOOST_JUMP, JUMP_STRIPES, jumpRampGeometry } from './trackFeatures';
import { art } from './config';
import { useGame } from './store';
import { BRIDGE_DECK_SEGMENTS, BRIDGE_SUPPORTS, TRACK_BARRIERS } from './trackBarriers';
import { currentMap } from './maps';
import { surfaceTexture, worldSurfaceUV } from './surfaceDetail';
import AlpineTown from './AlpineTown';
import { buildAlpineTown, isTownLot, type TownSite } from './alpineVillage';

const INK = '#30483d';
export function Instances({ points, kind, color, colors }: { points: { position: [number, number, number]; scale: [number, number, number]; rotation?: number }[]; kind: 'cone' | 'box' | 'rock' | 'sphere'; color: string; colors?: string[] }) {
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
  return <instancedMesh ref={ref} args={[undefined, undefined, points.length]} castShadow={kind === 'cone'} receiveShadow>
    {kind === 'cone' ? <coneGeometry args={[1, 1, 9]} /> : kind === 'rock' ? <icosahedronGeometry args={[1, 1]} /> : kind === 'sphere' ? <sphereGeometry args={[1, 10, 7]} /> : <boxGeometry args={[1, 1, 1]} />}
    <meshLambertMaterial color={colors ? '#ffffff' : color} flatShading />
  </instancedMesh>;
}

const Forest = memo(({ low, sites }: { low: boolean; sites: TownSite[] }) => {
  const trees = useMemo(() => {
    const random = seededRandom(3219); const result = [];
    for (let i = 0; i < (low ? 380 : 850); i++) {
      const x = (random() - 0.5) * 900; const z = (random() - 0.5) * 800;
      const size = 0.8 + random() * 1.3;
      if (Math.abs(z) < 33 || nearestTrackPoint(x, z).distance < 19 || isTownLot(x, z, sites)) continue;
      result.push({ x, z, size });
    }
    return result;
  }, [low, sites]);
  const trunks = useMemo(() => trees.map(({ x, z, size }) => ({ position: [x, size * 2, z] as [number, number, number], scale: [size * 0.7, size * 4, size * 0.7] as [number, number, number] })), [trees]);
  const tops = useMemo(() => trees.flatMap(({ x, z, size }) => [0, 1, 2].map((level) => ({ position: [x, size * (3.5 + level * 1.7), z] as [number, number, number], scale: [size * (3.1 - level * 0.65), size * 4.4, size * (3.1 - level * 0.65)] as [number, number, number] }))), [trees]);
  return <><Instances points={trunks} kind="box" color="#6e5138" /><Instances points={tops} kind="cone" color="#31563d" colors={['#47735b', '#5f8663', '#708f66', '#819e6c']} /></>;
});

const Mountains = memo(() => {
  const mountains = useMemo(() => {
    const random = seededRandom(892);
    return Array.from({ length: 24 }, (_, index) => {
      const angle = index / 24 * Math.PI * 2; const radius = 490 + random() * 55; const height = 55 + random() * 80;
      return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, height, width: 45 + random() * 38 };
    });
  }, []);
  const bodies = useMemo(() => mountains.map((m) => ({ position: [m.x, m.height / 2 - 9, m.z] as [number, number, number], scale: [m.width, m.height, m.width] as [number, number, number] })), [mountains]);
  const peaks = useMemo(() => mountains.map((m) => ({ position: [m.x, m.height * 0.86 - 9, m.z] as [number, number, number], scale: [m.width * 0.29, m.height * 0.29, m.width * 0.29] as [number, number, number] })), [mountains]);
  return <><Instances points={bodies} kind="cone" color="#5b7d7c" colors={['#78929b', '#8da3a6', '#9caeaa']} /><Instances points={peaks} kind="cone" color="#eee9dc" /></>;
});

function River() {
  const lines = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (lines.current) lines.current.position.x = (clock.elapsedTime * 2) % 18; });
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.05, 0]} receiveShadow><planeGeometry args={[1000, 47]} /><meshStandardMaterial color="#49a6b4" roughness={0.27} metalness={0.25} envMapIntensity={0.55} /></mesh>
    <group ref={lines}>
      {Array.from({ length: 45 }, (_, i) => <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[(i % 15) * 28 - 215, -1.025, Math.floor(i / 15) * 12 - 12]}><planeGeometry args={[7 + (i % 3) * 3, 0.25]} /><meshBasicMaterial color="#b7dfd3" transparent opacity={0.6} /></mesh>)}
    </group>
  </group>;
}

function Eagle({ offset = 0 }: { offset?: number }) {
  const group = useRef<THREE.Group>(null); const left = useRef<THREE.Group>(null); const right = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.09 + offset;
    if (group.current) { group.current.position.set(Math.sin(t) * 95, 27 + Math.sin(t * 2) * 5, Math.cos(t) * 80); group.current.rotation.y = t + Math.PI / 2; }
    if (left.current && right.current) { left.current.rotation.z = Math.sin(clock.elapsedTime * 2.2 + offset) * 0.2; right.current.rotation.z = -left.current.rotation.z; }
  });
  return <group ref={group} scale={1.7}>
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

export function CheckpointGates() {
  const checkpoint = useGame((state) => state.telemetry.checkpoint);
  const { theme, id } = currentMap;
  const gateColor = (index: number, active: boolean) => id === 'snow' ? (active ? theme.accent : index === CHECKPOINTS.length - 1 ? '#d47762' : '#7aa7bf') : index === 0 ? (id === 'jungle' ? '#d97d73' : '#f7d674') : active ? theme.accent : (id === 'jungle' ? '#86b960' : '#b8c7a0');
  const gateWidth = ROAD_WIDTH + 2.2;
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
      const dx = Math.max(0, Math.abs(cameraLocal.x) - (gateWidth + 0.5) / 2);
      const dy = Math.max(0, Math.abs(cameraLocal.y) - 0.375);
      const dz = Math.max(0, -0.35 - cameraLocal.z, cameraLocal.z - 0.37);
      overhead.visible = dx * dx + dy * dy + dz * dz > 16;
    }
  });
  return <group>{CHECKPOINTS.map(({ point, yaw }, index) => {
    const active = index === (TRACK_CLOSED ? (checkpoint + 1) % CHECKPOINTS.length : Math.min(CHECKPOINTS.length - 1, checkpoint + 1));
    const finish = TRACK_CLOSED ? index === 0 : index === CHECKPOINTS.length - 1;
    return <group key={index} position={point} rotation={[0, yaw, 0]}>
      {[-gateWidth / 2, gateWidth / 2].map((x) => <group key={x} position={[x, 0, 0]}>
        <mesh position={[0, 2.7, 0]} castShadow><boxGeometry args={[0.55, 5.4, 0.7]} /><meshLambertMaterial color={gateColor(index, active)} /></mesh>
        {[1.4, 3.6].map((y) => <mesh key={y} position={[0, y, 0.02]}><boxGeometry args={[0.58, 0.65, 0.73]} /><meshLambertMaterial color="#fff7e8" /></mesh>)}
      </group>)}
      <group ref={(group) => { overheads.current[index] = group; }} position={[0, 5.4, 0]}>
        <mesh castShadow><boxGeometry args={[gateWidth + 0.5, 0.75, 0.7]} /><meshLambertMaterial color={gateColor(index, active)} /></mesh>
        {finish && Array.from({ length: 16 }, (_, i) => <mesh key={i} position={[(i - 7.5) * gateWidth / 16, 0.02, 0.37]}><planeGeometry args={[gateWidth / 16 - 0.03, 0.55]} /><meshBasicMaterial color={i % 2 ? theme.paper : theme.ink} side={THREE.DoubleSide} /></mesh>)}
      </group>
    </group>;
  })}</group>;
}

export const TrackSurface = memo(() => {
  const { theme, id } = currentMap;
  const jungle = id === 'jungle', snow = id === 'snow';
  const gl = useThree((state) => state.gl);
  const asphalt = useMemo(() => surfaceTexture('asphalt', gl.capabilities.getMaxAnisotropy()), [gl]);
  const road = useMemo(() => worldSurfaceUV(ribbonGeometry(ROAD_WIDTH), 5), []);
  const shoulder = useMemo(() => ribbonGeometry(ROAD_WIDTH + 3, 0, -0.09), []);
  const leftLine = useMemo(() => ribbonGeometry(0.24, -ROAD_WIDTH / 2 + 0.4, 0.035), []);
  const rightLine = useMemo(() => ribbonGeometry(0.24, ROAD_WIDTH / 2 - 0.4, 0.035), []);
  const marks = useMemo(() => TRACK_POINTS.filter((_, i) => i % 4 === 0).map(({ point, yaw }) => ({ position: [point.x, point.y + 0.025, point.z] as [number, number, number], scale: [0.24, 0.025, 2.8] as [number, number, number], rotation: yaw })), []);
  const kerbs = useMemo(() => [-1, 1].map((side) => {
    const indexed = ribbonGeometry(0.52, side * (ROAD_WIDTH / 2 - 0.15), 0.04);
    const geometry = indexed.toNonIndexed(); indexed.dispose();
    const positions = geometry.attributes.position, colors = new Float32Array(positions.count * 3);
    const accent = new THREE.Color(currentMap.theme.accent), pale = new THREE.Color('#cbd4ce');
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
  useEffect(() => () => asphalt.dispose(), [asphalt]);
  useEffect(() => () => { road.dispose(); shoulder.dispose(); leftLine.dispose(); rightLine.dispose(); kerbs.forEach((geometry) => geometry.dispose()); }, [road, shoulder, leftLine, rightLine, kerbs]);
  return <>
    <mesh geometry={shoulder} receiveShadow><meshLambertMaterial color={snow ? '#b9cbd7' : jungle ? '#5e6842' : '#bdaf8e'} /></mesh>
    <RigidBody type="fixed" colliders="trimesh" friction={0.8}><mesh geometry={road} receiveShadow><meshStandardMaterial color={snow ? '#526779' : jungle ? '#323f3c' : '#48545e'} map={asphalt} bumpMap={asphalt} bumpScale={0.025} roughness={snow ? 0.62 : 0.91} metalness={0.02} envMapIntensity={0.16} side={THREE.DoubleSide} /></mesh></RigidBody>
    <mesh geometry={leftLine}><meshBasicMaterial color="#f7edcf" /></mesh><mesh geometry={rightLine}><meshBasicMaterial color="#f7edcf" /></mesh>
    {kerbs.map((geometry, index) => <mesh key={index} geometry={geometry} receiveShadow><meshLambertMaterial vertexColors /></mesh>)}
    <Instances points={marks} kind="box" color={snow ? '#e9f4f8' : jungle ? '#d6e8a7' : '#f4d477'} />
    <Instances points={bridgePlanks} kind="box" color={jungle ? '#8b9564' : '#b98e60'} />
    <Instances points={bridgeWalls} kind="box" color={jungle ? '#287451' : '#a67d53'} />
    <Instances points={bridgeCaps} kind="box" color={jungle ? '#d6e8a7' : '#f5e7c5'} />
    <Instances points={BRIDGE_SUPPORTS} kind="box" color={jungle ? '#456b51' : '#99724d'} />
    <Instances points={roadsideWalls} kind="box" color={theme.accent} colors={[theme.accent, theme.paper]} />
    <Instances points={roadsideStripes} kind="box" color={theme.paper} colors={[theme.paper, theme.accent]} />
    <RigidBody type="fixed" colliders={false} name="bridge-decks">
      {BRIDGE_DECK_SEGMENTS.map(({ id, position, yaw, halfExtents }) => <CuboidCollider key={id} position={position} rotation={[0, yaw, 0]} args={halfExtents} friction={0.8} restitution={0} />)}
    </RigidBody>
    <RigidBody type="fixed" colliders={false} name="barriers">
      {TRACK_BARRIERS.map(({ id, position, yaw, halfExtents }) => <CuboidCollider key={id} position={position} rotation={[0, yaw, 0]} args={halfExtents} friction={0.2} restitution={0} />)}
    </RigidBody>
    {Array.from({ length: 16 }, (_, index) => <mesh key={index} position={START_MARK(index)} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[ROAD_WIDTH / 16, 0.9]} /><meshBasicMaterial color={index % 2 ? theme.paper : theme.ink} /></mesh>)}
  </>;
});
function START_MARK(index: number): [number, number, number] { const frame = TRACK_CLOSED ? trackFrame(0) : CHECKPOINTS[CHECKPOINTS.length - 1]; const p = frame.point.clone().addScaledVector(frame.right, (index - 7.5) * ROAD_WIDTH / 16); return [p.x, p.y + 0.045, p.z]; }

export function JumpRamp() {
  const geometry = useMemo(jumpRampGeometry, []);
  return <group>
    <RigidBody type="fixed" colliders="trimesh"><mesh geometry={geometry} castShadow><meshLambertMaterial color={currentMap.theme.accent} side={THREE.DoubleSide} flatShading /></mesh></RigidBody>
    {JUMP_STRIPES.map(({ position, yaw, slope }, i) => <group key={i} position={position} rotation={[0, yaw, 0]}><mesh rotation={[-Math.PI / 2 - slope, 0, 0]}><planeGeometry args={[BOOST_JUMP.width - 0.5, 0.4]} /><meshBasicMaterial color={currentMap.id === 'jungle' ? currentMap.theme.ink : '#f7d674'} side={THREE.DoubleSide} /></mesh></group>)}
  </group>;
}

export default memo(function World({ low }: { low: boolean }) {
  const sites = useMemo(buildAlpineTown, []);
  const ground = useMemo(() => { const texture = surfaceTexture('ground'); texture.repeat.set(85, 38); return texture; }, []);
  useEffect(() => () => ground.dispose(), [ground]);
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
    {[-1, 1].map((side) => <mesh key={side} position={[0, -0.035, side * 236]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[960, 424]} /><meshLambertMaterial map={ground} color={side > 0 ? '#92a972' : '#849f70'} /></mesh>)}
    <Mountains /><Forest low={low} sites={sites} /><Instances points={rocks} kind="rock" color="#6d8176" colors={['#5b706b', '#839080', '#778578']} />
    <River /><TrackSurface /><CheckpointGates /><AlpineTown sites={sites} /><JumpRamp />
    <Goat position={[144, 0, 294]} rotation={-1} /><Goat position={[-162, 0, -278]} rotation={1.8} />
    <Eagle /><Eagle offset={2.5} />
    <CharacterSign name="wild-haired-driver" position={roadsidePosition(0.01, -12)} /><CharacterSign name="crying-driver" position={roadsidePosition(0.79, 12)} />
  </>;
});

function roadsidePosition(progress: number, offset: number): [number, number, number] {
  const frame = trackFrame(progress), p = frame.point.clone().addScaledVector(frame.right, offset);
  return [p.x, p.y, p.z];
}
