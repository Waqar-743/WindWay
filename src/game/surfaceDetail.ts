import * as THREE from 'three';
import { seededRandom } from './track';

/** Small deterministic, tiled surface maps keep offline scenery detailed without
 * shipping photographs or increasing terrain polygons. */
export function surfaceTexture(kind: 'asphalt' | 'ground', anisotropy = 1) {
  const size = kind === 'asphalt' ? 512 : 256;
  const data = new Uint8Array(size * size * 4);
  const random = seededRandom(kind === 'asphalt' ? 401 : 917);

  // Precompute subtle tar crack lines for asphalt so roads look driven-in, not flat
  const crackA = Math.floor(size * 0.28);
  const crackB = Math.floor(size * 0.74);

  for (let y = 0; y < size; y++) {
    const wobbleA = Math.round(Math.sin(y / size * Math.PI * 4) * 5 + Math.cos(y / size * Math.PI * 10) * 2);
    const wobbleB = Math.round(Math.cos(y / size * Math.PI * 6) * 4);
    for (let x = 0; x < size; x++) {
      const grain = random();
      const fine = random();
      const micro = Math.sin(x / size * Math.PI * 16) * Math.cos(y / size * Math.PI * 16);
      const broad = Math.sin(x / size * Math.PI * 4 + Math.cos(y / size * Math.PI * 2)) * Math.cos(y / size * Math.PI * 4);
      let raw: number;
      if (kind === 'asphalt') {
        const aggregate = grain * 42 + fine * 16 + micro * 5 + broad * 8;
        const pebble = grain > 0.965 ? -56 : grain < 0.03 ? 34 : 0;
        const seam = Math.abs(((x + wobbleA) % size) - crackA) < 1 || Math.abs(((x + wobbleB) % size) - crackB) < 1 ? -46 : 0;
        raw = 186 + aggregate + pebble + seam;
      } else {
        raw = 202 + broad * 22 + micro * 5 + grain * 26;
      }
      const value = Math.max(0, Math.min(255, Math.round(raw)));
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(8, anisotropy);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Deterministic roughness variation map so sunlight skims subtly across road aggregate. */
export function roadRoughnessTexture(anisotropy = 1) {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const random = seededRandom(1409);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wave = Math.sin(x / size * Math.PI * 6) * Math.cos(y / size * Math.PI * 4) * 18;
      const speck = (random() - 0.5) * 44;
      const v = Math.max(120, Math.min(250, Math.round(208 + wave + speck)));
      const idx = (y * size + x) * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(8, anisotropy);
  texture.needsUpdate = true;
  return texture;
}

export function worldSurfaceUV(geometry: THREE.BufferGeometry, tileSize: number) {
  const positions = geometry.attributes.position, uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    uv[i * 2] = positions.getX(i) / tileSize;
    uv[i * 2 + 1] = positions.getZ(i) / tileSize;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}
