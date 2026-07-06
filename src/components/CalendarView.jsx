import { useState, useMemo } from 'react';
import { getDaysInMonth, sumRange, calcBill, formatRupees } from '../utils/formulas';
import { Sheet } from './UI';

// =====================================================
// COLOR-CODED CALENDAR VIEW
// =====================================================
const WEEKDAYS = ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'];
const MONTHS = ['जनवरी','फरवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितंबर','अक्टूबर','नवंबर','दिसंबर'];

function getDayColor(qty, defaultQty) {
  if (qty == null) return 'empty';
  if (qty === 0) return 'red';
  if (qty < defaultQty) return 'orange';
  return 'green';
}

export default function CalendarView({ entries, defaultQty, rate = 0, onDaySelect, selectedRange = [] }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [rangeStart, setRangeStart] = useState(null);
  const [rangeEnd, setRangeEnd] = useState(null);
  const [dayDetail, setDayDetail] = useState(null);

  const days = getDaysInMonth(viewYear, viewMonth);
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();

  // Entry map: date -> qty
  const entryMap = useMemo(() => {
    const map = {};
    (entries || []).forEach(e => { map[e.date] = e.qty; });
    return map;
  }, [entries]);

  const todayStr = today.toISOString().split('T')[0];

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

  const rangeTotal = sumRange(rangeEntries);
  const rangeAmount = calcBill(rangeTotal, rate);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setRangeStart(null); setRangeEnd(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setRangeStart(null); setRangeEnd(null);
  };

  return (
    <div>
      {/* Month Navigator */}
      <div className="flex items-center justify-between mb-3">
        <button className="btn btn-outline btn-sm btn-icon" onClick={prevMonth}>‹</button>
        <span className="font-bold text-lg">{MONTHS[viewMonth]} {viewYear}</span>
        <button className="btn btn-outline btn-sm btn-icon" onClick={nextMonth}>›</button>
      </div>

      {/* Weekday headers */}
      <div className="calendar-grid" style={{ marginBottom: 6 }}>
        {WEEKDAYS.map(d => <div key={d} className="cal-header">{d}</div>)}
      </div>

      {/* Day cells */}
      <div className="calendar-grid">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
        {days.map(dateStr => {
          const qty = entryMap[dateStr];
          const color = getDayColor(qty, defaultQty || 1);
          const dayNum = parseInt(dateStr.split('-')[2]);
          const isToday = dateStr === todayStr;
          const inRange = rangeStart && rangeEnd && dateStr >= rangeStart && dateStr <= rangeEnd;
          const isStart = dateStr === rangeStart;
          const isEnd   = dateStr === rangeEnd;
          return (
            <div
              key={dateStr}
              className={`cal-day ${color} ${isToday ? 'today' : ''} ${inRange || isStart || isEnd ? 'selected' : ''}`}
              onClick={() => handleDayTap(dateStr)}
              title={qty != null ? `${qty} ${qty === 1 ? 'unit' : 'units'}` : 'No entry'}
            >
              {dayNum}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-3 mt-3" style={{ fontSize: '0.72rem', justifyContent: 'center' }}>
        <span><span style={{color:'var(--clr-green)'}}>●</span> पूरा मिला</span>
        <span><span style={{color:'var(--clr-orange)'}}>●</span> आधा मिला</span>
        <span><span style={{color:'var(--clr-red)'}}>●</span> नहीं मिला</span>
      </div>

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
              <div className="stat-value text-gold" style={{fontSize:'1.4rem'}}>{rangeTotal}</div>
              <div className="stat-label">कुल मात्रा</div>
            </div>
            {rate > 0 && (
              <div style={{textAlign:'right'}}>
                <div className="stat-value text-green" style={{fontSize:'1.4rem'}}>{formatRupees(rangeAmount)}</div>
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
        <div className="card mt-3" style={{textAlign:'center'}}>
          <span className="text-sm text-muted">अब End Date चुनें (📅 {rangeStart} से)</span>
        </div>
      )}
    </div>
  );
}
