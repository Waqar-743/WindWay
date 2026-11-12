import { useGame } from './store';
import { LEVELS, levelById, levelFacts } from './levels';
import './levels.css';

export default function LevelSelector() {
  const mapId = useGame(state => state.selectedMap), selected = useGame(state => state.selectedLevel);
  const completed = useGame(state => state.completedLevels);
  const completions = completed[mapId] ?? [];
  const select = useGame(state => state.selectLevel), profile = levelById(selected), facts = levelFacts(mapId, selected);
  const snow = mapId === 'snow';
  return <fieldset className="level-picker" aria-label="Choose difficulty level">
    <legend>YOUR NEXT CHALLENGE</legend>
    <div className="level-heading"><div><strong>Level {selected} <span>/ {profile.name}</span></strong><p>{snow ? (selected === 0 ? 'Learn the mountain. Follow the ice warnings and the snow-block slalom.' : 'Tighter mountain ledges, more earned gates and the full snow-block slalom.') : profile.description}</p></div><small>{completions.length} / 6 completed</small></div>
    <div className="level-options">{LEVELS.map(level => <button key={level.id} type="button" aria-label={'Level ' + level.id + ': ' + level.name} aria-pressed={selected === level.id} onClick={() => select(level.id)}>
      <span className="level-number">{level.id}</span><span>{level.name}</span><small>{completions.includes(level.id) ? 'Completed ✓' : level.id === selected ? 'Selected' : 'Choose level'}</small>
    </button>)}</div>
    <p className="level-summary" role="status">{facts.gates} gates {snow ? 'to the summit' : 'each lap'} <i /> {facts.width.toFixed(1)} m {facts.narrows ? 'at the narrowest point' : 'road'} <i /> {facts.obstacles} {snow ? 'snow blocks' : 'slalom barriers'}</p>
    <p className="level-footnote">Choose any level. Earn every checkpoint in order. Your best time is saved separately for each level.</p>
  </fieldset>;
}
