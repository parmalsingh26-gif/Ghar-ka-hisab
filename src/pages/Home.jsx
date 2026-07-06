import { useState, useEffect, useCallback } from 'react';
import db, {
  todayStr, upsertEntry, getSetting, setSetting,
  getDayEntries, getDayTotal, formatQty, getSessions
} from '../db/db';
import { calcStreak, formatRupees, getDaysInMonth, sumRange } from '../utils/formulas';
import { showToast, StreakBadge, Sheet, StatCard } from '../components/UI';
import QuickGrid from '../components/QuickGrid';

const SESSION_CONFIG = {
  morning: { label: 'सुबह',  icon: '🌅', color: 'var(--clr-gold)' },
  evening: { label: 'शाम',   icon: '🌆', color: 'var(--clr-violet-light)' },
  night:   { label: 'रात',   icon: '🌙', color: 'var(--clr-teal)' },
};
const ALL_SESSIONS = ['morning', 'evening', 'night'];

export default function Home() {
  const [items,         setItems]         = useState([]);
  const [session,       setSession]       = useState('morning');
  const [streak,        setStreak]        = useState(0);
  const [vacation,      setVacation]      = useState(false);
  const [vacMsg,        setVacMsg]        = useState('');
  const [loadingAll,    setLoadingAll]    = useState(false);
  const [runningTotal,  setRunningTotal]  = useState({});  // { itemId: { total, rate, amount } }
  const [monthlyData,   setMonthlyData]   = useState([]); // { name, emoji, unit, morning, evening, total }
  const [budgets,       setBudgets]       = useState([]);  // budget warnings
  const [holidays,      setHolidays]      = useState([]); // today's holidays
  const [bulkSheet,     setBulkSheet]     = useState(false);
  const [bulkItem,      setBulkItem]      = useState(null);
  const [bulkRows,      setBulkRows]      = useState([]);  // [{ date, qty, note }]
  const [holidaySheet,  setHolidaySheet]  = useState(false);
  const [holidayForm,   setHolidayForm]   = useState({ date: todayStr(), name: '', autoZero: true });
  const [todaySummary,  setTodaySummary]  = useState([]); // per-item today status
  const [subsAlert,     setSubsAlert]     = useState([]); // subscriptions due today/soon
  const [activeDate,    setActiveDate]    = useState(todayStr());
  const today = todayStr();

  const load = useCallback(async () => {
    const allItems = await db.items.toArray();
    setItems(allItems);

    // Detect active session based on time
    const h = new Date().getHours();
    if (h >= 5  && h < 11) setSession('morning');
    else if (h >= 11 && h < 18) setSession('evening');
    else setSession('night');

    // Streak
    const allEntries = await db.entries.filter(e => e.qty > 0).toArray();
    const uniqueDates = [...new Set(allEntries.map(e => e.date))].map(d => ({ date: d, qty: 1 }));
    setStreak(calcStreak(uniqueDates));

    // Vacation
    const vac = await getSetting('vacationMode');
    const vf  = await getSetting('vacationFrom');
    const vt  = await getSetting('vacationTo');
    setVacation(!!vac);
    if (vac && vf && vt) {
      setVacMsg(`बाहर गए हैं: ${vf} से ${vt} तक`);
    }

    // Today's holiday check (for the selected activeDate)
    const todayHolidays = await db.holidays.where('date').equals(activeDate).toArray();
    setHolidays(todayHolidays);

    // Running total (this month) for first active item
    const activeItems = allItems.filter(it => it.isActive);
    const monthStr = today.slice(0, 7);
    const rtMap = {};
    for (const item of activeItems) {
      const entries = await db.entries
        .where('itemId').equals(item.id)
        .filter(e => e.date.startsWith(monthStr))
        .toArray();
      const total = entries.reduce((s, e) => s + (e.qty || 0), 0);
      const rateRows = await db.rates.where('itemId').equals(item.id).toArray();
      const rate = rateRows.filter(r => r.effectiveFrom <= today).pop()?.rate || 0;
      rtMap[item.id] = { total, rate, amount: total * rate, unit: item.unit, name: item.name, emoji: item.emoji };
    }
    setRunningTotal(rtMap);

    // Monthly Summary (Month-to-Date) for active month
    const mData = [];
    const activeMonthStr = activeDate.slice(0, 7); // e.g. "2026-07"
    for (const item of activeItems) {
      const entries = await db.entries.where('itemId').equals(item.id)
        .filter(e => e.date.startsWith(activeMonthStr)).toArray();
      let morning = 0, evening = 0, total = 0;
      entries.forEach(e => {
        const q = e.qty || 0;
        total += q;
        if (e.session === 'morning') morning += q;
        if (e.session === 'evening') evening += q;
      });
      if (total > 0) {
        mData.push({ morning, evening, total, unit: item.unit, name: item.name, emoji: item.emoji });
      }
    }
    setMonthlyData(mData);

    // Budget warnings
    const allBudgets = await db.budgets.filter(b => b.month === monthStr).toArray();
    const warnings = [];
    for (const bud of allBudgets) {
      const it = allItems.find(i => i.id === bud.itemId);
      if (!it) continue;
      const entries = await db.entries.where('itemId').equals(bud.itemId).filter(e => e.date.startsWith(monthStr)).toArray();
      const spent   = entries.reduce((s,e)=>s+(e.qty||0),0);
      const pct     = bud.limitQty > 0 ? Math.round((spent / bud.limitQty) * 100) : 0;
      if (pct >= 80) warnings.push({ item: it, spent, limit: bud.limitQty, pct });
    }
    setBudgets(warnings);

    // Today summary (per item)
    const summary = [];
    for (const item of activeItems) {
      const dayTotal = await getDayTotal(item.id, activeDate);
      const sessions = getSessions(item);
      const dayEntries = await getDayEntries(item.id, activeDate);
      const sessEntries = {};
      dayEntries.forEach(e => { sessEntries[e.session] = e.qty; });
      summary.push({ item, dayTotal, sessions, sessEntries });
    }
    setTodaySummary(summary);

    // Subscriptions due soon
    const allSubs = await db.subscriptions.where('isActive').equals(1).toArray();
    const todayD = new Date();
    const dueAlerts = allSubs.filter(s => {
      const daysUntil = s.billingDay - todayD.getDate();
      return daysUntil >= 0 && daysUntil <= 3;
    });
    setSubsAlert(dueAlerts);
  }, [activeDate]);

  useEffect(() => { load(); }, [load, activeDate]);

  // Open bulk past-entry sheet for an item
  const openBulkEntry = async (item) => {
    const rows = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(activeDate + 'T00:00:00'); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const entryList = await db.entries.where('itemId').equals(item.id).filter(e => e.date === dateStr && e.session === session).toArray();
      const entry = entryList[0];
      rows.push({ date: dateStr, qty: entry?.qty != null ? entry.qty : '', note: entry?.note || '' });
    }
    setBulkRows(rows);
    setBulkItem(item);
    setBulkSheet(true);
  };

  const saveBulkEntries = async () => {
    let saved = 0;
    for (const row of bulkRows) {
      if (row.qty !== '' && row.qty !== null) {
        await upsertEntry(bulkItem.id, row.date, +row.qty, row.note || '', session);
        saved++;
      }
    }
    showToast(`✓ ${saved} entries save हो गईं`);
    setBulkSheet(false);
    load();
  };

  const handleAllNormal = async () => {
    setLoadingAll(true);
    try {
      const activeItems = items.filter(it => it.isActive && getSessions(it).includes(session));
      for (const item of activeItems) {
        const presets = item.presets ? JSON.parse(item.presets) : [];
        const qty = presets[0] || item.defaultQty || 1;
        await upsertEntry(item.id, today, qty, 'सब नॉर्मल', session);
      }
      await load();
      showToast(`✅ ${SESSION_CONFIG[session].icon} ${SESSION_CONFIG[session].label} — सब नॉर्मल!`);
    } catch { showToast('कुछ entries save नहीं हुईं', 'error'); }
    finally { setLoadingAll(false); }
  };

  const addHoliday = async () => {
    await db.holidays.add({ ...holidayForm });
    if (holidayForm.autoZero) {
      const activeItems = items.filter(it => it.isActive);
      for (const item of activeItems) {
        for (const sess of ALL_SESSIONS) {
          await upsertEntry(item.id, holidayForm.date, 0, `🎉 ${holidayForm.name}`, sess);
        }
      }
    }
    showToast(`🎉 ${holidayForm.name} mark हो गया`);
    setHolidaySheet(false);
    load();
  };

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'सुप्रभात 🌅' : hour < 17 ? 'नमस्ते ☀️' : 'शुभ संध्या 🌙';

  const totalMonthAmount = Object.values(runningTotal).reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div className="page">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="page-title" style={{marginBottom:0}}>🏠 घर का हिसाब</div>
          <div className="flex items-center gap-2 mt-1">
            <input type="date" className="input text-xs" style={{padding:'4px 8px', width:'auto', background:'rgba(255,255,255,0.05)'}} 
              value={activeDate} onChange={(e) => setActiveDate(e.target.value)} max={todayStr()} />
            <span className="text-xs text-muted"> • 🔥 {streak}</span>
          </div>
        </div>
        <StreakBadge streak={streak} />
      </div>

      {/* Today's Holiday Banner */}
      {holidays.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {holidays.map(h => (
            <div key={h.id} className="holiday-badge" style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', borderRadius: 12, marginBottom: 8 }}>
              🎉 आज {h.name} है — entries 0 mark की गई हैं
            </div>
          ))}
        </div>
      )}

      {/* Vacation Banner */}
      {vacation && (
        <div className="vacation-banner">
          <span style={{ fontSize: '1.6rem' }}>✈️</span>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--clr-teal)' }}>छुट्टी मोड ON</div>
            <div className="text-xs text-muted">{vacMsg}</div>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }}
              onClick={async () => { await navigator.clipboard.writeText(vacMsg).catch(()=>{}); showToast('Copy हो गया!', 'info'); }}>
              📋 Message Copy
            </button>
          </div>
        </div>
      )}

      {/* Subscription Alert */}
      {subsAlert.length > 0 && (
        <div className="card card-gold mb-3" style={{ padding: 12 }}>
          <div className="text-xs font-bold text-gold mb-2">💳 Bill Due Soon</div>
          {subsAlert.map(s => (
            <div key={s.id} className="flex justify-between text-sm">
              <span>{s.emoji} {s.name}</span>
              <span className="font-bold text-orange">{formatRupees(s.amount)} — {s.billingDay} तारीख</span>
            </div>
          ))}
        </div>
      )}

      {/* Running Total Banner */}
      {totalMonthAmount > 0 && (
        <div className="running-total-banner">
          <div>
            <div className="running-total-label">📊 इस महीने का कुल खर्च</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(241,245,249,0.4)' }}>
              {Object.values(runningTotal).filter(r=>r.total>0).map(r=>`${r.emoji} ${formatQty(r.total, r.unit)}`).join('  •  ')}
            </div>
          </div>
          <div className="running-total-amount">{formatRupees(totalMonthAmount)}</div>
        </div>
      )}

      {/* Budget Warnings */}
      {budgets.map(b => (
        <div key={b.item.id} className="card card-red mb-3" style={{ padding: 12 }}>
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold">{b.item.emoji} {b.item.name} Budget {b.pct}% used!</span>
            <span className="badge badge-red">{formatQty(b.spent, b.item.unit)} / {formatQty(b.limit, b.item.unit)}</span>
          </div>
          <div className="progress-bar" style={{ marginTop: 6 }}>
            <div className="progress-fill red" style={{ width: `${Math.min(100, b.pct)}%` }} />
          </div>
        </div>
      ))}

      {/* Monthly Session Summary */}
      {Array.isArray(monthlyData) && monthlyData.length > 0 && (
        <div className="weekly-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
          {monthlyData.map((data, idx) => (
            <div key={idx} style={{ borderBottom: idx !== monthlyData.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', paddingBottom: idx !== monthlyData.length - 1 ? '12px' : 0 }}>
              <div className="text-xs text-muted mb-2 font-bold">📈 {data.emoji} {data.name} — इस महीने का हिसाब ({activeDate.slice(0,7)})</div>
              <div className="weekly-compare" style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'center', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div className="weekly-col-label">{SESSION_CONFIG['morning'].icon} सुबह</div>
                  <div className="weekly-col-value text-gold">{formatQty(data.morning, data.unit)}</div>
                </div>
                <div className="weekly-vs" style={{ margin: '0 8px' }}>+</div>
                <div style={{ flex: 1 }}>
                  <div className="weekly-col-label">{SESSION_CONFIG['evening'].icon} शाम</div>
                  <div className="weekly-col-value text-violet">{formatQty(data.evening, data.unit)}</div>
                </div>
                <div className="weekly-vs" style={{ margin: '0 8px' }}>=</div>
                <div style={{ flex: 1 }}>
                  <div className="weekly-col-label">कुल</div>
                  <div className="weekly-col-value text-green">{formatQty(data.total, data.unit)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Session Tabs */}
      <div className="session-tabs">
        {ALL_SESSIONS.map(s => (
          <button
            key={s}
            className={`session-tab ${s} ${session === s ? 'active' : ''}`}
            onClick={() => setSession(s)}
          >
            <span>{SESSION_CONFIG[s].icon}</span>
            <span>{SESSION_CONFIG[s].label}</span>
          </button>
        ))}
      </div>

      {/* All Normal + Bulk + Holiday Buttons */}
      <div className="flex gap-2 mb-4">
        <button className="btn btn-primary flex-1" onClick={handleAllNormal} disabled={loadingAll} id="btn-all-normal">
          {loadingAll ? <span className="spinner" /> : SESSION_CONFIG[session].icon} सब नॉर्मल
        </button>
        <button className="btn btn-outline btn-sm btn-icon" onClick={() => { setBulkItem(items.find(i=>i.isActive)); openBulkEntry(items.find(i=>i.isActive)); }} title="पिछले दिन भरें">
          📅
        </button>
        <button className="btn btn-outline btn-sm btn-icon" onClick={() => setHolidaySheet(true)} title="छुट्टी mark करें">
          🎉
        </button>
      </div>

      {/* Quick Grid */}
      <QuickGrid items={items} session={session} activeDate={activeDate} onEntryUpdate={load} />

      {/* Today's Full Summary */}
      {todaySummary.some(s => s.dayTotal > 0) && (
        <div className="card mt-4">
          <div className="section-title">✅ आज का पूरा हिसाब</div>
          {todaySummary.filter(s => s.dayTotal > 0 || Object.keys(s.sessEntries).length > 0).map(({ item, dayTotal, sessions, sessEntries }) => (
            <div key={item.id} className="mb-3">
              <div className="flex justify-between items-center">
                <span className="font-semi">{item.emoji} {item.name}</span>
                <span className="font-bold text-gold">{formatQty(dayTotal, item.unit)}</span>
              </div>
              <div className="today-summary-row">
                {sessions.map(sess => {
                  const qty = sessEntries[sess];
                  if (qty == null) return <span key={sess} className="today-summary-chip missed">{SESSION_CONFIG[sess]?.icon} —</span>;
                  if (qty === 0)   return <span key={sess} className="today-summary-chip missed">{SESSION_CONFIG[sess]?.icon} नहीं मिला</span>;
                  return <span key={sess} className="today-summary-chip">{SESSION_CONFIG[sess]?.icon} {formatQty(qty, item.unit)}</span>;
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bulk Past Entry Sheet */}
      <Sheet open={bulkSheet} onClose={() => setBulkSheet(false)} title="📅 पिछले दिनों की Entry">
        {bulkItem && (
          <>
            <div className="flex gap-2 mb-4 scroll-x">
              {items.filter(i=>i.isActive).map(it => (
                <button key={it.id} style={{flexShrink:0}}
                  className={`btn btn-sm ${bulkItem?.id===it.id?'btn-primary':'btn-outline'}`}
                  onClick={() => openBulkEntry(it)}
                >{it.emoji} {it.name}</button>
              ))}
            </div>
            {bulkRows.map((row, i) => (
              <div key={i} className="bulk-entry-row flex items-center gap-2 mb-2">
                <input
                  className="input"
                  style={{ width: '130px', padding: '6px 8px', fontSize: '0.8rem' }}
                  type="date"
                  value={row.date}
                  onChange={async e => {
                    const r = [...bulkRows];
                    r[i].date = e.target.value;
                    if (e.target.value && bulkItem) {
                      const entryList = await db.entries.where('itemId').equals(bulkItem.id).filter(en => en.date === e.target.value && en.session === session).toArray();
                      const entry = entryList[0];
                      r[i].qty = entry?.qty != null ? entry.qty : '';
                      r[i].note = entry?.note || '';
                    }
                    setBulkRows(r);
                  }}
                />
                <input
                  className="bulk-qty-input"
                  type="number"
                  placeholder={`${bulkItem.unit}`}
                  value={row.qty}
                  onChange={e => { const r=[...bulkRows]; r[i].qty=e.target.value; setBulkRows(r); }}
                  step={bulkItem.unit==='ml'||bulkItem.unit==='gram'?50:0.5}
                />
                <input
                  className="input flex-1"
                  style={{fontSize:'0.8rem',padding:'6px 10px'}}
                  placeholder="Note..."
                  value={row.note}
                  onChange={e => { const r=[...bulkRows]; r[i].note=e.target.value; setBulkRows(r); }}
                />
              </div>
            ))}
            <button className="btn btn-primary btn-block mt-3" onClick={saveBulkEntries}>
              ✓ सभी Save करें
            </button>
          </>
        )}
      </Sheet>

      {/* Holiday Marking Sheet */}
      <Sheet open={holidaySheet} onClose={() => setHolidaySheet(false)} title="🎉 Holiday Mark करें">
        <div className="input-group">
          <label className="input-label">तारीख</label>
          <input className="input" type="date" value={holidayForm.date}
            onChange={e => setHolidayForm(f=>({...f, date:e.target.value}))} />
        </div>
        <div className="input-group">
          <label className="input-label">त्योहार / छुट्टी का नाम</label>
          <input className="input" placeholder="जैसे: Diwali, Sunday छुट्टी..." value={holidayForm.name}
            onChange={e => setHolidayForm(f=>({...f, name:e.target.value}))} />
        </div>
        <div className="toggle-wrap">
          <div>
            <div className="toggle-label">Auto Zero Entry</div>
            <div className="toggle-sub">इस दिन सभी items की entry 0 mark होगी</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={holidayForm.autoZero}
              onChange={e => setHolidayForm(f=>({...f, autoZero:e.target.checked}))} />
            <span className="toggle-slider" />
          </label>
        </div>
        <button className="btn btn-primary btn-block mt-3" onClick={addHoliday}>🎉 Mark करें</button>
      </Sheet>
    </div>
  );
}
