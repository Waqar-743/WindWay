import { useEffect, useRef, useState } from 'react';

interface ConnectionInfo extends EventTarget {
  saveData?: boolean;
  effectiveType?: string;
}

const media = `${import.meta.env.BASE_URL}media/`;

/** A poster-first preview: no video request until it can actually play on screen. */
export default function F1Preview({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const autoplayBlocked = useRef(false);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [autoplayAllowed, setAutoplayAllowed] = useState(false);
  const [manualPlay, setManualPlay] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [source, setSource] = useState<string>();
  const [hasFrame, setHasFrame] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
    const updatePreferences = () => {
      const constrained = connection?.saveData || /^(slow-)?2g$/.test(connection?.effectiveType ?? '');
      const blocked = reducedMotion || motion.matches || Boolean(constrained);
      setAutoplayAllowed(!blocked);
      // Ordinary network updates must not interrupt an explicit play request.
      if (blocked && !autoplayBlocked.current) setManualPlay(false);
      autoplayBlocked.current = blocked;
    };
    updatePreferences();
    motion.addEventListener('change', updatePreferences);
    connection?.addEventListener('change', updatePreferences);
    return () => {
      motion.removeEventListener('change', updatePreferences);
      connection?.removeEventListener('change', updatePreferences);
    };
  }, [reducedMotion]);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === 'visible');
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting && entry.intersectionRatio >= 0.2);
    }, { threshold: [0, 0.2] }) : undefined;
    if (frame.current) observer?.observe(frame.current);
    // Older browsers keep the lightweight poster until the visitor presses play.
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  const wantsPlayback = inView && pageVisible && !userPaused && !failed && (manualPlay || autoplayAllowed);

  useEffect(() => {
    const player = video.current;
    if (!player) return;
    if (!wantsPlayback) {
      player.pause();
      setWaiting(false);
      return;
    }
    if (!source) {
      const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
      const useSmallClip = window.matchMedia('(max-width: 767px)').matches || connection?.saveData || /^(slow-)?2g$/.test(connection?.effectiveType ?? '');
      setSource(`${media}${useSmallClip ? 'f1-drive-mobile.mp4' : 'f1-drive.mp4'}`);
      return;
    }
    let active = true;
    setWaiting(true);
    void player.play().catch(() => {
      if (!active) return;
      // Autoplay may be blocked by the browser; leave a usable play button.
      setUserPaused(true);
      setWaiting(false);
    });
    return () => { active = false; player.pause(); };
  }, [source, wantsPlayback]);

  const togglePlayback = () => {
    if (wantsPlayback) {
      setUserPaused(true);
    } else {
      setManualPlay(true);
      setUserPaused(false);
      if (!('IntersectionObserver' in window)) setInView(true);
    }
  };

  return <figure className="wl-film">
    <div className="wl-film-frame" ref={frame}>
      <img className="wl-film-poster" src={`${media}f1-drive-poster.webp`} width="960" height="540" loading="lazy" decoding="async" alt="The orange Mercedes-AMG W14 up close in Windway, before a drive through Alpine Valley." />
      <video
        ref={video}
        className={`wl-film-video${hasFrame ? ' is-ready' : ''}`}
        src={source}
        width="960"
        height="540"
        preload="none"
        muted
        loop
        playsInline
        disablePictureInPicture
        aria-label="Windway driving preview: a close look at the orange F1 car, then accelerating along the alpine road. No audio."
        onPlaying={() => { setHasFrame(true); setWaiting(false); }}
        onWaiting={() => setWaiting(true)}
        onError={() => { setFailed(true); setHasFrame(false); setWaiting(false); }}
      />
      <span className="wl-film-label" aria-hidden="true">WINDWAY / IN MOTION</span>
      {failed ? <p className="wl-film-status" role="status">Preview unavailable. The road is still yours.</p> : <>
        {waiting && <span className="wl-film-status" role="status">Loading clip…</span>}
        <button type="button" className="wl-film-toggle" onClick={togglePlayback} aria-label={wantsPlayback ? 'Pause driving preview' : 'Play driving preview'}>
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">{wantsPlayback ? <path d="M5 4h3v12H5zm7 0h3v12h-3z" /> : <path d="m6 3 11 7-11 7z" />}</svg>
          <span>{wantsPlayback ? 'Pause clip' : 'Play clip'}</span>
        </button>
      </>}
    </div>
    <figcaption><span>Mercedes-AMG W14 · Alpine Valley</span><span>IN-GAME FOOTAGE</span></figcaption>
  </figure>;
}
