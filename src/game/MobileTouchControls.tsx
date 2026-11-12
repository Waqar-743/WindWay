import { useEffect, useRef, useState } from 'react';
import { clearInput, drivingInput } from './input';
import { useMobileConfig } from './mobileBridge';
import type { DrivingInput } from './driving';
import { useGame } from './store';

export function MobileIcon({ name }: { name: 'stop' | 'camera' | 'recover' | 'pause' | 'play' | 'left' | 'right' | 'pedal' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'stop' ? <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
      : name === 'pause' ? <><path d="M8 5v14M16 5v14" strokeWidth="4" /></>
      : name === 'play' ? <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />
      : name === 'camera' ? <><path d="M8 7 10 4h4l2 3h4v13H4V7Z" /><circle cx="12" cy="13" r="3.3" /></>
      : name === 'recover' ? <><path d="M4 10a8 8 0 1 1 1.5 8M4 4v6h6" /></>
      : name === 'left' ? <path d="m14 5-7 7 7 7" strokeWidth="2.5" />
      : name === 'right' ? <path d="m10 5 7 7-7 7" strokeWidth="2.5" />
      : <><rect x="7" y="3" width="10" height="18" rx="3" /><path d="M10 7h4M10 11h4M10 15h4" /></>}
  </svg>;
}

export function MobileDriverBadge() {
  const { character } = useMobileConfig();
  const status = useGame((state) => state.status);
  const camera = useGame((state) => state.cameraMode);
  const pack = character === 'snowman' ? 'snow-pack' : 'jungle-pack';
  return <div className="mobile-driver-badge" aria-label="Drive controls">
    <button className="mobile-stop" aria-label="Stop drive and save checkpoint" onClick={() => window.WindwayMobile?.command('menu')}><span className="mobile-control-mark"><MobileIcon name="stop" /><span>STOP</span></span></button>
    <button aria-label={`Switch to ${camera === 'chase' ? 'hood' : 'chase'} camera`} disabled={status !== 'running'} onClick={() => window.WindwayMobile?.command('camera')}><MobileIcon name="camera" /></button>
    <button aria-label="Recover car to the last checkpoint" disabled={status !== 'running'} onClick={() => window.WindwayMobile?.command('recover')}><MobileIcon name="recover" /></button>
    <img src={`${import.meta.env.BASE_URL}${pack}/${character}.svg`} alt={`${character} driving companion`} width="32" height="32" />
  </div>;
}

function Pedal({ action, children, label, className = '' }: { action: Exclude<keyof DrivingInput, 'steering'>; children: React.ReactNode; label: string; className?: string }) {
  const [pressed, setPressed] = useState(false);
  const release = () => { drivingInput[action] = false; setPressed(false); };
  useEffect(() => () => { drivingInput[action] = false; }, [action]);
  return <button className={`touch-button ${className}`} aria-label={label} aria-pressed={pressed}
    onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drivingInput[action] = true; setPressed(true); }}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onContextMenu={(event) => event.preventDefault()}><span className="mobile-control-mark">{children}</span></button>;
}
function SteeringWheel() {
  const { sensitivity } = useMobileConfig();
  const wheel = useRef<SVGSVGElement>(null), lastAngle = useRef(0), total = useRef(0), active = useRef<number | null>(null);
  const angle = (event: React.PointerEvent<HTMLDivElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2); };
  const release = () => { active.current = null; total.current = 0; delete drivingInput.steering; if (wheel.current) { wheel.current.style.transform = 'rotate(0deg)'; wheel.current.parentElement?.setAttribute('aria-valuenow', '0'); } };
  useEffect(() => release, []);
  return <div className="mobile-wheel" role="slider" tabIndex={0} aria-label="Steering wheel. Drag to turn; release to center." aria-valuemin={-1} aria-valuemax={1} aria-valuenow={0}
    onPointerDown={(event) => { event.preventDefault(); active.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); lastAngle.current = angle(event); }}
    onPointerMove={(event) => {
      if (active.current !== event.pointerId) return;
      const next = angle(event); let delta = next - lastAngle.current;
      if (delta > Math.PI) delta -= 2 * Math.PI; if (delta < -Math.PI) delta += 2 * Math.PI;
      lastAngle.current = next; total.current = Math.max(-1.92, Math.min(1.92, total.current + delta));
      drivingInput.steering = Math.max(-1, Math.min(1, -total.current / 1.92 * sensitivity));
      event.currentTarget.setAttribute('aria-valuenow', drivingInput.steering.toFixed(2));
      if (wheel.current) wheel.current.style.transform = `rotate(${total.current}rad)`;
    }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
    onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); drivingInput.steering = event.key === 'ArrowLeft' ? 0.7 : -0.7; } }} onKeyUp={release} onBlur={release}>
    <svg ref={wheel} viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="none" stroke="var(--hud-text)" strokeOpacity=".9" strokeWidth="7" /><path d="M16 40h68M50 50v35" stroke="var(--hud-text)" strokeOpacity=".8" strokeWidth="7" /><circle cx="50" cy="48" r="13" fill="none" stroke="var(--hud-text)" strokeWidth="2" /><path d="M50 10v7" stroke="var(--hud-accent)" strokeWidth="5" /></svg>
  </div>;
}
export default function MobileTouchControls() {
  const { steeringMode } = useMobileConfig();
  useEffect(() => () => clearInput(), [steeringMode]);
  return <div className={`touch-controls mobile-controls mobile-controls-${steeringMode}`}>
    <div className="mobile-steering-cluster">
      <Pedal action="handbrake" label="Hold handbrake" className="touch-drift">DRIFT</Pedal>
      {steeringMode === 'wheel' ? <SteeringWheel /> : steeringMode === 'tilt' ? <div className="mobile-tilt-controls"><span>TILT TO STEER</span><button className="touch-button" onClick={() => window.WindwayMobile?.command('calibrate')}><span className="mobile-control-mark">CENTER PHONE</span></button></div> : <div className="mobile-arrow-controls"><Pedal action="left" label="Steer left"><MobileIcon name="left" /></Pedal><Pedal action="right" label="Steer right"><MobileIcon name="right" /></Pedal></div>}
    </div>
    <div className="touch-pedals"><Pedal action="brake" label="Brake or reverse" className="touch-brake"><MobileIcon name="pedal" /><span>BRAKE</span></Pedal><Pedal action="throttle" label="Accelerate" className="touch-throttle"><MobileIcon name="pedal" /><span>GO</span></Pedal></div>
  </div>;
}
