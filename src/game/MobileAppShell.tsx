import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { carById, formatTime } from './config';
import { APP_CREW, APP_MAPS, loadBrowserAppState, persistBrowserAppState, recordBrowserResult, saveBrowserCheckpoint, updateBrowserConfig, validateBrowserSavedRun, type BrowserAppState, type BrowserGameConfig, type BrowserSavedRun } from './mobileAppPreferences';
import { AppIcon, pageNames, ScenicBackdrop, type AppPage } from './MobileAppElements';
import MobileAppPages from './MobileAppPages';
import './mobile-app-shell.css';

const MobileShowroom = lazy(() => import('./MobileShowroom'));
interface GameSession { id: number; config: BrowserGameConfig; resume: BrowserSavedRun | null }

export default function MobileAppShell() {
  const [app, setApp] = useState(loadBrowserAppState), [page, setPage] = useState<AppPage>('home');
  const [session, setSession] = useState<GameSession | null>(null);
  const [gameReady, setGameReady] = useState(false), [gameError, setGameError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState(false), [notice, setNotice] = useState(''), [fullscreen, setFullscreen] = useState(false);
  const iframe = useRef<HTMLIFrameElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const sessionRef = useRef<GameSession | null>(null), appRef = useRef(app), handshaken = useRef<number | null>(null);
  const latestSessionSave = useRef<BrowserSavedRun | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null), nextSession = useRef(0);
  const update = useCallback((transform: (state: BrowserAppState) => BrowserAppState) => setApp((previous) => transform(previous)), []);
  useLayoutEffect(() => { appRef.current = app; setStorageWarning(!persistBrowserAppState(app)); }, [app]);
  useLayoutEffect(() => { sessionRef.current = session; }, [session]);
  const clearWatchdog = useCallback(() => { if (watchdog.current !== null) { clearTimeout(watchdog.current); watchdog.current = null; } }, []);
  const sendCommand = useCallback((command: string) => { iframe.current?.contentWindow?.postMessage({ source: 'windway-app', type: 'command', command }, window.location.origin); }, []);
  const openPage = (next: AppPage) => { setPage(next); setNotice(''); };
  const patch = (value: Partial<BrowserGameConfig>) => update((state) => updateBrowserConfig(state, value));
  const startDrive = (resume = false) => {
    setNotice(''); setGameError(null); setGameReady(false); handshaken.current = null; latestSessionSave.current = null;
    setSession({ id: ++nextSession.current, config: { ...appRef.current.config }, resume: resume ? appRef.current.savedRun : null });
  };
  const leaveDrive = useCallback(() => { clearWatchdog(); setSession(null); setGameReady(false); setGameError(null); setPage('home'); }, [clearWatchdog]);
  useEffect(() => { document.body.classList.add('windway-app'); return () => document.body.classList.remove('windway-app'); }, []);
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
        if (message.protocol !== 1) { setGameError('Refresh the page to update this game package, then try again.'); return; }
        if (handshaken.current === active.id) return;
        handshaken.current = active.id; setGameError(null);
        child.postMessage({ source: 'windway-app', type: 'configure', config: { ...active.config, bestTimes: { ...appRef.current.bestTimes } } }, window.location.origin);
        child.postMessage({ source: 'windway-app', type: 'start', resume: active.resume }, window.location.origin);
      } else if (message.type === 'state') {
        if (typeof message.status === 'string' && ['countdown', 'running', 'paused', 'recovering', 'finished'].includes(message.status)) { clearWatchdog(); setGameReady(true); }
      } else if (message.type === 'save') {
        const run = validateBrowserSavedRun(message.run), expected = active.resume ?? active.config;
        if (run && run.mapId === expected.mapId && run.carId === expected.carId) { latestSessionSave.current = run; update((state) => saveBrowserCheckpoint(state, run)); }
      } else if (message.type === 'finished') {
        const expected = active.resume ?? active.config, result = message.result as Record<string, unknown> | null;
        if (result && result.mapId === expected.mapId && result.carId === expected.carId) update((state) => recordBrowserResult(state, result));
      } else if (message.type === 'exit') leaveDrive();
      else if (message.type === 'error') { clearWatchdog(); setGameError('The 3D drive could not finish loading. Try again, or choose Low graphics in Settings. Your last checkpoint is safe.'); }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [clearWatchdog, leaveDrive, update]);
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
    const escape = (event: KeyboardEvent) => { if (event.key !== 'Escape') return; if (sessionRef.current) sendCommand('pause'); else setPage('home'); };
    const changed = () => setFullscreen(!!document.fullscreenElement);
    window.addEventListener('keydown', escape); document.addEventListener('fullscreenchange', changed);
    return () => { window.removeEventListener('keydown', escape); document.removeEventListener('fullscreenchange', changed); };
  }, [sendCommand]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [page]);
  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { setNotice('Full screen is unavailable in this browser. You can still drive.'); }
  };
  const selectedMap = APP_MAPS.find((map) => map.id === app.config.mapId) ?? APP_MAPS[0];
  const selectedCar = carById(app.config.carId), selectedCrew = APP_CREW.find((crew) => crew.id === app.config.character) ?? APP_CREW[0];
  const savedMap = APP_MAPS.find((map) => map.id === app.savedRun?.mapId);
  const action = <button className="wwa-button wwa-primary" onClick={() => startDrive()}><AppIcon name="play" /><span>Start drive</span></button>;
  return <main className={`wwa wwa-page-${page}${app.config.reducedMotion ? ' wwa-reduce-motion' : ''}`} data-app-page={session ? 'game' : page}>
    {!session && <ScenicBackdrop mapId={app.config.mapId} />}
    {session ? <div className="wwa-game" aria-label="Windway driving game">
      <iframe key={session.id} ref={iframe} title="Windway drive" src={`${import.meta.env.BASE_URL}index.html?native=1&previewGame=1`} allow="autoplay; fullscreen" allowFullScreen onError={() => setGameError('The game could not open. Try again, or return to the lobby.')} />
      {(!gameReady || gameError) && <div className="wwa-game-overlay"><div className="wwa-game-loading" role={gameError ? 'alert' : 'status'}>
        <AppIcon name={gameError ? 'help' : 'car'} /><span className="wwa-kicker">{gameError ? 'Drive interrupted' : 'Starting your drive'}</span>
        <h1>{gameError ? 'Let’s get you back on the road.' : 'Your starting line is ready.'}</h1><p>{gameError ?? 'Preparing the car, the road and your controls.'}</p>
        {!gameError && <div className="wwa-progress" aria-label="Loading game"><span /></div>}
        {gameError && <button className="wwa-button wwa-primary" onClick={() => { const old = sessionRef.current; setGameError(null); setGameReady(false); handshaken.current = null; if (old) setSession({ ...old, id: ++nextSession.current, resume: latestSessionSave.current ?? old.resume }); }}>Try again</button>}
        <button className="wwa-text-button" onClick={leaveDrive}>Back to lobby</button>
      </div></div>}
    </div> : <>
      <header className="wwa-header">
        {page === 'home' ? <div className="wwa-brand"><AppIcon name="road" /><span>WINDWAY<small>THE LONG WAY HOME</small></span></div> : <button className="wwa-back" onClick={() => openPage('home')}><AppIcon name="back" /><span>Lobby</span></button>}
        <span className="wwa-header-label">{page === 'home' ? 'FREE DRIVE' : `DRIVE / ${page.toUpperCase()}`}</span>
        <div className="wwa-header-tools"><button className="wwa-icon-button" aria-label={fullscreen ? 'Leave full screen' : 'Enter full screen'} title="Full screen" onClick={() => { void toggleFullscreen(); }}><AppIcon name="fullscreen" /></button>{page !== 'settings' && <button className="wwa-icon-button" aria-label="Settings" title="Settings" onClick={() => openPage('settings')}><AppIcon name="settings" /></button>}</div>
      </header>
      {page === 'home' ? <section className="wwa-lobby">
        <div className="wwa-lobby-copy"><span className="wwa-kicker">{selectedMap.region}</span><h1 ref={heading} tabIndex={-1}>Your road.<br /><em>Your pace.</em></h1><p>{selectedMap.name}<span />{selectedCar.name}</p><div className="wwa-start-actions">{action}<button className="wwa-button wwa-continue" disabled={!app.savedRun} onClick={() => startDrive(true)}><AppIcon name="continue" /><span>Continue</span></button></div><p className="wwa-save-caption">{app.savedRun ? `${savedMap?.name ?? 'Saved drive'} · Gate ${app.savedRun.checkpoint + 1} · ${formatTime(app.savedRun.elapsed)}` : 'Hold the accelerator. Find your line. Pause anytime.'}</p></div>
        <Suspense fallback={<div className="wwa-preview-note">Preparing your car…</div>}><MobileShowroom key={app.config.carId} carId={app.config.carId} paint={app.config.paint} /></Suspense>
        <div className="wwa-car-caption"><span>{selectedCar.nickname}</span><strong>{selectedCar.name}</strong><small>{selectedMap.tagline}</small></div>
        <nav className="wwa-lobby-dock" aria-label="Game menu">{([{ page: 'maps', icon: 'road', title: 'Roads', detail: selectedMap.name }, { page: 'garage', icon: 'car', title: 'Garage', detail: 'Car & paint' }, { page: 'crew', icon: 'crew', title: 'Crew', detail: selectedCrew.name }, { page: 'records', icon: 'records', title: 'Records', detail: 'Your best times' }, { page: 'help', icon: 'help', title: 'How to play', detail: 'Controls & tips' }] as const).map((item) => <button key={item.page} onClick={() => openPage(item.page)}><AppIcon name={item.icon} /><span><strong>{item.title}</strong><small>{item.detail}</small></span></button>)}</nav>
        <button className="wwa-about-link" onClick={() => openPage('about')}>Windway / By Waqar Ahmed</button>
      </section> : <>
        <section className="wwa-content" aria-labelledby="wwa-page-title" key={page}>
          <div className="wwa-title"><span className="wwa-kicker">{page === 'maps' ? 'Three roads. All open.' : page === 'garage' ? 'Choose your machine' : page === 'records' ? 'Every clean lap counts' : 'Make the drive yours'}</span><h1 id="wwa-page-title" ref={heading} tabIndex={-1}>{pageNames[page]}</h1></div>
          <MobileAppPages page={page} app={app} patch={patch} />
        </section>
        <footer className="wwa-action-bar"><div><span className="wwa-kicker">READY TO DRIVE</span><strong>{selectedMap.name}<span> / </span>{selectedCar.name}</strong></div><div className="wwa-footer-actions">{page !== 'maps' && <button className="wwa-button wwa-secondary" onClick={() => openPage('maps')}><AppIcon name="road" />Roads</button>}{action}</div></footer>
      </>}
      {(storageWarning || notice) && <div className="wwa-notice" role="status">{notice || 'Browser storage is unavailable. You can still play; progress may not be saved.'}<button aria-label="Dismiss message" onClick={() => { setNotice(''); setStorageWarning(false); }}>×</button></div>}
    </>}
  </main>;
}
