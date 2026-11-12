import Windway from './game/Wildway';
import { lazy, Suspense } from 'react';

const MobileAppShell = lazy(() => import('./game/MobileAppShell'));

function App() {
  const query = new URLSearchParams(window.location.search);
  const mobileApp = (query.get('native') === '1' || query.get('mobile') === '1') && !window.WindwayNative;
  if (mobileApp) return <Suspense fallback={<div className="mobile-app-boot" role="status">Opening Windway…</div>}><MobileAppShell /></Suspense>;
  return <Windway />;
}

export default App;
