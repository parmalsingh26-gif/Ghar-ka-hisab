import { useState, useEffect, useCallback, useMemo } from 'react';
import db, { getEntriesRange, formatQty, upsertEntry, getDayEntries, getSessions } from '../db/db';
import { calcSplitBill, calcAdvanceBalance, calcBill, formatRupees, formatDate, monthlySummary, getDaysInMonth } from '../utils/formulas';
import { showToast, Sheet, StatCard } from '../components/UI';

const MONTHS_HI = ['जनवरी','फरवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितंबर','अक्टूबर','नवंबर','दिसंबर'];
const WEEKDAYS  = ['रवि','सोम','मंगल','बुध','गुरु','शुक्र','शनि'];

const SESSION_CONFIG = {
  morning: { label: 'सुबह', icon: '🌅', color: 'var(--clr-gold)' },
  evening: { label: 'शाम',  icon: '🌆', color: 'var(--clr-violet-light)' },
  night:   { label: 'रात',  icon: '🌙', color: 'var(--clr-teal)' },
};

function getDayColor(sessionData, defaultQty) {
  // sessionData: { morning: qty, evening: qty, night: qty } or empty
  if (!sessionData || Object.keys(sessionData).length === 0) return 'empty';
  const total = Object.values(sessionData).reduce((s, q) => s + (q || 0), 0);
  const hasZero = Object.values(sessionData).some(q => q === 0);
  if (total === 0) return 'red';
  if (hasZero && total > 0) return 'orange'; // some sessions got, some didn't
  if (total < (defaultQty || 1)) return 'orange';
  return 'green';
}

export default function CalendarPage() {
  const now = new Date();
  const [items, setItems]               = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [entries, setEntries]           = useState([]);
  const [rates, setRates]               = useState([]);
  const [advances, setAdvances]         = useState([]);
  const [holidays, setHolidays]         = useState([]);
  const [viewYear, setViewYear]         = useState(now.getFullYear());
  const [viewMonth, setViewMonth]       = useState(now.getMonth());
  const [advanceSheet, setAdvanceSheet] = useState(false);
  const [rateSheet, setRateSheet]       = useState(false);
  const [newRate, setNewRate]           = useState('');
  const [rateUnit, setRateUnit]         = useState('base');
  const [newRateDate, setNewRateDate]   = useState(new Date().toISOString().split('T')[0]);
  const [newAdvAmt, setNewAdvAmt]       = useState('');
  const [newAdvNote, setNewAdvNote]     = useState('');
  // Day detail sheet
  const [daySheet, setDaySheet]         = useState(null); // date string
  const [dayDetail, setDayDetail]       = useState([]);   // [{item, sessions: {morning: qty, evening: qty}}]
  const [editSheet, setEditSheet]       = useState(null); // {item, session, date, qty, note}
  const [editQty, setEditQty]           = useState(0);
  const [editNote, setEditNote]         = useState('');
  // Range selection
  const [rangeStart, setRangeStart]     = useState(null);
  const [rangeEnd, setRangeEnd]         = useState(null);

  const todayStr = now.toISOString().split('T')[0];

  const load = useCallback(async () => {
    const all = await db.items.toArray();
    const allItems = all.filter(i => i.isActive);
    setItems(allItems);
    if (!selectedItem && allItems.length > 0) setSelectedItem(allItems[0]);
    const hols = await db.holidays.toArray();
    setHolidays(hols);
  }, [selectedItem]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedItem) return;
    const fromDate = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-01`;
    const lastDay  = new Date(viewYear, viewMonth+1, 0).getDate();
    const toDate   = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

    db.entries.where('itemId').equals(selectedItem.id)
      .filter(e => e.date >= fromDate && e.date <= toDate)
      .toArray().then(setEntries);
    db.rates.where('itemId').equals(selectedItem.id).toArray().then(setRates);
    db.advances.toArray().then(setAdvances);
  }, [selectedItem, viewYear, viewMonth]);

  // Build entry map: date -> { session: qty }
  const entryMap = useMemo(() => {
    const map = {};
    entries.forEach(e => {
      if (!map[e.date]) map[e.date] = {};
      map[e.date][e.session] = e.qty;
    });
    return map;
  }, [entries]);

  // Build holiday set
  const holidaySet = useMemo(() => new Set(holidays.map(h => h.date)), [holidays]);

  const splitBill = calcSplitBill(entries, rates);
  const advBalance = calcAdvanceBalance(
    advances.filter(a => !a.vendorId),
    []
  );

  const monthStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}`;

  // Accurate monthly summary: sum all sessions per day, but only the latest rate
  const monthlyTotal = entries.reduce((s, e) => s + (e.qty || 0), 0);
  const activeRate   = rates.filter(r => r.effectiveFrom <= `${monthStr}-31`).pop()?.rate || 0;
  const monthlyAmount = Math.round(monthlyTotal * activeRate * 100) / 100;
  const daysWithEntry = new Set(entries.filter(e => e.qty > 0).map(e => e.date)).size;
  const avgPerDay     = daysWithEntry > 0 ? (monthlyTotal / daysWithEntry).toFixed(1) : 0;

  const addRate = async () => {
    if (!newRate || !selectedItem) return;
    let finalRate = +newRate;
    if (rateUnit === 'liter' && selectedItem.unit === 'ml') finalRate = finalRate / 1000;
    if (rateUnit === 'kg'    && selectedItem.unit === 'gram') finalRate = finalRate / 1000;
    await db.rates.add({ itemId: selectedItem.id, rate: finalRate, effectiveFrom: newRateDate });
    const r = await db.rates.where('itemId').equals(selectedItem.id).toArray();
    setRates(r);
    showToast(`Rate set: ₹${newRate} per ${rateUnit === 'base' ? selectedItem.unit : rateUnit} ✓`);
    setRateSheet(false); setNewRate('');
  };

  const addAdvance = async () => {
    if (!newAdvAmt) return;
    await db.advances.add({ amount: +newAdvAmt, date: new Date().toISOString().split('T')[0], note: newAdvNote, balance: +newAdvAmt });
    const a = await db.advances.toArray();
    setAdvances(a);
    showToast(`₹${newAdvAmt} advance जोड़ा गया`);
    setAdvanceSheet(false); setNewAdvAmt(''); setNewAdvNote('');
  };

  // Open day detail sheet
  const openDaySheet = async (dateStr) => {
    setDaySheet(dateStr);
    const detail = [];
    for (const item of items) {
      const dayEntries = await getDayEntries(item.id, dateStr);
      const sessions = {};
      dayEntries.forEach(e => { sessions[e.session] = { qty: e.qty, note: e.note, id: e.id }; });
      detail.push({ item, sessions });
    }
    setDayDetail(detail);
  };

  // Handle calendar day tap (range or detail)
  const handleDayTap = (dateStr) => {
    if (!rangeStart) {
      setRangeStart(dateStr);
      setRangeEnd(null);
      openDaySheet(dateStr);
    } else if (!rangeEnd && dateStr >= rangeStart && dateStr !== rangeStart) {
      setRangeEnd(dateStr);
      setDaySheet(null); // show range summary instead
    } else {
      setRangeStart(dateStr);
      setRangeEnd(null);
      openDaySheet(dateStr);
    }
  };

  const openEditSession = (item, session, date, existing) => {
    setEditQty(existing?.qty || 0);
    setEditNote(existing?.note || '');
    setEditSheet({ item, session, date, existingId: existing?.id });
  };

  const saveEdit = async () => {
    if (!editSheet) return;
    await upsertEntry(editSheet.item.id, editSheet.date, editQty, editNote, editSheet.session);
    showToast(`${editSheet.item.emoji} ${formatQty(editQty, editSheet.item.unit)} ✓`);
    setEditSheet(null);
    if (daySheet) await openDaySheet(daySheet);
    // reload entries for calendar
    const fromDate = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-01`;
    const lastDay  = new Date(viewYear, viewMonth+1, 0).getDate();
    const toDate   = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    db.entries.where('itemId').equals(selectedItem.id)
      .filter(e => e.date >= fromDate && e.date <= toDate)
      .toArray().then(setEntries);
  };

  // Range entries
  const rangeEntries = useMemo(() => {
    if (!rangeStart || !rangeEnd) return [];
    return entries.filter(e => e.date >= rangeStart && e.date <= rangeEnd);
  }, [rangeStart, rangeEnd, entries]);
  const rangeTotal  = rangeEntries.reduce((s, e) => s + (e.qty || 0), 0);
  const rangeDays   = new Set(rangeEntries.filter(e => e.qty > 0).map(e => e.date)).size;
  const rangeAmount = Math.round(rangeTotal * activeRate * 100) / 100;

  const days = getDaysInMonth(viewYear, viewMonth);
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">📅 कैलेंडर</div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm btn-icon" onClick={() => { setRateUnit('base'); setRateSheet(true); }} title="Rate बदलें">💰</button>
          <button className="btn btn-outline btn-sm btn-icon" onClick={() => setAdvanceSheet(true)} title="Advance">💵</button>
        </div>
      </div>

      {/* Item Selector */}
      {items.length > 1 && (
        <div className="flex gap-2 mb-4 scroll-x">
          {items.map(it => (
            <button key={it.id}
              className={`btn btn-sm ${selectedItem?.id === it.id ? 'btn-primary' : 'btn-outline'}`}
              style={{ flexShrink: 0 }}
              onClick={() => setSelectedItem(it)}>
              {it.emoji} {it.name}
            </button>
          ))}
        </div>
      )}

      {/* Month Nav */}
      <div className="flex items-center justify-between mb-3">
        <button className="btn btn-outline btn-sm btn-icon" onClick={() => {
          if (viewMonth === 0) { setViewYear(y => y-1); setViewMonth(11); } else setViewMonth(m => m-1);
          setRangeStart(null); setRangeEnd(null);
        }}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div className="font-bold">{MONTHS_HI[viewMonth]} {viewYear}</div>
          {activeRate > 0 && (
            <div className="text-xs text-muted">
              Rate: ₹{selectedItem?.unit === 'ml' ? (activeRate * 1000).toFixed(2) : activeRate} per {selectedItem?.unit === 'ml' ? 'Liter' : selectedItem?.unit}
            </div>
          )}
        </div>
        <button className="btn btn-outline btn-sm btn-icon" onClick={() => {
          if (viewMonth === 11) { setViewYear(y => y+1); setViewMonth(0); } else setViewMonth(m => m+1);
          setRangeStart(null); setRangeEnd(null);
        }}>›</button>
      </div>

      {/* Calendar */}
      <div className="card mb-3" style={{ padding: 12 }}>
        {/* Weekday headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 6 }}>
          {WEEKDAYS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, padding: '3px 0' }}>
              {d}
            </div>
          ))}
        </div>
        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
          {days.map(dateStr => {
            const sessData = entryMap[dateStr] || {};
            const color    = getDayColor(sessData, selectedItem?.defaultQty);
            const dayNum   = parseInt(dateStr.split('-')[2]);
            const isToday  = dateStr === todayStr;
            const inRange  = rangeStart && rangeEnd && dateStr >= rangeStart && dateStr <= rangeEnd;
            const isStart  = dateStr === rangeStart;
            const isHoliday = holidaySet.has(dateStr);
            const total    = Object.values(sessData).reduce((s, q) => s + (q || 0), 0);

            return (
              <div
                key={dateStr}
                onClick={() => handleDayTap(dateStr)}
                style={{
                  textAlign: 'center',
                  borderRadius: 10,
                  padding: '6px 2px',
                  cursor: 'pointer',
                  position: 'relative',
                  background: inRange || isStart
                    ? 'rgba(168,85,247,0.2)'
                    : color === 'green' ? 'rgba(34,197,94,0.12)'
                    : color === 'orange' ? 'rgba(249,115,22,0.12)'
                    : color === 'red' ? 'rgba(239,68,68,0.12)'
                    : 'rgba(255,255,255,0.03)',
                  border: isToday
                    ? '2px solid var(--clr-gold)'
                    : isStart ? '2px solid var(--clr-violet-light)'
                    : '1.5px solid rgba(255,255,255,0.06)',
                  transition: 'all 0.15s',
                  minHeight: 42,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                }}
              >
                <div style={{
                  fontSize: '0.78rem', fontWeight: isToday ? 700 : 500,
                  color: isToday ? 'var(--clr-gold)' : color === 'empty' ? 'rgba(255,255,255,0.4)' : '#f1f5f9',
                }}>
                  {dayNum}
                </div>
                {/* Session dots */}
                {Object.keys(sessData).length > 0 && (
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                    {['morning','evening','night'].map(s => {
                      const q = sessData[s];
                      if (q == null) return null;
                      return (
                        <div key={s} style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: q === 0 ? 'var(--clr-red)' : SESSION_CONFIG[s]?.color,
                          opacity: 0.9,
                        }} />
                      );
                    })}
                  </div>
                )}
                {/* Total qty tiny label */}
                {total > 0 && (
                  <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1 }}>
                    {formatQty(total, selectedItem?.unit || '')}
                  </div>
                )}
                {/* Holiday marker */}
                {isHoliday && (
                  <div style={{ position: 'absolute', top: 2, right: 3, fontSize: '0.5rem' }}>🎉</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-3 mt-3" style={{ fontSize: '0.68rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <span><span style={{ color: 'var(--clr-green)' }}>●</span> पूरा मिला</span>
          <span><span style={{ color: 'var(--clr-orange)' }}>●</span> आधा मिला</span>
          <span><span style={{ color: 'var(--clr-red)' }}>●</span> नहीं मिला</span>
          <span>🎉 छुट्टी</span>
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>• tap = detail, 2 tap = range</span>
        </div>
      </div>

      {/* Range Summary */}
      {rangeStart && rangeEnd && (
        <div className="card card-gradient mb-4">
          <div className="section-title">📊 चुनी हुई अवधि</div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted">{rangeStart} → {rangeEnd}</span>
            <span className="badge badge-violet">{rangeDays} दिन</span>
          </div>
          <div className="flex justify-between mt-3">
            <div>
              <div className="stat-value text-gold" style={{ fontSize: '1.4rem' }}>{formatQty(rangeTotal, selectedItem?.unit || '')}</div>
              <div className="stat-label">कुल मात्रा</div>
            </div>
            {activeRate > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div className="stat-value text-green" style={{ fontSize: '1.4rem' }}>{formatRupees(rangeAmount)}</div>
                <div className="stat-label">
                  कुल राशि (₹{selectedItem?.unit === 'ml' ? (activeRate * 1000).toFixed(2) + '/L' : activeRate + '/' + selectedItem?.unit})
                </div>
              </div>
            )}
          </div>
          <button className="btn btn-outline btn-sm btn-block mt-3"
            onClick={() => { setRangeStart(null); setRangeEnd(null); }}>
            ✕ Range Clear करें
          </button>
        </div>
      )}
      {rangeStart && !rangeEnd && (
        <div className="card mt-0 mb-3" style={{ textAlign: 'center', padding: '10px 14px' }}>
          <span className="text-sm text-muted">अब End Date चुनें (📅 {rangeStart} से)</span>
        </div>
      )}

      {/* Monthly Summary — Advanced */}
      <div className="section-title">महीने की Summary</div>
      <div className="grid-2 gap-3 mb-4">
        <StatCard label="कुल मात्रा" value={formatQty(monthlyTotal, selectedItem?.unit || '')} icon="📦" />
        <StatCard label="रोज औसत"   value={`${avgPerDay} ${selectedItem?.unit || ''}`}         icon="📈" />
        {monthlyAmount > 0 && <StatCard label="कुल राशि"  value={formatRupees(monthlyAmount)} icon="💰" color="card-gold" />}
        {daysWithEntry > 0 && <StatCard label="Entry Days" value={`${daysWithEntry} दिन`}      icon="📅" />}
      </div>

      {/* Rate-Change Split Billing */}
      {splitBill.splits.length > 0 && (
        <div className="card mb-4">
          <div className="section-title">💳 Rate-Split Bill</div>
          {splitBill.splits.map((sp, i) => (
            <div key={i} className="split-row">
              <div>
                <div className="text-xs text-muted">{sp.from} → {sp.to}</div>
                <div className="text-sm">{formatQty(sp.qty, selectedItem?.unit || '')} × ₹{sp.rate}/{selectedItem?.unit}</div>
              </div>
              <div className="font-bold text-gold">{formatRupees(sp.amount)}</div>
            </div>
          ))}
          <div className="split-total">कुल: {formatRupees(splitBill.total)}</div>
        </div>
      )}

      {/* Advance Tracker */}
      <div className="card mb-4">
        <div className="flex justify-between items-center mb-3">
          <div className="section-title" style={{ marginBottom: 0 }}>💵 Advance Tracker</div>
          <button className="btn btn-primary btn-sm" onClick={() => setAdvanceSheet(true)}>+ Add</button>
        </div>
        {advBalance.transactions.length === 0 ? (
          <div className="text-muted text-sm">कोई advance नहीं</div>
        ) : (
          <>
            {advBalance.transactions.slice(-5).map((tx, i) => (
              <div key={i} className="split-row">
                <div>
                  <div className="text-sm font-semi">{tx.desc}</div>
                  <div className="text-xs text-muted">{tx.date}</div>
                </div>
                <div>
                  <div className={tx.amount > 0 ? 'text-green text-sm' : 'text-red text-sm'}>
                    {tx.amount > 0 ? '+' : ''}{formatRupees(tx.amount)}
                  </div>
                  <div className="text-xs text-muted">Bal: {formatRupees(tx.balance)}</div>
                </div>
              </div>
            ))}
            <div className={`split-total ${advBalance.balance < 0 ? 'text-red' : 'text-green'}`}>
              Balance: {formatRupees(Math.abs(advBalance.balance))} {advBalance.balance < 0 ? '(Due)' : '(Credit)'}
            </div>
          </>
        )}
      </div>

      {/* Rate Sheet */}
      <Sheet open={rateSheet} onClose={() => setRateSheet(false)} title="💰 Rate Set करें">
        <div className="input-group">
          <label className="input-label">Rate Unit</label>
          <div className="flex gap-2 mb-2">
            <button className={`btn btn-sm flex-1 ${rateUnit === 'base' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setRateUnit('base')}>
              Per {selectedItem?.unit}
            </button>
            {(selectedItem?.unit === 'ml' || selectedItem?.unit === 'gram') && (
              <button className={`btn btn-sm flex-1 ${rateUnit !== 'base' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setRateUnit(selectedItem.unit === 'ml' ? 'liter' : 'kg')}>
                Per {selectedItem.unit === 'ml' ? 'Liter' : 'Kg'}
              </button>
            )}
          </div>
          <input className="input" type="number" value={newRate} onChange={e => setNewRate(e.target.value)}
            placeholder={`जैसे: ${rateUnit === 'base' ? '0.06' : '60'} (₹${rateUnit === 'base' ? '0.06' : '60'} per ${rateUnit === 'base' ? selectedItem?.unit : rateUnit})`} />
          {newRate && (
            <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--clr-teal)' }}>
              ℹ️ {selectedItem?.unit === 'ml' && rateUnit !== 'base'
                ? `1L = ₹${newRate} → per ml = ₹${(+newRate/1000).toFixed(4)}`
                : `per ${rateUnit} = ₹${newRate}`}
            </div>
          )}
        </div>
        <div className="input-group">
          <label className="input-label">किस तारीख से?</label>
          <input className="input" type="date" value={newRateDate} onChange={e => setNewRateDate(e.target.value)} />
        </div>
        {rates.length > 0 && (
          <div className="card mb-3" style={{ padding: 12 }}>
            <div className="text-xs text-muted mb-2">Rate History</div>
            {rates.map((r, i) => (
              <div key={i} className="split-row">
                <span className="text-sm">{r.effectiveFrom} से</span>
                <span className="font-bold text-gold">
                  ₹{selectedItem?.unit === 'ml' ? (r.rate * 1000).toFixed(2) + '/L' : r.rate + '/' + selectedItem?.unit}
                </span>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-primary btn-block" onClick={addRate}>✓ Rate Set करें</button>
      </Sheet>

      {/* Advance Sheet */}
      <Sheet open={advanceSheet} onClose={() => setAdvanceSheet(false)} title="💵 Advance जोड़ें">
        <div className="input-group">
          <label className="input-label">Amount (₹)</label>
          <input className="input" type="number" value={newAdvAmt} onChange={e => setNewAdvAmt(e.target.value)} placeholder="जैसे: 500" />
        </div>
        <div className="input-group">
          <label className="input-label">Note (optional)</label>
          <input className="input" type="text" value={newAdvNote} onChange={e => setNewAdvNote(e.target.value)} placeholder="जैसे: July advance" />
        </div>
        <button className="btn btn-primary btn-block" onClick={addAdvance}>✓ Advance Add करें</button>
      </Sheet>

      {/* Day Detail Sheet */}
      <Sheet open={!!daySheet} onClose={() => setDaySheet(null)} title={`📅 ${daySheet} का हिसाब`}>
        {dayDetail.length === 0 && <div className="text-muted text-sm text-center">कोई entry नहीं</div>}
        {dayDetail.map(({ item, sessions: sessData }) => {
          const itemSessions = getSessions(item);
          const total = Object.values(sessData).reduce((s, d) => s + (d?.qty || 0), 0);
          return (
            <div key={item.id} className="card mb-3" style={{ padding: 12 }}>
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold">{item.emoji} {item.name}</span>
                <span className="font-bold text-gold">{total > 0 ? formatQty(total, item.unit) : '—'}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {itemSessions.map(sess => {
                  const d = sessData[sess];
                  return (
                    <div key={sess} className="flex justify-between items-center"
                      style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '6px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{SESSION_CONFIG[sess]?.icon}</span>
                        <span className="text-sm">{SESSION_CONFIG[sess]?.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {d ? (
                          <span className={`badge ${d.qty === 0 ? 'badge-red' : 'badge-green'}`}>
                            {d.qty === 0 ? 'नहीं मिला' : formatQty(d.qty, item.unit)}
                          </span>
                        ) : (
                          <span className="badge" style={{ opacity: 0.4 }}>—</span>
                        )}
                        <button className="btn-icon-xs"
                          onClick={() => openEditSession(item, sess, daySheet, d)}
                          style={{ border: '1px solid rgba(255,255,255,0.15)' }}>✏️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Sheet>

      {/* Edit Session Entry Sheet */}
      <Sheet open={!!editSheet} onClose={() => setEditSheet(null)}
        title={`✏️ ${editSheet?.item?.emoji} ${editSheet?.item?.name} — ${SESSION_CONFIG[editSheet?.session]?.label}`}>
        {editSheet && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
            <div className="text-sm text-muted text-center">
              📅 {editSheet.date} • {SESSION_CONFIG[editSheet.session]?.icon} {SESSION_CONFIG[editSheet.session]?.label}
            </div>
            <div className="input-group">
              <label className="input-label">मात्रा ({editSheet.item.unit})</label>
              <input className="input" type="number"
                value={editQty}
                onChange={e => setEditQty(+e.target.value)}
                step={editSheet.item.unit === 'ml' || editSheet.item.unit === 'gram' ? 50 : 0.5}
                min={0}
                style={{ fontSize: '1.3rem', fontWeight: 700, textAlign: 'center' }} />
              {editQty > 0 && (
                <div className="text-center text-gold font-bold mt-1">{formatQty(editQty, editSheet.item.unit)}</div>
              )}
            </div>
            <div className="preset-row" style={{ justifyContent: 'center' }}>
              {(editSheet.item.presets ? JSON.parse(editSheet.item.presets) : []).map(p => (
                <button key={p} className={`preset-btn ${editQty === p ? 'preset-btn-active' : ''}`}
                  onClick={() => setEditQty(p)}>
                  {formatQty(p, editSheet.item.unit)}
                </button>
              ))}
              <button className="preset-btn" style={{ color: 'var(--clr-red)' }} onClick={() => setEditQty(0)}>
                ✗ 0
              </button>
            </div>
            <div className="input-group">
              <label className="input-label">Note (optional)</label>
              <input className="input" type="text" value={editNote} onChange={e => setEditNote(e.target.value)}
                placeholder="जैसे: देर से आया..." />
            </div>
            <button className="btn btn-primary btn-block" onClick={saveEdit}>✓ Save करें</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
