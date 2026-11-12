import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useProgress } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import CarVisual from './CarVisual';
import World from './World';
import JungleWorld from './JungleWorld';
import SnowWorld from './SnowWorld';
import { currentMap, mapById } from './maps';
import Vehicle, { ChaseCamera, DrivingEffects } from './Vehicle';
import { useGame } from './store';
import { START } from './track';
import { vehicleFrame } from './runtime';
import { getRenderQuality } from '../utils/renderQuality';
import ViewerErrorBoundary from '../components/PanoramicViewer/ViewerErrorBoundary';
import TrackLoader from './TrackLoader';
import { isNativeGame } from './mobileBridge';
import { mobileResolution } from './mobilePerformance';
import SceneAtmosphere from './SceneAtmosphere';

function MobileResolution({ maximum }: { maximum: number }) {
  const setDpr = useThree((state) => state.setDpr);
  const getRendererState = useThree((state) => state.get);
  const quality = useGame((state) => state.settings.quality);
  const sample = useRef({ warmup: 0, seconds: 0, frames: 0, healthy: 0 });
  useEffect(() => { sample.current = { warmup: 0, seconds: 0, frames: 0, healthy: 0 }; if (quality === 'auto') setDpr(maximum); }, [quality, setDpr, maximum]);
  useFrame((_, delta) => {
    const state = useGame.getState(), value = sample.current;
    if (state.settings.quality !== 'auto' || state.status !== 'running') {
      value.seconds = 0; value.frames = 0; return;
    }
    value.warmup += delta;
    if (value.warmup < 4) return;
    value.seconds += delta; value.frames++;
    if (value.seconds < 2) return;
    const currentDpr = getRendererState().viewport.dpr;
    const next = mobileResolution(currentDpr, value.frames / value.seconds, value.healthy, maximum, 0.8);
    value.seconds = 0; value.frames = 0; value.healthy = next.healthyWindows;
    if (next.dpr !== currentDpr) setDpr(next.dpr);
  });
  return null;
}

function Sunlight({ shadows, shadowMapSize }: { shadows: boolean; shadowMapSize: number }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const state = useGame.getState();
    const p = state.page === 'race' || state.page === 'results' ? vehicleFrame.position : START.point;
    target.position.copy(p); target.updateMatrixWorld();
    light.current?.position.set(p.x + 35, p.y + 65, p.z + 24);
  });
  return <>
    <hemisphereLight args={[currentMap.id === 'snow' ? '#cce4f7' : currentMap.id === 'jungle' ? '#b8e0d2' : '#c4dff2', currentMap.id === 'snow' ? '#5a7894' : currentMap.id === 'jungle' ? '#244b35' : '#7b9468', currentMap.id === 'alpine' ? 1.08 : 0.92]} />
    <directionalLight position={[-34, 24, -52]} color={currentMap.id === 'snow' ? '#9bc8e8' : currentMap.id === 'jungle' ? '#7ec4a8' : '#96c2e3'} intensity={0.52} />
    <directionalLight ref={light} target={target} color={currentMap.id === 'snow' ? '#fff6e5' : '#ffefd2'} intensity={3.05} castShadow={shadows}
      shadow-mapSize={[shadowMapSize, shadowMapSize]} shadow-camera-left={-28} shadow-camera-right={28}
      shadow-camera-top={28} shadow-camera-bottom={-28} shadow-camera-near={1} shadow-camera-far={150}
      shadow-bias={-0.0002} shadow-normalBias={0.04} shadow-radius={2.4} />
    <primitive object={target} />
  </>;
}

function Showcase() {
  const page = useGame((state) => state.page);
  const selectedCar = useGame((state) => state.selectedCar); const paint = useGame((state) => state.paint);
  const { camera, invalidate } = useThree(); const transitioning = useRef(true);
  const desired = useRef(new THREE.Vector3()); const target = useRef(START.point.clone().add(new THREE.Vector3(0, 0.6, 0)));
  const ready = useCallback(() => useGame.getState().setReady(true), []);
  useEffect(() => {
    desired.current.copy(START.point).add(new THREE.Vector3(page === 'garage' ? 8.2 : 12, page === 'garage' ? 3.6 : 7, page === 'garage' ? 6.5 : 17));
    transitioning.current = true;
    if (camera instanceof THREE.PerspectiveCamera) { camera.fov = 40; camera.updateProjectionMatrix(); }
    invalidate();
  }, [page, camera, invalidate]);
  useFrame((_, delta) => {
    if (transitioning.current) {
      camera.position.lerp(desired.current, 1 - Math.exp(-Math.min(delta, 0.05) * 5)); camera.lookAt(target.current);
      if (camera.position.distanceTo(desired.current) < 0.04) transitioning.current = false;
    }
  });
  return <>
    <group position={[START.point.x, START.point.y + 0.04, START.point.z]} rotation={[0, START.yaw, 0]}>
      {page === 'garage' && <>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
          <ringGeometry args={[3.15, 3.35, 64]} />
          <meshBasicMaterial color={paint} transparent opacity={0.65} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
          <circleGeometry args={[3.15, 64]} />
          <meshStandardMaterial color="#1e2d28" roughness={0.45} metalness={0.25} transparent opacity={0.38} />
        </mesh>
      </>}
      <CarVisual carId={selectedCar} paint={paint} onReady={ready} />
    </group>
    <OrbitControls target={target.current} enabled={page === 'garage'} autoRotate={page === 'garage'} autoRotateSpeed={0.45} enablePan={false} enableDamping dampingFactor={0.08} minDistance={6.2} maxDistance={22} minPolarAngle={0.28} maxPolarAngle={Math.PI / 2.08} />
  </>;
}

function ContextMonitor() {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); useGame.getState().pause(); useGame.getState().setError('The graphics engine needs a fresh start. Your saved cars and records are safe.'); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => gl.domElement.removeEventListener('webglcontextlost', lost);
  }, [gl]);
  return null;
}

function SceneLoading() {
  const ready = useGame((state) => state.ready); const error = useGame((state) => state.error);
  const page = useGame((state) => state.page), reducedMotion = useGame((state) => state.settings.reducedMotion);
  const selectedMap = useGame((state) => state.selectedMap); const map = mapById(selectedMap);
  const progress = useProgress((state) => state.progress);
  // The race has its own compact loader in the edge HUD; never cover its center.
  if (ready || error || page === 'race') return null;
  return <div className="scene-loadscreen"><TrackLoader label={`Getting ${map.region} ready`} progress={progress} reducedMotion={reducedMotion} /></div>;
}

export default function GameScene({ attempt }: { attempt: number }) {
  const page = useGame((state) => state.page); const status = useGame((state) => state.status);
  const returnPage = useGame((state) => state.returnPage); const runId = useGame((state) => state.runId);
  const quality = useGame((state) => state.settings.quality);
  const selectedMap = useGame((state) => state.selectedMap); const map = mapById(selectedMap);
  const device = useMemo(getRenderQuality, []);
  const native = isNativeGame();
  const low = quality === 'low' || (quality === 'auto' && device.dpr[1] <= 1.15);
  const shadows = quality === 'high' || (quality === 'auto' && device.shadows);
  const maximumDpr = quality === 'high' ? 1.5 : quality === 'low' ? 1 : device.dpr[1];
  const racing = page === 'race' || page === 'results' || (['settings', 'howto'].includes(page) && returnPage === 'race' && status === 'paused');
  const error = useCallback((issue: Error) => useGame.getState().setError(issue.message || 'The valley could not load. Please try again.'), []);
  return <><ViewerErrorBoundary key={`${attempt}-${selectedMap}`} resetKey={`${attempt}-${selectedMap}`} onError={error}>
    <Canvas
      shadows={shadows} dpr={quality === 'low' ? 1 : [1, maximumDpr]}
      frameloop={['paused', 'recovering'].includes(status) || ['map', 'settings', 'howto', 'results'].includes(page) ? 'demand' : 'always'}
      camera={{ fov: 42, near: 0.1, far: map.id === 'snow' ? 4500 : map.id === 'alpine' ? 1200 : 900, position: [START.point.x + 12, START.point.y + 7, START.point.z + 17] }}
      gl={{ antialias: quality === 'high' || device.antialias, powerPreference: 'high-performance', stencil: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.95 }}
    >
      <SceneAtmosphere mapId={map.id} />
      <ContextMonitor />{native && <MobileResolution maximum={maximumDpr} />}<Sunlight shadows={shadows} shadowMapSize={quality === 'high' ? 1024 : device.shadowMapSize} />
      <Suspense fallback={null}>
        <Physics gravity={[0, -18, 0]} timeStep={1 / 60} paused={status !== 'running'} interpolate>
          {map.id === 'snow' ? <SnowWorld low={low} /> : map.id === 'jungle' ? <JungleWorld low={low} /> : <World low={low} />}
          {racing ? <Vehicle key={runId} /> : <Showcase />}
        </Physics>
        {racing && <><ChaseCamera key={`camera-${runId}`} /><DrivingEffects key={`effects-${runId}`} /></>}
      </Suspense>
    </Canvas>
  </ViewerErrorBoundary><SceneLoading /></>;
}
