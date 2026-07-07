import { useState, useEffect, useCallback } from 'react';
import db, {
  todayStr, upsertEntry, getSetting, setSetting,
  getDayEntries, getDayTotal, formatQty, getSessions
} from '../db/db';
import { calcStreak, formatRupees, getDaysInMonth, sumRange } from '../utils/formulas';
import { showToast, StreakBadge, Sheet, StatCard } from '../components/UI';
import QuickGrid from '../components/QuickGrid';

const SESSION_CONFIG = {
  morning: { label: 'सुबह',  icon: '🌅', color: 'var(--clr-gold)',         grad: 'linear-gradient(135deg,#f5a623,#ffd166)' },
  evening: { label: 'शाम',   icon: '🌆', color: 'var(--clr-violet-light)', grad: 'linear-gradient(135deg,#7c3aed,#c084fc)' },
  night:   { label: 'रात',   icon: '🌙', color: 'var(--clr-teal)',         grad: 'linear-gradient(135deg,#0891b2,#06b6d4)' },
};
const ALL_SESSIONS = ['morning', 'evening', 'night'];

export default function Home() {
  const [items,         setItems]         = useState([]);
  const [session,       setSession]       = useState('morning');
  const [streak,        setStreak]        = useState(0);
  const [vacation,      setVacation]      = useState(false);
  const [vacMsg,        setVacMsg]        = useState('');
  const [loadingAll,    setLoadingAll]    = useState(false);
  const [runningTotal,  setRunningTotal]  = useState({});
  const [monthlyData,   setMonthlyData]   = useState([]);
  const [budgets,       setBudgets]       = useState([]);
  const [holidays,      setHolidays]      = useState([]);
  const [bulkSession,   setBulkSession]   = useState('morning');
  const [bulkSheet,     setBulkSheet]     = useState(false);
  const [bulkItem,      setBulkItem]      = useState(null);
  const [bulkRows,      setBulkRows]      = useState([]);
  const [holidaySheet,  setHolidaySheet]  = useState(false);
  const [holidayForm,   setHolidayForm]   = useState({ date: todayStr(), name: '', autoZero: true });
  const [todaySummary,  setTodaySummary]  = useState([]);
  const [subsAlert,     setSubsAlert]     = useState([]);
  const [activeDate,    setActiveDate]    = useState(todayStr());
  const [autoFillMode,    setAutoFillMode]    = useState(false);
  const [autoFillQty,     setAutoFillQty]     = useState('');
  const [autoFillFrom,    setAutoFillFrom]    = useState(() => new Date().toISOString().slice(0, 7) + '-01');
  const [autoFillTo,      setAutoFillTo]      = useState(todayStr());
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  // Daily session completion status per item
  const [sessionStatus,   setSessionStatus]   = useState({}); // { itemId: { morning: done, evening: done, night: done } }
  const today = todayStr();

  const load = useCallback(async () => {
    const allItems = await db.items.toArray();
    setItems(allItems);

    // Detect active session by time
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
    if (vac && vf && vt) setVacMsg(`बाहर गए हैं: ${vf} से ${vt} तक`);

    // Today's holiday
    const todayHolidays = await db.holidays.where('date').equals(activeDate).toArray();
    setHolidays(todayHolidays);

    // Running total this month
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

    // Monthly Summary
    const mData = [];
    const activeMonthStr = activeDate.slice(0, 7);
    for (const item of activeItems) {
      const entries = await db.entries.where('itemId').equals(item.id)
        .filter(e => e.date.startsWith(activeMonthStr)).toArray();
      let morning = 0, evening = 0, night = 0, total = 0;
      entries.forEach(e => {
        const q = e.qty || 0;
        total += q;
        if (e.session === 'morning') morning += q;
        if (e.session === 'evening') evening += q;
        if (e.session === 'night')   night   += q;
      });
      if (total > 0) {
        const daysEntried = new Set(entries.filter(e => e.qty > 0).map(e => e.date)).size;
        mData.push({ morning, evening, night, total, unit: item.unit, name: item.name, emoji: item.emoji, daysEntried });
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
      const spent   = entries.reduce((s,e) => s+(e.qty||0), 0);
      const pct     = bud.limitQty > 0 ? Math.round((spent / bud.limitQty) * 100) : 0;
      if (pct >= 80) warnings.push({ item: it, spent, limit: bud.limitQty, pct });
    }
    setBudgets(warnings);

    // Today summary
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

    // Session status (for progress badges on session tabs)
    const sStatus = {};
    for (const item of activeItems) {
      sStatus[item.id] = {};
      const dayEntries = await getDayEntries(item.id, activeDate);
      dayEntries.forEach(e => { sStatus[item.id][e.session] = e.qty; });
    }
    setSessionStatus(sStatus);

    // Subscriptions due soon
    const allSubs = await db.subscriptions.filter(s => !!s.isActive).toArray();
    const todayD = new Date();
    const dueAlerts = allSubs.filter(s => {
      const daysUntil = s.billingDay - todayD.getDate();
      return daysUntil >= 0 && daysUntil <= 3;
    });
    setSubsAlert(dueAlerts);
  }, [activeDate]);

  useEffect(() => { load(); }, [load, activeDate]);

  // Navigate date
  const goDate = (delta) => {
    const d = new Date(activeDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const newDate = d.toISOString().split('T')[0];
    if (newDate <= today) setActiveDate(newDate);
  };

  // Open bulk past-entry sheet
  const openBulkEntry = async (item) => {
    let activeBulkSession = session;
    const itemSessions = getSessions(item);
    if (!itemSessions.includes(activeBulkSession)) activeBulkSession = itemSessions[0] || 'morning';
    setBulkSession(activeBulkSession);
    const rows = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(activeDate + 'T00:00:00'); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const entryList = await db.entries.where('itemId').equals(item.id).filter(e => e.date === dateStr && e.session === activeBulkSession).toArray();
      const entry = entryList[0];
      rows.push({ id: entry?.id, date: dateStr, qty: entry?.qty != null ? entry.qty : '', note: entry?.note || '' });
    }
    setBulkRows(rows);
    setBulkItem(item);
    setBulkSheet(true);
  };

  const saveBulkEntries = async () => {
    let saved = 0;
    for (const row of bulkRows) {
      if (row.qty !== '' && row.qty !== null) {
        await upsertEntry(bulkItem.id, row.date, +row.qty, row.note || '', bulkSession);
        saved++;
      } else if (row.id) {
        await db.entries.delete(row.id);
        saved++;
      }
    }
    showToast(`✓ ${saved} entries save हो गईं`);
    setBulkSheet(false);
    load();
  };

  const handleAutoFill = async () => {
    if (!autoFillQty || !autoFillFrom || !autoFillTo || !bulkItem) {
      showToast('Qty aur Date range bharo', 'error'); return;
    }
    if (autoFillFrom > autoFillTo) {
      showToast('"Kab Se" date "Kab Tak" se pahle honi chahiye', 'error'); return;
    }
    setAutoFillLoading(true);
    try {
      const holidays = await db.holidays.toArray();
      const holidayDates = new Set(holidays.filter(h => h.autoZero).map(h => h.date));
      const d = new Date(autoFillFrom + 'T00:00:00');
      const end = new Date(autoFillTo + 'T00:00:00');
      let count = 0;
      while (d <= end) {
        const ds = d.toISOString().split('T')[0];
        if (!holidayDates.has(ds)) {
          await upsertEntry(bulkItem.id, ds, +autoFillQty, 'Auto-Fill', bulkSession);
          count++;
        }
        d.setDate(d.getDate() + 1);
      }
      showToast(`⚡ ${count} din ki entry fill ho gayi!`);
      setAutoFillMode(false);
      setBulkSheet(false);
      load();
    } catch { showToast('Auto-Fill mein error aayi', 'error'); }
    finally { setAutoFillLoading(false); }
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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'सुप्रभात 🌅' : hour < 17 ? 'नमस्ते ☀️' : 'शुभ संध्या 🌙';
  const totalMonthAmount = Object.values(runningTotal).reduce((s, r) => s + (r.amount || 0), 0);
  const isToday = activeDate === today;

  // Per-session completion count for tab badges
  const getSessionBadge = (sess) => {
    const activeItemsForSession = items.filter(it => it.isActive && getSessions(it).includes(sess));
    if (activeItemsForSession.length === 0) return null;
    const done = activeItemsForSession.filter(it => {
      const qty = sessionStatus[it.id]?.[sess];
      return qty != null && qty > 0;
    }).length;
    return { done, total: activeItemsForSession.length };
  };

  return (
    <div className="page">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="page-title" style={{ marginBottom: 2 }}>🏠 घर का हिसाब</div>
          <div className="text-xs text-muted">{greeting}</div>
        </div>
        <StreakBadge streak={streak} />
      </div>

      {/* Date Navigator */}
      <div className="flex items-center gap-2 mb-4" style={{
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: '8px 12px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <button
          onClick={() => goDate(-1)}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '1.1rem', cursor: 'pointer', padding: '0 4px' }}
        >‹</button>
        <input
          type="date"
          className="input"
          style={{ padding: '4px 8px', width: 'auto', flex: 1, background: 'transparent', border: 'none', textAlign: 'center', fontWeight: 600 }}
          value={activeDate}
          onChange={(e) => setActiveDate(e.target.value)}
          max={todayStr()}
        />
        <button
          onClick={() => goDate(1)}
          disabled={isToday}
          style={{ background: 'none', border: 'none', color: isToday ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)', fontSize: '1.1rem', cursor: isToday ? 'default' : 'pointer', padding: '0 4px' }}
        >›</button>
        {!isToday && (
          <button
            onClick={() => setActiveDate(today)}
            style={{ background: 'rgba(245,166,35,0.15)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 8, color: 'var(--clr-gold)', fontSize: '0.7rem', padding: '3px 8px', cursor: 'pointer' }}
          >आज</button>
        )}
        <span className="text-xs text-muted">🔥 {streak}</span>
      </div>

      {/* Today's Holiday Banner */}
      {holidays.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {holidays.map(h => (
            <div key={h.id} className="holiday-badge"
              style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', borderRadius: 12, marginBottom: 8 }}>
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
              onClick={async () => { await navigator.clipboard.writeText(vacMsg).catch(() => {}); showToast('Copy हो गया!', 'info'); }}>
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

      {/* Running Total Banner — Advanced */}
      {totalMonthAmount > 0 && (
        <div className="running-total-banner" style={{ marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="running-total-label">📊 {activeDate.slice(0,7)} का खर्च</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(241,245,249,0.4)', marginTop: 2 }}>
              {Object.values(runningTotal).filter(r => r.total > 0).map(r => `${r.emoji} ${formatQty(r.total, r.unit)}`).join('  •  ')}
            </div>
            {/* Days info */}
            <div style={{ fontSize: '0.65rem', color: 'rgba(241,245,249,0.3)', marginTop: 2 }}>
              {new Date().getDate()} दिन में से {new Date(activeDate.slice(0,7)+'-01').toLocaleDateString('hi-IN',{month:'long'})}
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

      {/* Monthly Session Summary — Advanced */}
      {Array.isArray(monthlyData) && monthlyData.length > 0 && (
        <div className="weekly-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
          {monthlyData.map((data, idx) => (
            <div key={idx} style={{ borderBottom: idx !== monthlyData.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', paddingBottom: idx !== monthlyData.length - 1 ? '12px' : 0 }}>
              <div className="text-xs text-muted mb-2 font-bold">
                📈 {data.emoji} {data.name} — {activeDate.slice(0,7)} &nbsp;
                <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}>({data.daysEntried} दिन)</span>
              </div>
              <div className="weekly-compare" style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'center', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div className="weekly-col-label">{SESSION_CONFIG['morning'].icon} सुबह</div>
                  <div className="weekly-col-value text-gold">{formatQty(data.morning, data.unit)}</div>
                </div>
                {data.evening > 0 && <>
                  <div className="weekly-vs" style={{ margin: '0 8px' }}>+</div>
                  <div style={{ flex: 1 }}>
                    <div className="weekly-col-label">{SESSION_CONFIG['evening'].icon} शाम</div>
                    <div className="weekly-col-value text-violet">{formatQty(data.evening, data.unit)}</div>
                  </div>
                </>}
                {data.night > 0 && <>
                  <div className="weekly-vs" style={{ margin: '0 8px' }}>+</div>
                  <div style={{ flex: 1 }}>
                    <div className="weekly-col-label">{SESSION_CONFIG['night'].icon} रात</div>
                    <div className="weekly-col-value text-teal">{formatQty(data.night, data.unit)}</div>
                  </div>
                </>}
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

      {/* Session Tabs — with completion badges */}
      <div className="session-tabs">
        {ALL_SESSIONS.map(s => {
          const badge = getSessionBadge(s);
          return (
            <button
              key={s}
              className={`session-tab ${s} ${session === s ? 'active' : ''}`}
              onClick={() => setSession(s)}
              style={{ position: 'relative' }}
            >
              <span>{SESSION_CONFIG[s].icon}</span>
              <span>{SESSION_CONFIG[s].label}</span>
              {badge && badge.done > 0 && (
                <span style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 16, height: 16, borderRadius: '50%',
                  background: badge.done === badge.total ? 'var(--clr-green)' : 'var(--clr-orange)',
                  fontSize: '0.55rem', color: '#fff', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1.5px solid var(--clr-bg-deep)',
                }}>
                  {badge.done}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 mb-4">
        <button className="btn btn-primary flex-1" onClick={handleAllNormal} disabled={loadingAll} id="btn-all-normal">
          {loadingAll ? <span className="spinner" /> : SESSION_CONFIG[session].icon} सब नॉर्मल
        </button>
        <button
          className="btn btn-outline btn-sm btn-icon"
          onClick={() => { const first = items.find(i => i.isActive); if (first) openBulkEntry(first); }}
          title="पिछले दिन भरें"
        >📅</button>
        <button className="btn btn-outline btn-sm btn-icon" onClick={() => setHolidaySheet(true)} title="छुट्टी mark करें">🎉</button>
      </div>

      {/* Quick Grid */}
      <QuickGrid items={items} session={session} activeDate={activeDate} onEntryUpdate={load} />

      {/* Today's Full Summary */}
      {todaySummary.some(s => s.dayTotal > 0) && (
        <div className="card mt-4" style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.15)' }}>
          <div className="section-title">✅ {activeDate === today ? 'आज' : activeDate} का पूरा हिसाब</div>
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
      <Sheet open={bulkSheet} onClose={() => { setBulkSheet(false); setAutoFillMode(false); }} title="📅 पिछले दिनों की Entry">
        {bulkItem && (
          <>
            {/* Item Selector */}
            <div className="flex gap-2 mb-4 scroll-x">
              {items.filter(i => i.isActive).map(it => (
                <button key={it.id} style={{ flexShrink: 0 }}
                  className={`btn btn-sm ${bulkItem?.id === it.id ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => openBulkEntry(it)}>
                  {it.emoji} {it.name}
                </button>
              ))}
            </div>

            {/* Session Selector */}
            <div className="flex justify-center mb-3">
              {getSessions(bulkItem).map(s => (
                <button key={s}
                  className={`btn btn-sm ${bulkSession === s ? 'btn-outline' : ''}`}
                  style={{
                    border: bulkSession === s ? `1px solid ${SESSION_CONFIG[s].color}` : 'none',
                    color: bulkSession === s ? SESSION_CONFIG[s].color : 'rgba(255,255,255,0.4)',
                    background: 'transparent',
                  }}
                  onClick={async () => {
                    const activeBulkSession = s;
                    setBulkSession(activeBulkSession);
                    const rows = [];
                    for (let i = 1; i <= 7; i++) {
                      const d = new Date(activeDate + 'T00:00:00'); d.setDate(d.getDate() - i);
                      const dateStr = d.toISOString().split('T')[0];
                      const entryList = await db.entries.where('itemId').equals(bulkItem.id).filter(e => e.date === dateStr && e.session === activeBulkSession).toArray();
                      const entry = entryList[0];
                      rows.push({ id: entry?.id, date: dateStr, qty: entry?.qty != null ? entry.qty : '', note: entry?.note || '' });
                    }
                    setBulkRows(rows);
                  }}
                >
                  {SESSION_CONFIG[s].icon} {SESSION_CONFIG[s].label}
                </button>
              ))}
            </div>

            {/* Auto-Fill Toggle */}
            <div
              className="card mb-3"
              style={{
                padding: '10px 14px',
                background: autoFillMode ? 'rgba(245,166,35,0.08)' : 'rgba(255,255,255,0.04)',
                border: autoFillMode ? '1px solid rgba(245,166,35,0.4)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12, cursor: 'pointer',
              }}
              onClick={() => setAutoFillMode(m => !m)}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semi text-sm">⚡ Auto-Fill (Copy Pattern)</div>
                  <div className="text-xs text-muted">एक ही qty को कई दिनों में एक साथ भरें</div>
                </div>
                <span style={{ fontSize: '1.2rem', color: autoFillMode ? 'var(--clr-gold)' : 'rgba(255,255,255,0.3)' }}>
                  {autoFillMode ? '▲' : '▼'}
                </span>
              </div>
            </div>

            {/* Auto-Fill Panel */}
            {autoFillMode && (
              <div className="card mb-4" style={{ padding: 14, background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 14 }}>
                <div className="grid-2 gap-3 mb-3">
                  <div className="input-group">
                    <label className="input-label">Qty ({bulkItem.unit}) *</label>
                    <input className="input" type="number" value={autoFillQty}
                      onChange={e => setAutoFillQty(e.target.value)}
                      placeholder={`जैसे: ${(bulkItem.presets ? JSON.parse(bulkItem.presets)[0] : bulkItem.defaultQty) || 500}`}
                      step={bulkItem.unit === 'ml' || bulkItem.unit === 'gram' ? 50 : 0.5} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Quick Presets</label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(bulkItem.presets ? JSON.parse(bulkItem.presets) : []).map(p => (
                        <button key={p}
                          className={`btn btn-sm ${+autoFillQty === p ? 'btn-primary' : 'btn-outline'}`}
                          style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                          onClick={() => setAutoFillQty(p.toString())}>
                          {bulkItem.unit === 'ml' && p >= 1000 ? `${p / 1000}L` : `${p}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid-2 gap-3 mb-3">
                  <div className="input-group">
                    <label className="input-label">📅 कब से (From)</label>
                    <input className="input" type="date" value={autoFillFrom} onChange={e => setAutoFillFrom(e.target.value)} />
                  </div>
                  <div className="input-group">
                    <label className="input-label">📅 कब तक (To)</label>
                    <input className="input" type="date" value={autoFillTo} onChange={e => setAutoFillTo(e.target.value)} />
                  </div>
                </div>
                {autoFillQty && autoFillFrom && autoFillTo && (
                  <div style={{ background: 'rgba(245,166,35,0.08)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.8rem' }}>
                    ℹ️ {formatQty(+autoFillQty, bulkItem.unit)} × हर दिन ({autoFillFrom} से {autoFillTo})
                  </div>
                )}
                <button className="btn btn-primary btn-block" onClick={handleAutoFill} disabled={autoFillLoading}>
                  {autoFillLoading ? <span className="spinner" /> : '⚡ Auto-Fill करें'}
                </button>
              </div>
            )}

            {/* Manual Entry Rows */}
            {!autoFillMode && (
              <>
                {bulkRows.map((row, i) => (
                  <div key={i} className="bulk-entry-row flex items-center gap-2 mb-2">
                    <input className="input" style={{ width: '130px', padding: '6px 8px', fontSize: '0.8rem' }}
                      type="date" value={row.date}
                      onChange={async e => {
                        const r = [...bulkRows]; r[i].date = e.target.value;
                        if (e.target.value && bulkItem) {
                          const entryList = await db.entries.where('itemId').equals(bulkItem.id).filter(en => en.date === e.target.value && en.session === bulkSession).toArray();
                          const entry = entryList[0];
                          r[i].id = entry?.id; r[i].qty = entry?.qty != null ? entry.qty : ''; r[i].note = entry?.note || '';
                        }
                        setBulkRows(r);
                      }} />
                    <input className="bulk-qty-input" type="number"
                      placeholder={`${bulkItem.unit}`} value={row.qty}
                      onChange={e => { const r = [...bulkRows]; r[i].qty = e.target.value; setBulkRows(r); }}
                      step={bulkItem.unit === 'ml' || bulkItem.unit === 'gram' ? 50 : 0.5} />
                    <input className="input flex-1" style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                      placeholder="Note..." value={row.note}
                      onChange={e => { const r = [...bulkRows]; r[i].note = e.target.value; setBulkRows(r); }} />
                  </div>
                ))}
                <button className="btn btn-primary btn-block mt-3" onClick={saveBulkEntries}>
                  ✓ सभी Save करें
                </button>
              </>
            )}
          </>
        )}
      </Sheet>

      {/* Holiday Marking Sheet */}
      <Sheet open={holidaySheet} onClose={() => setHolidaySheet(false)} title="🎉 Holiday Mark करें">
        <div className="input-group">
          <label className="input-label">तारीख</label>
          <input className="input" type="date" value={holidayForm.date}
            onChange={e => setHolidayForm(f => ({ ...f, date: e.target.value }))} />
        </div>
        <div className="input-group">
          <label className="input-label">त्योहार / छुट्टी का नाम</label>
          <input className="input" placeholder="जैसे: Diwali, Sunday छुट्टी..." value={holidayForm.name}
            onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="toggle-wrap">
          <div>
            <div className="toggle-label">Auto Zero Entry</div>
            <div className="toggle-sub">इस दिन सभी items की entry 0 mark होगी</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={holidayForm.autoZero}
              onChange={e => setHolidayForm(f => ({ ...f, autoZero: e.target.checked }))} />
            <span className="toggle-slider" />
          </label>
        </div>
        <button className="btn btn-primary btn-block mt-3" onClick={addHoliday}>🎉 Mark करें</button>
      </Sheet>
    </div>
  );
}
