import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { carById, formatTime } from './config';
import { LEVELS } from './levels';
import {
  APP_CREW,
  APP_MAPS,
  countTotalCompletions,
  defaultBrowserAppState,
  loadBrowserAppState,
  persistBrowserAppState,
  recordBrowserResult,
  saveBrowserCheckpoint,
  setOnboardingCompleted,
  updateBrowserConfig,
  validateBrowserSavedRun,
  type BrowserAppState,
  type BrowserGameConfig,
  type BrowserSavedRun,
} from './mobileAppPreferences';
import { AppIcon, pageNames, ScenicBackdrop, type AppPage } from './MobileAppElements';
import MobileAppPages from './MobileAppPages';
import StarterOnboarding from './StarterOnboarding';
import './mobile-app-shell.css';

const MobileShowroom = lazy(() => import('./MobileShowroom'));

interface GameSession { id: number; config: BrowserGameConfig; resume: BrowserSavedRun | null }
interface AndroidDeviceInfo { hasTiltSensor?: boolean; totalMemoryMb?: number; cpuCores?: number }

function readAndroidDeviceInfo(): AndroidDeviceInfo {
  try {
    const raw = typeof window !== 'undefined' ? window.WindwayAndroidHost?.getDeviceInfo() : null;
    return raw ? JSON.parse(raw) as AndroidDeviceInfo : {};
  } catch {
    return {};
  }
}

export default function MobileAppShell() {
  const [app, setApp] = useState(loadBrowserAppState);
  const [page, setPage] = useState<AppPage>('home');
  const [showStarter, setShowStarter] = useState(() => !loadBrowserAppState().onboardingCompleted);
  const [session, setSession] = useState<GameSession | null>(null);
  const [gameStatus, setGameStatus] = useState<string>('idle');
  const [gameReady, setGameReady] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [notice, setNotice] = useState('');
  const [fullscreen, setFullscreen] = useState(false);

  const [deviceInfo] = useState(readAndroidDeviceInfo);
  const isAndroidHost = typeof window !== 'undefined' && Boolean(window.WindwayAndroidHost);
  const hasTiltSensor = isAndroidHost ? deviceInfo.hasTiltSensor !== false : false;

  const iframe = useRef<HTMLIFrameElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const appRef = useRef(app);
  const pageRef = useRef(page);
  const showStarterRef = useRef(showStarter);
  const lastBackAt = useRef(0);
  const handshaken = useRef<number | null>(null);
  const latestSessionSave = useRef<BrowserSavedRun | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextSession = useRef(0);

  const update = useCallback((transform: (state: BrowserAppState) => BrowserAppState) => setApp((previous) => transform(previous)), []);

  const triggerHaptic = useCallback((kind: string) => {
    if (!appRef.current.config.haptics) return;
    try { window.WindwayAndroidHost?.haptic(kind); } catch { /* Host optional. */ }
  }, []);

  useLayoutEffect(() => { appRef.current = app; setStorageWarning(!persistBrowserAppState(app)); }, [app]);
  useLayoutEffect(() => { sessionRef.current = session; }, [session]);
  useLayoutEffect(() => { pageRef.current = page; }, [page]);
  useLayoutEffect(() => { showStarterRef.current = showStarter; }, [showStarter]);

  const clearWatchdog = useCallback(() => { if (watchdog.current !== null) { clearTimeout(watchdog.current); watchdog.current = null; } }, []);
  const sendCommand = useCallback((command: string) => { iframe.current?.contentWindow?.postMessage({ source: 'windway-app', type: 'command', command }, window.location.origin); }, []);
  const sendSteer = useCallback((value: number) => { iframe.current?.contentWindow?.postMessage({ source: 'windway-app', type: 'steer', value }, window.location.origin); }, []);

  const openPage = (next: AppPage) => { triggerHaptic('tap'); setPage(next); setNotice(''); };
  const patch = (value: Partial<BrowserGameConfig>) => update((state) => updateBrowserConfig(state, value));

  const startDrive = useCallback((resume = false) => {
    triggerHaptic('boost');
    setNotice('');
    setGameError(null);
    setGameReady(false);
    setGameStatus('loading');
    handshaken.current = null;
    latestSessionSave.current = null;
    setSession({ id: ++nextSession.current, config: { ...appRef.current.config }, resume: resume ? appRef.current.savedRun : null });
  }, [triggerHaptic]);

  const leaveDrive = useCallback(() => {
    clearWatchdog();
    setSession(null);
    setGameReady(false);
    setGameError(null);
    setGameStatus('idle');
    setPage('home');
    try {
      window.WindwayAndroidHost?.setTiltActive(false, 1, false);
      window.WindwayAndroidHost?.setKeepScreenOn(false);
    } catch { /* Host optional. */ }
  }, [clearWatchdog]);

  useEffect(() => { document.body.classList.add('windway-app'); return () => document.body.classList.remove('windway-app'); }, []);

  // Keep Android screen awake during an active race session and control tilt streaming.
  useEffect(() => {
    try { window.WindwayAndroidHost?.setKeepScreenOn(Boolean(session)); } catch { /* Host optional. */ }
    const tiltRunning = Boolean(session && gameStatus === 'running' && app.config.steeringMode === 'tilt' && hasTiltSensor);
    try { window.WindwayAndroidHost?.setTiltActive(tiltRunning, app.config.sensitivity, app.config.invertTilt); } catch { /* Host optional. */ }
    return () => {
      if (!session) {
        try { window.WindwayAndroidHost?.setTiltActive(false, 1, false); } catch { /* Host optional. */ }
      }
    };
  }, [session, gameStatus, app.config.steeringMode, app.config.sensitivity, app.config.invertTilt, hasTiltSensor]);

  // Register global callbacks for Native Kotlin Android host (tilt, back button, lifecycle).
  useEffect(() => {
    window.onWindwayTilt = (value: number) => {
      if (sessionRef.current && Number.isFinite(value)) sendSteer(value);
    };
    window.onWindwayLifecycle = (event: string) => {
      if (event === 'pause') {
        persistBrowserAppState(appRef.current);
        if (sessionRef.current) sendCommand('pause');
      }
    };
    window.onWindwayBack = () => {
      if (sessionRef.current) { sendCommand('pause'); return; }
      if (showStarterRef.current) {
        if (appRef.current.onboardingCompleted) setShowStarter(false);
        else { update((s) => setOnboardingCompleted(s, true)); setShowStarter(false); }
        return;
      }
      if (pageRef.current !== 'home') { setPage('home'); return; }
      const now = Date.now();
      if (now - lastBackAt.current < 2400) {
        window.WindwayAndroidHost?.exitApp();
      } else {
        lastBackAt.current = now;
        setNotice('Press Back again to exit Windway.');
      }
    };
    return () => {
      delete window.onWindwayTilt;
      delete window.onWindwayLifecycle;
      delete window.onWindwayBack;
    };
  }, [sendCommand, sendSteer, update]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const active = sessionRef.current, child = iframe.current?.contentWindow;
      if (!active || !child || event.source !== child || event.origin !== window.location.origin) return;
      const data: unknown = event.data;
      if (!data || typeof data !== 'object') return;
      const envelope = data as Record<string, unknown>;
      if (envelope.source !== 'windway-game' || !envelope.message || typeof envelope.message !== 'object') return;
      const message = envelope.message as Record<string, unknown>;
      if (message.type === 'ready') {
        if (message.protocol !== 1) { setGameError('Refresh or restart Windway to update this game package, then try again.'); return; }
        if (handshaken.current === active.id) return;
        handshaken.current = active.id; setGameError(null);
        child.postMessage({
          source: 'windway-app',
          type: 'configure',
          config: {
            ...active.config,
            bestTimes: { ...appRef.current.bestTimes },
            completedLevels: { ...appRef.current.completedLevels },
          },
        }, window.location.origin);
        child.postMessage({ source: 'windway-app', type: 'start', resume: active.resume }, window.location.origin);
      } else if (message.type === 'state') {
        if (typeof message.status === 'string') {
          setGameStatus(message.status);
          if (['countdown', 'running', 'paused', 'recovering', 'finished'].includes(message.status)) { clearWatchdog(); setGameReady(true); }
        }
      } else if (message.type === 'save') {
        const run = validateBrowserSavedRun(message.run), expected = active.resume ?? active.config;
        if (run && run.mapId === expected.mapId && run.carId === expected.carId) {
          latestSessionSave.current = run;
          update((state) => saveBrowserCheckpoint(state, run));
        }
      } else if (message.type === 'level') {
        if (typeof message.level === 'number' && Number.isInteger(message.level)) {
          update((state) => updateBrowserConfig(state, { level: message.level as number }));
        }
      } else if (message.type === 'finished') {
        const expected = active.resume ?? active.config, result = message.result as Record<string, unknown> | null;
        if (result && result.mapId === expected.mapId && result.carId === expected.carId) {
          update((state) => recordBrowserResult(state, result));
        }
      } else if (message.type === 'calibrate') {
        try { window.WindwayAndroidHost?.calibrateTilt(); } catch { /* Host optional. */ }
      } else if (message.type === 'haptic') {
        if (typeof message.kind === 'string') triggerHaptic(message.kind);
      } else if (message.type === 'exit') leaveDrive();
      else if (message.type === 'error') { clearWatchdog(); setGameError('The 3D drive could not finish loading. Try again, or choose Low graphics in Settings. Your last checkpoint is safe.'); }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [clearWatchdog, leaveDrive, triggerHaptic, update]);

  useEffect(() => {
    if (!session) return;
    clearWatchdog();
    watchdog.current = setTimeout(() => setGameError('The drive took too long to open. Try again, or switch to Low graphics in Settings.'), 45000);
    iframe.current?.focus();
    return clearWatchdog;
  }, [session, clearWatchdog]);

  useEffect(() => {
    const background = () => { if (document.visibilityState === 'hidden' && sessionRef.current) sendCommand('pause'); };
    const saveBeforeLeaving = () => { persistBrowserAppState(appRef.current); if (sessionRef.current) sendCommand('pause'); };
    document.addEventListener('visibilitychange', background); window.addEventListener('pagehide', saveBeforeLeaving);
    return () => { document.removeEventListener('visibilitychange', background); window.removeEventListener('pagehide', saveBeforeLeaving); };
  }, [sendCommand]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (sessionRef.current) sendCommand('pause');
      else if (showStarterRef.current) { update((s) => setOnboardingCompleted(s, true)); setShowStarter(false); }
      else setPage('home');
    };
    const changed = () => setFullscreen(!!document.fullscreenElement);
    window.addEventListener('keydown', escape); document.addEventListener('fullscreenchange', changed);
    return () => { window.removeEventListener('keydown', escape); document.removeEventListener('fullscreenchange', changed); };
  }, [sendCommand, update]);

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [page, showStarter]);

  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { setNotice('Full screen is unavailable in this browser. You can still drive.'); }
  };

  const selectedMap = APP_MAPS.find((map) => map.id === app.config.mapId) ?? APP_MAPS[0];
  const selectedLevel = LEVELS[app.config.level] ?? LEVELS[0];
  const selectedCar = carById(app.config.carId);
  const selectedCrew = APP_CREW.find((crew) => crew.id === app.config.character) ?? APP_CREW[0];
  const savedMap = APP_MAPS.find((map) => map.id === app.savedRun?.mapId);
  const routeNumber = APP_MAPS.findIndex((map) => map.id === selectedMap.id) + 1;
  const totalCleared = countTotalCompletions(app);

  const completeOnboarding = (launchDrive: boolean) => {
    update((state) => setOnboardingCompleted(state, true));
    setShowStarter(false);
    setPage('home');
    if (launchDrive) startDrive(false);
  };

  const resetDefaults = () => {
    const fresh = defaultBrowserAppState();
    update((state) => updateBrowserConfig(state, fresh.config));
    setNotice('Settings restored to recommended defaults.');
  };

  const action = <button type="button" className="wwa-button wwa-primary" onClick={() => startDrive()}>
    <AppIcon name="play" />
    <span>Start drive</span>
    <span className="wwa-button-code" aria-hidden="true">L{selectedLevel.id}</span>
  </button>;

  const menuItems = [
    { page: 'maps', icon: 'road', title: 'Paths', detail: selectedMap.name },
    { page: 'levels', icon: 'levels', title: 'Levels', detail: `L${selectedLevel.id} · ${selectedLevel.name}` },
    { page: 'garage', icon: 'car', title: 'Garage', detail: selectedCar.name.split(' ')[0] },
    { page: 'crew', icon: 'crew', title: 'Crew', detail: selectedCrew.name },
    { page: 'records', icon: 'records', title: 'Records', detail: `${totalCleared}/18 cleared` },
    { page: 'help', icon: 'help', title: 'Guide', detail: 'Controls & tips' },
  ] as const;

  const activeDataPage = session ? 'game' : showStarter ? 'starter' : page;

  return <main className={`wwa wwa-page-${activeDataPage} wwa-map-${selectedMap.id}${app.config.reducedMotion ? ' wwa-reduce-motion' : ''}`} data-app-page={activeDataPage}>
    {!session && <ScenicBackdrop mapId={app.config.mapId} />}
    {session ? <div className="wwa-game" aria-label="Windway driving game">
      <iframe key={session.id} ref={iframe} title="Windway drive" src={`${import.meta.env.BASE_URL}index.html?native=1&previewGame=1`} allow="autoplay; fullscreen" allowFullScreen onError={() => setGameError('The game could not open. Try again, or return to the lobby.')} />
      {(!gameReady || gameError) && <div className="wwa-game-overlay"><div className="wwa-game-loading" role={gameError ? 'alert' : 'status'}>
        <span className="wwa-loading-code">WW / DRIVE SYSTEM · LEVEL 0{selectedLevel.id}</span>
        <AppIcon name={gameError ? 'help' : 'car'} />
        <span className="wwa-kicker">{gameError ? 'Drive interrupted' : 'Starting your drive'}</span>
        <h1>{gameError ? 'Let’s get you back on the road.' : `${selectedMap.name} ready.`}</h1>
        <p>{gameError ?? `Loading ${selectedCar.name} for Level ${selectedLevel.id} (${selectedLevel.name})…`}</p>
        {!gameError && <div className="wwa-progress" aria-label="Loading game"><span /></div>}
        {gameError && <button type="button" className="wwa-button wwa-primary" onClick={() => { const old = sessionRef.current; setGameError(null); setGameReady(false); handshaken.current = null; if (old) setSession({ ...old, id: ++nextSession.current, config: { ...old.config, level: appRef.current.config.level }, resume: latestSessionSave.current ?? old.resume }); }}>Try again</button>}
        <button type="button" className="wwa-text-button" onClick={leaveDrive}>Back to lobby</button>
      </div></div>}
    </div> : showStarter ? (
      <StarterOnboarding
        app={app}
        hasTiltSensor={hasTiltSensor}
        isFirstLaunch={!app.onboardingCompleted}
        onPatch={patch}
        onFinishToLobby={() => completeOnboarding(false)}
        onFinishAndDrive={() => completeOnboarding(true)}
        onHaptic={triggerHaptic}
      />
    ) : <>
      <header className="wwa-header">
        {page === 'home' ? (
          <div className="wwa-brand">
            <AppIcon name="road" />
            <span>WINDWAY<small>{isAndroidHost ? 'ANDROID OFFLINE EDITION' : 'MOBILE DRIVING EDITION'}</small></span>
          </div>
        ) : (
          <button type="button" className="wwa-back" onClick={() => openPage('home')}>
            <AppIcon name="back" />
            <span>Lobby</span>
          </button>
        )}
        <span className="wwa-header-label">
          <i />
          {page === 'home'
            ? `${selectedMap.name.toUpperCase()} · LEVEL 0${selectedLevel.id} · ${totalCleared}/18 CLEARED`
            : `DRIVE SYSTEM / ${page.toUpperCase()}`}
        </span>
        <div className="wwa-header-tools">
          <button type="button" className="wwa-icon-button" aria-label="Starter guide" title="Starter guide" onClick={() => { triggerHaptic('tap'); setShowStarter(true); }}>
            <AppIcon name="compass" />
          </button>
          {!isAndroidHost && (
            <button type="button" className="wwa-icon-button" aria-label={fullscreen ? 'Leave full screen' : 'Enter full screen'} title="Full screen" onClick={() => { void toggleFullscreen(); }}>
              <AppIcon name="fullscreen" />
            </button>
          )}
          {page !== 'settings' && (
            <button type="button" className="wwa-icon-button" aria-label="Settings" title="Settings" onClick={() => openPage('settings')}>
              <AppIcon name="settings" />
            </button>
          )}
        </div>
      </header>

      {page === 'home' ? <section className="wwa-lobby" aria-label="Drive lobby">
        <div className="wwa-lobby-copy">
          <span className="wwa-kicker"><i />PATH 0{routeNumber} / LEVEL 0{selectedLevel.id} · {selectedLevel.name.toUpperCase()}</span>
          <h1 ref={heading} tabIndex={-1}>FIND YOUR<br /><em>NEXT LINE.</em></h1>
          <div className="wwa-lobby-selection">
            <button type="button" className="wwa-quick-pill" onClick={() => openPage('maps')}><small>PATH</small>{selectedMap.name}</button>
            <i />
            <button type="button" className="wwa-quick-pill" onClick={() => openPage('levels')}><small>LEVEL</small>L{selectedLevel.id} · {selectedLevel.name}</button>
            <i />
            <button type="button" className="wwa-quick-pill" onClick={() => openPage('garage')}><small>MACHINE</small>{selectedCar.name}</button>
          </div>
          <div className="wwa-start-actions">
            {action}
            <button type="button" className="wwa-button wwa-continue" disabled={!app.savedRun} onClick={() => startDrive(true)}>
              <AppIcon name="continue" />
              <span>Continue</span>
            </button>
          </div>
          <p className="wwa-save-caption">
            {app.savedRun
              ? `${savedMap?.name ?? 'Saved drive'} · L${app.savedRun.level ?? 0} · Gate ${app.savedRun.checkpoint + 1} · ${formatTime(app.savedRun.elapsed)}`
              : 'Hold GO to accelerate. Tap Paths, Levels, or Garage to customize.'}
          </p>
        </div>

        <div className="wwa-lobby-stage">
          <div className="wwa-stage-grid" aria-hidden="true" />
          <div className="wwa-stage-status" aria-hidden="true"><span>VEHICLE / {selectedCar.number}</span><span>LIVE 3D SETUP</span></div>
          <Suspense fallback={<div className="wwa-preview-note">Preparing your car…</div>}>
            <MobileShowroom key={app.config.carId} carId={app.config.carId} paint={app.config.paint} />
          </Suspense>
          <div className="wwa-car-caption">
            <span>{selectedCar.nickname}</span>
            <strong>{selectedCar.name}</strong>
            <small>{selectedMap.region} / Level {selectedLevel.id} {selectedLevel.name}</small>
          </div>
          <span className="wwa-stage-index" aria-hidden="true">0{routeNumber}<small>/ 03</small></span>
        </div>

        <nav className="wwa-lobby-dock" aria-label="Game menu">
          {menuItems.map((item, index) => (
            <button key={item.page} type="button" onClick={() => openPage(item.page)}>
              <span className="wwa-dock-index">0{index + 1}</span>
              <AppIcon name={item.icon} />
              <span><strong>{item.title}</strong><small>{item.detail}</small></span>
            </button>
          ))}
        </nav>
        <button type="button" className="wwa-about-link" onClick={() => openPage('about')}>Windway / By Waqar Ahmed <span aria-hidden="true">↗</span></button>
      </section> : <>
        <section className="wwa-content" aria-labelledby="wwa-page-title" key={page}>
          <div className="wwa-title">
            <div>
              <span className="wwa-kicker">{page === 'maps' ? 'Path database / 01—03' : page === 'levels' ? 'Progressive challenge / Levels 0—5' : page === 'garage' ? 'Machine configuration / Live 3D' : page === 'records' ? 'Local telemetry / Personal bests' : page === 'settings' ? 'System configuration / Driver' : page === 'crew' ? 'Driver support / Select crew' : page === 'help' ? 'Driver briefing / Controls & tips' : 'Independent / Offline project'}</span>
              <h1 id="wwa-page-title" ref={heading} tabIndex={-1}>{pageNames[page]}</h1>
            </div>
            <span className="wwa-title-code" aria-hidden="true">WW / {page.toUpperCase()}</span>
          </div>
          <MobileAppPages
            page={page}
            app={app}
            hasTiltSensor={hasTiltSensor}
            isAndroidHost={isAndroidHost}
            patch={patch}
            onNavigate={openPage}
            onOpenStarter={() => setShowStarter(true)}
            onResetDefaults={resetDefaults}
            onHaptic={triggerHaptic}
          />
        </section>
        <footer className="wwa-action-bar">
          <div>
            <span className="wwa-kicker">READY / PATH 0{routeNumber} · LEVEL 0{selectedLevel.id}</span>
            <strong>{selectedMap.name}<span> / </span>{selectedLevel.name}<span> / </span>{selectedCar.name}</strong>
          </div>
          <div className="wwa-footer-actions">
            {page !== 'levels' && <button type="button" className="wwa-button wwa-secondary" onClick={() => openPage('levels')}><AppIcon name="levels" />Levels</button>}
            {page !== 'maps' && <button type="button" className="wwa-button wwa-secondary" onClick={() => openPage('maps')}><AppIcon name="road" />Paths</button>}
            {action}
          </div>
        </footer>
      </>}
      {(storageWarning || notice) && <div className="wwa-notice" role="status">{notice || 'Local storage is unavailable. You can still play; progress may not be saved.'}<button type="button" aria-label="Dismiss message" onClick={() => { setNotice(''); setStorageWarning(false); }}>×</button></div>}
    </>}
  </main>;
}
