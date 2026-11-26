import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface BiomePalette {
  bg: THREE.Color;
  fog: THREE.Color;
  accent: THREE.Color;
  secondary: THREE.Color;
  terrain: THREE.Color;
}

const PALETTES: BiomePalette[] = [
  {
    bg: new THREE.Color('#0b0a09'),
    fog: new THREE.Color('#14110e'),
    accent: new THREE.Color('#e36d2b'),
    secondary: new THREE.Color('#f2a93b'),
    terrain: new THREE.Color('#241d17'),
  },
  {
    bg: new THREE.Color('#0c0a08'),
    fog: new THREE.Color('#17120c'),
    accent: new THREE.Color('#d9a438'),
    secondary: new THREE.Color('#e36d2b'),
    terrain: new THREE.Color('#261f15'),
  },
  {
    bg: new THREE.Color('#0d0c0b'),
    fog: new THREE.Color('#191714'),
    accent: new THREE.Color('#d6cec2'),
    secondary: new THREE.Color('#f2a93b'),
    terrain: new THREE.Color('#292622'),
  },
];

/** Full-viewport, scroll-choreographed Three.js motorsport terrain backdrop for the landing page. */
export default function LandingScroll3D({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const scroller = hostRef.current?.closest('.page-home') as HTMLElement | null;
    const updateBar = () => {
      if (!progressRef.current) return;
      let ratio = 0;
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 20) {
        ratio = THREE.MathUtils.clamp(scroller.scrollTop / (scroller.scrollHeight - scroller.clientHeight), 0, 1);
      } else {
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        ratio = THREE.MathUtils.clamp(window.scrollY / max, 0, 1);
      }
      progressRef.current.style.transform = `scaleX(${ratio.toFixed(4)})`;
    };
    updateBar();
    scroller?.addEventListener('scroll', updateBar, { passive: true });
    window.addEventListener('scroll', updateBar, { passive: true });
    return () => {
      scroller?.removeEventListener('scroll', updateBar);
      window.removeEventListener('scroll', updateBar);
    };
  }, []);

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

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(host.clientWidth || window.innerWidth, host.clientHeight || window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const fog = new THREE.FogExp2('#14110e', 0.0155);
    scene.fog = fog;

    const camera = new THREE.PerspectiveCamera(48, (host.clientWidth || window.innerWidth) / Math.max(1, host.clientHeight || window.innerHeight), 0.5, 220);
    camera.position.set(0, 12, 34);

    // Lighting
    const hemi = new THREE.HemisphereLight('#f2dfc4', '#1d1814', 0.78);
    const keyLight = new THREE.DirectionalLight('#ffefd6', 1.65);
    keyLight.position.set(22, 35, 18);
    const accentLight = new THREE.PointLight('#e36d2b', 28, 95, 1.6);
    accentLight.position.set(0, 10, 0);
    scene.add(hemi, keyLight, accentLight);

    // Sculpted mountain-pass terrain with topographic wireframe overlay
    const terrainGeo = new THREE.PlaneGeometry(160, 260, 56, 86);
    terrainGeo.rotateX(-Math.PI / 2);
    const pos = terrainGeo.attributes.position;
    const valleyCenter = (z: number) => Math.sin(z * 0.032) * 14 + Math.cos(z * 0.017) * 7;
    const valleyElev = (z: number) => Math.sin(z * 0.022) * 2.2 + Math.max(0, (-z - 30) * 0.045);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const cx = valleyCenter(z);
      const dist = Math.abs(x - cx);
      const roadFlat = THREE.MathUtils.smoothstep(dist, 4.5, 18);
      const ridge = (Math.sin(x * 0.09 + z * 0.04) * 5.2 + Math.cos(x * 0.045 - z * 0.07) * 6.8 + Math.abs(Math.sin(x * 0.03)) * 12) * roadFlat;
      const wall = Math.pow(Math.max(0, dist - 14) * 0.14, 1.55) * 4.5;
      const y = valleyElev(z) - 0.8 + ridge + wall;
      pos.setY(i, y);
    }
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      color: '#241d17',
      roughness: 0.88,
      metalness: 0.12,
      flatShading: true,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    scene.add(terrainMesh);

    const wireMat = new THREE.MeshBasicMaterial({
      color: '#e36d2b',
      wireframe: true,
      transparent: true,
      opacity: 0.14,
    });
    const wireMesh = new THREE.Mesh(terrainGeo, wireMat);
    wireMesh.position.y = 0.08;
    scene.add(wireMesh);

    // Winding 3D highway curve through the valley
    const curvePoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const z = 75 - i * 4.5;
      curvePoints.push(new THREE.Vector3(valleyCenter(z), valleyElev(z) + 0.15, z));
    }
    const roadCurve = new THREE.CatmullRomCurve3(curvePoints);

    // Road ribbon mesh
    const roadSegs = 220;
    const roadPos: number[] = [], roadIdx: number[] = [];
    const halfW = 3.2;
    for (let i = 0; i <= roadSegs; i++) {
      const t = i / roadSegs;
      const p = roadCurve.getPointAt(t);
      const tan = roadCurve.getTangentAt(t).normalize();
      const right = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
      for (const side of [-1, 1]) {
        const ep = p.clone().addScaledVector(right, side * halfW);
        roadPos.push(ep.x, ep.y, ep.z);
      }
      if (i < roadSegs) {
        const v = i * 2;
        roadIdx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    }
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
    roadGeo.setIndex(roadIdx);
    roadGeo.computeVertexNormals();
    const roadMat = new THREE.MeshStandardMaterial({ color: '#171412', roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(roadGeo, roadMat));

    // Glowing road edge rails & center racing line
    const buildLine = (offset: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 180; i++) {
        const t = i / 180;
        const p = roadCurve.getPointAt(t);
        const tan = roadCurve.getTangentAt(t).normalize();
        const right = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
        pts.push(p.clone().addScaledVector(right, offset).add(new THREE.Vector3(0, 0.12, 0)));
      }
      return new THREE.BufferGeometry().setFromPoints(pts);
    };
    const leftEdgeGeo = buildLine(-halfW + 0.15);
    const rightEdgeGeo = buildLine(halfW - 0.15);
    const centerGeo = buildLine(0);
    const edgeMat = new THREE.LineBasicMaterial({ color: '#e36d2b', transparent: true, opacity: 0.72 });
    const centerMat = new THREE.LineBasicMaterial({ color: '#f2a93b', transparent: true, opacity: 0.85 });
    scene.add(new THREE.Line(leftEdgeGeo, edgeMat), new THREE.Line(rightEdgeGeo, edgeMat), new THREE.Line(centerGeo, centerMat));

    // Two luminous light-stream racers speeding down the 3D circuit
    const racerGeo = new THREE.SphereGeometry(0.45, 12, 10);
    const racerMatA = new THREE.MeshBasicMaterial({ color: '#f2a93b' });
    const racerMatB = new THREE.MeshBasicMaterial({ color: '#e36d2b' });
    const racerA = new THREE.Mesh(racerGeo, racerMatA);
    const racerB = new THREE.Mesh(racerGeo, racerMatB);
    scene.add(racerA, racerB);

    // Floating atmospheric particles (valley embers / golden dust / summit frost)
    const pCount = 260;
    const pPositions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPositions[i * 3] = (Math.random() - 0.5) * 110;
      pPositions[i * 3 + 1] = Math.random() * 34 + 1;
      pPositions[i * 3 + 2] = 65 - Math.random() * 210;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const particleMat = new THREE.PointsMaterial({ color: '#f2a93b', size: 0.38, transparent: true, opacity: 0.52, depthWrite: false, blending: THREE.AdditiveBlending });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Scroll & pointer tracking (handles both .wildway.page-home scroll container & window fallback)
    const scrollEl = host.closest('.page-home') as HTMLElement | null;
    let targetScroll = 0;
    let smoothScroll = 0;
    let targetPointerX = 0;
    let targetPointerY = 0;
    let smoothPointerX = 0;
    let smoothPointerY = 0;

    const readScroll = () => {
      if (scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight + 20) {
        targetScroll = THREE.MathUtils.clamp(scrollEl.scrollTop / (scrollEl.scrollHeight - scrollEl.clientHeight), 0, 1);
      } else {
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        targetScroll = THREE.MathUtils.clamp(window.scrollY / max, 0, 1);
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      targetPointerX = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      targetPointerY = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    };
    const onResize = () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    readScroll();
    scrollEl?.addEventListener('scroll', readScroll, { passive: true });
    window.addEventListener('scroll', readScroll, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    const tmpColorA = new THREE.Color();
    const tmpColorB = new THREE.Color();
    const tmpTerrain = new THREE.Color();
    const tmpFog = new THREE.Color();
    const camPos = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();

    let rafId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      rafId = window.requestAnimationFrame(animate);
      if (document.visibilityState === 'hidden') return;
      const dt = Math.min(0.05, clock.getDelta());
      const elapsed = clock.elapsedTime;
      const lerpFactor = 1 - Math.exp(-dt * 5.5);
      smoothScroll += (targetScroll - smoothScroll) * lerpFactor;
      smoothPointerX += (targetPointerX - smoothPointerX) * lerpFactor;
      smoothPointerY += (targetPointerY - smoothPointerY) * lerpFactor;

      // Fly smoothly along the 3D valley curve as the user scrolls down
      const curveT = THREE.MathUtils.clamp(0.08 + smoothScroll * 0.68, 0.05, 0.82);
      const aheadT = Math.min(0.98, curveT + 0.14);
      const trackP = roadCurve.getPointAt(curveT);
      const aheadP = roadCurve.getPointAt(aheadT);

      const lateralSway = Math.sin(smoothScroll * Math.PI * 2.5) * 6.5 + smoothPointerX * 3.8;
      const camHeight = 11.5 - smoothScroll * 2.2 - smoothPointerY * 1.8;
      camPos.set(trackP.x + lateralSway, trackP.y + camHeight, trackP.z + 18);
      lookTarget.set(aheadP.x + smoothPointerX * 2.2, aheadP.y + 1.6, aheadP.z - 8);
      camera.position.lerp(camPos, 0.14);
      camera.lookAt(lookTarget);

      // Morph biome lighting & neon contour colors smoothly across Alpine -> Jungle -> Snow
      const scaled = smoothScroll * 2;
      const idxA = Math.min(1, Math.floor(scaled));
      const idxB = Math.min(2, idxA + 1);
      const mix = scaled - idxA;
      const pA = PALETTES[idxA], pB = PALETTES[idxB];

      tmpColorA.copy(pA.accent).lerp(pB.accent, mix);
      tmpColorB.copy(pA.secondary).lerp(pB.secondary, mix);
      tmpTerrain.copy(pA.terrain).lerp(pB.terrain, mix);
      tmpFog.copy(pA.fog).lerp(pB.fog, mix);

      wireMat.color.copy(tmpColorA);
      edgeMat.color.copy(tmpColorA);
      centerMat.color.copy(tmpColorB);
      terrainMat.color.copy(tmpTerrain);
      fog.color.copy(tmpFog);
      accentLight.color.copy(tmpColorA);
      accentLight.position.set(aheadP.x, aheadP.y + 9, aheadP.z);
      particleMat.color.copy(tmpColorB);

      // Move light-stream racers along the highway
      const rT1 = (elapsed * 0.065 + smoothScroll * 0.35) % 1;
      const rT2 = (elapsed * 0.048 + 0.45 + smoothScroll * 0.25) % 1;
      const rp1 = roadCurve.getPointAt(rT1);
      const rp2 = roadCurve.getPointAt(rT2);
      racerA.position.set(rp1.x - 0.8, rp1.y + 0.5, rp1.z);
      racerB.position.set(rp2.x + 0.9, rp2.y + 0.5, rp2.z);

      // Drift ambient particles
      particles.position.y = Math.sin(elapsed * 0.4) * 1.2;
      particles.rotation.y = elapsed * 0.012;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(rafId);
      scrollEl?.removeEventListener('scroll', readScroll);
      window.removeEventListener('scroll', readScroll);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      terrainGeo.dispose();
      terrainMat.dispose();
      wireMat.dispose();
      roadGeo.dispose();
      roadMat.dispose();
      leftEdgeGeo.dispose();
      rightEdgeGeo.dispose();
      centerGeo.dispose();
      edgeMat.dispose();
      centerMat.dispose();
      racerGeo.dispose();
      racerMatA.dispose();
      racerMatB.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [reducedMotion]);

  return <>
    <div ref={hostRef} className="wl-scroll-3d" aria-hidden="true" />
    <div className="wl-scroll-progress" aria-hidden="true"><span ref={progressRef} style={{ transform: 'scaleX(0)' }} /></div>
  </>;
}
