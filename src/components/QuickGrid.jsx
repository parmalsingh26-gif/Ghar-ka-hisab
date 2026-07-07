import { useState, useEffect, useRef, useCallback } from 'react';
import { showToast, Sheet } from './UI';
import db, { upsertEntry, deleteEntry, getDayEntries, getPresets, getSessions, formatQty, todayStr } from '../db/db';

const SESSION_CONFIG = {
  morning: { label: 'सुबह', icon: '🌅', color: 'var(--clr-gold)',   grad: 'linear-gradient(135deg,#f5a623,#ffd166)' },
  evening: { label: 'शाम',  icon: '🌆', color: 'var(--clr-violet-light)', grad: 'linear-gradient(135deg,#7c3aed,#c084fc)' },
  night:   { label: 'रात',  icon: '🌙', color: 'var(--clr-teal)',   grad: 'linear-gradient(135deg,#0891b2,#06b6d4)' },
};

// =====================================================
// QUICK TAP GRID — Sessions + Custom Presets
// BUG FIX: Preset tap now REPLACES qty (not adds)
// Use +Add button to accumulate more
// =====================================================
export default function QuickGrid({ items, session, activeDate, onEntryUpdate }) {
  const [dayEntries,    setDayEntries]    = useState({}); // { itemId: { session: {qty,note} } }
  const [customSheet,   setCustomSheet]   = useState(null);
  const [customQty,     setCustomQty]     = useState(0);
  const [customNote,    setCustomNote]    = useState('');
  const [historySheet,  setHistorySheet]  = useState(null);
  const [history,       setHistory]       = useState([]);
  const [historyFromDate, setHistoryFromDate] = useState('');
  const [historyToDate,   setHistoryToDate]   = useState('');
  const [customEditMeta,  setCustomEditMeta]  = useState(null);
  const [tappingId,       setTappingId]       = useState(null); // item id for visual feedback
  const [addMoreSheet,    setAddMoreSheet]    = useState(null); // for +More mode
  const [addMoreQty,      setAddMoreQty]      = useState(0);
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

  // ✅ BUG FIX: Preset tap = REPLACE (not add)
  const handlePresetTap = async (item, presetQty) => {
    setTappingId(item.id + '-' + presetQty);
    setTimeout(() => setTappingId(null), 400);
    try {
      await upsertEntry(item.id, today, presetQty, '', session);
      showToast(`${item.emoji} ${formatQty(presetQty, item.unit)} set ✓`);
      await loadEntries();
      onEntryUpdate?.();
    } catch { showToast('Entry save नहीं हुई', 'error'); }
  };

  // +Add More: adds on top of existing qty
  const handleAddMore = async () => {
    if (!addMoreSheet) return;
    const existing = dayEntries[addMoreSheet.id]?.[session];
    const newQty = (existing?.qty || 0) + addMoreQty;
    try {
      await upsertEntry(addMoreSheet.id, today, newQty, existing?.note || '', session);
      showToast(`${addMoreSheet.emoji} +${formatQty(addMoreQty, addMoreSheet.unit)} → ${formatQty(newQty, addMoreSheet.unit)} ✓`);
      setAddMoreSheet(null);
      await loadEntries();
      onEntryUpdate?.();
    } catch { showToast('Save नहीं हुआ', 'error'); }
  };

  const handleCustomSave = async () => {
    if (!customSheet) return;
    try {
      const d = customEditMeta ? customEditMeta.date : today;
      const s = customEditMeta ? customEditMeta.session : session;
      await upsertEntry(customSheet.id, d, customQty, customNote, s);
      showToast(`${customSheet.emoji} ${formatQty(customQty, customSheet.unit)} ✓`);
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
    if (window.confirm('क्या इस entry को delete करना है?')) {
      await deleteEntry(id);
      await loadEntries();
      onEntryUpdate?.();
      await loadHistory(historySheet, historyFromDate, historyToDate);
    }
  };

  const activeItems = items.filter(it => {
    if (!it.isActive) return false;
    return getSessions(it).includes(session);
  });

  if (activeItems.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-emoji">📦</span>
        <div className="empty-title">{SESSION_CONFIG[session]?.icon} इस session में कोई item नहीं</div>
        <div className="empty-desc">Settings → Items में session configure करें</div>
      </div>
    );
  }

  const sessColor = SESSION_CONFIG[session]?.color || 'var(--clr-gold)';
  const sessGrad  = SESSION_CONFIG[session]?.grad  || 'var(--grad-gold)';

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {activeItems.map(item => {
          const presets    = getPresets(item);
          const sessData   = dayEntries[item.id]?.[session];
          const allSess    = dayEntries[item.id] || {};
          const totalToday = Object.values(allSess).reduce((s, e) => s + (e?.qty || 0), 0);
          const hasSessEntry = sessData?.qty != null;
          const isZero       = hasSessEntry && sessData?.qty === 0;
          const sessionsDone = getSessions(item).filter(s => dayEntries[item.id]?.[s]?.qty != null && dayEntries[item.id]?.[s]?.qty > 0).length;
          const sessionsTotal = getSessions(item).length;
          const progressPct   = sessionsTotal > 0 ? Math.round((sessionsDone / sessionsTotal) * 100) : 0;

          return (
            <div
              key={item.id}
              className={`item-session-card ${hasSessEntry ? (isZero ? 'item-card-red' : 'item-card-green') : ''}`}
              style={{ transition: 'all 0.2s var(--ease-spring)' }}
            >
              {/* Item Header */}
              <div className="item-card-header">
                <div className="flex items-center gap-3">
                  <div style={{ position: 'relative' }}>
                    <span style={{ fontSize: '2rem' }}>{item.emoji}</span>
                    {/* Session progress dot */}
                    {progressPct === 100 && (
                      <span style={{
                        position: 'absolute', top: -4, right: -4,
                        width: 14, height: 14, borderRadius: '50%',
                        background: 'var(--clr-green)',
                        border: '2px solid var(--clr-bg-deep)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.5rem', color: '#fff', fontWeight: 700,
                      }}>✓</span>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="font-bold">{item.name}</div>
                    <div className="text-xs text-muted" style={{ lineHeight: 1.5 }}>
                      {hasSessEntry
                        ? isZero
                          ? <span style={{ color: 'var(--clr-red)' }}>✗ नहीं मिला</span>
                          : <span style={{ color: sessColor }}>
                              {SESSION_CONFIG[session]?.icon} {formatQty(sessData.qty, item.unit)}
                            </span>
                        : <span>{SESSION_CONFIG[session]?.icon} Entry बाकी</span>}
                      {totalToday > 0 && (
                        <span style={{ color: 'rgba(241,245,249,0.5)', marginLeft: 6 }}>
                          • आज कुल: <b style={{ color: 'var(--clr-gold)' }}>{formatQty(totalToday, item.unit)}</b>
                        </span>
                      )}
                    </div>
                    {/* Session progress mini bar */}
                    {sessionsTotal > 1 && (
                      <div style={{ marginTop: 4, display: 'flex', gap: 3, alignItems: 'center' }}>
                        {getSessions(item).map(s => {
                          const sd = dayEntries[item.id]?.[s];
                          const done = sd?.qty != null && sd.qty > 0;
                          const zero = sd?.qty === 0;
                          return (
                            <div key={s} title={`${SESSION_CONFIG[s]?.label}: ${done ? formatQty(sd.qty, item.unit) : zero ? 'नहीं मिला' : 'बाकी'}`}
                              style={{
                                width: 20, height: 4, borderRadius: 4,
                                background: done ? SESSION_CONFIG[s]?.color : zero ? 'var(--clr-red)' : 'rgba(255,255,255,0.15)',
                                transition: 'background 0.3s',
                              }}
                            />
                          );
                        })}
                        <span className="text-xs text-muted" style={{ fontSize: '0.62rem' }}>
                          {sessionsDone}/{sessionsTotal}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-icon-xs" onClick={() => openHistory(item)} title="History">📋</button>
                  <button className="btn-icon-xs btn-red" onClick={() => handleZero(item)} title="नहीं मिला">✗</button>
                </div>
              </div>

              {/* Preset Buttons — REPLACE mode */}
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>
                  tap = set करें &nbsp;•&nbsp; ✏️ = custom
                </div>
                <div className="preset-row">
                  {(presets.length > 0 ? presets : [item.defaultQty || 1]).map((p) => {
                    const isActive = hasSessEntry && sessData?.qty === p;
                    const tapKey = item.id + '-' + p;
                    return (
                      <button
                        key={p}
                        className={`preset-btn ${isActive ? 'preset-btn-active' : ''}`}
                        style={{
                          transform: tappingId === tapKey ? 'scale(0.92)' : 'scale(1)',
                          transition: 'transform 0.15s var(--ease-spring)',
                          borderColor: isActive ? sessColor : undefined,
                          color: isActive ? sessColor : undefined,
                        }}
                        onClick={() => handlePresetTap(item, p)}
                      >
                        {formatQty(p, item.unit)}
                      </button>
                    );
                  })}

                  {/* +More button — ADDITIVE mode */}
                  {hasSessEntry && !isZero && (
                    <button
                      className="preset-btn"
                      style={{ color: 'var(--clr-teal)', borderColor: 'rgba(6,182,212,0.4)', fontSize: '0.8rem' }}
                      onClick={() => {
                        setAddMoreQty(presets[0] || item.defaultQty || 1);
                        setAddMoreSheet(item);
                      }}
                      title="और जोड़ें"
                    >
                      ➕ और
                    </button>
                  )}

                  {/* Custom button */}
                  <button
                    className="preset-btn preset-btn-custom"
                    onClick={() => {
                      setCustomQty(sessData?.qty || item.defaultQty || presets[0] || 0);
                      setCustomNote(sessData?.note || '');
                      setCustomEditMeta(null);
                      setCustomSheet(item);
                    }}
                  >
                    ✏️
                  </button>
                </div>
              </div>

              {/* Note display */}
              {sessData?.note && (
                <div className="item-note" style={{ marginTop: 6 }}>📝 {sessData.note}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* +More Sheet */}
      <Sheet
        open={!!addMoreSheet}
        onClose={() => setAddMoreSheet(null)}
        title={`➕ ${addMoreSheet?.emoji} ${addMoreSheet?.name} — और जोड़ें`}
      >
        {addMoreSheet && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
            <div className="text-sm text-muted text-center">
              अभी: <b style={{ color: 'var(--clr-gold)' }}>
                {formatQty(dayEntries[addMoreSheet.id]?.[session]?.qty || 0, addMoreSheet.unit)}
              </b> • इसमें जोड़ें:
            </div>
            <div className="preset-row" style={{ justifyContent: 'center' }}>
              {getPresets(addMoreSheet).map(p => (
                <button key={p}
                  className={`preset-btn ${addMoreQty === p ? 'preset-btn-active' : ''}`}
                  onClick={() => setAddMoreQty(p)}>
                  +{formatQty(p, addMoreSheet.unit)}
                </button>
              ))}
            </div>
            <div className="input-group">
              <label className="input-label">Custom amount जोड़ें ({addMoreSheet.unit})</label>
              <input
                className="input"
                type="number"
                value={addMoreQty}
                onChange={e => setAddMoreQty(+e.target.value)}
                step={addMoreSheet.unit === 'ml' || addMoreSheet.unit === 'gram' ? 50 : 0.5}
                min={0}
                style={{ fontSize: '1.3rem', fontWeight: 700, textAlign: 'center' }}
              />
              <div className="text-center text-gold font-bold mt-1" style={{ fontSize: '0.85rem' }}>
                नया Total = {formatQty((dayEntries[addMoreSheet.id]?.[session]?.qty || 0) + addMoreQty, addMoreSheet.unit)}
              </div>
            </div>
            <button className="btn btn-primary btn-block" onClick={handleAddMore}>
              ➕ {formatQty(addMoreQty, addMoreSheet.unit)} जोड़ें
            </button>
          </div>
        )}
      </Sheet>

      {/* Custom Qty Sheet */}
      <Sheet
        open={!!customSheet}
        onClose={() => { setCustomSheet(null); setCustomEditMeta(null); }}
        title={`${customSheet?.emoji} ${customSheet?.name} — Custom Entry`}
      >
        {customSheet && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
            <div className="text-sm text-muted text-center">
              {customEditMeta
                ? `✏️ Edit: ${customEditMeta.date} • ${SESSION_CONFIG[customEditMeta.session]?.label}`
                : `${SESSION_CONFIG[session]?.icon} ${SESSION_CONFIG[session]?.label} • ${customSheet.unit}`}
            </div>

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
              {(customSheet.unit === 'ml' || customSheet.unit === 'gram') && customQty > 0 && (
                <div className="text-center text-gold font-bold mt-1">
                  = {formatQty(customQty, customSheet.unit)}
                </div>
              )}
            </div>

            <div className="preset-row" style={{ justifyContent: 'center' }}>
              {getPresets(customSheet).map(p => (
                <button key={p} className={`preset-btn ${customQty === p ? 'preset-btn-active' : ''}`}
                  onClick={() => setCustomQty(p)}>
                  {formatQty(p, customSheet.unit)}
                </button>
              ))}
            </div>

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
              <button className="btn btn-danger flex-1"
                onClick={() => handleZero(customSheet, true).then(() => { setCustomSheet(null); setCustomEditMeta(null); })}>
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
            <input type="date" className="input" style={{ padding: '4px', fontSize: '0.8rem' }}
              value={historyFromDate}
              onChange={e => { setHistoryFromDate(e.target.value); loadHistory(historySheet, e.target.value, historyToDate); }} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted block mb-1">To</label>
            <input type="date" className="input" style={{ padding: '4px', fontSize: '0.8rem' }}
              value={historyToDate}
              onChange={e => { setHistoryToDate(e.target.value); loadHistory(historySheet, historyFromDate, e.target.value); }} />
          </div>
        </div>

        {/* History Summary */}
        {history.length > 0 && (
          <div style={{
            background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.2)',
            borderRadius: 10, padding: '8px 14px', marginBottom: 12,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span className="text-xs text-muted">{history.length} दिन का रिकॉर्ड</span>
            <span className="font-bold text-gold">
              कुल: {formatQty(history.reduce((s, d) => s + d.total, 0), historySheet?.unit)}
            </span>
          </div>
        )}

        {history.map((day) => (
          <div key={day.date} className="list-item" style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="flex justify-between items-center mb-2">
              <div className="font-semi text-sm">
                {day.date === today ? 'आज' : new Date(day.date + 'T00:00:00').toLocaleDateString('hi-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginLeft: 6 }}>({day.date})</span>
              </div>
              <div className="font-bold text-gold">
                {day.total > 0 ? formatQty(day.total, historySheet?.unit) : '—'}
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-1">
              {day.sessions.map(s => (
                <div key={s.id || s.session}
                  className="flex justify-between items-center"
                  style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 8 }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.8rem' }}>{SESSION_CONFIG[s.session]?.icon}</span>
                    <span className={`badge ${s.qty === 0 ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '0.68rem' }}>
                      {formatQty(s.qty, historySheet?.unit)}
                    </span>
                    {s.note && <span className="text-xs text-muted">{s.note}</span>}
                  </span>
                  <div className="flex gap-1">
                    <button className="btn-icon-xs" style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                      onClick={() => {
                        setCustomQty(s.qty);
                        setCustomNote(s.note || '');
                        setCustomEditMeta({ date: day.date, session: s.session, id: s.id });
                        setCustomSheet(historySheet);
                      }}>✏️</button>
                    <button className="btn-icon-xs btn-red" onClick={() => handleDeleteHistory(s.id)}>🗑️</button>
                  </div>
                </div>
              ))}
              {day.sessions.length === 0 && (
                <span className="badge badge-orange" style={{ fontSize: '0.68rem', alignSelf: 'flex-start' }}>⚪ No entry</span>
              )}
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
