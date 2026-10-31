import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD_WIDTH, TRACK_LENGTH, TRACK_POINTS, ribbonGeometry } from './track';
import { buildTownParts, type TownPart, type TownSite } from './alpineVillage';

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

/** Sloped verges support the elevated road and join the original valley floor. */
function villageVergeGeometry() {
  const positions: number[] = [];
  for (let i = 0; i < TRACK_POINTS.length; i++) {
    const a = TRACK_POINTS[i], b = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
    if (Math.abs(a.point.z) < 35 || Math.abs(b.point.z) < 35) continue;
    for (const side of [-1, 1]) {
      const rows = [ROAD_WIDTH / 2 + 0.5, ROAD_WIDTH / 2 + 5, ROAD_WIDTH / 2 + 30];
      for (let row = 0; row < 2; row++) {
        const vertices = [a, b].flatMap((frame) => [row, row + 1].map((r) => {
          const p = frame.point.clone().addScaledVector(frame.right, side * rows[r]);
          return [p.x, r === 2 ? -0.04 : p.y - 0.15, p.z];
        }));
        for (const index of (side > 0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3])) positions.push(...vertices[index]);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
  return geometry;
}

export default memo(function AlpineTown({ sites }: { sites: TownSite[] }) {
  const parts = useMemo(() => buildTownParts(sites), [sites]);
  const verge = useMemo(villageVergeGeometry, []);
  const pavements = useMemo(() => {
    const strips = sites.map((site) => {
      const halfLength = (site.plotWidth + 6) / 2 / TRACK_LENGTH;
      return ribbonGeometry(3, site.side * (ROAD_WIDTH / 2 + 2.2), -0.01,
        Math.max(0, site.progress - halfLength), Math.min(1, site.progress + halfLength));
    });
    const merged = mergeGeometries(strips); strips.forEach((strip) => strip.dispose()); return merged;
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
  useEffect(() => () => { verge.dispose(); pavements?.dispose(); signs.forEach((texture) => texture.dispose()); }, [verge, pavements, signs]);
  return <group name="alpine-village">
    <mesh geometry={verge} receiveShadow><meshLambertMaterial color="#91aa71" side={THREE.DoubleSide} /></mesh>
    {pavements && <mesh geometry={pavements} receiveShadow><meshStandardMaterial color="#e4d9c5" roughness={0.94} /></mesh>}
    <TownBatch parts={parts.boxes} kind="box" /><TownBatch parts={parts.gables} kind="roof" /><TownBatch parts={parts.crowns} kind="tree" />
    {parts.signs.map((sign, i) => <mesh key={i} position={sign.position} rotation={[0, sign.yaw, 0]}>
      <planeGeometry args={[sign.width, sign.width * 144 / 1024]} /><meshStandardMaterial map={signs.get(sign.label)} roughness={0.9} />
    </mesh>)}
  </group>;
});
