import { useState, useEffect, useCallback } from 'react';
import db, { getEntriesRange, formatQty } from '../db/db';
import { calcSplitBill, calcAdvanceBalance, calcBill, formatRupees, formatDate, monthlySummary, getDaysInMonth } from '../utils/formulas';
import { showToast, Sheet, StatCard } from '../components/UI';
import CalendarView from '../components/CalendarView';

const MONTHS_HI = ['जनवरी','फरवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितंबर','अक्टूबर','नवंबर','दिसंबर'];

export default function CalendarPage() {
  const now = new Date();
  const [items, setItems]           = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [entries, setEntries]       = useState([]);
  const [rates, setRates]           = useState([]);
  const [advances, setAdvances]     = useState([]);
  const [bills, setBills]           = useState([]);
  const [viewYear, setViewYear]     = useState(now.getFullYear());
  const [viewMonth, setViewMonth]   = useState(now.getMonth());
  const [advanceSheet, setAdvanceSheet] = useState(false);
  const [rateSheet, setRateSheet]   = useState(false);
  const [newRate, setNewRate]       = useState('');
  const [newRateDate, setNewRateDate] = useState(new Date().toISOString().split('T')[0]);
  const [newAdvAmt, setNewAdvAmt]   = useState('');
  const [newAdvNote, setNewAdvNote] = useState('');

  const load = useCallback(async () => {
    const allItems = await db.items.where('isActive').equals(1).toArray();
    setItems(allItems);
    if (!selectedItem && allItems.length > 0) setSelectedItem(allItems[0]);
  }, [selectedItem]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedItem) return;
    const fromDate = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-01`;
    const lastDay  = new Date(viewYear, viewMonth+1, 0).getDate();
    const toDate   = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

    db.entries.where('itemId').equals(selectedItem.id).filter(e => e.date >= fromDate && e.date <= toDate).toArray()
      .then(setEntries);
    db.rates.where('itemId').equals(selectedItem.id).toArray().then(setRates);
    db.advances.toArray().then(setAdvances);
  }, [selectedItem, viewYear, viewMonth]);

  const splitBill = calcSplitBill(entries, rates);
  const advBalance = calcAdvanceBalance(
    advances.filter(a => !a.vendorId),
    bills.map(b => ({ date: b.date, amount: b.amount }))
  );

  const monthStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}`;
  const summary  = monthlySummary(entries, rates[rates.length-1]?.rate || 0);

  const addRate = async () => {
    if (!newRate || !selectedItem) return;
    await db.rates.add({ itemId: selectedItem.id, rate: +newRate, effectiveFrom: newRateDate });
    const r = await db.rates.where('itemId').equals(selectedItem.id).toArray();
    setRates(r);
    showToast(`₹${newRate}/unit rate set from ${newRateDate}`);
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

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">📅 कैलेंडर</div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm btn-icon" onClick={() => setRateSheet(true)} title="Rate बदलें">💰</button>
          <button className="btn btn-outline btn-sm btn-icon" onClick={() => setAdvanceSheet(true)} title="Advance">💵</button>
        </div>
      </div>

      {/* Item Selector */}
      {items.length > 1 && (
        <div className="flex gap-2 mb-4 scroll-x">
          {items.map(it => (
            <button
              key={it.id}
              className={`btn btn-sm ${selectedItem?.id === it.id ? 'btn-primary' : 'btn-outline'}`}
              style={{ flexShrink: 0 }}
              onClick={() => setSelectedItem(it)}
            >
              {it.emoji} {it.name}
            </button>
          ))}
        </div>
      )}

      {/* Month Nav */}
      <div className="flex items-center justify-between mb-3">
        <button className="btn btn-outline btn-sm btn-icon" onClick={() => {
          if (viewMonth === 0) { setViewYear(y=>y-1); setViewMonth(11); } else setViewMonth(m=>m-1);
        }}>‹</button>
        <span className="font-bold">{MONTHS_HI[viewMonth]} {viewYear}</span>
        <button className="btn btn-outline btn-sm btn-icon" onClick={() => {
          if (viewMonth === 11) { setViewYear(y=>y+1); setViewMonth(0); } else setViewMonth(m=>m+1);
        }}>›</button>
      </div>

      {/* Calendar */}
      <div className="card mb-4">
        <CalendarView
          entries={entries}
          defaultQty={selectedItem?.defaultQty}
          rate={rates[rates.length-1]?.rate || 0}
        />
      </div>

      {/* Monthly Summary */}
      <div className="section-title">महीने की Summary</div>
      <div className="grid-2 gap-3 mb-4">
        <StatCard label="कुल मात्रा" value={`${summary.total} ${selectedItem?.unit || ''}`} icon="📦" />
        <StatCard label="रोज औसत"   value={`${summary.avg} ${selectedItem?.unit || ''}`}   icon="📈" />
        {summary.amount > 0 && <StatCard label="कुल राशि" value={formatRupees(summary.amount)} icon="💰" color="card-gold" />}
        {summary.days > 0   && <StatCard label="Entry Days" value={summary.days}              icon="📅" />}
      </div>

      {/* Rate-Change Split Billing */}
      {splitBill.splits.length > 0 && (
        <div className="card mb-4">
          <div className="section-title">💳 Rate-Split Bill</div>
          {splitBill.splits.map((sp, i) => (
            <div key={i} className="split-row">
              <div>
                <div className="text-xs text-muted">{sp.from} → {sp.to}</div>
                <div className="text-sm">{sp.qty} × ₹{sp.rate}</div>
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
          <div className="section-title" style={{marginBottom:0}}>💵 Advance Tracker</div>
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
      <Sheet open={rateSheet} onClose={() => setRateSheet(false)} title="💰 Rate बदलें">
        <div className="input-group">
          <label className="input-label">नया Rate (₹ per {selectedItem?.unit})</label>
          <input className="input" type="number" value={newRate} onChange={e => setNewRate(e.target.value)} placeholder="जैसे: 62" />
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
                <span className="font-bold text-gold">₹{r.rate}</span>
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
    </div>
  );
}
