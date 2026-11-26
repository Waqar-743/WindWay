import { lazy, Suspense, useState, type CSSProperties } from 'react';
import { GAME_CARS, PAINTS, carById, formatTime } from './config';
import { LEVELS, levelFacts } from './levels';
import { evaluateRunGrade } from './trackAnalysis';
import {
  APP_CREW,
  APP_MAPS,
  browserRecordKey,
  countTotalCompletions,
  type BrowserAppState,
  type BrowserGameConfig,
  type BrowserMapId,
} from './mobileAppPreferences';
import { AppIcon, appAsset, type AppIconName, type AppPage } from './MobileAppElements';
import { RouteMap } from './RouteMap';

const MobileShowroom = lazy(() => import('./MobileShowroom'));

interface PageProps {
  page: AppPage;
  app: BrowserAppState;
  hasTiltSensor: boolean;
  isAndroidHost: boolean;
  patch: (value: Partial<BrowserGameConfig>) => void;
  onNavigate: (page: AppPage) => void;
  onOpenStarter: () => void;
  onResetDefaults: () => void;
  onHaptic?: (kind: string) => void;
}

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  detail,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  detail?: string;
}) {
  return <fieldset className="wwa-field">
    <legend>{label}</legend>
    <div className="wwa-segments">
      {options.map((option) => (
        <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
    {detail && <p>{detail}</p>}
  </fieldset>;
}

function Toggle({ title, detail, value, onChange }: { title: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="wwa-toggle">
    <span><strong>{title}</strong><small>{detail}</small></span>
    <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
    <span className="wwa-switch" aria-hidden="true" />
  </label>;
}

const routeCodes = { alpine: 'ALP', jungle: 'CNP', snow: 'FBA' } as const;

function bestForMapLevel(app: BrowserAppState, mapId: BrowserMapId, levelId: number): number | null {
  let best = Infinity;
  for (const car of GAME_CARS) {
    const t = app.bestTimes[browserRecordKey(mapId, car.id, levelId)];
    if (typeof t === 'number' && t < best) best = t;
  }
  return Number.isFinite(best) ? best : null;
}

export default function MobileAppPages({
  page,
  app,
  hasTiltSensor,
  isAndroidHost,
  patch,
  onNavigate,
  onOpenStarter,
  onResetDefaults,
  onHaptic,
}: PageProps) {
  const [recordsMap, setRecordsMap] = useState<BrowserMapId>(app.config.mapId);

  if (page === 'maps') {
    return <div className="wwa-road-list">
      {APP_MAPS.map((map, index) => {
        const cleared = app.completedLevels[map.id]?.length ?? 0;
        const selected = map.id === app.config.mapId;
        return <div className={`wwa-road-choice wwa-route-${map.id}${selected ? ' is-selected' : ''}`} key={map.id}>
          <button
            type="button"
            className="wwa-road-select"
            aria-label={`Select ${map.name}`}
            aria-pressed={selected}
            onClick={() => { onHaptic?.('tap'); patch({ mapId: map.id }); }}
          >
            <span className="wwa-route-art">
              <span className="wwa-choice-number">0{index + 1}<small>{routeCodes[map.id]} / PATH</small></span>
              <img src={appAsset(map.art)} alt="" width="180" height="140" loading="lazy" decoding="async" />
              <span className="wwa-route-scan" aria-hidden="true" />
            </span>
            <span className="wwa-road-info">
              <span className="wwa-kicker">{map.region} / {map.difficulty} · {cleared} / 6 LEVELS</span>
              <strong>{map.name}</strong>
              <span className="wwa-choice-description">{map.description}</span>
            </span>
            <span className="wwa-route-facts">
              <span>{map.terrain}</span>
              <span>{map.id === 'snow' ? 'One way' : `${map.laps} ${map.laps === 1 ? 'lap' : 'laps'}`}</span>
              <span>{map.gates} {map.id === 'snow' ? 'base gates' : 'base gates'}</span>
            </span>
            <span className="wwa-selection-marker">
              {selected ? <><AppIcon name="check" /><span>Selected</span></> : <span>Choose path</span>}
            </span>
          </button>
          <div className="wwa-road-blueprint">
            <RouteMap mapId={map.id} compact showTelemetry={false} />
            <button
              type="button"
              className="wwa-inline-link"
              onClick={() => { onHaptic?.('tap'); patch({ mapId: map.id }); onNavigate('levels'); }}
            >
              <span>Browse 6 Levels</span>
              <AppIcon name="arrowRight" />
            </button>
          </div>
        </div>;
      })}
    </div>;
  }

  if (page === 'levels') {
    const activeMap = APP_MAPS.find((m) => m.id === app.config.mapId) ?? APP_MAPS[0];
    const completed = app.completedLevels[activeMap.id] ?? [];
    const totalCleared = countTotalCompletions(app);
    const snow = activeMap.id === 'snow';
    return <div className="wwa-levels-page">
      <div className="wwa-levels-bar">
        <div className="wwa-path-tabs" role="tablist" aria-label="Filter levels by path">
          {APP_MAPS.map((map) => (
            <button
              key={map.id}
              type="button"
              role="tab"
              aria-selected={app.config.mapId === map.id}
              className={app.config.mapId === map.id ? 'is-active' : ''}
              onClick={() => { onHaptic?.('tap'); patch({ mapId: map.id }); }}
            >
              <span>{map.name}</span>
              <small>{app.completedLevels[map.id]?.length ?? 0}/6</small>
            </button>
          ))}
        </div>
        <div className="wwa-mastery-pill">
          <span>PATH MASTERY</span>
          <strong>{completed.length} / 6</strong>
          <small>{totalCleared} / 18 OVERALL</small>
        </div>
      </div>

      <div className="wwa-levels-grid">
        {LEVELS.map((lvl) => {
          const facts = levelFacts(activeMap.id, lvl.id);
          const isSelected = app.config.level === lvl.id;
          const isDone = completed.includes(lvl.id);
          const best = bestForMapLevel(app, activeMap.id, lvl.id);
          const grade = best !== null ? evaluateRunGrade(best, 0, activeMap.id, lvl.id) : null;
          return <button
            key={lvl.id}
            type="button"
            className={`wwa-level-card${isSelected ? ' is-selected' : ''}${isDone ? ' is-completed' : ''}`}
            aria-label={`Level ${lvl.id}: ${lvl.name}`}
            aria-pressed={isSelected}
            onClick={() => { onHaptic?.('tap'); patch({ level: lvl.id }); }}
          >
            <div className="wwa-level-card-top">
              <span className="wwa-level-num">0{lvl.id}</span>
              <span className={`wwa-level-status${isDone ? ' is-done' : ''}`}>
                {isDone ? (grade ? grade.tier : 'CLEARED') : isSelected ? 'ACTIVE' : 'OPEN'}
              </span>
            </div>
            <strong>{lvl.name}</strong>
            <p>{snow && lvl.id > 0 ? 'Tighter summit ledges, additional checkpoints and full snow-block slalom.' : lvl.description}</p>
            <div className="wwa-level-specs">
              <span><b>{facts.gates}</b> gates</span>
              <span><b>{facts.width.toFixed(1)}m</b> width</span>
              <span><b>{facts.obstacles}</b> {snow ? 'hurdles' : 'slaloms'}</span>
            </div>
            <div className="wwa-level-foot">
              <span>{best !== null ? `BEST ${formatTime(best)}` : 'NO RECORD YET'}</span>
              {isSelected && <AppIcon name="check" />}
            </div>
          </button>;
        })}
      </div>
    </div>;
  }

  if (page === 'garage') {
    const car = carById(app.config.carId);
    return <div className="wwa-garage">
      <div className="wwa-car-selection">
        {GAME_CARS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`wwa-car-choice${item.id === app.config.carId ? ' is-selected' : ''}`}
            aria-pressed={item.id === app.config.carId}
            onClick={() => { onHaptic?.('tap'); patch({ carId: item.id }); }}
          >
            <span className="wwa-choice-number">{item.number}</span>
            <span>
              <small>{item.nickname}</small>
              <strong>{item.name}</strong>
              <span>{item.description}</span>
            </span>
            {item.id === app.config.carId && <AppIcon name="check" />}
          </button>
        ))}

        <div className="wwa-car-bars" aria-label="Car performance characteristics">
          <div><span>Top speed</span><b>{Math.round(car.topSpeed * 3.6)} km/h</b><i><em style={{ width: `${(car.topSpeed / 56) * 100}%` }} /></i></div>
          <div><span>Acceleration</span><b>{car.acceleration} m/s²</b><i><em style={{ width: `${(car.acceleration / 18) * 100}%` }} /></i></div>
          <div><span>Corner grip</span><b>{car.grip} / 12</b><i><em style={{ width: `${(car.grip / 12) * 100}%` }} /></i></div>
          <div><span>Braking power</span><b>{car.braking} m/s²</b><i><em style={{ width: `${(car.braking / 30) * 100}%` }} /></i></div>
        </div>

        <fieldset className="wwa-paint">
          <legend>Body paint <span>{PAINTS.find((paint) => paint.hex === app.config.paint)?.name}</span></legend>
          <div>
            {PAINTS.map((paint) => (
              <button
                key={paint.hex}
                type="button"
                className={paint.hex === app.config.paint ? 'is-selected' : ''}
                aria-label={paint.name}
                aria-pressed={paint.hex === app.config.paint}
                title={paint.name}
                style={{ '--paint': paint.hex } as CSSProperties}
                onClick={() => { onHaptic?.('tap'); patch({ paint: paint.hex }); }}
              >
                {paint.hex === app.config.paint && <AppIcon name="check" />}
              </button>
            ))}
          </div>
          <p>Paint changes the body finish. Handling stays pure to the chassis.</p>
        </fieldset>
      </div>

      <div className="wwa-garage-stage">
        <div className="wwa-stage-grid" aria-hidden="true" />
        <span className="wwa-garage-live">LIVE 3D SHOWROOM / CAR {car.number}</span>
        <Suspense fallback={<span className="wwa-preview-note">Preparing your car…</span>}>
          <MobileShowroom key={app.config.carId} carId={app.config.carId} paint={app.config.paint} interactive />
        </Suspense>
        <div className="wwa-car-specs">
          <span>Top speed<strong>{Math.round(car.topSpeed * 3.6)} <small>km/h</small></strong></span>
          <span>Character<strong>{car.id === 'mclaren-mcl38' ? 'Agile' : 'Planted'}</strong></span>
          <span>Car number<strong>{car.number}</strong></span>
        </div>
      </div>
    </div>;
  }

  if (page === 'settings') {
    const steeringOptions = [
      { value: 'arrows' as const, label: 'Arrow buttons' },
      { value: 'wheel' as const, label: 'Steering wheel' },
      ...(hasTiltSensor ? [{ value: 'tilt' as const, label: 'Phone tilt' }] : []),
    ];
    return <div className="wwa-settings">
      <section>
        <div className="wwa-section-heading"><span>01 / INPUT &amp; FEEL</span><h2>Driving &amp; Controls</h2></div>
        <ChoiceGroup
          label="Steering"
          value={hasTiltSensor ? app.config.steeringMode : (app.config.steeringMode === 'tilt' ? 'arrows' : app.config.steeringMode)}
          options={steeringOptions}
          onChange={(steeringMode) => { onHaptic?.('tap'); patch({ steeringMode }); }}
          detail={app.config.steeringMode === 'tilt'
            ? 'Hold the phone in landscape and gently roll left or right. Tap Center Phone while stationary to recalibrate.'
            : 'Use on-screen controls, or WASD / arrow keys on a keyboard. Phone tilt activates automatically on Android devices with tilt sensors.'}
        />
        <label className="wwa-slider">
          <span>Wheel &amp; tilt sensitivity<strong>{app.config.sensitivity.toFixed(2)}×</strong></span>
          <input type="range" min="0.5" max="1.5" step="0.05" value={app.config.sensitivity} onChange={(event) => patch({ sensitivity: Number(event.target.value) })} />
          <small>Lower is calmer on straights. Higher turns into hairpins sooner.</small>
        </label>
        {hasTiltSensor && app.config.steeringMode === 'tilt' && (
          <Toggle
            title="Invert tilt steering"
            detail="Swap left and right roll direction if it feels more natural."
            value={app.config.invertTilt}
            onChange={(invertTilt) => { onHaptic?.('tap'); patch({ invertTilt }); }}
          />
        )}
        <ChoiceGroup
          label="Starting camera"
          value={app.config.cameraMode}
          options={[{ value: 'chase', label: 'Chase' }, { value: 'hood', label: 'Hood' }]}
          onChange={(cameraMode) => { onHaptic?.('tap'); patch({ cameraMode }); }}
          detail="Chase shows the full car and road borders. Hood brings the apex closer."
        />
        <Toggle
          title="Tactile haptic feedback"
          detail={isAndroidHost ? 'Subtle Android vibration on gate crossings, boosts, and menu taps.' : 'Android vibration feedback (active when running the installed Android app).'}
          value={app.config.haptics}
          onChange={(haptics) => { patch({ haptics }); if (haptics) onHaptic?.('tap'); }}
        />
      </section>

      <section>
        <div className="wwa-section-heading"><span>02 / PERFORMANCE &amp; AUDIO</span><h2>Graphics &amp; Sound</h2></div>
        <ChoiceGroup
          label="Graphics quality"
          value={app.config.quality}
          options={[{ value: 'low', label: 'Low' }, { value: 'auto', label: 'Auto' }, { value: 'high', label: 'High' }]}
          onChange={(quality) => { onHaptic?.('tap'); patch({ quality }); }}
          detail="Auto adapts rendering resolution to device memory and live frame rate. Choose Low for cooler battery life or High for full shadows."
        />
        <Toggle
          title="Extra visual effects"
          detail="Dust, tire marks, and extra roadside particles during the drive."
          value={app.config.effects}
          onChange={(effects) => { onHaptic?.('tap'); patch({ effects }); }}
        />
        <Toggle
          title="Reduce motion"
          detail="Calmer menu transitions and reduced decorative camera motion."
          value={app.config.reducedMotion}
          onChange={(reducedMotion) => { onHaptic?.('tap'); patch({ reducedMotion }); }}
        />
        <label className="wwa-slider">
          <span>Engine sound<strong>{Math.round(app.config.sound * 100)}%</strong></span>
          <input type="range" min="0" max="1" step="0.05" value={app.config.sound} onChange={(event) => patch({ sound: Number(event.target.value) })} />
          <small>Synthesized engine &amp; tire audio. Set to zero for a silent drive.</small>
        </label>

        <div className="wwa-settings-actions">
          <button type="button" className="wwa-button wwa-secondary" onClick={() => { onHaptic?.('tap'); onOpenStarter(); }}>
            <AppIcon name="compass" />
            <span>Replay Starter Guide</span>
          </button>
          <button type="button" className="wwa-button wwa-secondary" onClick={() => { onHaptic?.('tap'); onResetDefaults(); }}>
            <span>Restore Defaults</span>
          </button>
        </div>
      </section>
    </div>;
  }

  if (page === 'crew') {
    return <>
      <p className="wwa-intro">Choose the companion beside your race messages. Every companion gets the same car physics.</p>
      <div className="wwa-crew-list">
        {APP_CREW.map((crew, index) => (
          <button
            key={crew.id}
            type="button"
            className={`wwa-crew-choice${crew.id === app.config.character ? ' is-selected' : ''}`}
            aria-pressed={crew.id === app.config.character}
            onClick={() => { onHaptic?.('tap'); patch({ character: crew.id }); }}
          >
            <span className="wwa-crew-portrait">
              <span>CREW / 0{index + 1}</span>
              <img src={appAsset(crew.art)} alt="" width="120" height="132" loading="lazy" decoding="async" />
            </span>
            <span>
              <small>{crew.role}</small>
              <strong>{crew.name}</strong>
              <span>{crew.description}</span>
            </span>
            {crew.id === app.config.character && <AppIcon name="check" />}
          </button>
        ))}
      </div>
    </>;
  }

  if (page === 'help') {
    return <>
      <div className="wwa-help-banner">
        <div>
          <span className="wwa-kicker">INTERACTIVE WALKTHROUGH</span>
          <strong>Need a refresher on switching paths, levels, or steering?</strong>
        </div>
        <button type="button" className="wwa-button wwa-primary" onClick={() => { onHaptic?.('tap'); onOpenStarter(); }}>
          <AppIcon name="compass" />
          <span>Open Starter Guide</span>
        </button>
      </div>
      <div className="wwa-help-controls">
        <span><kbd>W</kbd><kbd>↑</kbd> Accelerate</span>
        <span><kbd>S</kbd><kbd>↓</kbd> Brake / reverse</span>
        <span><kbd>A</kbd><kbd>D</kbd> Steer</span>
        <span><kbd>Space</kbd> Handbrake</span>
        <span><kbd>C</kbd> Camera</span>
        <span><kbd>R</kbd> Recover</span>
        <span><kbd>Esc</kbd> Pause</span>
      </div>
      <div className="wwa-help-steps">{[
        ['play', 'Start in one tap', 'Tap Start drive in the lobby. Use Paths, Levels, and Garage anytime to switch route, difficulty tier, car, or paint before rolling out.'],
        ['car', 'Smooth inputs are faster', 'Hold GO to accelerate and BRAKE to slow down. Steer with arrows, drag the wheel, or tilt your Android phone. Brake before a corner, then turn in cleanly.'],
        ['levels', 'Conquer all 6 levels', 'Each path scales from Level 0 Explorer to Level 5 Master with narrower sections, extra gates, and alternating slalom barriers.'],
        ['flag', 'Follow the gates', 'Cross checkpoints in order. The corner minimap highlights your next gate. Alpine Valley and Canopy Run have boost ramps; hit them straight.'],
        ['continue', 'Pause, stop and return', 'Pause holds your race cleanly. Stop or Android Back saves your last earned gate and returns to the lobby so Continue picks up there.'],
        ['road', 'Climb Frostbite with care', 'Frostbite Ascent is a one-way summit climb with black ice and solid snow hurdles. Slow early before ice zones and weave cleanly.'],
      ].map(([icon, title, text], index) => (
        <article key={title}>
          <span className="wwa-help-number">0{index + 1}</span>
          <AppIcon name={icon as AppIconName} />
          <div>
            <span className="wwa-help-tag">BRIEFING / 0{index + 1}</span>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
        </article>
      ))}</div>
    </>;
  }

  if (page === 'records') {
    const activeMap = APP_MAPS.find((m) => m.id === recordsMap) ?? APP_MAPS[0];
    const totalCleared = countTotalCompletions(app);
    return <>
      <div className="wwa-levels-bar">
        <div className="wwa-path-tabs" role="tablist" aria-label="View records by path">
          {APP_MAPS.map((map) => (
            <button
              key={map.id}
              type="button"
              role="tab"
              aria-selected={recordsMap === map.id}
              className={recordsMap === map.id ? 'is-active' : ''}
              onClick={() => { onHaptic?.('tap'); setRecordsMap(map.id); }}
            >
              <span>{map.name}</span>
              <small>{app.completedLevels[map.id]?.length ?? 0}/6</small>
            </button>
          ))}
        </div>
        <div className="wwa-mastery-pill">
          <span>TOTAL CLEARED</span>
          <strong>{totalCleared} / 18</strong>
          <small>ALL PATHS &amp; LEVELS</small>
        </div>
      </div>

      <div className="wwa-records">
        {LEVELS.map((lvl) => {
          const done = (app.completedLevels[activeMap.id] ?? []).includes(lvl.id);
          return <section key={lvl.id} className={`wwa-route-${activeMap.id}`}>
            <h2>
              <span className="wwa-record-route">
                <small>LEVEL 0{lvl.id} / {routeCodes[activeMap.id]}</small>
                {lvl.name}
              </span>
              <span>{done ? 'CLEARED ✓' : activeMap.terrain}</span>
            </h2>
            {GAME_CARS.map((car) => {
              const best = app.bestTimes[browserRecordKey(activeMap.id, car.id, lvl.id)];
              return <div key={car.id}>
                <span><small>{car.number}</small>{car.name}</span>
                <strong>{best ? formatTime(best) : <small>No finish yet</small>}</strong>
              </div>;
            })}
          </section>;
        })}
      </div>
      <p className="wwa-footnote">LOCAL DEVICE STORAGE / Records, level completions and checkpoints stay offline on this device.</p>
    </>;
  }

  if (page === 'about') {
    return <div className="wwa-about">
      <div className="wwa-about-mark">
        <span className="wwa-kicker">WW / ORIGIN</span>
        <AppIcon name="road" />
        <strong>WINDWAY</strong>
        <span>An offline 3D driving escape by Waqar Ahmed.</span>
        <small>{isAndroidHost ? 'NATIVE KOTLIN ANDROID EDITION · 100% OFFLINE' : 'UNIFIED MOBILE EDITION · LOCAL SESSION'}</small>
      </div>
      <section>
        <span className="wwa-kicker">PROJECT NOTES / 01</span>
        <h2>Three paths. Six levels. Two machines.</h2>
        <p>An independent driving experience with open paths, 18 progressive level challenges, local checkpoint saves, native Android sensors &amp; haptics, and personal best telemetry. All saves stay private on your device.</p>
        <span className="wwa-kicker">ASSET MANIFEST / 02</span>
        <h2>Car artwork &amp; credits</h2>
        <p>Car artwork by <a href="https://sketchfab.com/MattsActuallyUsefulModels" target="_blank" rel="noreferrer">MattsActuallyUsefulModels</a>, licensed under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a>. Models are optimized for mobile WebGL delivery, body paint customization, and wheel animation.</p>
        <p>Windway is an independent, unofficial project. Car and manufacturer names identify the included community models.</p>
        <a className="wwa-credit-link" href={appAsset('MODEL_CREDITS.md')} target="_blank" rel="noreferrer">Full model sources and license notices <span aria-hidden="true">↗</span></a>
      </section>
    </div>;
  }

  return null;
}
