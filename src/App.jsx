import { useState, useEffect } from 'react';
import { ToastContainer, Navbar } from './components/UI';
import Home from './pages/Home';
import CalendarPage from './pages/Calendar';
import Grocery from './pages/Grocery';
import Vendor from './pages/Vendor';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Split from './pages/Split';
import { startNotificationScheduler } from './utils/notifications';
import { getSetting, setSetting } from './db/db';
import './index.css';

function App() {
  const [tab, setTab] = useState('home');
  const [onboarded, setOnboarded] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // Apply large mode on startup
    getSetting('largeMode').then(v => {
      if (v) document.body.classList.add('large-mode');
    });
    // Start notification scheduler
    startNotificationScheduler();
    // Check onboarding
    getSetting('onboarded').then(v => {
      if (!v) setOnboarded(false);
    });
  }, []);

  const completeOnboarding = async () => {
    await setSetting('onboarded', true);
    setOnboarded(true);
  };

  // Onboarding Screen
  if (!onboarded) {
    return (
      <>
        <ToastContainer />
        <div className="page" style={{ paddingBottom: 40 }}>
          <div className="welcome-hero">
            <span className="welcome-emoji">🏠</span>
            <div className="welcome-title">घर का हिसाब</div>
            <div className="welcome-sub">
              अपने घर के दूध, पानी, राशन का<br />हिसाब अब आसान — एकदम आपकी भाषा में।
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 8px' }}>
            {[
              ['⚡', 'एक Tap में Entry', 'दूध आया? बस एक टैप — हो गया हिसाब'],
              ['📅', 'Smart Calendar', 'हरे-लाल रंग से पता चले — कब मिला, कब नहीं'],
              ['💰', 'Auto Bill Calculator', 'Rate बदली? App खुद calculate करेगा'],
              ['🧑‍💼', 'Vendor Tracking', 'Vendor और Customer दोनों का हिसाब एक जगह'],
              ['📊', 'Reports & Export', 'Monthly report PDF/Excel में export करें'],
            ].map(([icon, title, sub]) => (
              <div key={title} className="card" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1.8rem', flexShrink: 0 }}>{icon}</span>
                <div>
                  <div className="font-bold">{title}</div>
                  <div className="text-sm text-muted">{sub}</div>
                </div>
              </div>
            ))}
          </div>

          <button
            className="btn btn-primary btn-lg btn-block"
            style={{ marginTop: 32 }}
            onClick={completeOnboarding}
          >
            🚀 शुरू करें
          </button>
        </div>
      </>
    );
  }

  const renderPage = () => {
    if (showSettings) return <Settings />;
    switch (tab) {
      case 'home':     return <Home />;
      case 'calendar': return <CalendarPage />;
      case 'grocery':  return <Grocery />;
      case 'vendor':   return <Vendor />;
      case 'reports':  return <Reports />;
      case 'split':    return <Split />;
      default:         return <Home />;
    }
  };

  return (
    <>
      <ToastContainer />
      {/* Top Settings Button */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        style={{
          position: 'fixed', top: 12, right: 16, zIndex: 200,
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '50%', width: 38, height: 38,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: '1.1rem',
          backdropFilter: 'blur(10px)',
          color: showSettings ? 'var(--clr-gold)' : 'rgba(255,255,255,0.7)',
        }}
        title="Settings"
      >
        ⚙️
      </button>

      {renderPage()}

      {!showSettings && (
        <Navbar active={tab} onChange={(id) => { setTab(id); setShowSettings(false); }} />
      )}
    </>
  );
}

export default App;
