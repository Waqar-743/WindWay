export interface DrivingInput { throttle: boolean; brake: boolean; left: boolean; right: boolean; handbrake: boolean }
export const neutralInput = (): DrivingInput => ({ throttle: false, brake: false, left: false, right: false, handbrake: false });

export function driveVelocity(forward: number, lateral: number, input: DrivingInput, car: { topSpeed: number; acceleration: number; braking: number; grip: number; steering: number }, onRoad: boolean, grounded: boolean, dt: number) {
  const throttle = Number(input.throttle);
  let next = forward;
  if (input.brake) {
    next += forward > 0.5 ? -car.braking * dt : -car.acceleration * 0.45 * dt;
    if (forward > 0 && next < 0) next = 0;
  } else if (throttle) next += car.acceleration * dt * Math.max(0.05, 1 - Math.max(0, forward) / car.topSpeed);
  else next *= Math.exp(-dt * (grounded ? 0.3 : 0.02));
  if (!onRoad) next *= Math.exp(-dt * 0.55);
  if (input.handbrake) next *= Math.exp(-dt * 0.7);
  next = Math.max(-12, Math.min(car.topSpeed, next));
  const grip = grounded ? car.grip * (input.handbrake ? 0.17 : 1) * (onRoad ? 1 : 0.45) : 0.25;
  const nextLateral = lateral * Math.exp(-grip * dt);
  const steer = Number(input.left) - Number(input.right);
  const speedFactor = Math.min(1, Math.abs(next) / 9) * (1 - Math.min(0.65, Math.abs(next) / 100));
  const yawRate = steer * car.steering * speedFactor * Math.sign(next || 1) * (grounded ? 1 : 0.2);
  return { forward: next, lateral: nextLateral, yawRate, steer };
}

export function crossedGate(previous: { x: number; z: number }, current: { x: number; z: number }, gate: { point: { x: number; z: number }; tangent: { x: number; z: number } }, halfWidth = 9) {
  const before = (previous.x - gate.point.x) * gate.tangent.x + (previous.z - gate.point.z) * gate.tangent.z;
  const after = (current.x - gate.point.x) * gate.tangent.x + (current.z - gate.point.z) * gate.tangent.z;
  if (before > 0 || after < 0 || after <= before) return false;
  const blend = -before / (after - before);
  const x = previous.x + (current.x - previous.x) * blend - gate.point.x;
  const z = previous.z + (current.z - previous.z) * blend - gate.point.z;
  return Math.hypot(x, z) < halfWidth;
}

/** Called only after the next ordered gate has actually been crossed. */
export function advanceRaceGate(checkpoint: number, lap: number, totalLaps: number, closed = true, gateCount = 8) {
  if (!closed) return { checkpoint: Math.min(gateCount - 1, checkpoint + 1), lap: 1, finished: checkpoint + 1 >= gateCount - 1 };
  if (checkpoint < gateCount - 1) return { checkpoint: checkpoint + 1, lap, finished: false };
  return lap < totalLaps ? { checkpoint: 0, lap: lap + 1, finished: false }
    : { checkpoint: gateCount - 1, lap, finished: true };
}
