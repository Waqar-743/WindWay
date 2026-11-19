import './landing-story.css';
import F1Preview from './F1Preview';
import { RouteMap } from './RouteMap';
import LandingScroll3D from './LandingScroll3D';
import Route3DShowcase from './Route3DShowcase';

type MapId = 'alpine' | 'jungle' | 'snow';
type Pack = 'cartoon-pack' | 'jungle-pack' | 'snow-pack' | 'branding';

export interface LandingStoryProps {
  selectedMap: string;
  selectedLevel?: number;
  levelSelector?: React.ReactNode;
  selectedCarName: string;
  reducedMotion?: boolean;
  onChooseMap: (id: string) => void;
  onExploreMap: (id: string) => void;
  onStartMap: (id: string) => void;
  onGarage: () => void;
}

interface RoadStory {
  id: MapId;
  number: string;
  code: string;
  name: string;
  region: string;
  coordinates: string;
  pack: Pack;
  badge: string;
  title: string;
  short: string;
  description: string;
  facts: { value: string; label: string }[];
  details: { icon: string; title: string; description: string }[];
  cast: { icon: string; pack?: Pack; label: string }[];
}

const ROAD_STORIES: RoadStory[] = [
  {
    id: 'alpine', number: '01', code: 'ALP / 01', name: 'The alpine loop', region: 'Windway Valley', coordinates: '46° 34′ N / 09° 52′ E',
    pack: 'cartoon-pack', badge: 'mountain-range', title: 'Open valley. Technical heart.',
    short: 'Village streets, timber crossings and a fast lap beneath the peaks.',
    description: 'A flowing circuit through the original Windway Valley. Link fast sweepers with the tighter village section, stay precise over two timber bridges and commit to the golden boost jump. The scenery invites you to breathe out; the stopwatch does not.',
    facts: [{ value: '01', label: 'complete lap' }, { value: '08', label: 'ordered gates' }, { value: 'Boost', label: 'on-road jump' }],
    details: [
      { icon: 'wooden-bridge', title: 'Timber over water', description: 'Square the car before the bridge. The approach is quick, the rails are solid and the river is never a shortcut.' },
      { icon: 'jump-ramp', title: 'Commit to the jump', description: 'The on-road ramp rewards a clean entry with extra speed and airtime. Settle the chassis before you turn back in.' },
    ],
    cast: [{ icon: 'eagle-soaring', label: 'Alpine airspace' }, { icon: 'mountain-goat', label: 'Ridge residents' }, { icon: 'wild-haired-driver', label: 'Your road crew' }],
  },
  {
    id: 'jungle', number: '02', code: 'CNP / 02', name: 'Canopy Run', region: 'Jungle Reserve', coordinates: '03° 08′ S / 60° 01′ W',
    pack: 'jungle-pack', badge: 'jungle-badge', title: 'Two laps. Zero idle moments.',
    short: 'Emerald switchbacks, jade water and a dense tropical racing line.',
    description: 'The valley opens up; the jungle closes in. Canopy Run strings together shaded corners, narrow riverside sections and a warm marigold launch ramp. Two laps turn discovery into rhythm: learn the road first, then take the time back.',
    facts: [{ value: '02', label: 'full laps' }, { value: '08', label: 'gates each lap' }, { value: 'Dense', label: 'tropical canopy' }],
    details: [
      { icon: 'stop-station', title: 'Read the clearing', description: 'The ranger station marks a brief opening in the canopy. Keep the exit clean; wildlife stays beyond the racing line.' },
      { icon: 'boost-ramp', title: 'Marigold launch', description: 'Line up early and approach straight. The ramp sits on the circuit, ready to turn a settled entry into a fast flight.' },
    ],
    cast: [{ icon: 'toucan', label: 'Canopy spotters' }, { icon: 'lion', label: 'Reserve locals' }, { icon: 'waqar', label: 'Jungle road crew' }],
  },
  {
    id: 'snow', number: '03', code: 'FBA / 03', name: 'Frostbite Ascent', region: 'Whiteout Ridge', coordinates: '46° 51′ N / 09° 31′ E',
    pack: 'snow-pack', badge: 'route-badge', title: 'A mountain measured in nerve.',
    short: 'Low-grip switchbacks on a relentless one-way climb to the summit.',
    description: 'No return lap. No easy descent. Frostbite Ascent climbs through 6.44 km of exposed switchbacks, packed snow and changing grip. Read eight ice zones, thread fifteen snow-block hurdles and make each of the sixteen gates count on the way above the cloud line.',
    facts: [{ value: '6.44', label: 'kilometres' }, { value: '+362', label: 'metres climbed' }, { value: '16', label: 'gates to summit' }],
    details: [
      { icon: 'ice-warning', title: 'Grip is a moving target', description: 'Blue ice reduces braking and lateral response. Slow down before the surface changes, then use small, deliberate inputs.' },
      { icon: 'slalom-gate', title: 'Find the passing lane', description: 'Solid snow blocks alternate across the route. Read the gap two turns ahead instead of charging the centre.' },
    ],
    cast: [{ icon: 'polar-bear', pack: 'branding' as Pack, label: 'Glacier polar bears' }, { icon: 'mountain-hut', label: 'Nordic village homes' }, { icon: 'summit-trophy', label: 'The summit reward' }],
  },
];

function Illustration({ pack, name, className = '', alt = '' }: { pack: Pack; name: string; className?: string; alt?: string }) {
  return <img src={`${import.meta.env.BASE_URL}${pack}/${name}.svg`} alt={alt} className={className} loading="lazy" decoding="async" draggable={false} width="256" height="256" />;
}

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg className="wl-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? 'M5 19 19 5M5 5h14v14' : 'M4 12h16m-6-6 6 6-6 6'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function RouteLandscape({ id, name, reducedMotion }: { id: MapId; name: string; reducedMotion?: boolean }) {
  const snow = id === 'snow', jungle = id === 'jungle';
  const sky = snow ? ['#809fb5', '#d5e6ec'] : jungle ? ['#315b50', '#9bb886'] : ['#809cac', '#d5d9c6'];
  return <figure className={`wl-environment wl-environment-${id}`}>
    <svg viewBox="0 0 960 480" role="img" aria-label={`${name} environment artwork`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`sky-${id}`} x2="0" y2="1"><stop stopColor={sky[0]} /><stop offset="1" stopColor={sky[1]} /></linearGradient>
        <linearGradient id={`ground-${id}`} x2="0" y2="1"><stop stopColor={snow ? '#a5bfce' : jungle ? '#345d3c' : '#617656'} /><stop offset="1" stopColor={snow ? '#e5edf1' : jungle ? '#172e26' : '#283d34'} /></linearGradient>
        <linearGradient id={`road-${id}`} x2="0" y2="1"><stop stopColor={snow ? '#657e8e' : '#596263'} /><stop offset="1" stopColor={snow ? '#334958' : '#252d30'} /></linearGradient>
        <filter id={`road-shadow-${id}`}><feDropShadow dx="0" dy="8" stdDeviation="8" floodOpacity=".22" /></filter>
      </defs>
      <rect width="960" height="480" fill={`url(#sky-${id})`} />
      <circle cx={jungle ? 760 : 715} cy="92" r={snow ? 35 : 46} fill={snow ? '#eaf4f8' : '#ffdfa0'} opacity=".7" />
      <g fill={snow ? '#6d879b' : jungle ? '#33594a' : '#788e85'} opacity=".74"><path d="M-50 288 170 45l124 126L421 38l241 238 125-146 233 157v135H-50Z" /><path d="m370 38 51 114-39-23-30 20-32-18-32 9Z" fill={snow ? '#e2ecf0' : '#d9ddd0'} opacity=".65" /></g>
      <path d="M0 280Q164 177 318 250T642 225T960 250V480H0Z" fill={`url(#ground-${id})`} />
      {snow ? <path d="m0 321 208-92 115 24 155-78 124 48 196-33 162 46v93H0Z" fill="#dce7ed" opacity=".72" /> : <path d="M0 322q190-110 398-30t408-42l154 16v89H0Z" fill={jungle ? '#477849' : '#829065'} opacity=".55" />}
      <path d="M910 505C749 414 633 420 557 372c-83-53-43-86 94-105 93-13 55-59-29-65-92-7-215 39-294 14-66-21-45-45-4-59" fill="none" stroke={snow ? '#c7d8e2' : jungle ? '#455840' : '#b4a789'} strokeWidth={jungle ? 61 : 72} strokeLinecap="round" filter={`url(#road-shadow-${id})`} />
      <path d="M910 505C749 414 633 420 557 372c-83-53-43-86 94-105 93-13 55-59-29-65-92-7-215 39-294 14-66-21-45-45-4-59" fill="none" stroke={`url(#road-${id})`} strokeWidth={jungle ? 48 : 57} strokeLinecap="round" />
      <path d="M910 505C749 414 633 420 557 372c-83-53-43-86 94-105 93-13 55-59-29-65-92-7-215 39-294 14-66-21-45-45-4-59" fill="none" stroke="#eef0df" strokeWidth="2.5" strokeDasharray="15 20" opacity=".8" />
      <g opacity={jungle ? '.95' : '.8'} fill={snow ? '#385762' : jungle ? '#183c29' : '#294b3b'}>
        {[[38,311,1.3],[110,292,.9],[184,330,1.5],[273,299,.8],[382,285,1.1],[724,301,1.3],[805,279,.9],[890,336,1.5],[90,413,1.8],[262,430,1.35],[757,451,1.65]].map(([x,y,s],i) => <g key={i} transform={`translate(${x} ${y}) scale(${s})`}><path d="M0 0v-56" stroke={snow ? '#52656b' : '#493f2e'} strokeWidth="5" /><path d="m0-94-25 45h13l-26 32h76L12-49h13Z" /></g>)}
      </g>
      <path d="M0 442q176-45 367-9t593-3v50H0Z" fill={snow ? '#eff5f7' : jungle ? '#142b22' : '#20392e'} opacity=".75" />
    </svg>
    <Route3DShowcase id={id} reducedMotion={reducedMotion} />
    <div className="wl-environment-badge" aria-hidden="true"><i />LIVE 3D TERRAIN · SCROLL OR HOVER TO ORBIT</div>
    <div className="wl-environment-caption"><span>{id === 'snow' ? 'ELEVATION / 362 M GAIN · NORDIC VILLAGE & GLACIERS' : jungle ? 'SURFACE / DENSE CANOPY · JADE RIVER' : 'SURFACE / ALPINE ASPHALT · VALLEY BRIDGES'}</span><span>3D ROUTE DIORAMA {id === 'alpine' ? '01' : id === 'jungle' ? '02' : '03'}</span></div>
  </figure>;
}

function RoadChapter({ story, selected, reducedMotion, onStart, onExplore }: { story: RoadStory; selected: boolean; reducedMotion?: boolean; onStart: () => void; onExplore: () => void }) {
  return <article className={`wl-chapter wl-chapter-${story.id}`} id={`road-${story.id}`} aria-labelledby={`title-${story.id}`}>
    <div className="wl-chapter-topline"><span>ROUTE {story.number}<i />{story.region}</span><span>{story.coordinates}</span></div>
    <RouteLandscape id={story.id} name={story.name} reducedMotion={reducedMotion} />
    <div className="wl-chapter-layout">
      <div className="wl-chapter-copy">
        <p className="wl-kicker">{story.code} / {story.id === 'snow' ? 'EXPERT ASCENT' : 'CIRCUIT'}</p>
        <h2 id={`title-${story.id}`}>{story.name}<span className="wl-period">.</span></h2>
        <h3>{story.title}</h3>
        <p className="wl-body">{story.description}</p>
        <dl className="wl-road-facts">{story.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
        <div className="wl-chapter-actions"><button type="button" className="wl-drive" onClick={onStart}>Drive this route<Arrow diagonal /></button><button type="button" className="wl-explore" onClick={onExplore}>Explore route<Arrow /></button></div>
        {selected && <span className="wl-selected-caption"><i />Selected in your race setup</span>}
      </div>
      <div className="wl-chapter-intel"><RouteMap mapId={story.id} compact showTelemetry={false} /><div className="wl-road-details">{story.details.map((detail) => <div key={detail.title}><Illustration pack={story.pack} name={detail.icon} /><div><h4>{detail.title}</h4><p>{detail.description}</p></div></div>)}</div></div>
    </div>
    <div className="wl-local-line"><span>WORLD DETAIL / {story.number}</span><div>{story.cast.map((character) => <figure key={character.icon}><Illustration pack={character.pack ?? story.pack} name={character.icon} alt={character.label} /><figcaption>{character.label}</figcaption></figure>)}</div><a href={`${import.meta.env.BASE_URL}${story.pack}/`}>Open {story.id === 'alpine' ? 'alpine' : story.id === 'snow' ? 'winter' : 'jungle'} asset collection<Arrow diagonal /></a></div>
  </article>;
}

export default function LandingStory({ selectedMap, levelSelector, selectedCarName, reducedMotion, onChooseMap, onExploreMap, onStartMap, onGarage }: LandingStoryProps) {
  const chosen = ROAD_STORIES.find((road) => road.id === selectedMap) ?? ROAD_STORIES[0];
  return <div className={`windway-landing landing-${chosen.id}`}>
    <LandingScroll3D reducedMotion={reducedMotion} />
    <a className="wl-skip" href="#windway-main">Skip to the roads</a>
    <header className="wl-header">
      <a href="#windway-main" className="wl-brand" aria-label="Windway, back to the start"><svg className="wl-brand-mark" viewBox="0 0 40 40" aria-hidden="true"><path d="M8 30 16 9h5l-4 11h10l5-11h5l-8 21h-5l4-11H18l-5 11Z" fill="currentColor" /></svg><span>WINDWAY<small>DRIVE BEYOND THE EXPECTED</small></span></a>
      <nav aria-label="Windway landing navigation"><a href="#the-roads">Routes</a><button type="button" onClick={onGarage}>Garage</button><a href="#first-drive">Driver briefing</a><a href="#the-story">Project</a></nav>
      <a className="wl-source" href="https://github.com/Waqar-743/WindWay" target="_blank" rel="noreferrer"><i />Open source<Arrow diagonal /></a>
    </header>
    <main id="windway-main">
      <section className="wl-hero" aria-labelledby="windway-title">
        <picture className="wl-hero-backdrop" aria-hidden="true"><source type="image/webp" srcSet={`${import.meta.env.BASE_URL}branding/windway-hero-jungle-640.webp 640w, ${import.meta.env.BASE_URL}branding/windway-hero-jungle-1024.webp 1024w, ${import.meta.env.BASE_URL}branding/windway-hero-jungle.webp 1672w`} sizes="100vw" /><img src={`${import.meta.env.BASE_URL}branding/windway-hero-jungle.jpg`} width="1672" height="941" alt="" loading="eager" {...{ fetchpriority: 'high' }} decoding="async" draggable={false} /></picture>
        <div className="wl-hero-grid" aria-hidden="true" />
        <div className="wl-hero-copy">
          <p className="wl-kicker"><span>01</span> INDEPENDENT DRIVING EXPERIENCE</p>
          <h1 id="windway-title" data-page-title tabIndex={-1}>EVERY ROAD<br />HAS A <em>PULSE.</em></h1>
          <p className="wl-hero-intro">Three worlds. Two precision machines. One simple objective: find the line that makes the road yours.</p>
          <div className="wl-hero-actions"><button type="button" className="wl-drive wl-hero-drive" onClick={() => onStartMap(chosen.id)}>Start your drive<span>01</span><Arrow diagonal /></button><button type="button" className="wl-garage-link" onClick={onGarage} aria-label={`Choose your car. Selected car: ${selectedCarName}`}>Configure your car<Arrow /></button></div>
          <p className="wl-browser-note"><i />BROWSER READY<i />NO DOWNLOAD<i />FREE TO PLAY</p>
        </div>
        <div className="wl-hero-route"><span>YOUR NEXT ROUTE</span><strong>{chosen.name}</strong><small>{chosen.region}<i />{chosen.id === 'snow' ? 'Expert ascent' : chosen.id === 'jungle' ? '2 lap circuit' : '1 lap circuit'}</small><a href={`#road-${chosen.id}`} aria-label={`View ${chosen.name}`}><Arrow /></a></div>
        <div className="wl-hero-index" aria-hidden="true"><strong>W / {chosen.number}</strong><span>THE WORLD IS YOUR CIRCUIT</span></div>
      </section>

      <div className="wl-journey-strip" aria-label="Windway at a glance"><div><strong>03</strong><span>distinct environments</span></div><div><strong>02</strong><span>race-bred machines</span></div><div><strong>06</strong><span>progressive courses</span></div><a href="#the-roads">Explore all routes<Arrow /></a></div>
      {levelSelector}

      <section className="wl-route-picker" id="the-roads" aria-labelledby="roads-title">
        <div className="wl-section-heading"><div><p className="wl-kicker">SELECT YOUR ENVIRONMENT / 01—03</p><h2 id="roads-title">CHOOSE YOUR<br /><em>ELEMENT.</em></h2></div><p>Every route changes more than the view. Read the surface, learn the rhythm and adapt your driving. Your next environment is one decision away.</p></div>
        <fieldset><legend>Choose your road</legend><div className="wl-route-grid">{ROAD_STORIES.map((road) => <div className="wl-route-card" key={road.id}><button type="button" aria-pressed={chosen.id === road.id} onClick={() => onChooseMap(road.id)} aria-label={`Select ${road.name}`}><span className="wl-route-number">{road.number}<i>{road.code}</i></span><span className="wl-route-label"><small>{road.region}</small><strong>{road.name}</strong><span>{road.short}</span></span><span className="wl-route-mark" aria-hidden="true">{chosen.id === road.id ? <svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : <Arrow />}</span></button><RouteMap mapId={road.id} compact showTelemetry={false} /><button type="button" className="wl-route-detail" onClick={() => onExploreMap(road.id)}>Route intelligence<Arrow diagonal /></button></div>)}</div></fieldset>
      </section>

      <section className="wl-motion-story" aria-labelledby="motion-title"><div className="wl-motion-copy"><p className="wl-kicker">FROM THE DRIVER’S SEAT / LIVE CAPTURE</p><h2 id="motion-title">BUILT TO BE<br /><em>DRIVEN.</em></h2><p className="wl-body">Not a showroom with a start button. A real 3D driving experience with surface-dependent grip, momentum, drifting and recoverable checkpoints.</p><dl><div><dt>HANDLING</dt><dd>Two distinct car setups</dd></div><div><dt>CAMERAS</dt><dd>Chase and cockpit views</dd></div><div><dt>RECORDS</dt><dd>Saved locally, per car and route</dd></div></dl><button type="button" className="wl-text-link" onClick={onGarage}>Find your machine<Arrow diagonal /></button></div><F1Preview reducedMotion={reducedMotion} /></section>

      <div className="wl-route-stories">{ROAD_STORIES.map((story) => <RoadChapter key={story.id} story={story} selected={chosen.id === story.id} reducedMotion={reducedMotion} onStart={() => onStartMap(story.id)} onExplore={() => onExploreMap(story.id)} />)}</div>

      <section className="wl-garage-story" aria-labelledby="garage-title"><div className="wl-garage-art"><span>ENGINEERED FOR<br />DIFFERENT LINES.</span><Illustration pack="cartoon-pack" name="racing-wheel" /></div><div><p className="wl-kicker">THE GARAGE / SELECT YOUR MACHINE</p><h2 id="garage-title">TWO CARS.<br /><em>TWO TEMPERAMENTS.</em></h2><p className="wl-body">Choose a car and finish, then feel the difference where it matters: turn-in, traction and the seconds between corners.</p><dl className="wl-car-stories"><div><dt><span>01</span>McLaren MCL38<small>AGILE / INSTANT</small></dt><dd>Lively acceleration and a quick response for drivers who like to place the nose with intent.</dd></div><div><dt><span>02</span>Mercedes-AMG W14<small>PLANTED / PRECISE</small></dt><dd>Higher grip and stronger braking for a composed, confident attack through faster bends.</dd></div></dl><button type="button" className="wl-drive" onClick={onGarage}>Enter the garage<Arrow diagonal /></button></div></section>

      <section className="wl-first-drive" id="first-drive" aria-labelledby="first-drive-title"><div className="wl-first-heading"><p className="wl-kicker">DRIVER BRIEFING / 90 SECONDS TO GREEN</p><h2 id="first-drive-title">KNOW THE ROAD.<br /><em>THEN LET GO.</em></h2><Illustration pack="cartoon-pack" name="steering-wheel" /></div><div className="wl-driving-notes"><article><span>01 / INPUT</span><h3>Simple controls. Nuanced exits.</h3><p>Use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys to accelerate, steer and brake. <kbd>SPACE</kbd> applies the handbrake. Touch controls appear on mobile.</p></article><article><span>02 / OBJECTIVE</span><h3>The gates tell the real story.</h3><p>Pass every checkpoint in order. Complete the lap target in the valley and jungle, or clear the final summit gate on Frostbite Ascent.</p></article><article><span>03 / RECOVERY</span><h3>A missed corner is not the end.</h3><p>Return to your latest earned gate with <kbd>R</kbd>. Switch cameras with <kbd>C</kbd>, pause with <kbd>Esc</kbd>, and keep the clock honest while you reset.</p></article></div></section>

      <section className="wl-origin" id="the-story" aria-labelledby="origin-title"><div className="wl-origin-note"><p className="wl-kicker">THE PROJECT / BUILT WITH CURIOSITY</p><h2 id="origin-title">FROM LOOKING AT CARS<br />TO <em>FINDING A LINE.</em></h2><p>Windway began as a 3D car viewer and became a place to drive. One valley grew into three complete environments, each with its own route, hazards and pace.</p><p>It remains an independent project made in the open: hand-built SVG assets, locally rendered worlds and a fascination with turning “what if?” into something you can play.</p><a className="wl-signature" href="https://github.com/Waqar-743" target="_blank" rel="noreferrer">Waqar Ahmed<span>Creator & developer<Arrow diagonal /></span></a></div><aside className="wl-origin-aside"><span className="wl-origin-code">INDEPENDENT / SINCE THE FIRST BEND</span><RouteMap mapId="alpine" compact showTelemetry={false} /><p>Small project. Real worlds. Open code.</p><a className="wl-text-link" href="https://github.com/Waqar-743/WindWay" target="_blank" rel="noreferrer">Follow development on GitHub<Arrow diagonal /></a></aside></section>

      <section className="wl-good-to-know" aria-labelledby="good-to-know-title"><h2 id="good-to-know-title">BEFORE YOU<br />JOIN THE GRID.</h2><div><article><span>01</span><div><h3>Nothing to install</h3><p>No account or installation is needed. WebGL renders the experience in your browser; game assets load only when you enter a driving scene.</p></div></article><article><span>02</span><div><h3>Your records stay yours</h3><p>Preferences and best times save locally in this browser when storage is available. Every environment, car and course keeps its own record.</p></div></article><article><span>03</span><div><h3>Independent by design</h3><p>Windway is not an official Formula 1 game. Community car models are credited separately, with their original license terms preserved.</p><a href={`${import.meta.env.BASE_URL}MODEL_CREDITS.md`} target="_blank" rel="noreferrer">Read model credits & licenses<Arrow diagonal /></a></div></article></div></section>

      <section className="wl-last-call" aria-labelledby="last-call-title"><div className="wl-last-call-route"><RouteMap mapId={chosen.id} compact showTelemetry={false} /></div><div><p className="wl-kicker">ENGINE READY / ROUTE {chosen.number}</p><h2 id="last-call-title">MAKE YOUR<br /><em>FIRST MOVE.</em></h2><p>{chosen.name} <span>/</span> {selectedCarName}</p></div><button type="button" className="wl-drive" onClick={() => onStartMap(chosen.id)}>Let’s drive<Arrow diagonal /></button></section>
    </main>
    <footer className="wl-footer"><a className="wl-footer-wordmark" href="#windway-main">WINDWAY<span>DRIVE BEYOND THE EXPECTED.</span></a><p>Designed and developed by <a href="https://github.com/Waqar-743" target="_blank" rel="noreferrer">Waqar Ahmed</a>.<br />Three worlds. Two cars. Your next line.</p><div><a href="https://github.com/Waqar-743/WindWay" target="_blank" rel="noreferrer">GitHub repository<Arrow diagonal /></a><a href={`${import.meta.env.BASE_URL}MODEL_CREDITS.md`} target="_blank" rel="noreferrer">Model credits & licenses</a><a href="#windway-main">Back to the start<Arrow /></a></div></footer>
  </div>;
}
