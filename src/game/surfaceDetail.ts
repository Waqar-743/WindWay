import * as THREE from 'three';
import { seededRandom } from './track';

/** Small deterministic, tiled surface maps keep offline scenery detailed without
 * shipping photographs or increasing terrain polygons. */
export function surfaceTexture(kind: 'asphalt' | 'ground', anisotropy = 1) {
  const size = 256, data = new Uint8Array(size * size * 4);
  const random = seededRandom(kind === 'asphalt' ? 401 : 917);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = random();
      const micro = Math.sin(x / size * Math.PI * 12) * Math.cos(y / size * Math.PI * 12);
      const broad = Math.sin(x / size * Math.PI * 4 + Math.cos(y / size * Math.PI * 2)) * Math.cos(y / size * Math.PI * 4);
      const raw = kind === 'asphalt'
        ? 198 + grain * 44 + micro * 6 + (grain > 0.965 ? -58 : grain < 0.025 ? 24 : 0)
        : 202 + broad * 22 + micro * 5 + grain * 26;
      const value = Math.max(0, Math.min(255, Math.round(raw)));
      const index = (y * size + x) * 4;
      data[index] = value; data[index + 1] = value; data[index + 2] = value; data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = Math.min(8, anisotropy);
  texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
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
