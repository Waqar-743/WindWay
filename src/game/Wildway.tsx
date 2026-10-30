import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame, type Page } from './store';
import { GAME_CARS, PAINTS, art, carById, formatTime } from './config';
import { GAME_MAPS, gameRecordKey, mapById } from './maps';
import { CHECKPOINTS, MAP_PATH, START, TRACK_LENGTH, trackMapPoint } from './track';
import { SNOW_HURDLES, SNOW_ICE_ZONES } from './snowCourse';
import { clearInput, drivingInput, installDrivingInput } from './input';
import { gameAudio } from './audio';
import type { DrivingInput } from './driving';
import ViewerErrorBoundary from '../components/PanoramicViewer/ViewerErrorBoundary';
import TrackLoader from './TrackLoader';
import LandingStory from './LandingStory';
import './wildway.css';
import './race-hud.css';

const GameScene = lazy(() => import('./GameScene'));

const JUNGLE_ART = new Set(['lion', 'giraffe', 'deer', 'python', 'horse', 'wolf', 'monkey', 'toucan', 'elephant', 'waqar', 'imran', 'tatheer', 'broadleaf-tree', 'palm-tree', 'jungle-badge', 'lap-badge', 'stop-station', 'boost-ramp']);
const THEMED_ART = new Set(['finish-flag', 'track-minimap', 'winner-trophy', 'checkpoint']);
const SNOW_ART = new Set(['snowman', 'snowy-tree', 'snowy-mountain', 'ice-patch', 'ice-warning', 'snowbank', 'snow-boulder', 'slalom-gate', 'summit-flag', 'summit-trophy', 'mountain-hut', 'route-badge', 'wind-gust', 'snowflake', 'arctic-fox', 'penguin']);
function Art({ name, className = '', alt = '' }: { name: string; className?: string; alt?: string }) {
  const selectedMap = useGame((state) => state.selectedMap), jungle = selectedMap === 'jungle', snow = selectedMap === 'snow';
  const snowAliases: Record<string, string> = { 'wild-haired-driver': 'snowman', 'crying-driver': 'snowman', 'finish-flag': 'summit-flag', 'winner-trophy': 'summit-trophy', 'mountain-range': 'snowy-mountain', 'pine-tree': 'snowy-tree', 'eagle-soaring': 'arctic-fox' };
  const resolvedName = snow ? snowAliases[name] ?? name : name === 'jungle-tree' ? 'broadleaf-tree' : jungle && name === 'wild-haired-driver' ? 'waqar' : jungle && name === 'crying-driver' ? 'tatheer' : name;
  const source = SNOW_ART.has(resolvedName) || (snow && THEMED_ART.has(resolvedName)) ? `${import.meta.env.BASE_URL}snow-pack/${resolvedName}.svg` : JUNGLE_ART.has(resolvedName) || (jungle && THEMED_ART.has(resolvedName)) ? `${import.meta.env.BASE_URL}jungle-pack/${resolvedName}.svg` : art(resolvedName);
  return <img className={className} src={source} alt={alt} draggable={false} />;
}
function Brand({ light = false }: { light?: boolean }) {
  const jungle = useGame((state) => state.selectedMap === 'jungle');
  const snow = useGame((state) => state.selectedMap === 'snow');
  return <button className={`brand ${light ? 'brand-light' : ''}`} onClick={() => useGame.getState().navigate('home')} aria-label="Windway home"><Art name={snow ? 'route-badge' : jungle ? 'jungle-badge' : 'vehicle-badge'} /><span>WINDWAY<small>TAKE THE LONG WAY.</small></span></button>;
}
function StartButton({ children = 'Let’s drive', className = '' }: { children?: React.ReactNode; className?: string }) {
  return <button className={`ww-button ww-primary ${className}`} onClick={() => { void gameAudio.unlock(); useGame.getState().startRace(); }}>{children}<span aria-hidden="true">↗</span></button>;
}
function PageTitle({ children, eyebrow }: { children: React.ReactNode; eyebrow: string }) {
  return <div className="page-title-block"><p className="ww-eyebrow">{eyebrow}</p><h1 className="page-title" data-page-title tabIndex={-1}>{children}</h1></div>;
}
function BackButton({ to = 'home', label = 'Back to the start' }: { to?: Page; label?: string }) {
  return <button className="back-link" onClick={() => useGame.getState().navigate(to)}>← {label}</button>;
}

function Header() {
  const page = useGame((state) => state.page);
  return <header className="ww-header"><Brand /><nav aria-label="Main navigation">
    {([{ page: 'garage', text: 'The garage' }, { page: 'map', text: 'The maps' }, { page: 'howto', text: 'How to play' }, { page: 'settings', text: 'Settings' }] as const).map((link) => <button key={link.page} aria-current={page === link.page ? 'page' : undefined} onClick={() => useGame.getState().navigate(link.page)}>{link.text}</button>)}
  </nav><span className="header-edition">THREE WORLDS. <i /> ONE WINDWAY.</span></header>;
}

function MapSelector({ compact = false }: { compact?: boolean }) {
  const selected = useGame((state) => state.selectedMap);
  const selectMap = useGame((state) => state.selectMap);
  return <fieldset className={`map-selector ${compact ? 'map-selector-compact' : ''}`}><legend>Choose your road</legend><div>{GAME_MAPS.map((map, index) => <button key={map.id} type="button" aria-pressed={selected === map.id} onClick={() => selectMap(map.id)}><img src={`${import.meta.env.BASE_URL}${map.pack}/${map.id === 'snow' ? 'route-badge' : map.id === 'jungle' ? 'jungle-badge' : 'mountain-range'}.svg`} alt="" draggable={false} /><span><strong>{map.name}</strong><small>{map.mode === 'ascent' ? 'Expert · Summit climb' : `${map.id === 'jungle' ? 'Dense jungle' : 'Mountain valley'} · ${map.laps} ${map.laps === 1 ? 'lap' : 'laps'}`}</small></span><i aria-hidden="true">{selected === map.id ? '✓' : `0${index + 1}`}</i></button>)}</div></fieldset>;
}

function Home() {
  const reducedMotion = useGame((state) => state.settings.reducedMotion);
  const selectedMap = useGame((state) => state.selectedMap);
  const car = carById(useGame((state) => state.selectedCar));
  const startMap = (id: string) => {
    const game = useGame.getState();
    if (game.status !== 'idle' && game.status !== 'finished') return;
    game.selectMap(id);
    void gameAudio.unlock();
    useGame.getState().startRace();
  };
  return <LandingStory selectedMap={selectedMap} selectedCarName={car.name} reducedMotion={reducedMotion}
    onChooseMap={(id) => useGame.getState().selectMap(id)} onStartMap={startMap}
    onExploreMap={(id) => { const game = useGame.getState(); game.selectMap(id); game.navigate('map'); }}
    onGarage={() => useGame.getState().navigate('garage')} />;
}

function Garage() {
  const { selectedCar, paint, selectCar, setPaint } = useGame(useShallow((state) => ({ selectedCar: state.selectedCar, paint: state.paint, selectCar: state.selectCar, setPaint: state.setPaint })));
  const car = carById(selectedCar);
  return <main className="garage-page">
    <div className="garage-heading"><BackButton /><PageTitle eyebrow="THE GARAGE / TWO VERY DIFFERENT ATTITUDES">Pick your kind<br />of <em>trouble.</em></PageTitle></div>
    <div className="garage-scene-label"><span>0{GAME_CARS.findIndex((item) => item.id === car.id) + 1} / {car.nickname}</span><span>Drag to look around · Scroll to zoom</span></div>
    <aside className="garage-panel" aria-label="Car selection and customization">
      <div className="car-options">{GAME_CARS.map((item) => <button key={item.id} aria-pressed={car.id === item.id} className={car.id === item.id ? 'selected' : ''} onClick={() => selectCar(item.id)}><span className="car-option-number">{item.number}</span><span><strong>{item.name}</strong><small>{item.nickname}</small></span><i>{car.id === item.id ? '✓' : '↗'}</i></button>)}</div>
      <div className="car-story"><span className="ww-eyebrow">YOUR PARTNER IN THE NONSENSE</span><h2>{car.nickname}.</h2><p>{car.description}</p></div>
      <dl className="car-stats"><div><dt>Top speed</dt><dd>{Math.round(car.topSpeed * 3.6)}<small> km/h</small></dd><span><i style={{ width: `${car.topSpeed / 55 * 100}%` }} /></span></div><div><dt>Acceleration</dt><dd>{car.acceleration}<small> m/s²</small></dd><span><i style={{ width: `${car.acceleration / 18 * 100}%` }} /></span></div><div><dt>Grip response</dt><dd>{car.grip}<small> / 12</small></dd><span><i style={{ width: `${car.grip / 12 * 100}%` }} /></span></div></dl>
      <fieldset className="paint-picker"><legend>A little color goes a long way <span>{PAINTS.find((item) => item.hex === paint)?.name}</span></legend><div>{PAINTS.map((item) => <button key={item.hex} aria-label={`Paint ${item.name}`} aria-pressed={paint === item.hex} style={{ backgroundColor: item.hex }} onClick={() => setPaint(item.hex)}>{paint === item.hex ? <span>✓</span> : null}</button>)}</div></fieldset>
      <StartButton>Take it for a spin</StartButton><p className="garage-footnote">Three roads. Three very different feelings.</p>
    </aside>
  </main>;
}

function TrackMap({ live = false }: { live?: boolean }) {
  const map = mapById(useGame((state) => state.selectedMap));
  const x = useGame((state) => live ? state.telemetry.x : START.point.x); const z = useGame((state) => live ? state.telemetry.z : START.point.z);
  const checkpoint = useGame((state) => live ? state.telemetry.checkpoint : 0);
  const jungle = map.id === 'jungle';
  if (map.mode === 'ascent') return <SnowTrackMap x={x} z={z} live={live} checkpoint={checkpoint} />;
  return <svg viewBox="0 0 200 200" className="track-map" role="img" aria-label={live ? `Live ${map.name} minimap showing your position` : `${map.name} circuit map with eight gates`}>
    {jungle && <g fill={map.theme.leaf} opacity=".25">{[[24,28],[49,18],[89,38],[147,28],[172,69],[23,145],[54,177],[112,156],[159,174]].map(([cx,cy],i) => <circle key={i} cx={cx} cy={cy} r={i % 2 ? 11 : 15} />)}</g>}
    <path d={jungle ? 'M19 89q37 25 74 4t88 8' : 'M10 96q50-17 90 5t90-5'} fill="none" stroke={jungle ? map.theme.water : '#9dcbd0'} opacity={jungle ? .7 : 1} strokeWidth={live ? 15 : 19} />
    <path d={MAP_PATH} fill="none" stroke={map.theme.road} strokeWidth={live ? 8 : 9} strokeLinejoin="round" />
    <path d={MAP_PATH} fill="none" stroke={map.theme.paper} strokeWidth="1" strokeDasharray="3 4" />
    {CHECKPOINTS.map(({ point }, index) => { const p = trackMapPoint(point.x, point.z); return <circle key={index} cx={p.x} cy={p.y} r={live ? 2.8 : 4.5} fill={index === 0 ? map.theme.accent : index <= checkpoint ? map.theme.leaf : map.theme.paper} stroke={map.theme.ink} strokeWidth="1" />; })}
    {live ? <circle cx={trackMapPoint(x, z).x} cy={trackMapPoint(x, z).y} r="4.5" fill={map.theme.accent} stroke={map.theme.paper} strokeWidth="2" /> : <><text x="112" y="181" fontSize="6" fontWeight="700" fill={map.theme.ink}>START / FINISH</text><text x="13" y="100" fontSize="5" fill={map.theme.ink} transform="rotate(-6 13 100)">{jungle ? 'CANOPY CREEK' : 'RIVER CROSSING'}</text></>}
  </svg>;
}

function Valley() {
  const map = mapById(useGame((state) => state.selectedMap)); const jungle = map.id === 'jungle';
  if (map.mode === 'ascent') return <SnowMapPage />;
  return <main className="sheet-page valley-page"><div className="map-page-top"><BackButton label="Back to the start" /><MapSelector /></div><div className="valley-layout"><div className="map-art-column"><div className="valley-art"><Art name={jungle ? 'jungle-tree' : 'mountain-range'} className="map-mountain" /><TrackMap /><Art name={jungle ? 'jungle-tree' : 'pine-tree'} className="map-pine" /><Art name={jungle ? 'giraffe' : 'mountain-goat'} className="map-goat" /><span className="map-tag">{jungle ? 'PLEASE DO NOT RACE THE WILDLIFE.' : 'YOU ARE HERE FOR A GOOD TIME.'}</span></div>{jungle && <div className="jungle-field-notes"><p className="ww-eyebrow">THE LOCALS / KEEP A RESPECTFUL DISTANCE</p><div className="wildlife-line">{['lion','giraffe','deer','python','horse','wolf'].map((animal) => <figure key={animal}><Art name={animal} alt={`Cartoon ${animal}`} /><figcaption>{animal}</figcaption></figure>)}</div><div className="jungle-crew"><span>YOUR<br /><b>ROAD CREW</b></span>{['waqar','imran','tatheer'].map((name) => <figure key={name}><Art name={name} alt={`${name.toUpperCase()} cartoon character`} /><figcaption>{name.toUpperCase()}</figcaption></figure>)}</div></div>}</div><div className="valley-copy"><PageTitle eyebrow={jungle ? 'MAP 02 / A ROAD THROUGH THE GREEN.' : 'MAP 01 / PLENTY OF WAYS TO MISBEHAVE.'}>{jungle ? <>Canopy<br /><em>Run.</em></> : <>The alpine<br /><em>loop.</em></>}</PageTitle><p>{map.description}</p><div className="track-facts"><div><strong>{(TRACK_LENGTH / 1000).toFixed(2)}<small>km</small></strong><span>PER LOOP</span></div><div><strong>08</strong><span>GATES EACH LAP</span></div><div><strong>{String(map.laps).padStart(2, '0')}</strong><span>{map.laps === 1 ? 'LAP' : 'LAPS'} TO MAKE IT COUNT</span></div></div><ul className="valley-features"><li><Art name={jungle ? 'stop-station' : 'wooden-bridge'} /><span><strong>{jungle ? 'A roadside breather' : 'Two river crossings'}</strong>{jungle ? 'Find the ranger stop station tucked beside the road. The racing line stays clear.' : 'Keep it on the timber. The river is not a shortcut.'}</span></li><li><Art name={jungle ? 'boost-ramp' : 'jump-ramp'} /><span><strong>A little extra airtime</strong>Drive forward over the {jungle ? 'marigold' : 'orange'} on-road boost ramp for a speed surge and a short flight back onto the circuit.</span></li><li><Art name={jungle ? 'waqar' : 'eagle-soaring'} /><span><strong>{jungle ? 'Trees. Then more trees.' : 'A road through the village'}</strong>{jungle ? 'A close, leafy canopy, tiny clearings, six animal characters, and WAQAR, IMRAN, and TATHEER along the route.' : 'Colorful houses, cafe awnings, a railway station and a roadside fuel stop. The longer loop runs between them.'}</span></li></ul><div className="map-race-kit"><Art name="finish-flag" /><Art name="checkpoint" /><Art name={jungle ? 'lap-badge' : 'track-minimap'} /><Art name="winner-trophy" /><span>{map.laps} {map.laps === 1 ? 'lap' : 'laps'}. Ordered gates.<br />One finish worth earning.</span></div><StartButton>Meet me at the start</StartButton></div></div></main>;
}

function SnowTrackMap({ x, z, live, checkpoint }: { x: number; z: number; live: boolean; checkpoint: number }) {
  const player = trackMapPoint(x, z), finish = trackMapPoint(CHECKPOINTS[CHECKPOINTS.length - 1].point.x, CHECKPOINTS[CHECKPOINTS.length - 1].point.z);
  return <svg viewBox="0 0 200 200" className="track-map" role="img" aria-label={live ? 'Live Frostbite Ascent minimap from base camp to summit' : 'Frostbite Ascent route with fifteen checkpoints and a summit finish'}>
    <path d="m11 74 28-27 26 27 33-54 39 54 27-32 27 32v112H11z" fill="#d5e5ee" />
    <path d={MAP_PATH} fill="none" stroke="#527485" strokeWidth={live ? 5.5 : 6.5} strokeLinejoin="round" strokeLinecap="round" />
    <path d={MAP_PATH} fill="none" stroke="#f3f8fb" strokeWidth="1" strokeDasharray="2 3" />
    {CHECKPOINTS.map(({ point }, i) => { const p = trackMapPoint(point.x, point.z); return <circle key={i} cx={p.x} cy={p.y} r={live ? 2.1 : 3} fill={i <= checkpoint ? '#d47762' : '#f3f8fb'} stroke="#263d52" strokeWidth=".8" />; })}
    <path d={`M${finish.x} ${finish.y}v-11l12 3-12 4`} fill="#d47762" stroke="#263d52" strokeWidth="1.2" />
    {live ? <circle cx={player.x} cy={player.y} r="3.8" fill="#d47762" stroke="#f3f8fb" strokeWidth="1.5" /> : <><text x="17" y="192" fontSize="6" fill="#263d52">BASE CAMP</text><text x={Math.min(147, finish.x + 16)} y="18" fontSize="6" fill="#263d52">SUMMIT</text></>}
  </svg>;
}

function SnowMapPage() {
  const map = mapById('snow'), summit = CHECKPOINTS[CHECKPOINTS.length - 1].point.y;
  const profile = CHECKPOINTS.map(({ point }, i) => `${i ? 'L' : 'M'}${(i / (CHECKPOINTS.length - 1) * 260).toFixed(1)},${(82 - (point.y - START.point.y) / (summit - START.point.y) * 68).toFixed(1)}`).join(' ');
  return <main className="sheet-page valley-page snow-map-page"><div className="map-page-top"><BackButton /><MapSelector /></div><div className="valley-layout"><div className="map-art-column"><div className="valley-art"><Art name="snowy-mountain" className="map-mountain" /><TrackMap /><Art name="snowy-tree" className="map-pine" /><Art name="snowman" className="map-goat" /><span className="map-tag">THE MOUNTAIN DOES NOT DO SHORTCUTS.</span></div><div className="snow-elevation"><p className="ww-eyebrow">BASE CAMP → SUMMIT / +{Math.round(summit - START.point.y)} M</p><svg viewBox="0 0 270 96" role="img" aria-label="The checkpoint elevation profile rises from base camp to the summit"><path d={`${profile}L260 92H0Z`} fill="#d9e8ef" /><path d={profile} fill="none" stroke="#527485" strokeWidth="3" /><circle cx="260" cy="14" r="5" fill="#d47762" /></svg></div><div className="snow-kit-row">{['snowman','arctic-fox','snowy-tree','ice-warning'].map((name) => <Art key={name} name={name} alt={name.replace(/-/g, ' ')} />)}</div></div>
    <div className="valley-copy"><PageTitle eyebrow="MAP 03 / THE HARD WAY UP">Frostbite<br /><em>Ascent.</em></PageTitle><p>{map.description}</p><div className="track-facts"><div><strong>{(TRACK_LENGTH / 1000).toFixed(2)}<small>km</small></strong><span>ONE-WAY ROUTE</span></div><div><strong>+{Math.round(summit - START.point.y)}<small>m</small></strong><span>SUMMIT GAIN</span></div><div><strong>{CHECKPOINTS.length - 1}</strong><span>GATES TO THE TOP</span></div></div><ul className="valley-features"><li><Art name="ice-warning" /><span><strong>Brake before the blue</strong>{SNOW_ICE_ZONES.length} marked ice zones reduce grip and braking. Ease off early and steer gently; the slide is real.</span></li><li><Art name="slalom-gate" /><span><strong>Weave. Do not ram.</strong>{SNOW_HURDLES.length} solid snow-block obstacles alternate across the narrow road. Find the passing lane.</span></li><li><Art name="summit-flag" /><span><strong>It only ends at the top</strong>No laps and no downhill shortcut. Earn every gate in order, then cross the checkered summit line.</span></li></ul><div className="map-race-kit"><Art name="mountain-hut" /><Art name="checkpoint" /><Art name="summit-trophy" /><span>Your last earned gate is your recovery point.<br />Your climb time keeps running.</span></div><StartButton>Meet me at base camp</StartButton></div></div></main>;
}

function SettingsPage() {
  const settings = useGame((state) => state.settings); const update = useGame((state) => state.updateSettings); const returnPage = useGame((state) => state.returnPage);
  const back = () => { if (returnPage === 'race') useGame.setState({ page: 'race' }); else useGame.getState().navigate(returnPage); };
  return <main className="sheet-page settings-page"><button className="back-link" onClick={back}>← {returnPage === 'race' ? 'Back to your pit stop' : 'Back to the good stuff'}</button><div className="settings-heading"><div><PageTitle eyebrow="TUNE THE EXPERIENCE, NOT THE FUN.">Your way.<br /><em>Your Windway.</em></PageTitle></div><Art name="steering-wheel" /></div>
    <div className="settings-grid"><section><h2>Soundtrack to a detour</h2><p>Original synthesized engine, tire, and valley sounds.</p><RangeSetting label="Engine & effects" value={settings.sound} min={0} max={1} step={0.05} display={`${Math.round(settings.sound * 100)}%`} onChange={(sound) => update({ sound })} /><RangeSetting label="Road-trip music" value={settings.music} min={0} max={1} step={0.05} display={`${Math.round(settings.music * 100)}%`} onChange={(music) => { void gameAudio.unlock(); update({ music }); }} />
      <h2 className="settings-subhead">Make yourself comfortable</h2><RangeSetting label="Camera responsiveness" value={settings.sensitivity} min={0.5} max={1.5} step={0.1} display={`${settings.sensitivity.toFixed(1)}×`} onChange={(sensitivity) => update({ sensitivity })} /><p className="setting-help">Lower feels floaty. Higher follows the car more closely.</p></section>
      <section><h2>A view that runs your way</h2><p>Change this anytime. Your lap stays paused here.</p><fieldset className="quality-picker"><legend>Graphics quality</legend><div>{([{ value: 'auto', label: 'Automatic', text: 'Let your device decide' }, { value: 'low', label: 'Light & quick', text: 'Fewer trees, no shadows' }, { value: 'high', label: 'The full view', text: 'Detailed forest & shadows' }] as const).map((item) => <button key={item.value} aria-pressed={settings.quality === item.value} onClick={() => update({ quality: item.value })}><strong>{item.label}</strong><small>{item.text}</small><span>{settings.quality === item.value ? '✓' : ''}</span></button>)}</div></fieldset>
        <ToggleSetting label="The extra good stuff" text="Dust, tire marks, speed effects, and camera shake." value={settings.effects} onChange={(effects) => update({ effects })} /><ToggleSetting label="A calmer ride" text="Reduce motion and keep the camera effects gentle." value={settings.reducedMotion} onChange={(reducedMotion) => update({ reducedMotion })} />
      </section></div><div className="settings-bottom"><span><i /> Saved automatically on this device</span><button className="ww-button ww-outline" onClick={() => update({ sound: 0.55, music: 0.2, quality: 'auto', sensitivity: 1, effects: true, reducedMotion: false })}>Restore defaults</button><button className="ww-button ww-primary" onClick={back}>All set <span>✓</span></button></div>
  </main>;
}
function RangeSetting({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void }) { return <label className="range-setting"><span>{label}<output>{display}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function ToggleSetting({ label, text, value, onChange }: { label: string; text: string; value: boolean; onChange: (value: boolean) => void }) { return <label className="toggle-setting"><span><strong>{label}</strong><small>{text}</small></span><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true" /></label>; }

function HowTo() {
  const returnPage = useGame((state) => state.returnPage);
  const map = mapById(useGame((state) => state.selectedMap)); const jungle = map.id === 'jungle';
  return <main className="sheet-page howto-page">
    <BackButton to={returnPage} label={returnPage === 'race' ? 'Back to your pit stop' : 'Back to the start'} />
    <div className="help-heading"><PageTitle eyebrow={`A QUICK BRIEFING / ${map.name.toUpperCase()}`}>Less reading.<br /><em>More driving.</em></PageTitle><Art name={map.character} /></div>
    <div className="help-grid"><section><h2>Get a feel for it.</h2>
      <div className="control-row"><span><kbd>W</kbd><small>or</small><kbd>↑</kbd></span><p><strong>Put your foot down</strong>Accelerate into the adventure.</p></div>
      <div className="control-row"><span><kbd>S</kbd><small>or</small><kbd>↓</kbd></span><p><strong>Brake, then reverse</strong>Hold once you’ve stopped to back up.</p></div>
      <div className="control-row"><span><kbd>A</kbd><kbd>D</kbd></span><p><strong>Find your line</strong>Steer left and right. Arrow keys work too.</p></div>
      <div className="control-row"><span><kbd>SPACE</kbd></span><p><strong>Get a little sideways</strong>Hold the handbrake while turning to drift.</p></div>
      <div className="shortcut-strip"><span><kbd>R</kbd> Back to road</span><span><kbd>C</kbd> Camera</span><span><kbd>ESC</kbd> Pause</span></div>
    </section><section className="race-briefing"><span className="ww-eyebrow">YOUR MISSION, SHOULD YOU CHOOSE TO SEND IT</span><h2>{map.mode === 'ascent' ? 'One hard climb.' : map.laps === 1 ? 'One clean loop.' : 'Two jungle laps.'}<br />One time to beat.</h2>
      <ol><li>Wait for the countdown, then head up the road.</li><li>{map.mode === 'ascent' ? `Cross all ${CHECKPOINTS.length - 1} ordered gates. Coral marks the next one.` : `Cross all seven checkpoint gates in order. ${jungle ? 'Marigold' : 'Orange'} is your next one.`}</li><li>{map.mode === 'ascent' ? 'Pass the snow blocks, slow before the blue ice, and reach the finish gate at the mountain summit.' : jungle ? 'Cross the finish to start lap two, then repeat every gate. Your total race time is saved after the second lap.' : 'Return through the finish gate to save your time and personal best.'}</li></ol>
      <p>{map.mode === 'ascent' ? 'Packed snow already has less grip. Blue ice reduces braking and lateral grip further. Brake early on the approach, avoid the handbrake on ice, and make small steering corrections. There is no boost ramp on this climb.' : `Drive forward over the ${jungle ? 'marigold' : 'orange'} boost ramp on the road for a brief speed surge and a short flight. Hold your line to land back on the circuit.`}</p>
      {jungle && <p>Look for the ranger stop station beside the road. Wildlife stays off the racing line; the canopy keeps the clearings small.</p>}
      <p>Missed a turn? Press <kbd>R</kbd> to return just after your last earned checkpoint. Your lap progress is safe and the clock keeps running.</p>
      <div className="touch-note"><Art name="pedal-controls" /><span><strong>On a phone or tablet?</strong>Use the on-screen arrows and pedals. You can steer and accelerate together.</span></div>
    </section></div><StartButton className="help-start">Enough talk. Let’s go.</StartButton>
  </main>;
}

function PauseMenu() {
  const dialog = useRef<HTMLElement>(null);
  return <div className="modal-scrim"><section ref={dialog} className="pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title" onKeyDown={(event) => {
    if (event.key !== 'Tab') return;
    const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button');
    if (!buttons?.length) return;
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}><Art name="wild-haired-driver" className="pause-character" /><p className="ww-eyebrow">A VERY WELL-DESERVED PIT STOP</p><h1 id="pause-title">Take a<br /><em>breather.</em></h1><p>Your car and your clock are right where you left them.</p><button className="ww-button ww-primary" autoFocus onClick={() => { void gameAudio.unlock(); useGame.getState().resume(); }}>Back to the madness <span>→</span></button><div className="pause-options"><button onClick={() => { void gameAudio.unlock(); useGame.getState().startRace(); }}>Restart run</button><button onClick={() => useGame.getState().navigate('settings')}>Settings</button><button onClick={() => useGame.getState().navigate('howto')}>How to play</button><button onClick={() => useGame.getState().navigate('garage')}>Return to garage</button></div></section></div>;
}

function Results() {
  const result = useGame((state) => state.result); const car = carById(useGame((state) => state.selectedCar)); const reducedMotion = useGame((state) => state.settings.reducedMotion);
  if (!result) return null;
  const map = mapById(result.mapId); const jungle = map.id === 'jungle', snow = map.mode === 'ascent';
  return <main className="results-page"><section className="results-card">
    {!reducedMotion && <div className="confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--i': i, '--color': [map.theme.accent, map.theme.leaf, map.theme.paper, map.theme.water][i % 4] } as CSSProperties} />)}</div>}
    <Art name="winner-trophy" className="results-trophy" /><span className="result-badge">{result.newBest ? 'A FRESH PERSONAL BEST' : snow ? 'SUMMIT CONQUERED' : jungle ? 'CANOPY CONQUERED' : 'VALLEY CONQUERED'}</span><h1 data-page-title tabIndex={-1}>{snow ? <>You took<br />the <em>high road.</em></> : <>Well, that<br />was <em>wild.</em></>}</h1><p>{car.name} · {map.name} · {snow ? 'summit climb' : `${result.laps} ${result.laps === 1 ? 'lap' : 'laps'}`}</p><strong className="result-time">{formatTime(result.time)}</strong>
    <div className="result-details"><div><span>PREVIOUS {snow ? 'SUMMIT' : jungle ? 'JUNGLE' : 'ALPINE'} BEST</span><strong>{result.previousBest ? formatTime(result.previousBest) : 'Your very first finish'}</strong></div><div><span>ROAD RECOVERIES</span><strong>{String(result.resets).padStart(2, '0')}</strong></div></div>
    <StartButton>One more for the road</StartButton><button className="back-link" onClick={() => useGame.getState().navigate('garage')}>Try a different attitude →</button>
  </section></main>;
}

function TouchButton({ action, label, children, className = '' }: { action: keyof DrivingInput; label: string; children: React.ReactNode; className?: string }) {
  const [held, setHeld] = useState(false);
  const release = () => { drivingInput[action] = false; setHeld(false); };
  return <button className={`touch-button ${className}`} aria-label={label} aria-pressed={held} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drivingInput[action] = true; setHeld(true); }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onContextMenu={(event) => event.preventDefault()}>{children}</button>;
}

function RaceHUD() {
  const recovery = useGame((state) => state.recovery);
  const reducedMotion = useGame((state) => state.settings.reducedMotion);
  const { telemetry: data, status, countdown, reaction, cameraMode } = useGame(useShallow((state) => ({ telemetry: state.telemetry, status: state.status, countdown: state.countdown, reaction: state.reaction, cameraMode: state.cameraMode })));
  const map = mapById(useGame((state) => state.selectedMap)); const jungle = map.id === 'jungle';
  const best = useGame((state) => state.bestTimes[gameRecordKey(state.selectedMap, state.selectedCar)]);
  return <div className={`race-ui race-ui-${status}`} data-hud-layout="split-corners">
    <aside className="race-dashboard" aria-label="Race information">
      <header className="race-header">
        <div className="race-wordmark">WINDWAY<span>{map.name.toUpperCase()}</span></div>
        <button className="hud-button pause-button" aria-label="Pause race" disabled={status !== 'running'} onClick={() => useGame.getState().pause()}><Art name="pause-button" /><span>PAUSE <kbd>ESC</kbd></span></button>
      </header>
      <div className="race-stats">
        <div className="lap-clock"><span>{map.mode === 'ascent' ? 'CLIMB TIME' : map.laps > 1 ? 'TOTAL RACE TIME' : 'LAP TIME'}</span><strong>{formatTime(data.elapsed)}</strong><small>{best ? `BEST ${formatTime(best)}` : 'YOUR FIRST TIME AROUND'}</small></div>
        <div className="lap-counter" aria-label={map.mode === 'ascent' ? 'Expert summit climb' : `Lap ${data.lap} of ${map.laps}`}>{jungle && <Art name="lap-badge" />}<b>{map.mode === 'ascent' ? 'SUMMIT CLIMB' : <>LAP {data.lap}<i> / {map.laps}</i></>}</b></div>
      </div>
      <div className="checkpoint-progress" aria-label={`${data.checkpoint} of ${map.mode === 'ascent' ? CHECKPOINTS.length - 1 : CHECKPOINTS.length} gates completed`}><span>GATES</span><div>{Array.from({ length: map.mode === 'ascent' ? CHECKPOINTS.length - 1 : CHECKPOINTS.length }, (_, i) => <i key={i} className={i < data.checkpoint ? 'complete' : i === data.checkpoint ? 'next' : ''} />)}</div><strong>{data.checkpoint}<small> / {map.mode === 'ascent' ? CHECKPOINTS.length - 1 : CHECKPOINTS.length}</small></strong></div>
      {map.mode === 'ascent' && <div className={`winter-drive-info ${data.surface === 'black-ice' ? 'is-ice' : ''}`} role="status"><Art name={data.surface === 'black-ice' ? 'ice-warning' : 'snowflake'} /><span><strong>{data.surface === 'black-ice' ? 'BLACK ICE / EASY INPUTS' : 'PACKED SNOW / EXPERT'}</strong><small>{Math.round(data.altitude ?? START.point.y)} m altitude · {Math.round(Math.min(1, data.progress) * 100)}% to the summit</small></span></div>}
      <div className="race-tools">
        <button className="hud-button" disabled={status !== 'running'} onClick={() => useGame.getState().resetCar()} aria-label="Recover car to the last checkpoint"><Art name="restart-button" /><span>BACK TO ROAD <kbd>R</kbd></span></button>
        <button className="hud-button" disabled={status !== 'running'} onClick={() => useGame.getState().toggleCamera()} aria-label={`Switch to ${cameraMode === 'chase' ? 'hood' : 'chase'} camera`}><Art name="camera-button" /><span>{cameraMode === 'chase' ? 'CHASE CAM' : 'HOOD CAM'} <kbd>C</kbd></span></button>
      </div>
      <div className="race-notices">
        <div className="ramp-status" role="status" aria-live="polite" aria-atomic="true">{status === 'running' && (data.boosting || data.airborne) && <div className={`ramp-status-label ${data.airborne ? 'is-airborne' : ''}`}><Art name={jungle ? 'boost-ramp' : data.airborne ? 'eagle-soaring' : 'jump-ramp'} /><span><strong>{data.boosting ? 'BOOST' : 'AIRTIME'}{data.boosting && data.airborne ? ' + AIRTIME' : ''}</strong><small>{data.airborne ? 'HOLD YOUR LINE FOR LANDING' : 'ON-ROAD RAMP POWER'}</small></span></div>}</div>
        {reaction && reaction.until > performance.now() && status === 'running' && <div className="race-reaction" role="status"><Art name={reaction.character} /><p>{reaction.text}</p></div>}
        {status === 'countdown' && <div className="countdown" role="status"><span>THE {map.mode === 'ascent' ? 'SUMMIT' : jungle ? 'JUNGLE' : 'VALLEY'} IS YOURS IN</span><strong key={countdown}>{countdown}</strong><small>{map.mode === 'ascent' ? 'One long climb' : `${map.laps} ${map.laps === 1 ? 'lap' : 'laps'}`} · Hold W or ↑ when it’s time to go.</small></div>}
        {status === 'loading' && <div className="countdown preparing"><TrackLoader label="Warming up your ride…" compact reducedMotion={reducedMotion} /></div>}
        {status === 'recovering' && recovery && <section className="recovery-card" role="status" aria-live="assertive"><Art name="crying-driver" /><p className="ww-eyebrow">{recovery.reason === 'manual' ? 'A QUICK RESET' : recovery.reason === 'water' ? 'THE RIVER WINS THIS ONE' : 'A LITTLE TOO FAR OFF TRACK'}</p><h2>Back on the<br /><em>good road.</em></h2><strong>{recovery.checkpoint === 0 ? 'RETURNING TO THE START' : `RETURNING TO CHECKPOINT ${String(recovery.checkpoint).padStart(2, '0')}`}</strong><p>Your progress is safe. The race clock keeps running.</p><progress max={1.2} value={1.2 - recovery.remaining} aria-label="Returning the car to the road" /></section>}
        {status === 'running' && data.elapsed < 1.5 && <div className="go-message" role="status">GO GET LOST.</div>}
      </div>
    </aside>
    <section className="race-minimap" aria-label={`${map.name} live roadmap`}><span>{map.region.toUpperCase()}</span><TrackMap live /><small>FOLLOW THE {map.mode === 'ascent' ? 'CORAL' : jungle ? 'MARIGOLD' : 'ORANGE'} GATE</small></section>
    <section className="speed-gauge" aria-label={`Speed ${Math.round(data.speed)} kilometers per hour`}><strong>{Math.round(data.speed).toString().padStart(2, '0')}</strong><span>KM/H</span><small>{data.boosting ? 'BOOST' : data.airborne ? 'AIRTIME' : data.drifting ? 'DRIFTING' : 'ON THE ROAD'}</small></section>
    {status === 'running' && <div className="touch-controls"><div className="touch-steering"><TouchButton action="left" label="Steer left">←</TouchButton><TouchButton action="right" label="Steer right">→</TouchButton><TouchButton action="handbrake" label="Hold handbrake" className="touch-drift">DRIFT</TouchButton></div><div className="touch-pedals"><TouchButton action="brake" label="Brake or reverse" className="touch-brake">BRAKE</TouchButton><TouchButton action="throttle" label="Accelerate" className="touch-throttle">GO</TouchButton></div></div>}
    {status === 'paused' && <PauseMenu />}
  </div>;
}

export default function Windway() {
  const page = useGame((state) => state.page); const status = useGame((state) => state.status); const countdown = useGame((state) => state.countdown);
  const error = useGame((state) => state.error); const reducedMotion = useGame((state) => state.settings.reducedMotion);
  const map = mapById(useGame((state) => state.selectedMap));
  const [attempt, setAttempt] = useState(0);
  const racing = page === 'race' || page === 'results';
  useEffect(() => () => gameAudio.close(), []);
  useEffect(() => installDrivingInput(() => { const state = useGame.getState(); if (state.page === 'race') { if (state.status === 'paused') state.resume(); else state.pause(); } }, () => useGame.getState().resetCar(), () => useGame.getState().toggleCamera(), () => { const state = useGame.getState(); return state.page === 'race' && ['running', 'countdown'].includes(state.status); }), []);
  useEffect(() => { if (status !== 'running') { clearInput(); gameAudio.stop(); } else if (document.visibilityState === 'hidden') useGame.getState().pause(); }, [status]);
  useEffect(() => {
    if (status !== 'countdown') return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') useGame.getState().tickCountdown(); }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);
  useEffect(() => {
    if (status !== 'recovering') return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now(), dt = Math.min(0.2, (now - previous) / 1000); previous = now;
      if (document.visibilityState === 'visible') useGame.getState().tickRecovery(dt);
    }, 100);
    return () => window.clearInterval(timer);
  }, [status]);
  useEffect(() => { if (status === 'countdown') gameAudio.chime('countdown'); }, [countdown, status]);
  useEffect(() => {
    const visibility = () => { if (document.visibilityState === 'hidden') useGame.getState().pause(); };
    document.addEventListener('visibilitychange', visibility); return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => { document.querySelector<HTMLElement>('[data-page-title]')?.focus({ preventScroll: true }); }, [page]);
  return <div className={`wildway map-${map.id} page-${page} ${reducedMotion ? 'calm-motion' : ''}`}>
    {page !== 'home' && <div className={`scene-shell ${['settings', 'howto', 'map'].includes(page) ? 'scene-muted' : ''}`} aria-label={`Interactive 3D ${map.region}`}><ViewerErrorBoundary resetKey={String(attempt)} onError={(issue) => useGame.getState().setError(issue.message || 'This world could not load. Please try again.')}><Suspense fallback={page === 'race' ? null : <div className="scene-loadscreen"><TrackLoader label={`Opening ${map.name}…`} reducedMotion={reducedMotion} /></div>}><GameScene attempt={attempt} /></Suspense></ViewerErrorBoundary></div>}
    {!racing && page !== 'home' && <Header />}
    {page === 'home' && <Home />}{page === 'garage' && <Garage />}{page === 'map' && <Valley />}{page === 'settings' && <SettingsPage />}{page === 'howto' && <HowTo />}{page === 'race' && <RaceHUD />}{page === 'results' && <Results />}
    {error && <div className="modal-scrim"><section className="error-card" role="alert"><Art name="crying-driver" /><p className="ww-eyebrow">A SMALL BUMP IN THE ROAD</p><h1>This world needs<br />another try.</h1><p>{error}</p><button className="ww-button ww-primary" onClick={() => { useGame.getState().setError(null); useGame.getState().setReady(false); useGame.getState().navigate('home'); setAttempt((value) => value + 1); }}>Try again <span>↗</span></button></section></div>}
  </div>;
}
