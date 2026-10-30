import * as THREE from 'three';
import { ALPINE_POINTS, setTrackLayout } from './track';
import { rebuildTrackBarriers } from './trackBarriers';
import { rebuildTrackFeatures } from './trackFeatures';
import { rebuildSnowCourse } from './snowCourse';

export interface GameMap {
  id: 'alpine' | 'jungle' | 'snow'; name: string; region: string; description: string;
  laps: number; pack: 'cartoon-pack' | 'jungle-pack' | 'snow-pack'; character: string;
  mode?: 'ascent';
  theme: { ink: string; paper: string; accent: string; leaf: string; sky: string; road: string; water: string };
  points: THREE.Vector3[];
}

export const GAME_MAPS: GameMap[] = [
  { id: 'alpine', name: 'The alpine loop', region: 'Windway Valley',
    description: 'A longer alpine escape through colorful village streets, hillside homes and a town station. Cross the river on timber bridges, pass the roadside fuel stop and take the golden boost jump.',
    laps: 1, pack: 'cartoon-pack', character: 'wild-haired-driver',
    theme: { ink: '#304c53', paper: '#faf3e5', accent: '#d87958', leaf: '#92af75', sky: '#b9daec', road: '#48545e', water: '#53abb7' },
    points: ALPINE_POINTS },
  { id: 'jungle', name: 'Canopy Run', region: 'Jungle Reserve',
    description: 'Two laps beneath a dense tropical canopy. Find the wildlife, cross jade rivers and launch from the marigold jump.',
    laps: 2, pack: 'jungle-pack', character: 'waqar',
    theme: { ink: '#153c35', paper: '#e9efda', accent: '#eac35a', leaf: '#287451', sky: '#b7d1b7', road: '#465e50', water: '#3b9a8e' },
    points: [[0, 1.2, 119], [90, 2.4, 120], [154, 3.5, 62], [123, 5, -10],
      [155, 4.2, -90], [75, 2.3, -146], [-14, 1.5, -113], [-105, 2.8, -147],
      [-156, 4.2, -60], [-114, 3.3, 21], [-147, 2, 93], [-55, 1.3, 137]]
      .map(([x, y, z]) => new THREE.Vector3(x, y, z)) },
  { id: 'snow', name: 'Frostbite Ascent', region: 'Whiteout Ridge',
    description: 'Windway’s expert route: a long one-way mountain climb, slippery ice, narrow switchbacks and physical snow-block slaloms. Earn every gate, then finish on the summit.',
    laps: 1, pack: 'snow-pack', character: 'snowman', mode: 'ascent',
    theme: { ink: '#263d52', paper: '#f3f8fb', accent: '#d47762', leaf: '#7aa7bf', sky: '#d9e8ef', road: '#688795', water: '#b9e1ed' },
    points: [[-280, 4, 650], [-80, 12, 620], [140, 22, 630], [310, 32, 540],
      [120, 44, 470], [-180, 56, 490], [-330, 66, 400], [-140, 77, 320], [180, 91, 330],
      [330, 104, 240], [100, 118, 160], [-200, 132, 180], [-320, 144, 80], [-70, 156, -10],
      [220, 171, 10], [340, 184, -90], [100, 198, -180], [-200, 212, -160], [-300, 226, -270],
      [-80, 240, -350], [180, 255, -330], [300, 268, -430], [80, 282, -520], [-160, 296, -500],
      [-240, 309, -610], [-40, 322, -690], [160, 337, -660], [220, 350, -760], [0, 365, -840], [-70, 365, -900]]
      .map(([x, y, z]) => new THREE.Vector3(x, y, z)) },
];

export const mapById = (id: string): GameMap => GAME_MAPS.find((map) => map.id === id) ?? GAME_MAPS[0];
// Keep pre-existing alpine records readable, with a separate namespace for new maps.
export const gameRecordKey = (mapId: string, carId: string) => mapId === 'alpine' ? carId : `${mapId}:${carId}`;
export let currentMap: GameMap = GAME_MAPS[0];
export function activateMap(id: string) {
  currentMap = mapById(id);
  setTrackLayout(currentMap.points, currentMap.mode === 'ascent' ? { closed: false, width: 10, segments: 1200, gates: 17 } : currentMap.id === 'alpine' ? { segments: 720 } : {});
  rebuildTrackFeatures();
  rebuildTrackBarriers();
  rebuildSnowCourse();
  return currentMap;
}
