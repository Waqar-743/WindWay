export const LEVELS = [
  { id: 0, name: 'Explorer', description: 'Learn the route on wide roads, with the original checkpoint course.', narrows: 0, slalom: 0, circuitWidth: 1, snowWidth: 1 },
  { id: 1, name: 'Cruise', description: 'One tighter section and your first marked slalom barrier.', narrows: 1, slalom: 1, circuitWidth: 0.86, snowWidth: 0.92 },
  { id: 2, name: 'Rally', description: 'Two narrow sections, alternating barriers and more checkpoints.', narrows: 2, slalom: 2, circuitWidth: 0.72, snowWidth: 0.84 },
  { id: 3, name: 'Precision', description: 'Read the bends, brake early and thread four slalom barriers.', narrows: 3, slalom: 4, circuitWidth: 0.63, snowWidth: 0.76 },
  { id: 4, name: 'Expert', description: 'Four tight sections and six barriers reward a clean racing line.', narrows: 4, slalom: 6, circuitWidth: 0.56, snowWidth: 0.68 },
  { id: 5, name: 'Master', description: 'The tightest roads, eight slalom barriers and every checkpoint to earn.', narrows: 5, slalom: 8, circuitWidth: 0.47, snowWidth: 0.6 },
] as const;
export function levelById(id: unknown) { return LEVELS.find(level => level.id === Number(id)) ?? LEVELS[0]; }
export let currentLevel: typeof LEVELS[number] = LEVELS[0];
export function activateLevel(id: unknown) { currentLevel = levelById(id); return currentLevel; }
export const NARROW_CENTERS = [0.18, 0.36, 0.53, 0.70, 0.86] as const;
export function checkpointCount(snow = false, level: unknown = currentLevel.id) { return (snow ? 17 : 8) + levelById(level).id * 2; }
export function levelFacts(mapId: string, level: unknown) {
  const profile = levelById(level), snow = mapId === 'snow';
  return { gates: checkpointCount(snow, profile.id) - (snow ? 1 : 0), width: snow ? 10 * profile.snowWidth : 14 * profile.circuitWidth,
    obstacles: snow ? 15 : profile.slalom, narrows: profile.narrows };
}
