import { useState } from 'react';
import { GAME_CARS } from './config';
import { LEVELS, levelFacts } from './levels';
import { APP_MAPS, type BrowserAppState, type BrowserGameConfig } from './mobileAppPreferences';
import { AppIcon, appAsset } from './MobileAppElements';

interface StarterOnboardingProps {
  app: BrowserAppState;
  hasTiltSensor: boolean;
  isFirstLaunch: boolean;
  onPatch: (value: Partial<BrowserGameConfig>) => void;
  onFinishToLobby: () => void;
  onFinishAndDrive: () => void;
  onHaptic?: (kind: string) => void;
}

const STEPS = [
  { id: 'welcome', code: '01', title: 'Welcome to Windway', short: 'Welcome' },
  { id: 'switch', code: '02', title: 'Switch Path, Level & Car', short: 'Switch Setup' },
  { id: 'controls', code: '03', title: 'How to Drive & Steer', short: 'Controls' },
  { id: 'ready', code: '04', title: 'Levels, Gates & Saves', short: 'Ready to Race' },
] as const;

export default function StarterOnboarding({
  app,
  hasTiltSensor,
  isFirstLaunch,
  onPatch,
  onFinishToLobby,
  onFinishAndDrive,
  onHaptic,
}: StarterOnboardingProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const selectedMap = APP_MAPS.find((m) => m.id === app.config.mapId) ?? APP_MAPS[0];
  const selectedLevel = LEVELS[app.config.level] ?? LEVELS[0];
  const facts = levelFacts(selectedMap.id, selectedLevel.id);

  const go = (next: number) => {
    onHaptic?.('tap');
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
  };

  return <section className="wwa-starter" aria-label="Windway starter guide" data-starter-step={current.id}>
    <header className="wwa-starter-head">
      <div className="wwa-brand">
        <AppIcon name="road" />
        <span>WINDWAY<small>DRIVER STARTER BRIEFING</small></span>
      </div>
      <nav className="wwa-starter-steps" aria-label="Starter guide steps">
        {STEPS.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            className={idx === step ? 'is-active' : idx < step ? 'is-done' : ''}
            aria-current={idx === step ? 'step' : undefined}
            onClick={() => go(idx)}
          >
            <span>{item.code}</span>
            <small>{item.short}</small>
          </button>
        ))}
      </nav>
      <button type="button" className="wwa-starter-skip" onClick={() => { onHaptic?.('tap'); onFinishToLobby(); }}>
        {isFirstLaunch ? 'Skip to lobby' : 'Close guide'}
      </button>
    </header>

    <div className="wwa-starter-progress" aria-hidden="true">
      <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
    </div>

    <div className="wwa-starter-body">
      {step === 0 && (
        <div className="wwa-starter-panel wwa-starter-welcome">
          <div className="wwa-starter-lead">
            <span className="wwa-kicker"><i />STEP 01 / FIRST LAUNCH BRIEFING</span>
            <h1>YOUR ROAD.<br /><em>YOUR PACE.</em></h1>
            <p className="wwa-starter-copy">
              Welcome to Windway — an offline 3D motorsport escape built for smooth landscape driving.
              In four quick steps, learn how to switch paths, pick levels, customize your machine, and take full command on the road.
            </p>
            <div className="wwa-starter-pillars">
              <article>
                <strong>03</strong>
                <span>Distinct Paths</span>
                <small>Alpine Valley, Canopy Run &amp; Frostbite Ascent</small>
              </article>
              <article>
                <strong>18</strong>
                <span>Level Challenges</span>
                <small>6 progressive tiers per path, Explorer to Master</small>
              </article>
              <article>
                <strong>100%</strong>
                <span>Offline Ready</span>
                <small>Saved locally on device with instant Continue</small>
              </article>
            </div>
          </div>
          <div className="wwa-starter-visual">
            <img src={appAsset('branding/windway-crest.svg')} alt="Windway motorsport crest" width="132" height="132" />
            <div className="wwa-starter-tip-card">
              <span className="wwa-kicker">LANDSCAPE COCKPIT</span>
              <strong>Hold with both hands</strong>
              <p>Keep your left thumb on steering and drift, and your right thumb on brake and throttle.</p>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="wwa-starter-panel wwa-starter-setup">
          <div className="wwa-starter-col-intro">
            <span className="wwa-kicker"><i />STEP 02 / HOW TO SWITCH SETUP</span>
            <h1>PICK YOUR PATH,<br /><em>CAR &amp; LEVEL.</em></h1>
            <p className="wwa-starter-copy">
              Use the Lobby dock anytime to open <strong>Paths</strong>, <strong>Levels</strong>, or <strong>Garage</strong>.
              Try switching your starting combination right here — every choice updates your drive immediately.
            </p>
            <div className="wwa-starter-summary-box">
              <span>ACTIVE CONFIGURATION</span>
              <strong>{selectedMap.name} · Level {selectedLevel.id} ({selectedLevel.name})</strong>
              <small>{facts.gates} gates · {facts.width.toFixed(1)} m road · {facts.obstacles} {selectedMap.id === 'snow' ? 'snow hurdles' : 'slalom barriers'}</small>
            </div>
          </div>

          <div className="wwa-starter-pickers">
            <fieldset className="wwa-starter-group">
              <legend>01 / Choose your path</legend>
              <div className="wwa-starter-chips">
                {APP_MAPS.map((map) => (
                  <button
                    key={map.id}
                    type="button"
                    aria-pressed={app.config.mapId === map.id}
                    onClick={() => { onHaptic?.('tap'); onPatch({ mapId: map.id }); }}
                  >
                    <strong>{map.name}</strong>
                    <small>{map.difficulty}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="wwa-starter-group">
              <legend>02 / Select your machine</legend>
              <div className="wwa-starter-chips wwa-starter-chips-2">
                {GAME_CARS.map((car) => (
                  <button
                    key={car.id}
                    type="button"
                    aria-pressed={app.config.carId === car.id}
                    onClick={() => { onHaptic?.('tap'); onPatch({ carId: car.id }); }}
                  >
                    <strong>{car.name}</strong>
                    <small>{car.nickname}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="wwa-starter-group">
              <legend>03 / Choose starting level</legend>
              <div className="wwa-starter-level-row">
                {LEVELS.map((lvl) => (
                  <button
                    key={lvl.id}
                    type="button"
                    aria-pressed={app.config.level === lvl.id}
                    onClick={() => { onHaptic?.('tap'); onPatch({ level: lvl.id }); }}
                  >
                    <strong>L{lvl.id}</strong>
                    <small>{lvl.name}</small>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="wwa-starter-panel wwa-starter-controls">
          <div className="wwa-starter-col-intro">
            <span className="wwa-kicker"><i />STEP 03 / HOW TO PLAY &amp; STEER</span>
            <h1>COMMAND THE<br /><em>COCKPIT.</em></h1>
            <p className="wwa-starter-copy">
              Choose the steering feel that matches your grip. You can switch controls, sensitivity, or Chase/Hood camera anytime in <strong>Settings</strong>.
            </p>
            <fieldset className="wwa-starter-group">
              <legend>Preferred steering style</legend>
              <div className="wwa-starter-chips">
                {([
                  { id: 'arrows' as const, label: 'Arrow Buttons', note: 'Crisp left & right taps' },
                  { id: 'wheel' as const, label: 'Steering Wheel', note: 'Smooth drag-to-turn' },
                  ...(hasTiltSensor ? [{ id: 'tilt' as const, label: 'Phone Tilt', note: 'Roll phone like a wheel' }] : []),
                ]).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={app.config.steeringMode === mode.id}
                    onClick={() => { onHaptic?.('tap'); onPatch({ steeringMode: mode.id }); }}
                  >
                    <strong>{mode.label}</strong>
                    <small>{mode.note}</small>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="wwa-cockpit-diagram" aria-label="Driving controls layout">
            <div className="wwa-diagram-row wwa-diagram-top">
              <div><strong>STOP / CAM / RECOVER</strong><small>Top-left: Save &amp; exit, switch Chase/Hood view, or reset to last gate</small></div>
              <div><strong>CLOCK &amp; PAUSE</strong><small>Top-right: Live time, gates, and pit-stop pause</small></div>
            </div>
            <div className="wwa-diagram-center">
              <span>CLEAR CENTER VIEW — THE ROAD STAYS UNOBSTRUCTED</span>
            </div>
            <div className="wwa-diagram-row wwa-diagram-bottom">
              <div><strong>LEFT THUMB · STEER + DRIFT</strong><small>Arrows, wheel, or phone tilt + hold DRIFT for tight corners</small></div>
              <div><strong>RIGHT THUMB · BRAKE + GO</strong><small>Hold GO to accelerate · Hold BRAKE early before hairpins &amp; ice</small></div>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="wwa-starter-panel wwa-starter-ready">
          <div className="wwa-starter-col-intro">
            <span className="wwa-kicker"><i />STEP 04 / LEVELS, GATES &amp; SAVES</span>
            <h1>READY FOR<br /><em>GREEN LIGHTS.</em></h1>
            <p className="wwa-starter-copy">
              Every drive saves automatically as you clear gates. You are all set to enter the Lobby or roll directly onto the grid.
            </p>
            <div className="wwa-starter-ready-actions">
              <button type="button" className="wwa-button wwa-primary" onClick={() => { onHaptic?.('boost'); onFinishAndDrive(); }}>
                <AppIcon name="play" />
                <span>Start {selectedMap.name} · L{selectedLevel.id}</span>
              </button>
              <button type="button" className="wwa-button wwa-secondary" onClick={() => { onHaptic?.('tap'); onFinishToLobby(); }}>
                <AppIcon name="compass" />
                <span>Open Full Lobby</span>
              </button>
            </div>
          </div>

          <div className="wwa-starter-rules">
            <article>
              <AppIcon name="flag" />
              <div>
                <strong>Cross Gates in Order</strong>
                <p>Follow the glowing corner minimap. Alpine &amp; Canopy feature boost ramps; Frostbite Ascent has black ice and snow hurdles.</p>
              </div>
            </article>
            <article>
              <AppIcon name="levels" />
              <div>
                <strong>Climb All 6 Levels</strong>
                <p>Higher levels tighten sections, add slalom barriers and checkpoints, and award Platinum, Gold, Silver, or Bronze run grades.</p>
              </div>
            </article>
            <article>
              <AppIcon name="continue" />
              <div>
                <strong>Pause or Stop Anytime</strong>
                <p>Tap Stop or Android Back to save your latest earned gate. Use Continue in the Lobby to resume right where you left off.</p>
              </div>
            </article>
          </div>
        </div>
      )}
    </div>

    <footer className="wwa-starter-foot">
      <button type="button" className="wwa-button wwa-secondary" disabled={step === 0} onClick={() => go(step - 1)}>
        <AppIcon name="back" />
        <span>Back</span>
      </button>
      <span className="wwa-starter-counter">STEP {current.code} OF 0{STEPS.length} · {current.title.toUpperCase()}</span>
      {step < STEPS.length - 1 ? (
        <button type="button" className="wwa-button wwa-primary" onClick={() => go(step + 1)}>
          <span>Next Step</span>
          <AppIcon name="arrowRight" />
        </button>
      ) : (
        <button type="button" className="wwa-button wwa-primary" onClick={() => { onHaptic?.('boost'); onFinishToLobby(); }}>
          <span>Enter Lobby</span>
          <AppIcon name="arrowRight" />
        </button>
      )}
    </footer>
  </section>;
}
