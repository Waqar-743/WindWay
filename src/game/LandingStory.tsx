import './landing-story.css';
import F1Preview from './F1Preview';

type MapId = 'alpine' | 'jungle' | 'snow';
type Pack = 'cartoon-pack' | 'jungle-pack' | 'snow-pack';

export interface LandingStoryProps {
  selectedMap: string;
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
  name: string;
  region: string;
  pack: Pack;
  badge: string;
  caption: string;
  title: string;
  description: string;
  invitation: string;
  facts: { value: string; label: string }[];
  details: { icon: string; title: string; description: string }[];
  cast: { icon: string; label: string }[];
}

const ROAD_STORIES: RoadStory[] = [
  {
    id: 'alpine', number: '01', name: 'The alpine loop', region: 'Windway Valley',
    pack: 'cartoon-pack', badge: 'mountain-range', caption: 'The road that started it all.',
    title: 'Fresh air. Fast corners. Questionable decisions.',
    description: 'Start where Windway found its feet: an open valley, a winding ribbon of road, and a river that politely refuses to be a shortcut. Find your line between the pines, keep it on the wooden crossings, and give the on-road boost ramp a proper run-up.',
    invitation: 'A good first road. Not a promise of sensible driving.',
    facts: [{ value: '01', label: 'complete lap' }, { value: '08', label: 'ordered gates' }, { value: 'Airtime', label: 'on-road boost' }],
    details: [
      { icon: 'wooden-bridge', title: 'Mind the timber', description: 'River crossings reward a clean approach. Rails are solid; the water is not a racing line.' },
      { icon: 'jump-ramp', title: 'A brief disagreement with gravity', description: 'Cross the boost ramp on the road for a speed surge and a short flight back onto the circuit.' },
    ],
    cast: [{ icon: 'eagle-soaring', label: 'The air crew' }, { icon: 'mountain-goat', label: 'Local spectators' }, { icon: 'wild-haired-driver', label: 'Bad influence' }],
  },
  {
    id: 'jungle', number: '02', name: 'Canopy Run', region: 'Jungle Reserve',
    pack: 'jungle-pack', badge: 'jungle-badge', caption: 'Less open land. More wild company.',
    title: 'Take a breath. The jungle has plenty to say.',
    description: 'Trade the open valley for a close green canopy. Jade water runs beside the bends, trees crowd the horizon, and the wildlife has the best seats in the reserve. Two laps give you time to learn the road. The marigold ramp gives you a reason to come back.',
    invitation: 'Keep the roar on the road. Leave the wildlife to its day.',
    facts: [{ value: '02', label: 'full laps' }, { value: '08', label: 'gates each lap' }, { value: 'Dense', label: 'tropical canopy' }],
    details: [
      { icon: 'stop-station', title: 'A little roadside character', description: 'Look for the ranger stop station beside the route, with the driving line kept clear.' },
      { icon: 'boost-ramp', title: 'Same lift. Wilder surroundings.', description: 'A warm marigold boost ramp sits on the circuit, not somewhere off in the trees.' },
    ],
    cast: [{ icon: 'waqar', label: 'WAQAR' }, { icon: 'imran', label: 'IMRAN' }, { icon: 'tatheer', label: 'TATHEER' }],
  },
  {
    id: 'snow', number: '03', name: 'Frostbite Ascent', region: 'Whiteout Ridge',
    pack: 'snow-pack', badge: 'route-badge', caption: 'No easy way up.',
    title: 'Cold road. Warm nerves. One very high finish.',
    description: 'This is the long way, straight up. Follow a 6.44 km mountain route with about 362 m of climbing, snow-covered firs, narrow switchbacks, and ice that changes the way your car responds. Thread the solid snow-block hurdles, earn every checkpoint, and take the final flag at the summit.',
    invitation: 'Windway’s hardest road. Brake before the ice, not on it.',
    facts: [{ value: '6.44 km', label: 'one-way ascent' }, { value: '16', label: 'earned gates' }, { value: 'Summit', label: 'finish line' }],
    details: [
      { icon: 'ice-warning', title: 'Eight reasons to ease off', description: 'Eight ice zones reduce grip and lengthen your stopping distance. Smooth inputs matter here.' },
      { icon: 'slalom-gate', title: 'Fifteen solid problems', description: 'Physical snow-block hurdles leave a route through. Read the gaps instead of charging the middle.' },
    ],
    cast: [{ icon: 'snowman', label: 'Chilled company' }, { icon: 'arctic-fox', label: 'Snow-side spectator' }, { icon: 'summit-trophy', label: 'Worth the climb' }],
  },
];

function Illustration({ pack, name, className = '', alt = '', eager = false }: {
  pack: Pack; name: string; className?: string; alt?: string; eager?: boolean;
}) {
  return <img src={`${import.meta.env.BASE_URL}${pack}/${name}.svg`} alt={alt} className={className} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false} width="256" height="256" />;
}

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg className="wl-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? 'M5 19 19 5M5 5h14v14' : 'M4 12h16m-6-6 6 6-6 6'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ChapterScene({ story }: { story: RoadStory }) {
  const alpine = story.id === 'alpine', snow = story.id === 'snow';
  return <figure className={`wl-chapter-scene wl-scene-${story.id}`} aria-label={alpine ? 'An alpine road, wooden bridge, pine trees, and a mountain goat.' : snow ? 'A winding snow-covered mountain ascent, snowman, icy road warning, and summit flag.' : 'A road among dense tropical trees, a lion, giraffe, and ranger station.'}>
    <span className="wl-scene-location">{story.region}<span>{story.number} / FIELD NOTES</span></span>
    <svg className="wl-scene-road" viewBox="0 0 600 500" fill="none" aria-hidden="true">
      <path d={snow ? 'M55 527c-3-84 470-35 462-128-8-90-407-4-406-97 1-77 356 7 344-84-8-60-252-11-238-78 10-50 145-31 154-90' : 'M-30 385c98-101 189-19 280-67 82-44-21-154 68-164 97-11 141 74 292 0'} stroke="var(--scene-road)" strokeWidth={snow ? '35' : '53'} strokeLinecap="round" />
      <path d={snow ? 'M55 527c-3-84 470-35 462-128-8-90-407-4-406-97 1-77 356 7 344-84-8-60-252-11-238-78 10-50 145-31 154-90' : 'M-30 385c98-101 189-19 280-67 82-44-21-154 68-164 97-11 141 74 292 0'} stroke="#f7f3e7" strokeWidth="2" strokeDasharray="8 10" />
      {!snow && <path d="M410-30c-116 133 107 250-17 377-55 55-61 105 5 190" stroke="var(--scene-water)" strokeWidth="32" />}
    </svg>
    {alpine ? <>
      <Illustration pack={story.pack} name="mountain-range" className="wl-scene-backdrop" />
      <Illustration pack={story.pack} name="pine-tree" className="wl-scene-tree-one" />
      <Illustration pack={story.pack} name="pine-tree" className="wl-scene-tree-two" />
      <Illustration pack={story.pack} name="wooden-bridge" className="wl-scene-bridge" />
      <Illustration pack={story.pack} name="mountain-goat" className="wl-scene-animal" />
      <Illustration pack={story.pack} name="eagle-soaring" className="wl-scene-bird" />
    </> : snow ? <>
      <Illustration pack={story.pack} name="snowy-mountain" className="wl-scene-backdrop" />
      <Illustration pack={story.pack} name="snowy-tree" className="wl-scene-tree-one" />
      <Illustration pack={story.pack} name="snowy-tree" className="wl-scene-tree-two" />
      <Illustration pack={story.pack} name="snowman" className="wl-scene-animal" />
      <Illustration pack={story.pack} name="summit-flag" className="wl-scene-flag" />
      <Illustration pack={story.pack} name="ice-warning" className="wl-scene-warning" />
    </> : <>
      <Illustration pack={story.pack} name="broadleaf-tree" className="wl-scene-backdrop" />
      <Illustration pack={story.pack} name="palm-tree" className="wl-scene-tree-one" />
      <Illustration pack={story.pack} name="broadleaf-tree" className="wl-scene-tree-two" />
      <Illustration pack={story.pack} name="lion" className="wl-scene-animal" />
      <Illustration pack={story.pack} name="giraffe" className="wl-scene-giraffe" />
      <Illustration pack={story.pack} name="stop-station" className="wl-scene-station" />
      <Illustration pack={story.pack} name="toucan" className="wl-scene-bird" />
    </>}
    <figcaption>{story.invitation}</figcaption>
  </figure>;
}

function RoadChapter({ story, selected, onStart }: { story: RoadStory; selected: boolean; onStart: () => void }) {
  return <article className={`wl-chapter wl-chapter-${story.id}`} id={`road-${story.id}`} aria-labelledby={`title-${story.id}`}>
    <div className="wl-chapter-topline"><span>CHAPTER {story.number}</span><span>{story.caption}</span></div>
    <div className="wl-chapter-layout">
      <ChapterScene story={story} />
      <div className="wl-chapter-copy">
        <p className="wl-kicker">{story.id === 'snow' ? 'EXPERT / MOUNTAIN ASCENT' : `${story.region.toUpperCase()} / CIRCUIT`}</p>
        <h2 id={`title-${story.id}`}>{story.name}<span className="wl-period">.</span></h2>
        <h3>{story.title}</h3>
        <p className="wl-body">{story.description}</p>
        <dl className="wl-road-facts">{story.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
        <div className="wl-road-details">{story.details.map((detail) => <div key={detail.title}><Illustration pack={story.pack} name={detail.icon} /><div><h4>{detail.title}</h4><p>{detail.description}</p></div></div>)}</div>
        <button type="button" className="wl-drive" onClick={onStart}>Drive {story.name}<Arrow diagonal /></button>
        {selected && <span className="wl-selected-caption">Your currently selected road</span>}
      </div>
    </div>
    <div className="wl-local-line"><span>{story.id === 'jungle' ? 'MEET THE ROAD CREW' : 'SOME VERY LOCAL COMPANY'}</span><div>{story.cast.map((character) => <figure key={character.icon}><Illustration pack={story.pack} name={character.icon} alt={`${character.label}, a Windway cartoon illustration`} /><figcaption>{character.label}</figcaption></figure>)}</div><a href={`${import.meta.env.BASE_URL}${story.pack}/`}>Browse the {story.id === 'alpine' ? 'alpine' : story.id === 'snow' ? 'winter' : 'jungle'} SVG collection<Arrow /></a></div>
  </article>;
}

export default function LandingStory({ selectedMap, selectedCarName, reducedMotion, onChooseMap, onExploreMap, onStartMap, onGarage }: LandingStoryProps) {
  const chosen = ROAD_STORIES.find((road) => road.id === selectedMap) ?? ROAD_STORIES[0];
  return <div className="windway-landing">
    <a className="wl-skip" href="#windway-main">Skip to the roads</a>
    <header className="wl-header">
      <a href="#windway-main" className="wl-brand" aria-label="Windway, back to the start"><img src={`${import.meta.env.BASE_URL}branding/windway-mark.svg`} width="44" height="44" alt="" /><span>WINDWAY<small>TAKE THE LONG WAY.</small></span></a>
      <nav aria-label="Windway landing navigation"><a href="#the-roads">The roads</a><button type="button" onClick={onGarage}>The garage</button><a href="#first-drive">First drive</a><a href="#the-story">The story</a></nav>
      <a className="wl-source" href="https://github.com/Waqar-743/WindWay" target="_blank" rel="noreferrer">Built in the open<Arrow diagonal /></a>
    </header>
    <main id="windway-main">
      <section className="wl-hero" aria-labelledby="windway-title">
        <picture className="wl-hero-backdrop" aria-hidden="true">
          <source type="image/webp" srcSet={`${import.meta.env.BASE_URL}branding/windway-hero-jungle-640.webp 640w, ${import.meta.env.BASE_URL}branding/windway-hero-jungle-1024.webp 1024w, ${import.meta.env.BASE_URL}branding/windway-hero-jungle.webp 1672w`} sizes="100vw" />
          <img src={`${import.meta.env.BASE_URL}branding/windway-hero-jungle.jpg`} width="1672" height="941" alt="" loading="eager" {...{ fetchpriority: 'high' }} decoding="async" draggable={false} />
        </picture>
        <div className="wl-hero-copy">
          <h1 className="wl-sr-only" id="windway-title" data-page-title tabIndex={-1}>Windway. Your road. Your pace.</h1>
          <p className="wl-kicker">THREE ROADS. TWO CARS. ONE WAY TO ESCAPE.</p>
          <p className="wl-hero-intro">Mountain bends, jungle roads, and a snowy summit. Find your next favorite drive.</p>
          <div className="wl-hero-actions">
            <button type="button" className="wl-drive wl-hero-drive" onClick={() => onExploreMap(chosen.id)}>Explore {chosen.name}<Arrow diagonal /></button>
            <button type="button" className="wl-garage-link" onClick={onGarage} aria-label={`Choose your car. Selected car: ${selectedCarName}`}>Choose your car<Arrow /></button>
          </div>
          <p className="wl-browser-note">Play in your browser · Keyboard or touch controls</p>
        </div>
      </section>

      <section className="wl-motion-story" aria-labelledby="motion-title">
        <div className="wl-motion-copy">
          <p className="wl-kicker">A FEW SECONDS BEHIND THE WHEEL</p>
          <h2 id="motion-title">Get close.<br />Go far<span className="wl-period">.</span></h2>
          <p className="wl-body">From the garage to the open road. A little preview of the drive ahead.</p>
          <button type="button" className="wl-text-link" onClick={onGarage}>Find your ride<Arrow diagonal /></button>
        </div>
        <F1Preview reducedMotion={reducedMotion} />
      </section>

      <section className="wl-route-picker" id="the-roads" aria-labelledby="roads-title">
        <div><p className="wl-kicker">PICK THE FEELING, THEN THE ROAD.</p><h2 id="roads-title">Same keys.<br />Different kind of trouble.</h2><p>All three worlds are right here. Choose your starting line, or keep scrolling to meet the locals.</p><a className="wl-text-link" href={`#road-${chosen.id}`}>Meet {chosen.name}<Arrow /></a></div>
        <fieldset><legend>Choose your road</legend>{ROAD_STORIES.map((road) => <button type="button" key={road.id} aria-pressed={chosen.id === road.id} onClick={() => onChooseMap(road.id)}><span className="wl-route-number">{road.number}</span><Illustration pack={road.pack} name={road.badge} /><span className="wl-route-label"><strong>{road.name}</strong><small>{road.id === 'snow' ? 'Expert · One-way summit climb' : `${road.region} · ${road.id === 'jungle' ? 'Two laps' : 'One lap'}`}</small></span><span className="wl-route-mark" aria-hidden="true">{chosen.id === road.id ? <svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : <Arrow />}</span></button>)}</fieldset>
      </section>

      {ROAD_STORIES.map((story) => <RoadChapter key={story.id} story={story} selected={chosen.id === story.id} onStart={() => onStartMap(story.id)} />)}

      <section className="wl-garage-story" aria-labelledby="garage-title"><div className="wl-garage-art" aria-hidden="true"><Illustration pack="cartoon-pack" name="garage" /><Illustration pack="cartoon-pack" name="racing-wheel" className="wl-garage-wheel" /></div><div><p className="wl-kicker">THE GARAGE / TWO DIFFERENT ATTITUDES</p><h2 id="garage-title">Pick your partner<br />in the nonsense.</h2><p className="wl-body">The road is half the story. The other half is how you choose to drive it.</p><dl className="wl-car-stories"><div><dt><span>01</span>McLaren MCL38</dt><dd>The firecracker. Lively off the line, quick to respond, and happy to make a little mischief.</dd></div><div><dt><span>02</span>Mercedes-AMG W14</dt><dd>The mountain arrow. Higher grip, stronger braking, and a planted feel through the bends.</dd></div></dl><button type="button" className="wl-drive" onClick={onGarage}>Meet the cars & choose a paint<Arrow /></button></div></section>

      <section className="wl-first-drive" id="first-drive" aria-labelledby="first-drive-title"><div className="wl-first-heading"><p className="wl-kicker">A QUICK WORD BEFORE YOU GO</p><h2 id="first-drive-title">Less reading.<br />More driving.</h2><Illustration pack="cartoon-pack" name="steering-wheel" /></div><div className="wl-driving-notes"><article><span>01 / GET MOVING</span><h3>Your hands know what to do.</h3><p>On a keyboard, use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys to accelerate, steer, and brake. Touch controls appear on phones and tablets.</p></article><article><span>02 / MAKE IT COUNT</span><h3>Follow the gates, not just the scenery.</h3><p>Pass checkpoints in order. Complete the lap target in the valley and jungle, or reach the final summit gate on Frostbite Ascent.</p></article><article><span>03 / TAKE ANOTHER SHOT</span><h3>A mistake is not the end of the drive.</h3><p>Fall off the road and checkpoint recovery gets you back into the run. You can also reset the car with <kbd>R</kbd>, and pause with <kbd>Esc</kbd>.</p></article></div></section>

      <section className="wl-origin" id="the-story" aria-labelledby="origin-title"><div className="wl-origin-note"><p className="wl-kicker">A NOTE FROM WAQAR</p><h2 id="origin-title">It started with<br />looking at cars.</h2><p>Then came the obvious question: what if you could actually drive one?</p><p>Windway grew from a 3D car viewer into a playful browser-driving project. First a valley. Then a jungle full of characters. Then a snowy climb that asks a little more of the driver.</p><p>No grand racing manifesto. Just a growing collection of roads, hand-built cartoon SVGs, and the fun of turning <q>what if?</q> into something you can play.</p><a className="wl-signature" href="https://github.com/Waqar-743" target="_blank" rel="noreferrer">Waqar Ahmed<span>Creator of Windway<Arrow diagonal /></span></a></div><aside className="wl-origin-aside"><Illustration pack="jungle-pack" name="waqar" alt="WAQAR, Windway’s cartoon road-crew character" /><span>STILL TAKING THE LONG WAY.</span><p>The road crew, the wildlife, even the very chilled snowman: the small details are part of the trip.</p><a className="wl-text-link" href="https://github.com/Waqar-743/WindWay" target="_blank" rel="noreferrer">Follow the project on GitHub<Arrow diagonal /></a></aside></section>

      <section className="wl-good-to-know" aria-labelledby="good-to-know-title"><h2 id="good-to-know-title">Good to know<br />before the next bend.</h2><div><article><h3>Do I need to install anything?</h3><p>No installation or account is needed. A browser with WebGL support runs the game; the 3D assets load when you enter a driving scene.</p></article><article><h3>Will my best run stay here?</h3><p>Windway saves your preferences and best times in this browser when local storage is available. Each map and car keeps its own record.</p></article><article><h3>Is this an official Formula 1 game?</h3><p>No. Windway is an independent hobby project. The car models are credited separately, with their original license terms preserved.</p><a href={`${import.meta.env.BASE_URL}MODEL_CREDITS.md`} target="_blank" rel="noreferrer">Read model credits & licenses<Arrow diagonal /></a></article></div></section>

      <section className="wl-last-call" aria-labelledby="last-call-title"><Illustration pack={chosen.pack} name={chosen.id === 'snow' ? 'summit-flag' : 'finish-flag'} /><div><p className="wl-kicker">YOUR STARTING LINE IS WAITING.</p><h2 id="last-call-title">Take the long way.</h2><p>{chosen.name} · {selectedCarName}</p></div><button type="button" className="wl-drive" onClick={() => onStartMap(chosen.id)}>Let’s drive<Arrow diagonal /></button></section>
    </main>
    <footer className="wl-footer"><a className="wl-footer-wordmark" href="#windway-main">WINDWAY<span>LESS SERIOUS. MORE SCENIC.</span></a><p>Made with curiosity by <a href="https://github.com/Waqar-743" target="_blank" rel="noreferrer">Waqar Ahmed</a>.<br />Three roads, two cars, and more ideas around the bend.</p><div><a href="https://github.com/Waqar-743/WindWay" target="_blank" rel="noreferrer">The GitHub repository<Arrow diagonal /></a><a href={`${import.meta.env.BASE_URL}MODEL_CREDITS.md`} target="_blank" rel="noreferrer">Model credits & licenses</a><a href="#windway-main">Back to the start<Arrow /></a></div></footer>
  </div>;
}
