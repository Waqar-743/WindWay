import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { mapById } from './maps';
import { SNOW_ICE_ZONES } from './snowCourse';

type MapId = 'alpine' | 'jungle' | 'snow';

const BIOME_CONFIG: Record<MapId, {
  sky: string;
  fog: string;
  ground: string;
  rock: string;
  accent: string;
  secondary: string;
  road: string;
  tree: string;
  water: string;
}> = {
  alpine: {
    sky: '#152532', fog: '#14232d', ground: '#3e5c45', rock: '#556e78',
    accent: '#f08b5b', secondary: '#d5fc58', road: '#222a30', tree: '#2a563c', water: '#398fa0',
  },
  jungle: {
    sky: '#0b221e', fog: '#0b201c', ground: '#1f442d', rock: '#2e523c',
    accent: '#6bdeb1', secondary: '#eac35a', road: '#1e2824', tree: '#175436', water: '#248778',
  },
  snow: {
    sky: '#112234', fog: '#132638', ground: '#9ab6ca', rock: '#485b6c',
    accent: '#8bdcff', secondary: '#f08b5b', road: '#1c252d', tree: '#1f4a3f', water: '#6bb8dc',
  },
};

/** Interactive scroll-driven 3D Three.js miniature terrain & real route diorama for each map chapter. */
export default function Route3DShowcase({ id, reducedMotion = false }: { id: MapId; reducedMotion?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion || typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      return;
    }

    const width = host.clientWidth || 800;
    const height = host.clientHeight || 360;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    host.appendChild(renderer.domElement);

    const cfg = BIOME_CONFIG[id];
    const map = mapById(id);
    const closed = map.mode !== 'ascent';
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(cfg.sky);
    scene.fog = new THREE.FogExp2(cfg.fog, 0.0115);

    const camera = new THREE.PerspectiveCamera(40, width / Math.max(1, height), 0.5, 220);

    // Lighting
    const hemi = new THREE.HemisphereLight(id === 'snow' ? '#cce8fa' : '#ffecd2', cfg.ground, 0.95);
    const sun = new THREE.DirectionalLight('#fff2da', 2.2);
    sun.position.set(28, 42, 24);
    const rim = new THREE.DirectionalLight(cfg.accent, 0.9);
    rim.position.set(-28, 18, -24);
    scene.add(hemi, sun, rim);

    // Normalize actual game map points into a crisp ~46-unit tabletop 3D world
    const rawCurve = new THREE.CatmullRomCurve3(map.points, closed, 'catmullrom', closed ? 0.35 : 0.55);
    const sampleCount = closed ? 160 : 220;
    const rawPts = Array.from({ length: sampleCount + (closed ? 0 : 1) }, (_, i) => rawCurve.getPointAt(i / sampleCount));
    const box = new THREE.Box3().setFromPoints(rawPts);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const horizScale = 44 / Math.max(size.x, size.z, 1);
    const vertScale = id === 'snow' ? horizScale * 2.1 : horizScale * 2.4;

    const normPoints = rawPts.map((p) => new THREE.Vector3(
      (p.x - center.x) * horizScale,
      (p.y - box.min.y) * vertScale + 0.6,
      (p.z - center.z) * horizScale,
    ));
    const displayCurve = new THREE.CatmullRomCurve3(normPoints, closed);

    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(item: T): T => { disposables.push(item); return item; };

    // Sculpted 3D terrain plinth under the route
    const terrainGeo = track(new THREE.PlaneGeometry(92, 92, 54, 54));
    terrainGeo.rotateX(-Math.PI / 2);
    const tPos = terrainGeo.attributes.position;
    const tColors = new Float32Array(tPos.count * 3);
    const cGround = new THREE.Color(cfg.ground);
    const cRock = new THREE.Color(cfg.rock);
    const cSnowCap = new THREE.Color('#eef6fc');
    const tmpC = new THREE.Color();

    for (let i = 0; i < tPos.count; i++) {
      const x = tPos.getX(i), z = tPos.getZ(i);
      let minDist = Infinity;
      let nearestY = 0;
      for (let k = 0; k < normPoints.length; k += 3) {
        const dx = normPoints[k].x - x, dz = normPoints[k].z - z;
        const d = dx * dx + dz * dz;
        if (d < minDist) { minDist = d; nearestY = normPoints[k].y; }
      }
      const dist = Math.sqrt(minDist);
      let y = nearestY - 0.55;
      if (dist > 2.2) {
        const hillFactor = THREE.MathUtils.clamp((dist - 2.2) / 14, 0, 1);
        const mountains = (Math.sin(x * 0.16 + 0.5) * Math.cos(z * 0.14) * 3.8 + Math.abs(Math.sin(x * 0.08 - z * 0.09)) * 7.2) * hillFactor;
        y = (id === 'snow' ? nearestY * 0.85 : 0) + mountains - (id === 'snow' ? 1.4 : 0.9);
      }
      tPos.setY(i, y);

      tmpC.copy(cGround);
      if (y > 4.2) tmpC.lerp(cRock, Math.min(1, (y - 4.2) / 4.5));
      if (y > 7.5 || (id === 'snow' && y > 3.2 && dist > 6)) tmpC.lerp(cSnowCap, id === 'snow' ? 0.68 : 0.78);
      tColors[i * 3] = tmpC.r; tColors[i * 3 + 1] = tmpC.g; tColors[i * 3 + 2] = tmpC.b;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(tColors, 3));
    terrainGeo.computeVertexNormals();
    const terrainMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.08, flatShading: true }));
    scene.add(new THREE.Mesh(terrainGeo, terrainMat));

    // Subtle topographic contour grid above terrain
    const contourMat = track(new THREE.MeshBasicMaterial({ color: cfg.accent, wireframe: true, transparent: true, opacity: 0.11 }));
    const contourMesh = new THREE.Mesh(terrainGeo, contourMat);
    contourMesh.position.y = 0.05;
    scene.add(contourMesh);

    // River plane for Alpine & Jungle
    if (id !== 'snow') {
      const riverGeo = track(new THREE.PlaneGeometry(88, 6.2));
      riverGeo.rotateX(-Math.PI / 2);
      const riverMat = track(new THREE.MeshStandardMaterial({ color: cfg.water, roughness: 0.15, metalness: 0.45 }));
      const river = new THREE.Mesh(riverGeo, riverMat);
      river.position.set(0, -0.35, 0);
      scene.add(river);
    }

    // Actual 3D road ribbon
    const roadSegs = closed ? 180 : 240;
    const rPos: number[] = [], rIdx: number[] = [];
    const roadW = id === 'snow' ? 1.15 : 1.45;
    for (let i = 0; i <= roadSegs; i++) {
      const t = i / roadSegs;
      const p = displayCurve.getPointAt(t);
      const tan = displayCurve.getTangentAt(t).normalize();
      const right = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
      for (const side of [-1, 1]) {
        const ep = p.clone().addScaledVector(right, side * roadW);
        rPos.push(ep.x, ep.y, ep.z);
      }
      if (i < roadSegs) {
        const v = i * 2;
        rIdx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    }
    const roadGeo = track(new THREE.BufferGeometry());
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
    roadGeo.setIndex(rIdx);
    roadGeo.computeVertexNormals();
    const roadMat = track(new THREE.MeshStandardMaterial({ color: cfg.road, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }));
    scene.add(new THREE.Mesh(roadGeo, roadMat));

    // Glowing racing line on top of the road
    const centerPts = Array.from({ length: roadSegs + 1 }, (_, i) => displayCurve.getPointAt(i / roadSegs).add(new THREE.Vector3(0, 0.14, 0)));
    const centerGeo = track(new THREE.BufferGeometry().setFromPoints(centerPts));
    const centerMat = track(new THREE.LineBasicMaterial({ color: cfg.accent, transparent: true, opacity: 0.92 }));
    scene.add(new THREE.Line(centerGeo, centerMat));

    // Highlight Snow's 8 Ice Zones directly on the 3D miniature climb
    if (id === 'snow') {
      const iceMat = track(new THREE.MeshBasicMaterial({ color: '#8bdcff' }));
      for (const [from, to] of SNOW_ICE_ZONES) {
        const pts = Array.from({ length: 8 }, (_, k) => displayCurve.getPointAt(from + (to - from) * (k / 7)).add(new THREE.Vector3(0, 0.12, 0)));
        const tube = track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.24, 6, false));
        scene.add(new THREE.Mesh(tube, iceMat));
      }
    }

    // Biome props: miniature trees & glowing village homes around the 3D circuit
    const treeGeo = track(id === 'jungle' ? new THREE.DodecahedronGeometry(0.95, 0) : new THREE.ConeGeometry(0.75, 2.2, 6));
    const treeMat = track(new THREE.MeshLambertMaterial({ color: cfg.tree, flatShading: true }));
    const treeMatrices: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();

    let seed = id === 'snow' ? 91 : id === 'jungle' ? 47 : 19;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

    for (let i = 0; i < 110; i++) {
      const x = (rand() - 0.5) * 68;
      const z = (rand() - 0.5) * 68;
      let nearest = Infinity, ny = 0;
      for (let k = 0; k < normPoints.length; k += 4) {
        const d = Math.hypot(normPoints[k].x - x, normPoints[k].z - z);
        if (d < nearest) { nearest = d; ny = normPoints[k].y; }
      }
      if (nearest < 2.6 || nearest > 22) continue;
      if (id !== 'snow' && Math.abs(z) < 4) continue;
      const s = 0.7 + rand() * 0.9;
      dummy.position.set(x, ny + s * 0.55, z);
      dummy.scale.set(s, s * (id === 'jungle' ? 0.95 : 1.2), s);
      dummy.rotation.set(0, rand() * Math.PI, 0);
      dummy.updateMatrix();
      treeMatrices.push(dummy.matrix.clone());
    }
    if (treeMatrices.length) {
      const inst = new THREE.InstancedMesh(treeGeo, treeMat, treeMatrices.length);
      treeMatrices.forEach((m, idx) => inst.setMatrixAt(idx, m));
      inst.instanceMatrix.needsUpdate = true;
      scene.add(inst);
    }

    // Miniature glowing alpine / snow homes along the route
    const cabinGeo = track(new THREE.BoxGeometry(1.15, 0.85, 1.0));
    const cabinMat = track(new THREE.MeshLambertMaterial({ color: id === 'snow' ? '#8c4b3c' : id === 'jungle' ? '#9e7d50' : '#d8c9a8' }));
    const winGeo = track(new THREE.BoxGeometry(1.2, 0.25, 0.5));
    const winMat = track(new THREE.MeshBasicMaterial({ color: '#ffd97d' }));
    for (let h = 0; h < 7; h++) {
      const t = (h + 0.4) / 7.5;
      const p = displayCurve.getPointAt(t);
      const tan = displayCurve.getTangentAt(t).normalize();
      const right = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
      const side = h % 2 ? 1 : -1;
      const hp = p.clone().addScaledVector(right, side * 3.2);
      const cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.set(hp.x, hp.y + 0.2, hp.z);
      cabin.rotation.y = Math.atan2(tan.x, tan.z);
      const win = new THREE.Mesh(winGeo, winMat);
      win.position.set(hp.x, hp.y + 0.26, hp.z);
      win.rotation.y = cabin.rotation.y;
      scene.add(cabin, win);
    }

    // Animated glowing telemetry pulse racer gliding along the actual 3D route
    const orbGeo = track(new THREE.SphereGeometry(0.62, 14, 12));
    const orbMat = track(new THREE.MeshBasicMaterial({ color: cfg.secondary }));
    const orb = new THREE.Mesh(orbGeo, orbMat);
    const orbLight = new THREE.PointLight(cfg.secondary, 14, 16, 1.5);
    scene.add(orb, orbLight);

    // Floating biome atmosphere motes
    const moteCount = 90;
    const mArr = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      mArr[i * 3] = (rand() - 0.5) * 60;
      mArr[i * 3 + 1] = rand() * 20 + 1;
      mArr[i * 3 + 2] = (rand() - 0.5) * 60;
    }
    const moteGeo = track(new THREE.BufferGeometry());
    moteGeo.setAttribute('position', new THREE.BufferAttribute(mArr, 3));
    const moteMat = track(new THREE.PointsMaterial({ color: id === 'snow' ? '#ffffff' : cfg.secondary, size: id === 'snow' ? 0.35 : 0.26, transparent: true, opacity: 0.65, depthWrite: false }));
    const motes = new THREE.Points(moteGeo, moteMat);
    scene.add(motes);

    // Visibility + scroll + hover parallax
    let isVisible = true;
    let pointerX = 0, pointerY = 0;
    const onPointerMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerX = ((e.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
      pointerY = ((e.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
    };
    const onPointerLeave = () => { pointerX = 0; pointerY = 0; };
    host.addEventListener('pointermove', onPointerMove, { passive: true });
    host.addEventListener('pointerleave', onPointerLeave, { passive: true });

    const observer = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => { isVisible = entry.isIntersecting; }, { rootMargin: '120px' })
      : null;
    observer?.observe(host);

    const resizeObs = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          const w = host.clientWidth || 800;
          const h = host.clientHeight || 360;
          camera.aspect = w / Math.max(1, h);
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        })
      : null;
    resizeObs?.observe(host);

    let rafId = 0;
    const clock = new THREE.Clock();
    let smoothPx = 0, smoothPy = 0;
    const baseTarget = new THREE.Vector3(0, id === 'snow' ? 6.5 : 1.5, 0);

    const animate = () => {
      rafId = window.requestAnimationFrame(animate);
      if (!isVisible || document.visibilityState === 'hidden') return;
      const dt = Math.min(0.05, clock.getDelta());
      const t = clock.elapsedTime;
      smoothPx += (pointerX - smoothPx) * Math.min(1, dt * 6);
      smoothPy += (pointerY - smoothPy) * Math.min(1, dt * 6);

      // Compute viewport scroll progress through this banner for organic scroll-linked orbit
      const rect = host.getBoundingClientRect();
      const viewH = window.innerHeight || 900;
      const scrollRatio = THREE.MathUtils.clamp((viewH - rect.top) / (viewH + rect.height), 0, 1);

      const angle = scrollRatio * 1.45 + t * 0.14 + smoothPx * 0.45;
      const radius = id === 'snow' ? 36 - scrollRatio * 5 : 34 - scrollRatio * 4;
      const camY = (id === 'snow' ? 20 + scrollRatio * 8 : 16 + Math.sin(scrollRatio * Math.PI) * 4) - smoothPy * 3.5;

      camera.position.set(Math.sin(angle) * radius, camY, Math.cos(angle) * radius);
      camera.lookAt(baseTarget);

      // Glide pulse racer along the actual 3D circuit
      const progress = (t * (id === 'snow' ? 0.055 : 0.085) + scrollRatio * 0.25) % 1;
      const op = displayCurve.getPointAt(progress);
      orb.position.set(op.x, op.y + 0.55, op.z);
      orbLight.position.copy(orb.position);

      if (id === 'snow') {
        motes.position.y = -((t * 1.6) % 6);
      } else {
        motes.rotation.y = t * 0.06;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      resizeObs?.disconnect();
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [id, reducedMotion]);

  return <div ref={hostRef} className="wl-route-3d" aria-hidden="true" />;
}
