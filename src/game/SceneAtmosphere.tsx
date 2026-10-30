import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { seededRandom } from './track';

const atmospheres = {
  alpine: { zenith: '#4a97cc', horizon: '#d2e5e9', ground: '#728c65', fog: '#d2e5e9', near: 310, far: 1000 },
  jungle: { zenith: '#285d70', horizon: '#6e9988', ground: '#193d2d', fog: '#6e9988', near: 100, far: 430 },
  snow: { zenith: '#285e8e', horizon: '#a2bccb', ground: '#718a9b', fog: '#a2bccb', near: 380, far: 1900 },
};

/** A local panoramic sky doubles as the car's reflection source. No HDR download
 * or per-frame reflection pass is needed, including in the offline Android APK. */
export default function SceneAtmosphere({ mapId }: { mapId: keyof typeof atmospheres }) {
  const { gl, scene, invalidate } = useThree();
  const palette = atmospheres[mapId];
  const sky = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 512;
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, palette.zenith);
    gradient.addColorStop(0.38, palette.zenith);
    gradient.addColorStop(0.5, palette.horizon);
    gradient.addColorStop(0.58, palette.ground);
    gradient.addColorStop(1, palette.ground);
    context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
    const random = seededRandom(mapId === 'snow' ? 814 : 218);
    // Soft, high cloud bands have no geometry or additional draw calls.
    for (let i = 0; i < 22; i++) {
      const x = random() * canvas.width, y = 154 + random() * 76;
      const width = 25 + random() * 90;
      context.save(); context.translate(x, y); context.scale(width, 3 + random() * 6);
      const cloud = context.createRadialGradient(0, 0, 0, 0, 0, 1);
      cloud.addColorStop(0, 'rgba(230,240,239,0.22)'); cloud.addColorStop(1, 'rgba(230,240,239,0)');
      context.fillStyle = cloud; context.fillRect(-1, -1, 2, 2); context.restore();
    }
    const glow = context.createRadialGradient(608, 93, 1, 608, 93, 86);
    glow.addColorStop(0, 'rgba(255,239,194,0.85)'); glow.addColorStop(0.12, 'rgba(255,225,170,0.35)'); glow.addColorStop(1, 'rgba(255,225,170,0)');
    context.fillStyle = glow; context.fillRect(520, 5, 176, 176);
    context.beginPath(); context.arc(608, 93, 5, 0, Math.PI * 2); context.fillStyle = '#fff0c5'; context.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [mapId, palette]);
  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    const reflection = generator.fromEquirectangular(sky);
    const oldBackground = scene.background, oldEnvironment = scene.environment;
    scene.background = sky; scene.environment = reflection.texture;
    generator.dispose(); invalidate();
    return () => {
      scene.background = oldBackground; scene.environment = oldEnvironment;
      reflection.dispose(); sky.dispose();
    };
  }, [gl, scene, sky, invalidate]);
  return <fog attach="fog" args={[palette.fog, palette.near, palette.far]} />;
}
