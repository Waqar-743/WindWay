import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Instances } from './World';
import { TRACK_CLOSED, TRACK_LENGTH, TRACK_POINTS, roadHalfWidthAt, seededRandom, trackFrame } from './track';
import { TRACK_BARRIERS } from './trackBarriers';

/* ------------------------------------------------------------------ */
/* Shared roadside furniture for the jungle and snow worlds.           */
/* Everything repeats through instancing, stays outside the driving    */
/* line, and grounds itself against each map's terrain.                */
/* ------------------------------------------------------------------ */

export type TrackFrame = ReturnType<typeof trackFrame>;
export type RoadPoint = { position: [number, number, number]; scale: [number, number, number]; rotation?: number };
export type RestStopPalette = {
  wall: string; roof: string; trim: string; glow: string;
  deck: string; post: string; paper: string; accent: string;
};

function fillInstances(mesh: THREE.InstancedMesh, points: RoadPoint[], colors?: string[]) {
  const object = new THREE.Object3D();
  const tint = new THREE.Color();
  points.forEach((point, index) => {
    object.position.fromArray(point.position);
    object.scale.fromArray(point.scale);
    object.rotation.set(0, point.rotation ?? 0, 0);
    object.updateMatrix();
    mesh.setMatrixAt(index, object.matrix);
    if (colors) mesh.setColorAt(index, tint.set(colors[index % colors.length]));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/** Bright unlit boxes read as lanterns, lamps and reflectors, like the town glow batch. */
export function GlowInstances({ points, colors, color = '#ffd98a' }: { points: RoadPoint[]; colors?: string[]; color?: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => { if (ref.current && points.length) fillInstances(ref.current, points, colors); }, [points, colors]);
  if (!points.length) return null;
  return <instancedMesh ref={ref} args={[undefined, undefined, points.length]}>
    <boxGeometry args={[1, 1, 1]} />
    <meshBasicMaterial color={colors ? '#ffffff' : color} toneMapped={false} />
  </instancedMesh>;
}

/** Instanced planes sharing one texture, used for chevron boards. */
function TexturedBoards({ points, texture }: { points: RoadPoint[]; texture: THREE.Texture }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => { if (ref.current && points.length) fillInstances(ref.current, points); }, [points]);
  if (!points.length) return null;
  return <instancedMesh ref={ref} args={[undefined, undefined, points.length]}>
    <planeGeometry args={[1, 1]} />
    <meshBasicMaterial map={texture} toneMapped={false} />
  </instancedMesh>;
}

/* ------------------------------------------------------------------ */
/* Curve chevron boards                                                */
/* ------------------------------------------------------------------ */

function chevronTexture(direction: 1 | -1, accent: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#232e33'; context.fillRect(0, 0, 256, 128);
  context.strokeStyle = accent; context.lineWidth = 7; context.strokeRect(4, 4, 248, 120);
  context.fillStyle = '#f3f5ef';
  for (let i = 0; i < 3; i++) {
    const x = 58 + i * 62;
    context.beginPath();
    context.moveTo(x - 15 * direction, 26);
    context.lineTo(x + 15 * direction, 64);
    context.lineTo(x - 15 * direction, 102);
    context.lineTo(x + 2 * direction, 64);
    context.closePath(); context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Warning boards on the outside of real bends, facing oncoming drivers. */
export const CurveChevrons = memo(function CurveChevrons({
  accent, distance = 2.6, boardY = 1.75, groundY, blocked,
}: {
  accent: string;
  /** Offset beyond the painted road edge. */
  distance?: number;
  /** Board centre height above the grounded base. */
  boardY?: number;
  /** Height of the ground under each board; defaults to the road surface. */
  groundY?: (frame: TrackFrame, distance: number) => number;
  /** Return true to skip a spot, e.g. over a river crossing. */
  blocked?: (x: number, z: number) => boolean;
}) {
  const right = useMemo(() => chevronTexture(1, accent), [accent]);
  const left = useMemo(() => chevronTexture(-1, accent), [accent]);
  useEffect(() => () => { right.dispose(); left.dispose(); }, [right, left]);
  const { rightBoards, leftBoards, posts } = useMemo(() => {
    const rightBoards: RoadPoint[] = [], leftBoards: RoadPoint[] = [], posts: RoadPoint[] = [];
    const spacing = 48 / TRACK_LENGTH;
    const segmentLength = TRACK_LENGTH / TRACK_POINTS.length;
    const look = Math.max(2, Math.round(50 / segmentLength));
    const base = (frame: TrackFrame) => groundY ? groundY(frame, distance) : frame.point.y;
    let lastPlaced = -1;
    for (let i = 0; i < TRACK_POINTS.length; i += 3) {
      const frame = TRACK_POINTS[i];
      const ahead = TRACK_POINTS[TRACK_CLOSED ? (i + look) % TRACK_POINTS.length : Math.min(i + look, TRACK_POINTS.length - 1)];
      const dYaw = Math.atan2(Math.sin(ahead.yaw - frame.yaw), Math.cos(ahead.yaw - frame.yaw));
      if (Math.abs(dYaw) < 0.5) continue;
      const progress = i / TRACK_POINTS.length;
      if (lastPlaced >= 0 && Math.abs(progress - lastPlaced) < spacing) continue;
      const side = dYaw > 0 ? -1 : 1;
      const offset = roadHalfWidthAt(progress) + distance;
      const p = frame.point.clone().addScaledVector(frame.right, side * offset);
      if (blocked && blocked(p.x, p.z)) continue;
      lastPlaced = progress;
      const y = base(frame);
      (dYaw > 0 ? leftBoards : rightBoards).push({
        position: [p.x, y + boardY, p.z], scale: [2.7, 1.35, 1], rotation: frame.yaw + Math.PI,
      });
      for (const along of [-0.9, 0.9]) {
        const q = p.clone().addScaledVector(frame.right, along);
        posts.push({ position: [q.x, y + (boardY - 0.6) / 2, q.z], scale: [0.14, boardY - 0.6, 0.14], rotation: frame.yaw });
      }
    }
    return { rightBoards, leftBoards, posts };
  }, [accent, distance, boardY, groundY, blocked]);
  return <>
    <TexturedBoards points={rightBoards} texture={right} />
    <TexturedBoards points={leftBoards} texture={left} />
    <Instances points={posts} kind="box" color="#39474d" shadows={false} />
  </>;
});

/* ------------------------------------------------------------------ */
/* Sector / distance marker plates                                     */
/* ------------------------------------------------------------------ */

/** One atlas, one merged mesh: every marker plate costs a single draw call. */
export const ProgressMarkers = memo(function ProgressMarkers({
  labels, accent, distance = 2.0, groundY,
}: {
  labels: { small: string; big: string }[];
  accent: string;
  distance?: number;
  groundY?: (frame: TrackFrame, distance: number) => number;
}) {
  const { geometry, texture, posts } = useMemo(() => {
    const cells = Math.min(labels.length, 12);
    const canvas = document.createElement('canvas');
    canvas.width = 256 * cells; canvas.height = 256;
    const context = canvas.getContext('2d')!;
    for (let i = 0; i < cells; i++) {
      const x = i * 256;
      context.fillStyle = '#232e33'; context.fillRect(x, 0, 256, 256);
      context.fillStyle = accent; context.fillRect(x, 0, 12, 256);
      context.fillStyle = '#3c4a4f'; context.fillRect(x + 22, 22, 212, 212);
      context.fillStyle = '#9fb0a8'; context.font = '600 30px Arial'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(labels[i].small, x + 138, 74, 180);
      context.fillStyle = '#f3f5ef'; context.font = '700 84px Arial';
      context.fillText(labels[i].big, x + 138, 158, 180);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const plates: THREE.BufferGeometry[] = [];
    const posts: RoadPoint[] = [];
    for (let i = 0; i < cells; i++) {
      const progress = (i + 0.5) / cells;
      const frame = trackFrame(progress);
      const side = i % 2 ? 1 : -1;
      const offset = roadHalfWidthAt(progress) + distance;
      const p = frame.point.clone().addScaledVector(frame.right, side * offset);
      const y = groundY ? groundY(frame, distance) : frame.point.y;
      const plate = new THREE.PlaneGeometry(1.5, 0.75);
      const uv = plate.attributes.uv;
      for (let v = 0; v < uv.count; v++) uv.setXY(v, (i + uv.getX(v)) / cells, uv.getY(v));
      plate.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, y + 1.35, p.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, frame.yaw + Math.PI, 0)),
        new THREE.Vector3(1, 1, 1),
      ));
      plates.push(plate);
      posts.push({ position: [p.x, y + 0.45, p.z], scale: [0.12, 0.9, 0.12], rotation: frame.yaw });
    }
    const geometry = mergeGeometries(plates)!;
    plates.forEach((plate) => plate.dispose());
    return { geometry, texture, posts };
  }, [labels, accent, distance, groundY]);
  useEffect(() => () => { geometry.dispose(); texture.dispose(); }, [geometry, texture]);
  return <group>
    <mesh geometry={geometry}><meshBasicMaterial map={texture} toneMapped={false} /></mesh>
    <Instances points={posts} kind="box" color="#39474d" shadows={false} />
  </group>;
});

/* ------------------------------------------------------------------ */
/* Guardrail dress-up                                                  */
/* ------------------------------------------------------------------ */

/** Posts, reflectors and (on snow) lying snow make the physical rails look built. */
export const RailDressUp = memo(function RailDressUp({ snow, accent, low }: { snow: boolean; accent: string; low: boolean }) {
  const { posts, caps, reflectors } = useMemo(() => {
    const posts: RoadPoint[] = [], caps: RoadPoint[] = [], reflectors: RoadPoint[] = [];
    TRACK_BARRIERS.forEach((rail, index) => {
      if (rail.kind !== 'roadside') return;
      const postStride = low ? 2 : 1, reflectorStride = low ? 3 : 1;
      const [x, y, z] = rail.position;
      if (index % postStride === 0) posts.push({ position: [x, y - 0.5, z], scale: [0.16, 1.1, 0.16], rotation: rail.yaw });
      if (snow && index % postStride === 0) caps.push({
        position: [x, y + rail.halfExtents[1] + 0.09, z],
        scale: [rail.halfExtents[0] * 2 + 0.18, 0.16, rail.halfExtents[2] * 2 + 0.1],
        rotation: rail.yaw,
      });
      if (index % reflectorStride === 0) {
        const face = rail.halfExtents[0] + 0.045;
        reflectors.push({
          position: [x - rail.side * Math.cos(rail.yaw) * face, y + 0.25, z + rail.side * Math.sin(rail.yaw) * face],
          scale: [0.05, 0.14, 0.26], rotation: rail.yaw,
        });
      }
    });
    return { posts, caps, reflectors };
  }, [snow, low]);
  return <>
    <Instances points={posts} kind="box" color="#39474d" shadows={false} />
    {snow && <Instances points={caps} kind="box" color="#f3f8fb" colors={['#f3f8fb', '#e8f1f7']} shadows={false} />}
    <GlowInstances points={reflectors} colors={[accent, '#ffd98a']} />
  </>;
});

/* ------------------------------------------------------------------ */
/* Snowbanks                                                           */
/* ------------------------------------------------------------------ */

/** A plowed ridge of overlapping white blobs just beyond the rails. */
export const Snowbanks = memo(function Snowbanks({ low }: { low: boolean }) {
  const banks = useMemo(() => {
    const random = seededRandom(4242);
    const result: RoadPoint[] = [];
    const stride = low ? 6 : 3;
    const segmentLength = TRACK_LENGTH / TRACK_POINTS.length;
    for (let i = 0; i < TRACK_POINTS.length; i += stride) {
      const frame = TRACK_POINTS[i];
      for (const side of [-1, 1]) {
        if (random() < 0.25) continue;
        const offset = roadHalfWidthAt(i / TRACK_POINTS.length) + 0.55 + random() * 0.7;
        const p = frame.point.clone().addScaledVector(frame.right, side * offset);
        const height = 0.7 + random() * 0.9;
        result.push({
          position: [p.x, frame.point.y - 0.1 + height * 0.5, p.z],
          scale: [2.6 + random() * 3.2, height, stride * segmentLength * 0.92],
          rotation: frame.yaw,
        });
      }
    }
    return result;
  }, [low]);
  return <Instances points={banks} kind="rock" color="#eef4f8" colors={['#e8f1f7', '#f3f8fb', '#dfe9f1']} shadows={false} />;
});

/* ------------------------------------------------------------------ */
/* Rest stop / mountain lodge                                          */
/* ------------------------------------------------------------------ */

/** A small timber landmark with warm windows, a bench, lantern and notice board.
 *  `deckTop` is the absolute height of the platform so the hut never sinks. */
export function RestStop({ position, yaw, side, low, palette, kind = 'shelter', deckTop }: {
  position: [number, number, number];
  yaw: number;
  side: -1 | 1;
  low: boolean;
  palette: RestStopPalette;
  kind?: 'shelter' | 'lodge';
  deckTop: number;
}) {
  const s = side;
  const floor = Math.max(0.3, deckTop - position[1]);
  const wallFace = -s * Math.PI / 2;
  return <group position={position} rotation={[0, yaw, 0]}>
    <mesh position={[0, (floor - 0.25) / 2, 0]} receiveShadow>
      <boxGeometry args={[10, floor + 0.25, 7]} />
      <meshLambertMaterial color={palette.deck} />
    </mesh>
    <mesh position={[s * 2.6, floor + 1.6, 0]} castShadow receiveShadow>
      <boxGeometry args={[4.4, 3.2, 3.8]} />
      <meshLambertMaterial color={palette.wall} />
    </mesh>
    <mesh position={[s * 2.6, floor + 3.34, 0]} rotation={[0, 0, -s * 0.07]} castShadow>
      <boxGeometry args={[5.2, 0.34, 4.6]} />
      <meshLambertMaterial color={palette.roof} />
    </mesh>
    {kind === 'lodge' && <>
      <mesh position={[s * 3.4, floor + 3.9, -0.9]} castShadow><boxGeometry args={[0.55, 1.0, 0.55]} /><meshLambertMaterial color={palette.trim} /></mesh>
      <mesh position={[s * 3.4, floor + 4.48, -0.9]}><boxGeometry args={[0.75, 0.16, 0.75]} /><meshLambertMaterial color={palette.post} /></mesh>
      {[0.11, 0.33, 0.55].map((y, i) => <mesh key={y} position={[s * 0.6, floor + y, 1.9]} rotation={[0, 0.15 + i * 0.1, 0]} castShadow>
        <boxGeometry args={[0.95, 0.21, 0.23]} /><meshLambertMaterial color={i % 2 ? '#8a6a45' : '#7a5c3f'} />
      </mesh>)}
    </>}
    <mesh position={[s * 0.42, floor + 0.875, 0]} rotation={[0, wallFace, 0]}>
      <planeGeometry args={[0.95, 1.75]} /><meshLambertMaterial color={palette.trim} />
    </mesh>
    {[-1.15, 1.15].map((z) => <mesh key={z} position={[s * 0.42, floor + 1.8, z]} rotation={[0, wallFace, 0]}>
      <planeGeometry args={[0.85, 0.7]} /><meshBasicMaterial color={palette.glow} toneMapped={false} />
    </mesh>)}
    <group position={[-s * 1.8, floor, 2.3]} rotation={[0, -s * Math.PI / 2, 0]}>
      <mesh position={[0, 0.55, 0]} castShadow><boxGeometry args={[1.7, 0.12, 0.55]} /><meshLambertMaterial color="#a57f52" /></mesh>
      <mesh position={[0, 0.29, 0]}><boxGeometry args={[1.45, 0.55, 0.45]} /><meshLambertMaterial color={palette.post} /></mesh>
      <mesh position={[0, 1.02, -0.3]} castShadow><boxGeometry args={[1.7, 0.55, 0.1]} /><meshLambertMaterial color="#8a6a45" /></mesh>
    </group>
    <group position={[-s * 3.6, floor, -2.4]}>
      <mesh position={[0, 1.175, 0]} castShadow><boxGeometry args={[0.1, 2.35, 0.1]} /><meshLambertMaterial color={palette.post} /></mesh>
      <mesh position={[0, 2.5, 0]}><boxGeometry args={[0.26, 0.32, 0.26]} /><meshBasicMaterial color={palette.glow} toneMapped={false} /></mesh>
      <mesh position={[0, 2.72, 0]}><coneGeometry args={[0.34, 0.2, 4]} /><meshLambertMaterial color={palette.trim} flatShading /></mesh>
    </group>
    <group position={[-s * 3.9, floor, 1.6]} rotation={[0, -s * Math.PI / 2, 0]}>
      <mesh position={[0, 0.75, 0]} castShadow><boxGeometry args={[0.09, 1.5, 0.09]} /><meshLambertMaterial color={palette.post} /></mesh>
      <mesh position={[0, 1.72, 0]} castShadow><boxGeometry args={[1.05, 0.66, 0.07]} /><meshLambertMaterial color={palette.paper} /></mesh>
      <mesh position={[0, 2.12, 0]}><boxGeometry args={[1.05, 0.13, 0.08]} /><meshLambertMaterial color={palette.accent} /></mesh>
    </group>
    <mesh position={[s * 0.4, floor + 0.36, 2.5]} rotation={[0, 0.4, 0]} castShadow><boxGeometry args={[0.8, 0.72, 0.8]} /><meshLambertMaterial color="#a8804e" /></mesh>
    <mesh position={[s * 1.3, floor + 0.28, -2.6]} rotation={[0, -0.2, 0]} castShadow><boxGeometry args={[0.65, 0.56, 0.65]} /><meshLambertMaterial color="#a8804e" /></mesh>
    {!low && <pointLight position={[-s * 3.6, floor + 2.6, -2.4]} color="#ffcf7a" intensity={1.0} distance={16} decay={2} />}
  </group>;
}
