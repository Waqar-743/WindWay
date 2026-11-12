import { Suspense, useCallback, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import CarVisual from './CarVisual';
import ViewerErrorBoundary from '../components/PanoramicViewer/ViewerErrorBoundary';

/** A demand-rendered local showroom; it unmounts before a drive begins. */
export default function MobileShowroom({ carId, paint, interactive = false }: { carId: string; paint: string; interactive?: boolean }) {
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const loaded = useCallback(() => setReady(true), []);
  const unavailable = useCallback(() => setFailed(true), []);
  return <div className={`wwa-showroom ${interactive ? 'wwa-showroom-interactive' : ''}`} aria-label="Your selected racing car in 3D">
    {(!ready || failed) && <img className="wwa-preview-fallback" src={`${import.meta.env.BASE_URL}cartoon-pack/formula-racer.svg`} alt="" />}
    <ViewerErrorBoundary resetKey={carId} onError={unavailable}>
      {!failed && <Canvas frameloop="demand" dpr={[1, 1.5]} shadows camera={{ position: [8.4, 3.5, 8.2], fov: 36, near: .1, far: 50 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power', stencil: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        fallback={<span className="wwa-preview-note">3D preview unavailable on this device</span>}>
        <ambientLight intensity={.7} />
        <hemisphereLight args={['#d8e9f5', '#182a34', 1]} />
        <directionalLight position={[4, 7, 3]} intensity={3.2} color="#fff2de" castShadow shadow-mapSize={[512, 512]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-normalBias={.04} />
        <directionalLight position={[-5, 3, -4]} intensity={1.8} color="#a3c7da" />
        <Suspense fallback={null}>
          <Environment resolution={128} frames={1}>
            <Lightformer intensity={3} position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[12, 4, 1]} />
            <Lightformer intensity={2} color="#9dc0d7" position={[-5, 2, 0]} rotation={[0, Math.PI / 2, 0]} scale={[8, 3, 1]} />
            <Lightformer intensity={2} color="#f2d1a6" position={[5, 3, -2]} rotation={[0, -Math.PI / 2, 0]} scale={[5, 3, 1]} />
          </Environment>
          <group rotation={[0, -.25, 0]}><CarVisual carId={carId} paint={paint} onReady={loaded} /></group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.025, 0]} receiveShadow><planeGeometry args={[80, 80]} /><shadowMaterial opacity={.4} transparent /></mesh>
        </Suspense>
        <OrbitControls target={[0, .5, 0]} enabled={interactive} enablePan={false} enableZoom={false} minPolarAngle={.4} maxPolarAngle={Math.PI / 2.15} />
      </Canvas>}
    </ViewerErrorBoundary>
    {(!ready || failed) && <span className="wwa-preview-note" role="status">{failed ? 'Car preview unavailable. You can still choose and drive.' : 'Preparing your car…'}</span>}
    {ready && interactive && <span className="wwa-preview-hint">Drag the car to look around</span>}
  </div>;
}
