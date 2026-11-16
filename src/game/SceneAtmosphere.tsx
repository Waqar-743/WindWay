import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { seededRandom } from './track';

const atmospheres = {
  alpine: { zenith: '#1d4f7f', midSky: '#5a9fc9', horizon: '#f2ddb8', glow: '#ffe0a8', ridge: '#5f7f88', ground: '#6a8a60', fog: '#e2eee9', near: 310, far: 1050 },
  jungle: { zenith: '#123f52', midSky: '#3f7f7c', horizon: '#b9d0ad', glow: '#ffe0a0', ridge: '#1e4a35', ground: '#143526', fog: '#8fb59b', near: 135, far: 540 },
  snow: { zenith: '#1b4772', midSky: '#588bb4', horizon: '#cfe1ec', glow: '#ffe4c4', ridge: '#6b889e', ground: '#7892a4', fog: '#bdd2df', near: 380, far: 1950 },
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
    gradient.addColorStop(0.28, palette.midSky);
    gradient.addColorStop(0.46, palette.horizon);
    gradient.addColorStop(0.51, palette.glow);
    gradient.addColorStop(0.57, palette.ground);
    gradient.addColorStop(1, palette.ground);
    context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle studio reflection band in the upper sky for rich automotive body highlights
    const studioHighlight = context.createLinearGradient(0, 48, 0, 130);
    studioHighlight.addColorStop(0, 'rgba(255,252,242,0)');
    studioHighlight.addColorStop(0.5, 'rgba(255,252,242,0.16)');
    studioHighlight.addColorStop(1, 'rgba(255,252,242,0)');
    context.fillStyle = studioHighlight;
    context.fillRect(0, 48, canvas.width, 82);

    const random = seededRandom(mapId === 'snow' ? 814 : mapId === 'jungle' ? 509 : 218);
    // Soft, high cloud bands with sunlit undersides have no geometry or additional draw calls.
    for (let i = 0; i < 28; i++) {
      const x = random() * canvas.width, y = 135 + random() * 88;
      const width = 32 + random() * 105, height = 3.5 + random() * 7.5;
      context.save(); context.translate(x, y); context.scale(width, height);
      const cloud = context.createRadialGradient(0, -0.15, 0, 0, 0, 1);
      cloud.addColorStop(0, 'rgba(255,252,245,0.28)');
      cloud.addColorStop(0.55, 'rgba(240,246,245,0.14)');
      cloud.addColorStop(1, 'rgba(230,240,239,0)');
      context.fillStyle = cloud; context.fillRect(-1, -1, 2, 2); context.restore();
    }

    // Distant horizon mountain silhouette band for grounded reflections and sky depth
    context.save();
    context.beginPath();
    const horizonY = 264;
    context.moveTo(0, horizonY);
    for (let x = 0; x <= canvas.width; x += 16) {
      const wave = Math.sin(x * 0.018) * 10 + Math.cos(x * 0.043) * 6 + Math.sin(x * 0.006) * 8;
      context.lineTo(x, horizonY - 12 - wave);
    }
    context.lineTo(canvas.width, horizonY + 18);
    context.lineTo(0, horizonY + 18);
    context.closePath();
    context.fillStyle = palette.ridge;
    context.globalAlpha = 0.45;
    context.fill();
    context.restore();

    // Alpine gets a second, higher range with snow caps for a deeper horizon.
    if (mapId === 'alpine') {
      context.save();
      context.beginPath();
      context.moveTo(0, 262);
      for (let x = 0; x <= canvas.width; x += 24) {
        const wave = Math.sin(x * 0.012) * 18 + Math.cos(x * 0.031) * 10 + Math.sin(x * 0.007) * 12;
        context.lineTo(x, 238 - wave);
      }
      context.lineTo(canvas.width, 276);
      context.lineTo(0, 276);
      context.closePath();
      context.fillStyle = '#8fa9b4';
      context.globalAlpha = 0.5;
      context.fill();
      context.globalAlpha = 0.75;
      context.fillStyle = '#eef3f2';
      for (let i = 0; i < 9; i++) {
        const x = (i + 0.5) / 9 * canvas.width;
        const peakY = 238 - (Math.sin(x * 0.012) * 18 + Math.cos(x * 0.031) * 10 + Math.sin(x * 0.007) * 12);
        context.beginPath();
        context.moveTo(x - 26, peakY + 22);
        context.lineTo(x, peakY);
        context.lineTo(x + 26, peakY + 22);
        context.closePath();
        context.fill();
      }
      const haze = context.createLinearGradient(0, 240, 0, 286);
      haze.addColorStop(0, 'rgba(255,240,214,0)');
      haze.addColorStop(0.5, 'rgba(255,240,214,0.22)');
      haze.addColorStop(1, 'rgba(255,240,214,0)');
      context.fillStyle = haze;
      context.fillRect(0, 240, canvas.width, 46);
      context.restore();
    }

    // The jungle horizon is a layered canopy rather than bare mountains. The
    // silhouette also gives the car's reflections a believable green edge.
    if (mapId === 'jungle') {
      context.save();
      context.beginPath();
      const canopyY = 258;
      context.moveTo(0, canopyY);
      for (let x = 0; x <= canvas.width; x += 8) {
        const wave = Math.sin(x * 0.021) * 8 + Math.cos(x * 0.047) * 5 + Math.sin(x * 0.009) * 6;
        context.lineTo(x, canopyY - 18 - wave);
      }
      context.lineTo(canvas.width, canopyY + 24);
      context.lineTo(0, canopyY + 24);
      context.closePath();
      context.fillStyle = '#1c4a35';
      context.globalAlpha = 0.72;
      context.fill();
      for (let i = 0; i < 18; i++) {
        const x = (i + 0.5) / 18 * canvas.width + Math.sin(i * 2.3) * 18;
        const radius = 18 + (i % 4) * 8;
        context.beginPath();
        context.arc(x, canopyY - 22 - (i % 3) * 6, radius, Math.PI, 0);
        context.fill();
      }
      const haze = context.createLinearGradient(0, 228, 0, 276);
      haze.addColorStop(0, 'rgba(205,228,208,0)');
      haze.addColorStop(0.5, 'rgba(205,228,208,0.2)');
      haze.addColorStop(1, 'rgba(205,228,208,0)');
      context.fillStyle = haze;
      context.fillRect(0, 228, canvas.width, 48);
      context.restore();
    }

    const glow = context.createRadialGradient(608, 96, 1, 608, 96, 128);
    glow.addColorStop(0, 'rgba(255,248,220,0.95)');
    glow.addColorStop(0.14, 'rgba(255,230,175,0.48)');
    glow.addColorStop(0.45, 'rgba(255,212,148,0.14)');
    glow.addColorStop(1, 'rgba(255,212,148,0)');
    context.fillStyle = glow; context.fillRect(480, 0, 256, 224);
    context.beginPath(); context.arc(608, 96, 6, 0, Math.PI * 2); context.fillStyle = '#fff8df'; context.fill();
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
