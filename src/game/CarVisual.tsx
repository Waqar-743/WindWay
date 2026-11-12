import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { carById } from './config';

export interface CarMotion { speed: number; steer: number; lean: number; bounce: number }
export default function CarVisual({ carId, paint, motion, onReady }: { carId: string; paint: string; motion?: MutableRefObject<CarMotion>; onReady?: () => void }) {
  const config = carById(carId);
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}${config.path}`, false, true);
  const invalidate = useThree((state) => state.invalidate);
  const spin = useRef(0);
  const prepared = useMemo(() => {
    const clone = scene.clone(true);
    const materials = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    const paints: THREE.MeshStandardMaterial[] = [];
    const wheels: { object: THREE.Object3D; base: THREE.Quaternion; front: boolean }[] = [];
    const box = new THREE.Box3().setFromObject(clone); const size = box.getSize(new THREE.Vector3());
    clone.scale.multiplyScalar(5.8 / Math.max(size.x, size.y, size.z));
    box.setFromObject(clone); const center = box.getCenter(new THREE.Vector3());
    clone.position.set(-center.x, -box.min.y, -center.z);
    clone.traverse((child) => {
      if (child.userData.part === 'wheel') wheels.push({ object: child, base: child.quaternion.clone(), front: ['lf', 'rf'].includes(child.userData.corner) });
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true; child.receiveShadow = true;
      const convert = (source: THREE.Material) => {
        if (!(source instanceof THREE.MeshStandardMaterial)) return source;
        if (!materials.has(source)) {
          const paintable = source.userData.paintable ?? (/paint|halo|mirror|tcam|number/i.test(source.name) && !/decal|alpha/i.test(source.name));
          // Keep the delivered livery, normal maps, carbon, glass and tyre detail.
          // Replacing these with toon materials made the actual game visibly
          // flatter than the car assets already included in the APK.
          const material = source.clone();
          material.envMapIntensity = paintable ? 1.18 : 0.82;
          if (paintable) {
            material.metalness = Math.max(0.38, Math.min(0.72, source.metalness));
            material.roughness = Math.max(0.16, Math.min(0.32, source.roughness));
            paints.push(material);
          } else if (/glass|visor|wind|lens/i.test(source.name)) {
            material.roughness = Math.min(0.12, source.roughness);
            material.envMapIntensity = 1.35;
          } else if (/tyre|tire|rubber/i.test(source.name)) {
            material.roughness = Math.max(0.72, source.roughness);
          }
          materials.set(source, material);
        }
        return materials.get(source)!;
      };
      child.material = Array.isArray(child.material) ? child.material.map(convert) : convert(child.material);
    });
    return { scene: clone, materials, paints, wheels, axis: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), rotation: new THREE.Quaternion(), steering: new THREE.Quaternion() };
  }, [scene]);

  useEffect(() => { prepared.paints.forEach((material) => material.color.set(paint)); invalidate(); }, [paint, prepared, invalidate]);
  useEffect(() => { onReady?.(); }, [prepared, onReady]);
  useEffect(() => () => { prepared.materials.forEach((material) => material.dispose()); }, [prepared]);
  useFrame((_, delta) => {
    if (!motion) return;
    spin.current += motion.current.speed * delta / 0.36;
    prepared.rotation.setFromAxisAngle(prepared.axis, spin.current);
    prepared.steering.setFromAxisAngle(prepared.up, motion.current.steer * 0.35);
    prepared.wheels.forEach(({ object, base, front }) => {
      object.quaternion.copy(base);
      if (front) object.quaternion.multiply(prepared.steering);
      object.quaternion.multiply(prepared.rotation);
    });
  });
  return <primitive object={prepared.scene} dispose={null} />;
}
