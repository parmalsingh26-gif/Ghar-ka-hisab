import { useState, useEffect, useCallback, useRef } from 'react';

// =====================================================
// TOAST NOTIFICATION COMPONENT
// =====================================================
let toastListeners = [];
export function showToast(message, type = 'success') {
  toastListeners.forEach(fn => fn({ message, type, id: Date.now() }));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const listener = (toast) => {
      setToasts(prev => [...prev, toast]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, 2800);
    };
    toastListeners.push(listener);
    return () => { toastListeners = toastListeners.filter(fn => fn !== listener); };
  }, []);

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type !== 'success' ? t.type : ''}`}>
          {t.type === 'success' && '✓ '}
          {t.type === 'error'   && '✗ '}
          {t.type === 'info'    && 'ℹ '}
          {t.message}
        </div>
      ))}
    </div>
  );
}

// =====================================================
// STREAK BADGE COMPONENT
// =====================================================
export function StreakBadge({ streak }) {
  if (!streak || streak === 0) return null;
  return (
    <div className="streak-badge">
      🔥 {streak} दिन
    </div>
  );
}

// =====================================================
// BOTTOM NAVIGATION
// =====================================================
export function Navbar({ active, onChange }) {
  const tabs = [
    { id: 'home',     icon: '🏠', label: 'होम' },
    { id: 'calendar', icon: '📅', label: 'कैलेंडर' },
    { id: 'grocery',  icon: '🛒', label: 'किराना' },
    { id: 'vendor',   icon: '🧑‍💼', label: 'विक्रेता' },
    { id: 'reports',  icon: '📊', label: 'रिपोर्ट' },
  ];
  return (
    <nav className="bottom-nav">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`nav-item ${active === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="nav-icon" style={{ fontSize: '1.3rem' }}>{tab.icon}</span>
          <span className="nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

// =====================================================
// QTY STEPPER
// =====================================================
export function QtyStepper({ value, onChange, min = 0, max = 99, step = 0.5 }) {
  return (
    <div className="qty-stepper">
      <button className="qty-btn minus" onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}>−</button>
      <span className="qty-value">{value}</span>
      <button className="qty-btn plus" onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))}>+</button>
    </div>
  );
}

// =====================================================
// TOGGLE SWITCH
// =====================================================
export function Toggle({ label, sub, checked, onChange }) {
  return (
    <div className="toggle-wrap">
      <div>
        <div className="toggle-label">{label}</div>
        {sub && <div className="toggle-sub">{sub}</div>}
      </div>
      <label className="toggle">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="toggle-slider"></span>
      </label>
    </div>
  );
}

// =====================================================
// BOTTOM SHEET MODAL
// =====================================================
export function Sheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        {title && <div className="sheet-title">{title}</div>}
        {children}
      </div>
    </>
  );
}

// =====================================================
// RATING STARS
// =====================================================
export function RatingStars({ value, onChange, readOnly = false }) {
  return (
    <div className="stars">
      {[1,2,3,4,5].map(s => (
        <span
          key={s}
          className={`star ${s <= value ? 'filled' : ''}`}
          onClick={() => !readOnly && onChange(s)}
          style={{ cursor: readOnly ? 'default' : 'pointer' }}
        >
          {s <= value ? '⭐' : '☆'}
        </span>
      ))}
    </div>
  );
}

// =====================================================
// CONFLICT FLAG
// =====================================================
export function ConflictFlag({ show, message }) {
  if (!show) return null;
  return (
    <span className="conflict-flag">
      🚩 {message || 'विवाद'}
    </span>
  );
}

// =====================================================
// AUTOCOMPLETE INPUT
// =====================================================
export function AutocompleteInput({ value, onChange, suggestions = [], placeholder }) {
  const [open, setOpen] = useState(false);
  const filtered = suggestions.filter(s =>
    s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()
  );

  return (
    <div className="autocomplete-wrap">
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && (
        <div className="autocomplete-list">
          {filtered.slice(0, 8).map(s => (
            <div key={s} className="autocomplete-item" onMouseDown={() => { onChange(s); setOpen(false); }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================
// PROGRESS BAR
// =====================================================
export function ProgressBar({ value, max, color = '' }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="progress-bar">
      <div className={`progress-fill ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// =====================================================
// STAT CARD
// =====================================================
export function StatCard({ label, value, icon, color = '' }) {
  return (
    <div className={`stat-card ${color}`}>
      {icon && <span style={{ fontSize: '1.4rem' }}>{icon}</span>}
      <div className={`stat-value ${color === 'card-gold' ? 'text-gold' : color === 'card-green' ? 'text-green' : ''}`}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
