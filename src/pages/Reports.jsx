import { useState, useEffect, useCallback } from 'react';
import db from '../db/db';
import { monthlySummary, getDaysInMonth, sumRange, formatRupees, formatDate } from '../utils/formulas';
import { exportToPDF, exportToExcel, nativeShare, generateBillText } from '../utils/export';
import { showToast, StatCard } from '../components/UI';
import { MonthCompareChart, DailyTrendChart, CategoryChart } from '../components/Charts';

const MONTHS_HI = ['जनवरी','फरवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितंबर','अक्टूबर','नवंबर','दिसंबर'];

export default function Reports() {
  const now = new Date();
  const [items, setItems]   = useState([]);
  const [selItem, setSelItem] = useState(null);
  const [year, setYear]     = useState(now.getFullYear());
  const [month, setMonth]   = useState(now.getMonth());
  const [thisMonthE, setThisMonthE]  = useState([]);
  const [lastMonthE, setLastMonthE]  = useState([]);
  const [rates, setRates]   = useState([]);
  const [allGrocery, setAllGrocery] = useState([]);
  const [chartTab, setChartTab] = useState('compare');

  const load = useCallback(async () => {
    const its = await db.items.where('isActive').equals(1).toArray();
    setItems(its);
    if (!selItem && its.length > 0) setSelItem(its[0]);
    const g = await db.grocery.toArray();
    setAllGrocery(g);
  }, [selItem]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selItem) return;
    const thisFrom = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const thisTo   = `${year}-${String(month+1).padStart(2,'0')}-${String(new Date(year,month+1,0).getDate()).padStart(2,'0')}`;
    const prevM = month === 0 ? 11 : month - 1;
    const prevY = month === 0 ? year - 1 : year;
    const prevFrom = `${prevY}-${String(prevM+1).padStart(2,'0')}-01`;
    const prevTo   = `${prevY}-${String(prevM+1).padStart(2,'0')}-${String(new Date(prevY,prevM+1,0).getDate()).padStart(2,'0')}`;

    db.entries.where('itemId').equals(selItem.id).filter(e => e.date >= thisFrom && e.date <= thisTo).toArray().then(setThisMonthE);
    db.entries.where('itemId').equals(selItem.id).filter(e => e.date >= prevFrom && e.date <= prevTo).toArray().then(setLastMonthE);
    db.rates.where('itemId').equals(selItem.id).toArray().then(setRates);
  }, [selItem, year, month]);

  const currentRate = rates.filter(r => r.effectiveFrom <= `${year}-${String(month+1).padStart(2,'0')}-31`).pop()?.rate || 0;
  const thisSum = monthlySummary(thisMonthE, currentRate);
  const lastSum = monthlySummary(lastMonthE, currentRate);
  const diff    = thisSum.total - lastSum.total;

  // Daily trend data
  const days = getDaysInMonth(year, month);
  const entryMapThis = {};
  thisMonthE.forEach(e => { entryMapThis[e.date] = e.qty; });
  const trendData   = days.map(d => entryMapThis[d] ?? 0);
  const trendLabels = days.map(d => d.split('-')[2]);

  // Compare chart: weeks
  const weeksThis = [0,0,0,0]; const weeksLast = [0,0,0,0];
  thisMonthE.forEach(e => { const d = parseInt(e.date.split('-')[2]); weeksThis[Math.min(3,Math.floor((d-1)/7))] += e.qty||0; });
  lastMonthE.forEach(e => { const d = parseInt(e.date.split('-')[2]); weeksLast[Math.min(3,Math.floor((d-1)/7))] += e.qty||0; });

  // Category breakdown for grocery
  const catMap = {};
  allGrocery.forEach(g => { catMap[g.category] = (catMap[g.category]||0) + (g.price||0); });

  const handlePDF = async () => {
    const rows = thisMonthE.map(e => ({
      'तारीख': formatDate(e.date), 'मात्रा': `${e.qty} ${selItem?.unit}`,
      'Rate': formatRupees(currentRate), 'Amount': formatRupees((e.qty||0)*currentRate)
    }));
    await exportToPDF(`${selItem?.name} — ${MONTHS_HI[month]} ${year}`, rows,
      `कुल: ${thisSum.total} ${selItem?.unit} | राशि: ${formatRupees(thisSum.amount)}`);
    showToast('PDF save हो गई ✓');
  };

  const handleExcel = async () => {
    const rows = thisMonthE.map(e => ({
      'Date': e.date, 'Qty': e.qty, 'Unit': selItem?.unit,
      'Rate': currentRate, 'Amount': (e.qty||0)*currentRate
    }));
    await exportToExcel(`${selItem?.name}_${MONTHS_HI[month]}`, rows);
    showToast('Excel save हो गई ✓');
  };

  const handleShare = async () => {
    const text = generateBillText({
      vendorName: selItem?.name || '',
      month: `${MONTHS_HI[month]} ${year}`,
      entries: thisMonthE.map(e=>({date:formatDate(e.date),qty:e.qty})),
      rate: currentRate,
      total: thisSum.amount,
    });
    const result = await nativeShare(text);
    if (result === 'clipboard') showToast('Copy हो गई — Paste करें WhatsApp पर', 'info');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">📊 रिपोर्ट</div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm btn-icon" onClick={handleShare} title="Share">📤</button>
          <button className="btn btn-outline btn-sm btn-icon" onClick={handlePDF} title="PDF">📄</button>
          <button className="btn btn-outline btn-sm btn-icon" onClick={handleExcel} title="Excel">📊</button>
        </div>
      </div>

      {/* Item + Month Selector */}
      {items.length > 1 && (
        <div className="flex gap-2 mb-3 scroll-x">
          {items.map(it => (
            <button key={it.id} style={{flexShrink:0}}
              className={`btn btn-sm ${selItem?.id===it.id?'btn-primary':'btn-outline'}`}
              onClick={() => setSelItem(it)}
            >{it.emoji} {it.name}</button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <button className="btn btn-outline btn-sm btn-icon" onClick={() => {
          if (month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1);
        }}>‹</button>
        <span className="font-bold">{MONTHS_HI[month]} {year}</span>
        <button className="btn btn-outline btn-sm btn-icon" onClick={() => {
          if (month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1);
        }}>›</button>
      </div>

      {/* Summary Stats */}
      <div className="grid-2 gap-3 mb-4">
        <StatCard label="कुल मात्रा" value={`${thisSum.total} ${selItem?.unit||''}`} icon="📦" />
        <StatCard label="रोज औसत"   value={`${thisSum.avg} ${selItem?.unit||''}`}   icon="📈" />
        {currentRate > 0 && <>
          <StatCard label="कुल राशि"  value={formatRupees(thisSum.amount)} icon="💰" color="card-gold" />
          <div className={`stat-card ${diff > 0 ? 'card-red' : diff < 0 ? 'card-green' : ''}`}>
            <div className={`stat-value ${diff > 0?'text-orange':diff<0?'text-green':''}`}>
              {diff > 0 ? `+${diff}` : diff} {selItem?.unit}
            </div>
            <div className="stat-label">पिछले महीने से {diff > 0 ? 'ज़्यादा' : 'कम'}</div>
          </div>
        </>}
      </div>

      {/* Chart Tab Selector */}
      <div className="flex gap-2 mb-3">
        {[['compare','📊 तुलना'],['trend','📈 Trend'],['grocery','🛒 Category']].map(([t,l]) => (
          <button key={t} className={`btn btn-sm ${chartTab===t?'btn-primary':'btn-outline'}`} onClick={()=>setChartTab(t)}>{l}</button>
        ))}
      </div>

      <div className="card mb-4">
        {chartTab === 'compare' && (
          <MonthCompareChart
            thisMonthData={weeksThis}
            lastMonthData={weeksLast}
            labels={['Week 1','Week 2','Week 3','Week 4']}
          />
        )}
        {chartTab === 'trend' && (
          <DailyTrendChart data={trendData} labels={trendLabels} />
        )}
        {chartTab === 'grocery' && (
          <CategoryChart labels={Object.keys(catMap)} values={Object.values(catMap)} />
        )}
      </div>

      {/* Entry List */}
      <div className="section-title">📋 Entries — {MONTHS_HI[month]}</div>
      {thisMonthE.length === 0 ? (
        <div className="text-muted text-sm">इस महीने कोई entry नहीं</div>
      ) : (
        thisMonthE.sort((a,b)=>b.date.localeCompare(a.date)).map(e => (
          <div key={e.id} className="split-row">
            <span className="text-sm">{formatDate(e.date)}</span>
            <span className="font-bold">{e.qty} {selItem?.unit}</span>
            {currentRate > 0 && <span className="text-gold text-sm">{formatRupees((e.qty||0)*currentRate)}</span>}
          </div>
        ))
      )}
    </div>
  );
}
