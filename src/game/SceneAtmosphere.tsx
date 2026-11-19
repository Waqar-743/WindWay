import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { seededRandom } from './track';

const atmospheres = {
  alpine: { zenith: '#164575', midSky: '#4f97c8', horizon: '#f5dcb4', glow: '#ffdf9e', ridge: '#587882', ground: '#638458', fog: '#dfece6', near: 320, far: 1120 },
  jungle: { zenith: '#0e374a', midSky: '#357774', horizon: '#b8d4ac', glow: '#ffe19e', ridge: '#1a4531', ground: '#123123', fog: '#89b396', near: 145, far: 570 },
  snow: { zenith: '#153e6a', midSky: '#4e84b2', horizon: '#d6e7f2', glow: '#ffe1be', ridge: '#607f98', ground: '#708b9e', fog: '#c1d6e3', near: 390, far: 2100 },
};

/** A local panoramic sky doubles as the car's reflection source. No HDR download
 * or per-frame reflection pass is needed, including in the offline Android APK. */
export default function SceneAtmosphere({ mapId }: { mapId: keyof typeof atmospheres }) {
  const { gl, scene, invalidate } = useThree();
  const palette = atmospheres[mapId];
  const sky = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1536; canvas.height = 768;
    const w = canvas.width, h = canvas.height;
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, palette.zenith);
    gradient.addColorStop(0.28, palette.midSky);
    gradient.addColorStop(0.46, palette.horizon);
    gradient.addColorStop(0.51, palette.glow);
    gradient.addColorStop(0.57, palette.ground);
    gradient.addColorStop(1, palette.ground);
    context.fillStyle = gradient; context.fillRect(0, 0, w, h);

    // Dual studio reflection ribbons in the upper sky for crisp F1 body-panel highlights
    const studioHighlight = context.createLinearGradient(0, h * 0.08, 0, h * 0.26);
    studioHighlight.addColorStop(0, 'rgba(255,252,242,0)');
    studioHighlight.addColorStop(0.45, 'rgba(255,253,245,0.22)');
    studioHighlight.addColorStop(0.65, 'rgba(255,248,232,0.12)');
    studioHighlight.addColorStop(1, 'rgba(255,252,242,0)');
    context.fillStyle = studioHighlight;
    context.fillRect(0, h * 0.08, w, h * 0.18);

    const random = seededRandom(mapId === 'snow' ? 814 : mapId === 'jungle' ? 509 : 218);
    // Layered cirrus & cumulus cloud puffs with warm lit rims and zero extra draw calls.
    for (let i = 0; i < 42; i++) {
      const x = random() * w, y = h * (0.22 + random() * 0.19);
      const width = 48 + random() * 165, height = 5 + random() * 14;
      context.save(); context.translate(x, y); context.scale(width, height);
      const cloud = context.createRadialGradient(0, -0.2, 0, 0, 0, 1);
      cloud.addColorStop(0, 'rgba(255,253,246,0.34)');
      cloud.addColorStop(0.5, 'rgba(242,248,247,0.16)');
      cloud.addColorStop(1, 'rgba(225,238,238,0)');
      context.fillStyle = cloud; context.fillRect(-1, -1, 2, 2); context.restore();
    }

    // Distant horizon mountain silhouette band for grounded reflections and sky depth
    context.save();
    context.beginPath();
    const horizonY = h * 0.515;
    context.moveTo(0, horizonY);
    for (let x = 0; x <= w; x += 20) {
      const wave = Math.sin(x * 0.012) * 15 + Math.cos(x * 0.029) * 9 + Math.sin(x * 0.004) * 12;
      context.lineTo(x, horizonY - 18 - wave);
    }
    context.lineTo(w, horizonY + 26);
    context.lineTo(0, horizonY + 26);
    context.closePath();
    context.fillStyle = palette.ridge;
    context.globalAlpha = 0.48;
    context.fill();
    context.restore();

    // Alpine gets a majestic second range with sunlit snow caps.
    if (mapId === 'alpine') {
      context.save();
      context.beginPath();
      context.moveTo(0, h * 0.51);
      for (let x = 0; x <= w; x += 28) {
        const wave = Math.sin(x * 0.0085) * 28 + Math.cos(x * 0.022) * 15 + Math.sin(x * 0.005) * 18;
        context.lineTo(x, h * 0.465 - wave);
      }
      context.lineTo(w, h * 0.54);
      context.lineTo(0, h * 0.54);
      context.closePath();
      context.fillStyle = '#89a5b2';
      context.globalAlpha = 0.54;
      context.fill();
      context.globalAlpha = 0.82;
      context.fillStyle = '#f2f6f5';
      for (let i = 0; i < 11; i++) {
        const x = (i + 0.5) / 11 * w;
        const peakY = h * 0.465 - (Math.sin(x * 0.0085) * 28 + Math.cos(x * 0.022) * 15 + Math.sin(x * 0.005) * 18);
        context.beginPath();
        context.moveTo(x - 36, peakY + 32);
        context.lineTo(x, peakY);
        context.lineTo(x + 36, peakY + 32);
        context.closePath();
        context.fill();
      }
      const haze = context.createLinearGradient(0, h * 0.47, 0, h * 0.56);
      haze.addColorStop(0, 'rgba(255,240,214,0)');
      haze.addColorStop(0.5, 'rgba(255,240,214,0.26)');
      haze.addColorStop(1, 'rgba(255,240,214,0)');
      context.fillStyle = haze;
      context.fillRect(0, h * 0.47, w, h * 0.09);
      context.restore();
    }

    // Snow gets dramatic serrated glacial peaks with crisp alpenglow ridge lighting.
    if (mapId === 'snow') {
      context.save();
      context.beginPath();
      context.moveTo(0, h * 0.515);
      for (let x = 0; x <= w; x += 24) {
        const ridge = Math.abs(Math.sin(x * 0.0075)) * 42 + Math.cos(x * 0.019) * 16 + Math.sin(x * 0.037) * 8;
        context.lineTo(x, h * 0.468 - ridge);
      }
      context.lineTo(w, h * 0.545);
      context.lineTo(0, h * 0.545);
      context.closePath();
      context.fillStyle = '#7b99b2';
      context.globalAlpha = 0.62;
      context.fill();
      context.globalAlpha = 0.85;
      context.fillStyle = '#f4f9fc';
      for (let i = 0; i < 12; i++) {
        const x = (i + 0.45) / 12 * w;
        const ridge = Math.abs(Math.sin(x * 0.0075)) * 42 + Math.cos(x * 0.019) * 16 + Math.sin(x * 0.037) * 8;
        const peakY = h * 0.468 - ridge;
        context.beginPath();
        context.moveTo(x - 32, peakY + 34);
        context.lineTo(x, peakY);
        context.lineTo(x + 32, peakY + 34);
        context.closePath();
        context.fill();
      }
      const alpenglow = context.createLinearGradient(0, h * 0.45, 0, h * 0.55);
      alpenglow.addColorStop(0, 'rgba(255,222,196,0)');
      alpenglow.addColorStop(0.5, 'rgba(255,226,204,0.24)');
      alpenglow.addColorStop(1, 'rgba(200,226,242,0)');
      context.fillStyle = alpenglow;
      context.fillRect(0, h * 0.45, w, h * 0.1);
      context.restore();
    }

    // The jungle horizon is a layered canopy rather than bare mountains.
    if (mapId === 'jungle') {
      context.save();
      context.beginPath();
      const canopyY = h * 0.505;
      context.moveTo(0, canopyY);
      for (let x = 0; x <= w; x += 12) {
        const wave = Math.sin(x * 0.015) * 12 + Math.cos(x * 0.032) * 8 + Math.sin(x * 0.006) * 9;
        context.lineTo(x, canopyY - 26 - wave);
      }
      context.lineTo(w, canopyY + 36);
      context.lineTo(0, canopyY + 36);
      context.closePath();
      context.fillStyle = '#18442f';
      context.globalAlpha = 0.74;
      context.fill();
      for (let i = 0; i < 22; i++) {
        const x = (i + 0.5) / 22 * w + Math.sin(i * 2.3) * 24;
        const radius = 26 + (i % 4) * 12;
        context.beginPath();
        context.arc(x, canopyY - 30 - (i % 3) * 9, radius, Math.PI, 0);
        context.fill();
      }
      const haze = context.createLinearGradient(0, h * 0.44, 0, h * 0.54);
      haze.addColorStop(0, 'rgba(205,232,208,0)');
      haze.addColorStop(0.5, 'rgba(205,232,208,0.24)');
      haze.addColorStop(1, 'rgba(205,232,208,0)');
      context.fillStyle = haze;
      context.fillRect(0, h * 0.44, w, h * 0.1);
      context.restore();
    }

    const sunX = w * 0.59, sunY = h * 0.19;
    const glow = context.createRadialGradient(sunX, sunY, 2, sunX, sunY, 195);
    glow.addColorStop(0, 'rgba(255,250,226,0.98)');
    glow.addColorStop(0.14, 'rgba(255,232,178,0.52)');
    glow.addColorStop(0.45, 'rgba(255,212,148,0.16)');
    glow.addColorStop(1, 'rgba(255,212,148,0)');
    context.fillStyle = glow; context.fillRect(sunX - 200, 0, 400, 360);
    context.beginPath(); context.arc(sunX, sunY, 9, 0, Math.PI * 2); context.fillStyle = '#fff9e4'; context.fill();
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
