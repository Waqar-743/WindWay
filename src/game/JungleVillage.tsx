import { memo, useMemo } from 'react';
import { TownBatch } from './AlpineTown';
import { buildJungleHouseParts } from './jungleSettlement';
import type { TownSite } from './alpineVillage';
export default memo(function JungleVillage({ sites }: { sites: TownSite[] }) {
  const parts = useMemo(() => buildJungleHouseParts(sites), [sites]);
  return <group name="canopy-village"><TownBatch parts={parts.boxes} kind="box" /><TownBatch parts={parts.roofs} kind="roof" /></group>;
});
