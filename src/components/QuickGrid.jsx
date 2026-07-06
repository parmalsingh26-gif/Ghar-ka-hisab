import { useState, useEffect, useRef, useCallback } from 'react';
import { showToast, Sheet, QtyStepper } from './UI';
import db, { upsertEntry, deleteEntry, getDayEntries, getPresets, getSessions, formatQty, todayStr } from '../db/db';

const SESSION_CONFIG = {
  morning: { label: 'सुबह', icon: '🌅', color: 'var(--clr-gold)' },
  evening: { label: 'शाम',  icon: '🌆', color: 'var(--clr-violet-light)' },
  night:   { label: 'रात',  icon: '🌙', color: 'var(--clr-teal)' },
};

// =====================================================
// QUICK TAP GRID — Sessions + Custom Presets
// =====================================================
export default function QuickGrid({ items, session, activeDate, onEntryUpdate }) {
  const [dayEntries, setDayEntries]   = useState({}); // { itemId: { session: qty } }
  const [customSheet, setCustomSheet] = useState(null);
  const [customQty,   setCustomQty]   = useState(0);
  const [customNote,  setCustomNote]  = useState('');
  const [historySheet, setHistorySheet] = useState(null);
  const [history,      setHistory]     = useState([]);
  const [historyFromDate, setHistoryFromDate] = useState('');
  const [historyToDate,   setHistoryToDate]   = useState('');
  const [customEditMeta,  setCustomEditMeta]  = useState(null);
  const [tapping,         setTapping]         = useState(null); // { itemId, preset } for visual feedback
  const today = activeDate || todayStr();

  // Load today's entries for all items
  const loadEntries = useCallback(async () => {
    const map = {};
    for (const item of items) {
      const entries = await getDayEntries(item.id, today);
      map[item.id] = {};
      entries.forEach(e => { map[item.id][e.session] = { qty: e.qty, note: e.note }; });
    }
    setDayEntries(map);
  }, [items, today]);

  useEffect(() => { if (items.length) loadEntries(); }, [loadEntries]);

  const handlePresetTap = async (item, presetQty) => {
    const existing = dayEntries[item.id]?.[session];
    const newQty   = existing ? existing.qty + presetQty : presetQty;
    try {
      await upsertEntry(item.id, today, newQty, existing?.note || '', session);
      showToast(`${item.emoji} ${item.name} — ${formatQty(newQty, item.unit)} ✓`);
      await loadEntries();
      onEntryUpdate?.();
    } catch { showToast('Entry save नहीं हुई', 'error'); }
  };

  const handleCustomSave = async () => {
    if (!customSheet) return;
    try {
      const d = customEditMeta ? customEditMeta.date : today;
      const s = customEditMeta ? customEditMeta.session : session;
      await upsertEntry(customSheet.id, d, customQty, customNote, s);
      showToast(`${customSheet.emoji} ${customSheet.name} — ${formatQty(customQty, customSheet.unit)} ✓`);
      await loadEntries();
      onEntryUpdate?.();
      if (customEditMeta && historySheet) await loadHistory(historySheet, historyFromDate, historyToDate);
      setCustomSheet(null);
      setCustomEditMeta(null);
      setCustomNote('');
    } catch { showToast('Save नहीं हुआ', 'error'); }
  };

  const handleZero = async (item, isCustom = false) => {
    try {
      const d = (isCustom && customEditMeta) ? customEditMeta.date : today;
      const s = (isCustom && customEditMeta) ? customEditMeta.session : session;
      await upsertEntry(item.id, d, 0, 'नहीं मिला', s);
      showToast(`${item.name} — नहीं मिला`, 'info');
      await loadEntries();
      onEntryUpdate?.();
      if (isCustom && customEditMeta && historySheet) await loadHistory(historySheet, historyFromDate, historyToDate);
    } catch {}
  };

  const loadHistory = async (item, fromD, toD) => {
    const entries = await db.entries.where('itemId').equals(item.id).toArray();
    const filtered = entries.filter(e => (!fromD || e.date >= fromD) && (!toD || e.date <= toD));
    const byDate = {};
    for (const e of filtered) {
      if (!byDate[e.date]) byDate[e.date] = { date: e.date, total: 0, sessions: [] };
      byDate[e.date].total += e.qty || 0;
      byDate[e.date].sessions.push({ id: e.id, session: e.session, qty: e.qty, note: e.note });
    }
    const sortedDates = Object.keys(byDate).sort((a,b) => b.localeCompare(a));
    setHistory(sortedDates.map(d => byDate[d]));
  };

  const openHistory = async (item) => {
    const toD = todayStr();
    setHistoryFromDate('');
    setHistoryToDate(toD);
    setHistorySheet(item);
    await loadHistory(item, '', toD);
  };

  const handleDeleteHistory = async (id) => {
    if (window.confirm("Delete this entry?")) {
      await deleteEntry(id);
      await loadEntries();
      onEntryUpdate?.();
      await loadHistory(historySheet, historyFromDate, historyToDate);
    }
  };

  const activeItems = items.filter(it => {
    if (!it.isActive) return false;
    const itemSessions = getSessions(it);
    return itemSessions.includes(session);
  });

  if (activeItems.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-emoji">📦</span>
        <div className="empty-title">
          {SESSION_CONFIG[session]?.icon} इस session में कोई item नहीं
        </div>
        <div className="empty-desc">Settings में item की sessions configure करें</div>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {activeItems.map(item => {
          const presets  = getPresets(item);
          const sessData = dayEntries[item.id]?.[session];
          const totalToday = Object.values(dayEntries[item.id] || {}).reduce((s, e) => s + (e?.qty || 0), 0);
          const hasSessEntry = sessData?.qty != null;
          const isZero = hasSessEntry && sessData?.qty === 0;

          return (
            <div key={item.id} className={`item-session-card ${hasSessEntry ? (isZero ? 'item-card-red' : 'item-card-green') : ''}`}>
              {/* Item Header */}
              <div className="item-card-header">
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: '1.8rem' }}>{item.emoji}</span>
                  <div>
                    <div className="font-bold">{item.name}</div>
                    <div className="text-xs text-muted">
                      {hasSessEntry
                        ? isZero
                          ? '✗ नहीं मिला'
                          : `${SESSION_CONFIG[session]?.icon} ${formatQty(sessData.qty, item.unit)}`
                        : `${SESSION_CONFIG[session]?.icon} Entry बाकी`}
                      {totalToday > 0 && ` • कुल आज: ${formatQty(totalToday, item.unit)}`}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-icon-xs"
                    onClick={() => openHistory(item)}
                    title="History"
                  >📋</button>
                  <button
                    className="btn-icon-xs btn-red"
                    onClick={() => handleZero(item)}
                    title="नहीं मिला"
                  >✗</button>
                </div>
              </div>

              {/* Preset Buttons */}
              {presets.length > 0 ? (
                <div className="preset-row">
                  {presets.map((p) => (
                    <button
                      key={p}
                      className={`preset-btn ${hasSessEntry && sessData?.qty === p ? 'preset-btn-active' : ''}`}
                      onClick={() => handlePresetTap(item, p)}
                    >
                      +{formatQty(p, item.unit)}
                    </button>
                  ))}
                  <button
                    className="preset-btn preset-btn-custom"
                    onClick={() => {
                      setCustomQty(sessData?.qty || item.defaultQty || presets[0] || 0);
                      setCustomNote(sessData?.note || '');
                      setCustomSheet(item);
                    }}
                  >
                    ✏️ Custom
                  </button>
                </div>
              ) : (
                <div className="preset-row">
                  <button
                    className="preset-btn"
                    onClick={() => handlePresetTap(item, item.defaultQty || 1)}
                  >
                    +{formatQty(item.defaultQty || 1, item.unit)}
                  </button>
                  <button
                    className="preset-btn preset-btn-custom"
                    onClick={() => {
                      setCustomQty(sessData?.qty || item.defaultQty || 1);
                      setCustomNote(sessData?.note || '');
                      setCustomSheet(item);
                    }}
                  >
                    ✏️ Custom
                  </button>
                </div>
              )}

              {/* Note display */}
              {sessData?.note && (
                <div className="item-note">📝 {sessData.note}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom Qty Sheet */}
      <Sheet
        open={!!customSheet}
        onClose={() => { setCustomSheet(null); setCustomEditMeta(null); }}
        title={`${customSheet?.emoji} ${customSheet?.name} — Custom Entry`}
      >
        {customSheet && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
            <div className="text-sm text-muted text-center">
              {SESSION_CONFIG[session]?.icon} {SESSION_CONFIG[session]?.label} • {customSheet.unit}
            </div>

            {/* Numeric Input */}
            <div className="input-group">
              <label className="input-label">
                मात्रा ({customSheet.unit})
                {customSheet.unit === 'ml' && <span className="text-xs text-muted"> — जैसे: 250, 500, 1000ml = 1L</span>}
                {customSheet.unit === 'gram' && <span className="text-xs text-muted"> — जैसे: 250, 500, 1000g = 1kg</span>}
              </label>
              <input
                className="input"
                type="number"
                value={customQty}
                onChange={e => setCustomQty(+e.target.value)}
                step={customSheet.unit === 'ml' || customSheet.unit === 'gram' ? 50 : 0.5}
                min={0}
                style={{ fontSize: '1.3rem', fontWeight: 700, textAlign: 'center' }}
              />
              {/* Smart display */}
              {(customSheet.unit === 'ml' || customSheet.unit === 'gram') && customQty > 0 && (
                <div className="text-center text-gold font-bold mt-1">
                  = {formatQty(customQty, customSheet.unit)}
                </div>
              )}
            </div>

            {/* Quick amounts */}
            <div className="preset-row" style={{ justifyContent: 'center' }}>
              {getPresets(customSheet).map(p => (
                <button key={p} className={`preset-btn ${customQty === p ? 'preset-btn-active' : ''}`}
                  onClick={() => setCustomQty(p)}>
                  {formatQty(p, customSheet.unit)}
                </button>
              ))}
            </div>

            {/* Note */}
            <div className="input-group">
              <label className="input-label">📝 Note (optional)</label>
              <input
                className="input"
                type="text"
                value={customNote}
                onChange={e => setCustomNote(e.target.value)}
                placeholder="जैसे: खट्टा था, देर से आया..."
              />
            </div>

            <div className="flex gap-3">
              <button className="btn btn-danger flex-1" onClick={() => handleZero(customSheet, true).then(() => { setCustomSheet(null); setCustomEditMeta(null); })}>
                ✗ नहीं मिला
              </button>
              <button className="btn btn-primary flex-1" onClick={handleCustomSave}>
                ✓ Save ({formatQty(customQty, customSheet.unit)})
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {/* History Sheet */}
      <Sheet
        open={!!historySheet}
        onClose={() => setHistorySheet(null)}
        title={`${historySheet?.emoji} ${historySheet?.name} — History`}
      >
        <div className="flex gap-2 mb-4">
          <div className="flex-1">
            <label className="text-xs text-muted block mb-1">From</label>
            <input type="date" className="input" style={{padding: '4px', fontSize: '0.8rem'}} value={historyFromDate} onChange={e => {
              setHistoryFromDate(e.target.value);
              loadHistory(historySheet, e.target.value, historyToDate);
            }} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted block mb-1">To</label>
            <input type="date" className="input" style={{padding: '4px', fontSize: '0.8rem'}} value={historyToDate} onChange={e => {
              setHistoryToDate(e.target.value);
              loadHistory(historySheet, historyFromDate, e.target.value);
            }} />
          </div>
        </div>

        {history.map((day, i) => (
          <div key={day.date} className="list-item" style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="flex justify-between items-center mb-2">
              <div className="font-semi text-sm">
                {day.date === today ? 'आज' : new Date(day.date + 'T00:00:00').toLocaleDateString('hi-IN', { weekday: 'short', day: 'numeric', month: 'short' })} ({day.date})
              </div>
              <div className="font-bold text-gold">
                {day.total > 0 ? formatQty(day.total, historySheet?.unit) : '—'}
              </div>
            </div>
            
            <div className="flex flex-col gap-2 mt-1">
              {day.sessions.map(s => (
                <div key={s.id || s.session} className="flex justify-between items-center" style={{ background: 'rgba(255,255,255,0.03)', padding: '6px', borderRadius: '8px' }}>
                  <span className={`badge ${s.qty === 0 ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '0.68rem' }}>
                    {SESSION_CONFIG[s.session]?.icon} {formatQty(s.qty, historySheet?.unit)}
                    {s.note && ` · ${s.note}`}
                  </span>
                  <div className="flex gap-1">
                    <button className="btn-icon-xs" style={{ border: '1px solid rgba(255,255,255,0.1)' }} onClick={() => {
                      setCustomQty(s.qty);
                      setCustomNote(s.note || '');
                      setCustomEditMeta({ date: day.date, session: s.session, id: s.id });
                      setCustomSheet(historySheet);
                    }}>✏️</button>
                    <button className="btn-icon-xs btn-red" onClick={() => handleDeleteHistory(s.id)}>🗑️</button>
                  </div>
                </div>
              ))}
              {day.sessions.length === 0 && <span className="badge badge-orange" style={{ fontSize: '0.68rem', alignSelf: 'flex-start' }}>⚪ No entry</span>}
            </div>
          </div>
        ))}
        {history.length === 0 && (
           <div className="text-center text-muted mt-4">कोई एंट्री नहीं मिली</div>
        )}
      </Sheet>
    </>
  );
}
