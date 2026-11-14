import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD_WIDTH, TRACK_LENGTH, TRACK_POINTS, ribbonGeometry, seededRandom } from './track';
import { worldSurfaceUV } from './surfaceDetail';
import { buildTownParts, townPosition, type TownPart, type TownSite, type TownPosition } from './alpineVillage';

export function TownBatch({ parts, kind }: { parts: TownPart[]; kind: 'box' | 'roof' | 'tree' }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    if (kind === 'box') return new THREE.BoxGeometry(1, 1, 1);
    if (kind === 'tree') return new THREE.IcosahedronGeometry(1, 1);
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0); shape.lineTo(0.5, 0); shape.lineTo(0, 1); shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  }, [kind]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const object = new THREE.Object3D(), color = new THREE.Color();
    parts.forEach((part, i) => {
      object.position.fromArray(part.position); object.scale.fromArray(part.scale);
      object.rotation.set(0, part.rotation, 0); object.updateMatrix();
      mesh.current!.setMatrixAt(i, object.matrix); mesh.current!.setColorAt(i, color.set(part.color));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [parts]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!parts.length) return null;
  return <instancedMesh ref={mesh} args={[geometry, undefined, parts.length]} castShadow receiveShadow>
    <meshStandardMaterial roughness={0.86} metalness={0.02} flatShading />
  </instancedMesh>;
}

/** Bright, unlit details read as warm windows, lamps, pump screens and signals. */
function GlowBatch({ parts }: { parts: TownPart[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const object = new THREE.Object3D(), color = new THREE.Color();
    parts.forEach((part, i) => {
      object.position.fromArray(part.position); object.scale.fromArray(part.scale);
      object.rotation.set(0, part.rotation, 0); object.updateMatrix();
      mesh.current!.setMatrixAt(i, object.matrix); mesh.current!.setColorAt(i, color.set(part.color));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [parts]);
  if (!parts.length) return null;
  return <instancedMesh ref={mesh} args={[undefined, undefined, parts.length]}>
    <boxGeometry args={[1, 1, 1]} />
    <meshBasicMaterial toneMapped={false} />
  </instancedMesh>;
}

function UmbrellaBatch({ parts }: { parts: TownPart[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const object = new THREE.Object3D(), color = new THREE.Color();
    parts.forEach((part, i) => {
      object.position.fromArray(part.position); object.scale.fromArray(part.scale);
      object.rotation.set(0, part.rotation, 0); object.updateMatrix();
      mesh.current!.setMatrixAt(i, object.matrix); mesh.current!.setColorAt(i, color.set(part.color));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [parts]);
  if (!parts.length) return null;
  return <instancedMesh ref={mesh} args={[undefined, undefined, parts.length]} castShadow>
    <coneGeometry args={[1, 1, 8]} />
    <meshLambertMaterial flatShading />
  </instancedMesh>;
}

function cobbleTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#b8ad9a';
  context.fillRect(0, 0, size, size);
  const random = seededRandom(3311);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = col * 32 + (row % 2) * 16 + random() * 3;
      const y = row * 32 + random() * 3;
      const w = 25 + random() * 5, h = 25 + random() * 5;
      context.fillStyle = ['#cfc5b2', '#c4b9a6', '#d8cebb', '#b9ae9b'][Math.floor(random() * 4)];
      context.fillRect(x, y, w, h);
      context.strokeStyle = 'rgba(90,80,66,0.28)';
      context.lineWidth = 1.5;
      context.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function smokeTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(242,240,234,0.8)');
  gradient.addColorStop(0.5, 'rgba(226,224,218,0.28)');
  gradient.addColorStop(1, 'rgba(220,218,212,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Chimney puffs rise and reset; one point per chimney on the low tier. */
function ChimneySmoke({ points, low }: { points: TownPosition[]; low: boolean }) {
  const texture = useMemo(smokeTexture, []);
  const perChimney = low ? 1 : 3;
  const count = points.length * perChimney;
  const { geometry, base, phase } = useMemo(() => {
    const random = seededRandom(4412);
    const base = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    let index = 0;
    for (const point of points) {
      for (let i = 0; i < perChimney; i++) {
        base[index * 3] = point[0] + (random() - 0.5) * 0.5;
        base[index * 3 + 1] = point[1] + random() * 1.4;
        base[index * 3 + 2] = point[2] + (random() - 0.5) * 0.5;
        phase[index] = random() * Math.PI * 2;
        index++;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(base), 3));
    return { geometry, base, phase };
  }, [count, perChimney, points]);
  const ref = useRef<THREE.Points>(null);
  useEffect(() => () => { geometry.dispose(); texture.dispose(); }, [geometry, texture]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const attribute = ref.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const p = phase[i], rise = (t * 0.55 + p) % 6;
      array[i * 3] = base[i * 3] + Math.sin(t * 0.4 + p) * 0.5 + rise * 0.22;
      array[i * 3 + 1] = base[i * 3 + 1] + rise;
      array[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.35 + p) * 0.5;
    }
    attribute.needsUpdate = true;
  });
  if (!points.length) return null;
  return <points ref={ref} geometry={geometry}>
    <pointsMaterial map={texture} color="#e8e4dc" size={1.5} sizeAttenuation transparent opacity={0.28} depthWrite={false} />
  </points>;
}

/** Sloped verges support the elevated road and join the original valley floor. */
function villageVergeGeometry() {
  const positions: number[] = [], colors: number[] = [];
  const inner = new THREE.Color('#7f9e5f'), outer = new THREE.Color('#5f7d4a');
  for (let i = 0; i < TRACK_POINTS.length; i++) {
    const a = TRACK_POINTS[i], b = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
    if (Math.abs(a.point.z) < 35 || Math.abs(b.point.z) < 35) continue;
    for (const side of [-1, 1]) {
      const rows = [ROAD_WIDTH / 2 + 0.5, ROAD_WIDTH / 2 + 5, ROAD_WIDTH / 2 + 30];
      for (let row = 0; row < 2; row++) {
        const vertices = [a, b].flatMap((frame) => [row, row + 1].map((r) => {
          const p = frame.point.clone().addScaledVector(frame.right, side * rows[r]);
          return { point: [p.x, r === 2 ? -0.04 : p.y - 0.15, p.z] as [number, number, number], color: r === 2 ? outer : inner };
        }));
        for (const index of (side > 0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3])) {
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
}

export default memo(function AlpineTown({ sites, low = false }: { sites: TownSite[]; low?: boolean }) {
  const parts = useMemo(() => buildTownParts(sites), [sites]);
  const verge = useMemo(villageVergeGeometry, []);
  const pavementTexture = useMemo(cobbleTexture, []);
  const pavements = useMemo(() => {
    const strips = sites.map((site) => {
      const halfLength = (site.plotWidth + 6) / 2 / TRACK_LENGTH;
      return ribbonGeometry(3, site.side * (ROAD_WIDTH / 2 + 2.2), -0.01,
        Math.max(0, site.progress - halfLength), Math.min(1, site.progress + halfLength));
    });
    const merged = mergeGeometries(strips); strips.forEach((strip) => strip.dispose());
    return merged ? worldSurfaceUV(merged, 2.6) : merged;
  }, [sites]);
  const signs = useMemo(() => {
    const textures = new Map<string, THREE.CanvasTexture>();
    for (const sign of parts.signs) {
      if (textures.has(sign.label)) continue;
      const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 144;
      const context = canvas.getContext('2d')!;
      context.fillStyle = sign.color; context.fillRect(0, 0, 1024, 144);
      context.strokeStyle = '#e7d9b7'; context.lineWidth = 5; context.strokeRect(12, 12, 1000, 120);
      context.font = 'bold 76px Arial, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillStyle = '#fff0d3'; context.fillText(sign.label, 512, 77, 950);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      textures.set(sign.label, texture);
    }
    return textures;
  }, [parts.signs]);
  const station = useMemo(() => sites.find((site) => site.kind === 'station'), [sites]);
  const cafe = useMemo(() => sites.find((site) => site.kind === 'shop'), [sites]);
  useEffect(() => () => { verge.dispose(); pavements?.dispose(); pavementTexture.dispose(); signs.forEach((texture) => texture.dispose()); }, [verge, pavements, pavementTexture, signs]);
  return <group name="alpine-village">
    <mesh geometry={verge} receiveShadow><meshLambertMaterial vertexColors side={THREE.DoubleSide} /></mesh>
    {pavements && <mesh geometry={pavements} receiveShadow><meshStandardMaterial map={pavementTexture} color="#e8dfcc" roughness={0.94} /></mesh>}
    <TownBatch parts={parts.boxes} kind="box" /><TownBatch parts={parts.gables} kind="roof" /><TownBatch parts={parts.crowns} kind="tree" />
    <GlowBatch parts={parts.glow} /><UmbrellaBatch parts={parts.umbrellas} />
    <ChimneySmoke points={parts.smoke} low={low} />
    {!low && station && <pointLight position={townPosition(station, 0, 4.2, station.depth / 2 + 2)} color="#ffcf7a" intensity={1.1} distance={22} decay={2} />}
    {!low && cafe && <pointLight position={townPosition(cafe, 0, 3.6, cafe.depth / 2 + 2.4)} color="#ffcf7a" intensity={0.9} distance={18} decay={2} />}
    {parts.signs.map((sign, i) => <mesh key={i} position={sign.position} rotation={[0, sign.yaw, 0]}>
      <planeGeometry args={[sign.width, sign.width * 144 / 1024]} /><meshStandardMaterial map={signs.get(sign.label)} roughness={0.9} />
    </mesh>)}
  </group>;
});
