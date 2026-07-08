import { useState, useMemo } from 'react';
import { getDaysInMonth, sumRange, calcBill, formatRupees } from '../utils/formulas';
import { Sheet } from './UI';

// =====================================================
// PREMIUM COLOR-CODED CALENDAR VIEW v2
// =====================================================
const WEEKDAYS = ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'];
const MONTHS   = ['जनवरी','फरवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितंबर','अक्टूबर','नवंबर','दिसंबर'];

function getDayColor(qty, defaultQty) {
  if (qty == null) return 'empty';
  if (qty === 0) return 'red';
  if (qty < defaultQty) return 'orange';
  return 'green';
}

// Heatmap intensity based on qty relative to max
function getHeatClass(qty, maxQty) {
  if (!qty || qty === 0) return '';
  const pct = qty / maxQty;
  if (pct <= 0.2) return 'heat-1';
  if (pct <= 0.4) return 'heat-2';
  if (pct <= 0.6) return 'heat-3';
  if (pct <= 0.85) return 'heat-4';
  return 'heat-5';
}

export default function CalendarView({ entries, defaultQty, rate = 0, onDaySelect, selectedRange = [] }) {
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [rangeStart, setRangeStart] = useState(null);
  const [rangeEnd,   setRangeEnd]   = useState(null);
  const [dayDetail,  setDayDetail]  = useState(null);
  const [heatmapMode, setHeatmapMode] = useState(false);

  const days     = getDaysInMonth(viewYear, viewMonth);
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();

  // Entry map: date -> qty
  const entryMap = useMemo(() => {
    const map = {};
    (entries || []).forEach(e => { map[e.date] = e.qty; });
    return map;
  }, [entries]);

  // Max qty for heatmap normalization
  const maxQty = useMemo(() => {
    const vals = Object.values(entryMap).filter(v => v != null && v > 0);
    return vals.length > 0 ? Math.max(...vals) : 1;
  }, [entryMap]);

  const todayStr = today.toISOString().split('T')[0];

  // Month stats
  const monthStats = useMemo(() => {
    const monthDays = days.filter(d => d <= todayStr);
    const entried   = monthDays.filter(d => entryMap[d] != null && entryMap[d] > 0);
    const missed    = monthDays.filter(d => entryMap[d] === 0);
    const noEntry   = monthDays.filter(d => entryMap[d] == null);
    const totalQty  = entried.reduce((s, d) => s + entryMap[d], 0);
    return { entried: entried.length, missed: missed.length, noEntry: noEntry.length, totalQty };
  }, [days, entryMap, todayStr]);

  const handleDayTap = (dateStr) => {
    if (!rangeStart) {
      setRangeStart(dateStr);
      setRangeEnd(null);
    } else if (!rangeEnd && dateStr >= rangeStart) {
      setRangeEnd(dateStr);
      onDaySelect?.({ from: rangeStart, to: dateStr });
    } else {
      setRangeStart(dateStr);
      setRangeEnd(null);
    }
    setDayDetail(dateStr);
  };

  // Range summary
  const rangeEntries = useMemo(() => {
    if (!rangeStart || !rangeEnd) return [];
    return days
      .filter(d => d >= rangeStart && d <= rangeEnd)
      .map(d => ({ date: d, qty: entryMap[d] ?? null }))
      .filter(e => e.qty != null);
  }, [rangeStart, rangeEnd, days, entryMap]);

  const rangeTotal  = sumRange(rangeEntries);
  const rangeAmount = calcBill(rangeTotal, rate);

  // Fixed: use manual date math, not ISO string to avoid timezone issues
  const prevMonth = () => {
    setRangeStart(null); setRangeEnd(null);
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    setRangeStart(null); setRangeEnd(null);
    // Don't go future beyond current month
    const now = new Date();
    if (viewYear === now.getFullYear() && viewMonth === now.getMonth()) return;
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  return (
    <div>
      {/* Month Navigator */}
      <div className="flex items-center justify-between mb-4" style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 18,
        padding: '8px 12px',
      }}>
        <button
          style={{
            width: 40, height: 40, borderRadius: 14,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            color: '#f1f5f9', fontSize: '1.3rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s var(--ease-spring)',
          }}
          onClick={prevMonth}
        >‹</button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
            {MONTHS[viewMonth]}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>{viewYear}</div>
        </div>

        <button
          style={{
            width: 40, height: 40, borderRadius: 14,
            background: isCurrentMonth ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: isCurrentMonth ? 'rgba(255,255,255,0.2)' : '#f1f5f9',
            fontSize: '1.3rem',
            cursor: isCurrentMonth ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s var(--ease-spring)',
          }}
          onClick={nextMonth}
          disabled={isCurrentMonth}
        >›</button>
      </div>

      {/* Month Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 8,
        marginBottom: 14,
      }}>
        {[
          { label: '✅ मिला',     value: monthStats.entried, color: 'var(--clr-green)',  bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.20)' },
          { label: '✗ नहीं मिला', value: monthStats.missed,  color: 'var(--clr-red)',    bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.20)' },
          { label: '— खाली',     value: monthStats.noEntry,  color: 'rgba(241,245,249,0.4)', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)' },
        ].map(s => (
          <div key={s.label} style={{
            background: s.bg, border: `1px solid ${s.border}`,
            borderRadius: 14, padding: '8px 10px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(241,245,249,0.4)', fontWeight: 600, marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Heatmap Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8, gap: 8 }}>
        <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)' }}>Heatmap</span>
        <label className="toggle" style={{ width: 38, height: 22 }}>
          <input type="checkbox" checked={heatmapMode} onChange={e => setHeatmapMode(e.target.checked)} />
          <span className="toggle-slider" style={{ borderRadius: 999 }} />
        </label>
      </div>

      {/* Weekday headers */}
      <div className="calendar-grid" style={{ marginBottom: 6 }}>
        {WEEKDAYS.map(d => <div key={d} className="cal-header">{d}</div>)}
      </div>

      {/* Day cells */}
      <div className="calendar-grid">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
        {days.map(dateStr => {
          const qty      = entryMap[dateStr];
          const color    = getDayColor(qty, defaultQty || 1);
          const dayNum   = parseInt(dateStr.split('-')[2]);
          const isToday  = dateStr === todayStr;
          const inRange  = rangeStart && rangeEnd && dateStr >= rangeStart && dateStr <= rangeEnd;
          const isStart  = dateStr === rangeStart;
          const isEnd    = dateStr === rangeEnd;
          const heatClass = heatmapMode && qty != null ? getHeatClass(qty, maxQty) : '';
          const isFuture = dateStr > todayStr;

          return (
            <div
              key={dateStr}
              className={`cal-day ${heatmapMode && heatClass ? heatClass : color} ${isToday ? 'today' : ''} ${inRange || isStart || isEnd ? 'selected' : ''}`}
              onClick={() => !isFuture && handleDayTap(dateStr)}
              title={qty != null ? `${qty} ${qty === 1 ? 'unit' : 'units'}` : 'No entry'}
              style={{
                opacity: isFuture ? 0.3 : 1,
                cursor: isFuture ? 'default' : 'pointer',
                position: 'relative',
              }}
            >
              {dayNum}
              {/* Tiny dot indicator */}
              {qty != null && qty > 0 && !heatmapMode && (
                <div style={{
                  position: 'absolute', bottom: 2, left: '50%',
                  transform: 'translateX(-50%)',
                  width: 3, height: 3, borderRadius: '50%',
                  background: 'currentColor', opacity: 0.7,
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {!heatmapMode ? (
        <div className="flex gap-3 mt-4" style={{ fontSize: '0.68rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <span><span style={{ color: 'var(--clr-green)' }}>●</span> पूरा मिला</span>
          <span><span style={{ color: 'var(--clr-orange)' }}>●</span> आधा मिला</span>
          <span><span style={{ color: 'var(--clr-red)' }}>●</span> नहीं मिला</span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>● खाली</span>
        </div>
      ) : (
        <div className="flex gap-2 mt-4" style={{ fontSize: '0.65rem', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>कम</span>
          {['heat-1','heat-2','heat-3','heat-4','heat-5'].map(c => (
            <div key={c} className={`cal-day ${c}`}
              style={{ width: 18, height: 18, borderRadius: 4, display: 'inline-flex', cursor: 'default' }} />
          ))}
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>ज़्यादा</span>
        </div>
      )}

      {/* Range Summary */}
      {rangeStart && rangeEnd && (
        <div className="card card-gradient mt-4">
          <div className="section-title">📊 चुनी हुई अवधि</div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted">{rangeStart} → {rangeEnd}</span>
            <span className="badge badge-violet">{rangeEntries.length} दिन</span>
          </div>
          <div className="flex justify-between mt-3">
            <div>
              <div className="stat-value text-gold" style={{ fontSize: '1.5rem' }}>{rangeTotal}</div>
              <div className="stat-label">कुल मात्रा</div>
            </div>
            {rate > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div className="stat-value text-green" style={{ fontSize: '1.5rem' }}>{formatRupees(rangeAmount)}</div>
                <div className="stat-label">कुल राशि (₹{rate}/unit)</div>
              </div>
            )}
          </div>
          <button
            className="btn btn-outline btn-sm btn-block mt-3"
            onClick={() => { setRangeStart(null); setRangeEnd(null); }}
          >
            ✕ Range Clear करें
          </button>
        </div>
      )}
      {rangeStart && !rangeEnd && (
        <div className="card mt-3" style={{ textAlign: 'center', padding: 14 }}>
          <span className="text-sm text-muted">अब End Date चुनें (📅 {rangeStart} से)</span>
        </div>
      )}
    </div>
  );
}
