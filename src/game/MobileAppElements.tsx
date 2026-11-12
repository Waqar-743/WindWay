import type { ReactNode } from 'react';

export type AppPage = 'home' | 'maps' | 'garage' | 'settings' | 'crew' | 'help' | 'records' | 'about';
export type AppIconName = 'play' | 'back' | 'road' | 'car' | 'settings' | 'crew' | 'help' | 'records' | 'fullscreen' | 'check' | 'continue' | 'sound' | 'flag';
export const pageNames: Record<AppPage, string> = { home: 'Your next drive', maps: 'Choose your road', garage: 'Your garage', settings: 'Drive settings', crew: 'Your road crew', help: 'How to play', records: 'Personal bests', about: 'About Windway' };
export const appAsset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export function AppIcon({ name }: { name: AppIconName }) {
  const paths: Record<AppIconName, ReactNode> = {
    play: <path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
    back: <path d="m14 5-7 7 7 7M7 12h14" />,
    road: <path d="M8 3 4 21M16 3l4 18M12 4v3m0 4v3m0 4v3" />,
    car: <path d="m4 10 2-6h12l2 6v9H4ZM4 11h16M7 19v2m10-2v2M7 15h2m6 0h2" />,
    settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" fill="currentColor" /><circle cx="16" cy="12" r="2" fill="currentColor" /><circle cx="10" cy="18" r="2" fill="currentColor" /></>,
    crew: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 1 1 5 2c-1 .7-2 1.2-2 3m0 3h.01" /></>,
    records: <path d="M8 3h8v5a4 4 0 0 1-8 0ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v6m-5 3h10m-7-3h4" />,
    fullscreen: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    check: <path d="m5 12 4 4L19 6" />,
    continue: <path d="M4 9a8 8 0 1 1 0 7M4 3v6h6M12 7v5l3 2" />,
    sound: <path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />,
    flag: <path d="M5 22V3m0 1c5-5 9 5 15 0v10c-6 5-10-5-15 0" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export function ScenicBackdrop({ mapId }: { mapId: string }) {
  return <div className={`wwa-scenery wwa-scenery-${mapId}`} aria-hidden="true"><svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="wwa-sky" x2="0" y2="1"><stop stopColor="#203846" /><stop offset="1" stopColor="#7c8f8d" /></linearGradient><linearGradient id="wwa-road" x2="0" y2="1"><stop stopColor="#62716e" /><stop offset="1" stopColor="#182933" /></linearGradient></defs>
    <path fill="url(#wwa-sky)" d="M0 0h1440v900H0z" /><circle className="wwa-sun" cx="1060" cy="265" r="54" fill="#e0c79b" />
    <path fill="#4b6873" d="M0 490 180 310 310 429 550 160 780 440 982 265 1250 480 1440 300V900H0Z" />
    {mapId === 'snow' && <path fill="#c0d1d3" d="m460 266 90-106 95 115-75-30-20 27-29-29Zm448 74 74-75 93 98-71-33-25 20-23-25Z" />}
    <path fill={mapId === 'snow' ? '#82999e' : '#2d494c'} d="m0 510 220-86 270 125 233-162 303 165 232-139 182 90V900H0Z" />
    <path fill={mapId === 'snow' ? '#a7b7b8' : '#2a4039'} d="M0 582q390-87 700-15t740-5v338H0Z" />
    {Array.from({ length: 26 }, (_, i) => <path key={i} fill={mapId === 'snow' ? '#36545c' : '#19332f'} d={`m${i * 61 - 20} ${591 + i % 3 * 8} 25-${64 + i % 5 * 13} 25 ${64 + i % 5 * 13}Z`} />)}
    <path fill={mapId === 'snow' ? '#d4dbd6' : '#8f9472'} d="M696 566c40 45 240 135 650 334H405c342-220 317-276 291-334Z" />
    <path fill="url(#wwa-road)" d="M698 569c50 50 220 132 620 331H437c321-213 289-276 261-331Z" />
    <path fill="none" stroke="#c1c8b6" strokeWidth="3" d="M703 575c57 50 220 137 590 325M695 575c35 56 46 120-234 325" opacity=".7" />
    <path fill="none" stroke="#c8d0c5" strokeWidth="5" strokeDasharray="24 32" d="M700 576c68 94 110 159 188 324" opacity=".45" />
    <path fill="none" stroke="#99a9a6" strokeWidth="8" d="M719 576c200 56 470 149 721 260" opacity=".65" />
  </svg></div>;
}
