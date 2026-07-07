import { useState, useEffect, useCallback } from 'react';
import db, { getSetting, setSetting, upsertEntry, getPresets, getSessions, formatQty } from '../db/db';
import { scheduleDailyReminder, requestPermission } from '../utils/notifications';
import { showToast, Toggle, Sheet, RatingStars } from '../components/UI';
import { LANGS, setLang, getLang } from '../utils/i18n';
import { formatRupees } from '../utils/formulas';

const CATEGORIES_EMOJI = ['🥛','💧','🍞','🥚','🥦','☕','🫓','🏠','⚡','🛒','🍎','🧅','🧄','🥩','🐟','🫗','🧈','🍶'];
const ALL_SESSIONS = ['morning', 'evening', 'night'];
const SESSION_LABELS = { morning: '🌅 सुबह', evening: '🌆 शाम', night: '🌙 रात' };
const UNITS = ['ml', 'gram', 'Litre', 'Kg', 'Packet', 'Piece', 'Cup', 'Camper', 'Box', 'Dozen'];
const SUB_CATEGORIES = ['Utilities','Entertainment','Food','Transport','Health','Education','अन्य'];

export default function Settings() {
  const [largeMode,     setLargeMode]   = useState(false);
  const [vacation,      setVacation]    = useState(false);
  const [vacFrom,       setVacFrom]     = useState('');
  const [vacTo,         setVacTo]       = useState('');
  const [lang,          setLangState]   = useState('hi');
  const [items,         setItems]       = useState([]);
  const [addSheet,      setAddSheet]    = useState(false);
  const [editSheet,     setEditSheet]   = useState(null);
  const [familyCode,    setFamilyCode]  = useState('');
  const [advThreshold,  setAdvThreshold]= useState(50);
  const [members,       setMembers]     = useState([]);
  const [addMember,     setAddMember]   = useState(false);
  const [memberForm,    setMemberForm]  = useState({ name: '', role: 'customer' });
  const [budgets,       setBudgets]     = useState([]);
  const [budgetSheet,   setBudgetSheet] = useState(null);
  const [budgetForm,    setBudgetForm]  = useState({ limitQty: '', limitAmount: '' });
  const [subscriptions, setSubscriptions] = useState([]);
  const [subSheet,      setSubSheet]    = useState(false);
  const [subForm,       setSubForm]     = useState({ name: '', emoji: '⚡', amount: '', billingDay: '1', category: 'Utilities' });
  const [activeTab,     setActiveTab]   = useState('items');
  // Rate management per item
  const [rateSheet,     setRateSheet]   = useState(null); // item
  const [rateForm,      setRateForm]    = useState({ rate: '', effectiveFrom: new Date().toISOString().split('T')[0], unit: 'base' });
  const [itemRates,     setItemRates]   = useState({}); // { itemId: [rates] }
  // Data management
  const [clearConfirm,  setClearConfirm]= useState(false);
  const [importJson,    setImportJson]  = useState('');
  const [importSheet,   setImportSheet] = useState(false);

  const blankItem = { name: '', emoji: '🥛', unit: 'ml', defaultQty: '500', presets: '250,500,750,1000', sessions: ['morning'], remindMorning: '', remindEvening: '', remindNight: '' };
  const [newItem, setNewItem] = useState({ ...blankItem });

  const load = useCallback(async () => {
    const its = await db.items.toArray();
    setItems(its);
    const lm = await getSetting('largeMode');
    setLargeMode(!!lm);
    if (lm) document.body.classList.add('large-mode');
    const vac = await getSetting('vacationMode');
    setVacation(!!vac);
    setVacFrom(await getSetting('vacationFrom') || '');
    setVacTo(await getSetting('vacationTo') || '');
    setFamilyCode(await getSetting('familyCode') || '');
    setAdvThreshold(await getSetting('advanceThreshold') || 50);
    setLangState(getLang());
    const mem = await db.members.toArray();
    setMembers(mem);
    const buds = await db.budgets.toArray();
    setBudgets(buds);
    const subs = await db.subscriptions.toArray();
    setSubscriptions(subs);
    // Load rates for all items
    const allRates = await db.rates.toArray();
    const rMap = {};
    allRates.forEach(r => {
      if (!rMap[r.itemId]) rMap[r.itemId] = [];
      rMap[r.itemId].push(r);
    });
    setItemRates(rMap);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleLargeMode = async (v) => {
    setLargeMode(v);
    await setSetting('largeMode', v);
    document.body.classList[v ? 'add' : 'remove']('large-mode');
    showToast(v ? '🔍 Large Mode ON' : 'Normal Mode ON', 'info');
  };
  const toggleVacation = async (v) => {
    setVacation(v);
    await setSetting('vacationMode', v);
    showToast(v ? '✈️ Vacation Mode ON' : '🏠 Vacation Mode OFF', 'info');
  };
  const saveVacDates = async () => {
    await setSetting('vacationFrom', vacFrom);
    await setSetting('vacationTo',   vacTo);
    const allItems = await db.items.filter(i => !!i.isActive).toArray();
    const start = new Date(vacFrom + 'T00:00:00');
    const end   = new Date(vacTo + 'T00:00:00');
    let d = new Date(start);
    while (d <= end) {
      const ds = d.toISOString().split('T')[0];
      for (const item of allItems) {
        for (const sess of ALL_SESSIONS) {
          await upsertEntry(item.id, ds, 0, 'छुट्टी मोड', sess);
        }
      }
      d.setDate(d.getDate() + 1);
    }
    showToast('✓ Vacation dates save — entries 0 mark हो गईं');
  };
  const changeLang = (code) => {
    setLang(code); setLangState(code); setSetting('lang', code);
    showToast(`Language: ${LANGS.find(l => l.code === code)?.label}`, 'info');
  };
  const toggleItem = async (item) => {
    await db.items.update(item.id, { isActive: !item.isActive });
    load();
  };

  const parsePresets = (str) =>
    (str || '').split(',').map(s => +s.trim()).filter(n => !isNaN(n) && n > 0);

  const openEditItem = (item) => {
    setNewItem({
      name: item.name, emoji: item.emoji, unit: item.unit,
      defaultQty: String(item.defaultQty),
      presets: getPresets(item).join(','),
      sessions: getSessions(item),
      remindMorning: item.remindMorning || '',
      remindEvening: item.remindEvening || '',
      remindNight:   item.remindNight   || '',
    });
    setEditSheet(item);
    setAddSheet(true);
  };

  const saveItem = async () => {
    if (!newItem.name) { showToast('नाम जरूरी है', 'error'); return; }
    const data = {
      name: newItem.name, emoji: newItem.emoji, unit: newItem.unit,
      defaultQty: +newItem.defaultQty || 1,
      presets: JSON.stringify(parsePresets(newItem.presets)),
      sessions: JSON.stringify(newItem.sessions),
      remindMorning: newItem.remindMorning || null,
      remindEvening: newItem.remindEvening || null,
      remindNight:   newItem.remindNight   || null,
      isActive: true,
    };
    if (editSheet) {
      await db.items.update(editSheet.id, data);
      showToast(`${newItem.name} update हो गया ✓`);
    } else {
      const id = await db.items.add(data);
      if (newItem.remindMorning) scheduleDailyReminder(id, newItem.name, newItem.remindMorning);
      showToast(`${newItem.name} जोड़ा गया ✓`);
    }
    setAddSheet(false); setEditSheet(null); setNewItem({ ...blankItem }); load();
  };

  const deleteItem = async (id) => {
    if (!window.confirm('क्या इस item को delete करना है? इसकी सारी entries भी हट जाएंगी।')) return;
    await db.items.delete(id);
    await db.entries.where('itemId').equals(id).delete();
    showToast('Item हटाया गया', 'info');
    load();
  };

  // Rate management
  const openRateSheet = async (item) => {
    setRateSheet(item);
    setRateForm({ rate: '', effectiveFrom: new Date().toISOString().split('T')[0], unit: 'base' });
    const rates = await db.rates.where('itemId').equals(item.id).toArray();
    setItemRates(prev => ({ ...prev, [item.id]: rates }));
  };
  const saveRate = async () => {
    if (!rateSheet || !rateForm.rate) { showToast('Rate भरो', 'error'); return; }
    let finalRate = +rateForm.rate;
    if (rateForm.unit === 'liter' && rateSheet.unit === 'ml') finalRate = finalRate / 1000;
    if (rateForm.unit === 'kg'    && rateSheet.unit === 'gram') finalRate = finalRate / 1000;
    await db.rates.add({ itemId: rateSheet.id, rate: finalRate, effectiveFrom: rateForm.effectiveFrom });
    const rates = await db.rates.where('itemId').equals(rateSheet.id).toArray();
    setItemRates(prev => ({ ...prev, [rateSheet.id]: rates }));
    showToast(`Rate set: ₹${rateForm.rate} ✓`);
    setRateForm(f => ({ ...f, rate: '' }));
    load();
  };
  const deleteRate = async (rateId, itemId) => {
    await db.rates.delete(rateId);
    const rates = await db.rates.where('itemId').equals(itemId).toArray();
    setItemRates(prev => ({ ...prev, [itemId]: rates }));
    showToast('Rate हटाया गया', 'info');
  };

  // Budgets
  const openBudget = async (item) => {
    const monthStr = new Date().toISOString().slice(0, 7);
    const existing = budgets.find(b => b.itemId === item.id && b.month === monthStr);
    setBudgetForm({ limitQty: existing?.limitQty || '', limitAmount: existing?.limitAmount || '' });
    setBudgetSheet(item);
  };
  const saveBudget = async () => {
    const monthStr = new Date().toISOString().slice(0, 7);
    const existing = budgets.find(b => b.itemId === budgetSheet.id && b.month === monthStr);
    const data = { itemId: budgetSheet.id, month: monthStr, limitQty: +budgetForm.limitQty || 0, limitAmount: +budgetForm.limitAmount || 0 };
    if (existing) await db.budgets.update(existing.id, data);
    else await db.budgets.add(data);
    showToast(`Budget set: ${formatQty(+budgetForm.limitQty, budgetSheet.unit)}`);
    setBudgetSheet(null); load();
  };

  // Subscriptions
  const addSub = async () => {
    if (!subForm.name || !subForm.amount) { showToast('नाम और amount जरूरी है', 'error'); return; }
    await db.subscriptions.add({ ...subForm, amount: +subForm.amount, billingDay: +subForm.billingDay, isActive: true, lastPaidDate: null });
    showToast(`${subForm.name} subscription जोड़ा ✓`);
    setSubSheet(false); setSubForm({ name: '', emoji: '⚡', amount: '', billingDay: '1', category: 'Utilities' }); load();
  };
  const toggleSub = async (sub) => { await db.subscriptions.update(sub.id, { isActive: !sub.isActive }); load(); };
  const deleteSub = async (id) => { await db.subscriptions.delete(id); showToast('Subscription हटाई', 'info'); load(); };
  const markSubPaid = async (sub) => {
    await db.subscriptions.update(sub.id, { lastPaidDate: new Date().toISOString().split('T')[0] });
    showToast(`${sub.name} — Paid mark किया ✓`); load();
  };

  // Data Export
  const exportData = async () => {
    const data = {
      exportedAt: new Date().toISOString(),
      version: 1,
      items:         await db.items.toArray(),
      entries:       await db.entries.toArray(),
      rates:         await db.rates.toArray(),
      advances:      await db.advances.toArray(),
      vendors:       await db.vendors.toArray(),
      grocery:       await db.grocery.toArray(),
      budgets:       await db.budgets.toArray(),
      subscriptions: await db.subscriptions.toArray(),
      members:       await db.members.toArray(),
      holidays:      await db.holidays.toArray(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ghar-ka-hisab-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✓ Backup download हो गई!');
  };

  // Data Import
  const importData = async () => {
    try {
      const data = JSON.parse(importJson);
      if (!data.items || !data.entries) { showToast('Invalid backup file', 'error'); return; }
      // Clear and re-import
      await db.items.clear(); await db.entries.clear(); await db.rates.clear();
      await db.budgets.clear(); await db.subscriptions.clear(); await db.members.clear();
      if (data.items.length)         await db.items.bulkAdd(data.items.map(({ id, ...r }) => r));
      // Entries need to be added fresh (new IDs)
      if (data.entries.length)       await db.entries.bulkAdd(data.entries.map(({ id, ...r }) => r));
      if (data.rates.length)         await db.rates.bulkAdd(data.rates.map(({ id, ...r }) => r));
      if (data.budgets?.length)      await db.budgets.bulkAdd(data.budgets.map(({ id, ...r }) => r));
      if (data.subscriptions?.length) await db.subscriptions.bulkAdd(data.subscriptions.map(({ id, ...r }) => r));
      if (data.members?.length)      await db.members.bulkAdd(data.members.map(({ id, ...r }) => r));
      if (data.holidays?.length)     await db.holidays.bulkAdd(data.holidays.map(({ id, ...r }) => r));
      showToast('✓ Data restore हो गया! App reload हो रहा है...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      showToast(`Import failed: ${e.message}`, 'error');
    }
  };

  // Clear all data
  const clearAllData = async () => {
    await db.entries.clear();
    await db.items.clear();
    await db.rates.clear();
    await db.advances.clear();
    await db.budgets.clear();
    await db.vendors.clear();
    await db.grocery.clear();
    await db.subscriptions.clear();
    await db.members.clear();
    await db.holidays.clear();
    showToast('⚠️ सारा data delete हो गया। App reload हो रहा है...');
    setTimeout(() => window.location.reload(), 1500);
  };

  const TABS = [
    { id: 'items',  label: '📦 Items'   },
    { id: 'rates',  label: '💰 Rates'   },
    { id: 'budget', label: '📊 Budget'  },
    { id: 'subs',   label: '💳 खर्चे'   },
    { id: 'family', label: '👥 Family'  },
    { id: 'app',    label: '⚙️ App'     },
  ];

  const monthStr = new Date().toISOString().slice(0, 7);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">⚙️ सेटिंग</div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-2 mb-4 scroll-x">
        {TABS.map(t => (
          <button key={t.id} style={{ flexShrink: 0 }}
            className={`btn btn-sm ${activeTab === t.id ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ===== ITEMS TAB ===== */}
      {activeTab === 'items' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="section-title" style={{ marginBottom: 0 }}>Daily Items</div>
            <button className="btn btn-primary btn-sm" onClick={() => { setNewItem({ ...blankItem }); setEditSheet(null); setAddSheet(true); }}>+ Add</button>
          </div>
          {items.map(it => {
            const presets  = getPresets(it);
            const sessions = getSessions(it);
            const rates    = itemRates[it.id] || [];
            const latestRate = rates.filter(r => r.effectiveFrom <= new Date().toISOString().split('T')[0]).pop();
            return (
              <div key={it.id} className="item-session-card mb-3">
                <div className="item-card-header">
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: '1.5rem' }}>{it.emoji}</span>
                    <div>
                      <div className="font-bold">{it.name}</div>
                      <div className="text-xs text-muted">
                        {presets.map(p => formatQty(p, it.unit)).join(' / ')} • {sessions.map(s => SESSION_LABELS[s]).join(', ')}
                      </div>
                      {latestRate && (
                        <div className="text-xs" style={{ color: 'var(--clr-gold)', marginTop: 1 }}>
                          💰 ₹{it.unit === 'ml' ? (latestRate.rate * 1000).toFixed(2) + '/L' : latestRate.rate + '/' + it.unit}
                          <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>({latestRate.effectiveFrom} से)</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-icon-xs" onClick={() => openRateSheet(it)} title="Rate Set">💰</button>
                    <button className="btn-icon-xs" onClick={() => openBudget(it)} title="Budget">📊</button>
                    <button className="btn-icon-xs" onClick={() => openEditItem(it)} title="Edit">✏️</button>
                    <button className="btn-icon-xs btn-red" onClick={() => deleteItem(it.id)} title="Delete">🗑️</button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="preset-row">
                    {presets.map(p => (
                      <span key={p} className="preset-btn" style={{ cursor: 'default', padding: '4px 10px', fontSize: '0.72rem' }}>
                        {formatQty(p, it.unit)}
                      </span>
                    ))}
                  </div>
                  <Toggle label="" checked={!!it.isActive} onChange={() => toggleItem(it)} />
                </div>
                {(it.remindMorning || it.remindEvening || it.remindNight) && (
                  <div className="item-note">
                    ⏰ {[it.remindMorning && `🌅${it.remindMorning}`, it.remindEvening && `🌆${it.remindEvening}`, it.remindNight && `🌙${it.remindNight}`].filter(Boolean).join('  ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== RATES TAB ===== */}
      {activeTab === 'rates' && (
        <div>
          <div className="section-title">💰 Item Rates</div>
          <div className="text-xs text-muted mb-4">
            हर item का rate यहाँ set और history देखें।<br />
            Rate बदलने पर purana rate history mein rahega.
          </div>
          {items.filter(i => i.isActive).map(it => {
            const rates = (itemRates[it.id] || []).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
            const currentRate = rates[0];
            return (
              <div key={it.id} className="card mb-3" style={{ padding: 14 }}>
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <div className="font-bold">{it.emoji} {it.name}</div>
                    {currentRate
                      ? <div className="text-xs text-gold">
                          Current: ₹{it.unit === 'ml' ? (currentRate.rate * 1000).toFixed(2) + '/L' : currentRate.rate + '/' + it.unit}
                        </div>
                      : <div className="text-xs text-orange">No rate set</div>}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => openRateSheet(it)}>+ Rate Set</button>
                </div>
                {rates.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {rates.map(r => (
                      <div key={r.id} className="flex justify-between items-center"
                        style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '6px 10px' }}>
                        <div>
                          <div className="text-sm font-semi">
                            ₹{it.unit === 'ml' ? (r.rate * 1000).toFixed(2) + '/L' : r.rate + '/' + it.unit}
                          </div>
                          <div className="text-xs text-muted">{r.effectiveFrom} से</div>
                        </div>
                        <button className="btn-icon-xs btn-red" onClick={() => deleteRate(r.id, it.id)}>🗑️</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== BUDGET TAB ===== */}
      {activeTab === 'budget' && (
        <div>
          <div className="section-title">📊 Monthly Budget Limits</div>
          <div className="text-xs text-muted mb-4">इस महीने ({monthStr}) के लिए limit set करें। 80% होने पर alert आएगा।</div>
          {items.filter(i => i.isActive).map(it => {
            const bud = budgets.find(b => b.itemId === it.id && b.month === monthStr);
            return (
              <div key={it.id} className="list-item mb-2" onClick={() => openBudget(it)}>
                <span style={{ fontSize: '1.3rem' }}>{it.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div className="font-semi">{it.name}</div>
                  {bud
                    ? <div className="text-xs text-muted">Limit: {formatQty(bud.limitQty, it.unit)}{bud.limitAmount > 0 ? ` • ₹${bud.limitAmount}` : ''}</div>
                    : <div className="text-xs text-orange">No budget — tap to set</div>}
                </div>
                <span style={{ fontSize: '1rem', color: 'rgba(241,245,249,0.4)' }}>›</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== SUBSCRIPTIONS TAB ===== */}
      {activeTab === 'subs' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="section-title" style={{ marginBottom: 0 }}>💳 Fixed Monthly Expenses</div>
            <button className="btn btn-primary btn-sm" onClick={() => setSubSheet(true)}>+ Add</button>
          </div>
          <div className="text-xs text-muted mb-3">किराया, बिजली, Cable, Gym — सब यहाँ track करें।</div>
          {subscriptions.map(sub => {
            const today = new Date();
            const daysUntil = sub.billingDay - today.getDate();
            const isDue = daysUntil >= 0 && daysUntil <= 3;
            const isPaid = sub.lastPaidDate && sub.lastPaidDate.startsWith(new Date().toISOString().slice(0, 7));
            return (
              <div key={sub.id} className={`subscription-card ${isDue && !isPaid ? 'due' : ''} ${isPaid ? 'paid' : ''}`}>
                <span className="sub-icon">{sub.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div className="sub-name">{sub.name}</div>
                  <div className="sub-due">
                    {sub.category} • हर महीने {sub.billingDay} तारीख को
                    {isDue && !isPaid && <span className="text-orange"> • {daysUntil === 0 ? 'आज due!' : `${daysUntil}d में due`}</span>}
                    {isPaid && <span className="text-green"> • ✓ Paid</span>}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="font-bold text-gold">{formatRupees(sub.amount)}</div>
                  {!isPaid && (
                    <button className="btn btn-green btn-sm" style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                      onClick={() => markSubPaid(sub)}>Paid ✓</button>
                  )}
                  <button className="btn btn-outline btn-sm" style={{ padding: '3px 8px', fontSize: '0.65rem' }}
                    onClick={() => deleteSub(sub.id)}>🗑️</button>
                </div>
              </div>
            );
          })}
          {subscriptions.length > 0 && (
            <div className="card card-gold mt-3" style={{ padding: 12 }}>
              <div className="text-xs text-muted">Monthly Total (Active)</div>
              <div className="font-bold text-gold" style={{ fontSize: '1.2rem' }}>
                {formatRupees(subscriptions.filter(s => s.isActive).reduce((s, sub) => s + sub.amount, 0))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== FAMILY TAB ===== */}
      {activeTab === 'family' && (
        <div>
          <div className="section-title">👥 Family Sync</div>
          <div className="card mb-4">
            <div className="input-group">
              <label className="input-label">Family Code</label>
              <div className="flex gap-2">
                <input className="input flex-1" value={familyCode} onChange={e => setFamilyCode(e.target.value)} placeholder="जैसे: sharma2024" />
                <button className="btn btn-primary btn-sm" onClick={async () => { await setSetting('familyCode', familyCode); showToast('Saved ✓'); }}>Save</button>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mb-2">
            <div className="section-title" style={{ marginBottom: 0 }}>👤 Members</div>
            <button className="btn btn-primary btn-sm" onClick={() => setAddMember(true)}>+ Add</button>
          </div>
          {members.map(m => (
            <div key={m.id} className="list-item mb-2">
              <span>👤</span>
              <div style={{ flex: 1 }}>
                <div className="font-semi">{m.name}</div>
                <div className="text-xs text-muted">{m.role}</div>
              </div>
              <button className="btn-icon-xs btn-red" onClick={async () => { await db.members.delete(m.id); load(); }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ===== APP TAB ===== */}
      {activeTab === 'app' && (
        <div>
          <div className="section-title">🌐 भाषा</div>
          <div className="flex gap-2 mb-4">
            {LANGS.map(l => (
              <button key={l.code} className={`btn btn-sm ${lang === l.code ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => changeLang(l.code)}>{l.label}</button>
            ))}
          </div>

          <div className="section-title">♿ Accessibility</div>
          <Toggle label="बड़े बटन (Elderly Mode)" sub="सभी buttons और text बड़े हो जाएंगे" checked={largeMode} onChange={toggleLargeMode} />

          <div className="section-title" style={{ marginTop: 16 }}>✈️ Vacation Mode</div>
          <Toggle label="बाहर गए मोड" sub="इन तारीखों की entries 0 mark होंगी" checked={vacation} onChange={toggleVacation} />
          {vacation && (
            <div className="card mb-4">
              <div className="grid-2 gap-3 mb-3">
                <div className="input-group"><label className="input-label">From</label><input className="input" type="date" value={vacFrom} onChange={e => setVacFrom(e.target.value)} /></div>
                <div className="input-group"><label className="input-label">To</label><input className="input" type="date" value={vacTo} onChange={e => setVacTo(e.target.value)} /></div>
              </div>
              <button className="btn btn-teal btn-block" onClick={saveVacDates}>✓ Dates Save करें</button>
            </div>
          )}

          <div className="section-title" style={{ marginTop: 16 }}>🔔 Notifications</div>
          <button className="btn btn-outline btn-block mb-4" onClick={async () => {
            const ok = await requestPermission(); showToast(ok ? '✓ Notifications enabled!' : 'Permission denied', ok ? 'success' : 'error');
          }}>🔔 Notification Permission लें</button>

          <div className="section-title">💰 Advance Alert Threshold</div>
          <div className="input-group mb-4">
            <label className="input-label">इस राशि से कम होने पर alert (₹)</label>
            <input className="input" type="number" value={advThreshold} onChange={e => setAdvThreshold(+e.target.value)}
              onBlur={async () => { await setSetting('advanceThreshold', advThreshold); showToast('Saved ✓'); }} />
          </div>

          {/* Data Management */}
          <div className="section-title">💾 Data Backup & Restore</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            <button className="btn btn-outline btn-block" onClick={exportData}>
              📤 Data Export (JSON Backup)
            </button>
            <button className="btn btn-outline btn-block" onClick={() => setImportSheet(true)}>
              📥 Data Import (Restore Backup)
            </button>
          </div>

          {/* Danger Zone */}
          <div className="section-title" style={{ color: 'var(--clr-red)' }}>⚠️ Danger Zone</div>
          <div className="card" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', padding: 14, borderRadius: 14 }}>
            <div className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.7)' }}>
              नीचे के actions <b>irreversible</b> हैं। पहले backup लें।
            </div>
            {!clearConfirm ? (
              <button className="btn btn-danger btn-block" onClick={() => setClearConfirm(true)}>
                🗑️ सारा Data Delete करें
              </button>
            ) : (
              <div>
                <div className="text-sm text-orange mb-3">⚠️ क्या आप sure हैं? सारी entries, items, vendors सब delete हो जाएगा!</div>
                <div className="flex gap-2">
                  <button className="btn btn-outline flex-1" onClick={() => setClearConfirm(false)}>Cancel</button>
                  <button className="btn btn-danger flex-1" onClick={clearAllData}>हाँ, Delete करो</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== ADD / EDIT ITEM SHEET ===== */}
      <Sheet open={addSheet} onClose={() => { setAddSheet(false); setEditSheet(null); setNewItem({ ...blankItem }); }}
        title={editSheet ? `✏️ ${editSheet.name} Edit करें` : '📦 नया Item जोड़ें'}>
        <div className="flex gap-2 mb-3 scroll-x">
          {CATEGORIES_EMOJI.map(e => (
            <button key={e} style={{
              fontSize: '1.5rem', padding: '8px', borderRadius: 8, flexShrink: 0, cursor: 'pointer',
              background: newItem.emoji === e ? 'rgba(245,166,35,0.2)' : 'transparent',
              border: newItem.emoji === e ? '1px solid var(--clr-gold)' : '1px solid transparent',
            }} onClick={() => setNewItem(f => ({ ...f, emoji: e }))}>{e}</button>
          ))}
        </div>
        <div className="input-group">
          <label className="input-label">नाम *</label>
          <input className="input" value={newItem.name} onChange={e => setNewItem(f => ({ ...f, name: e.target.value }))} placeholder="जैसे: Doodh, Sabzi..." />
        </div>
        <div className="grid-2 gap-3">
          <div className="input-group">
            <label className="input-label">Default Qty</label>
            <input className="input" type="number" value={newItem.defaultQty} onChange={e => setNewItem(f => ({ ...f, defaultQty: e.target.value }))} />
          </div>
          <div className="input-group">
            <label className="input-label">Unit</label>
            <select className="select" value={newItem.unit} onChange={e => setNewItem(f => ({ ...f, unit: e.target.value }))}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Quick Presets <span className="text-xs text-muted">(comma separated, जैसे: 250,500,1000)</span></label>
          <input className="input" value={newItem.presets} onChange={e => setNewItem(f => ({ ...f, presets: e.target.value }))} placeholder="250,500,1000" />
          {newItem.presets && (
            <div className="preset-row mt-2">
              {parsePresets(newItem.presets).map(p => (
                <span key={p} className="preset-btn" style={{ cursor: 'default', fontSize: '0.72rem', padding: '4px 10px' }}>
                  {newItem.unit === 'ml' && p >= 1000 ? `${p / 1000}L` : newItem.unit === 'gram' && p >= 1000 ? `${p / 1000}kg` : `${p} ${newItem.unit}`}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="input-group">
          <label className="input-label">Sessions (कब आता है?)</label>
          <div className="flex gap-2">
            {ALL_SESSIONS.map(s => (
              <button key={s} className={`btn btn-sm ${newItem.sessions.includes(s) ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setNewItem(f => ({ ...f, sessions: f.sessions.includes(s) ? f.sessions.filter(x => x !== s) : [...f.sessions, s] }))}>
                {SESSION_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        {newItem.sessions.includes('morning') && (
          <div className="input-group"><label className="input-label">⏰ सुबह Reminder</label>
            <input className="input" type="time" value={newItem.remindMorning} onChange={e => setNewItem(f => ({ ...f, remindMorning: e.target.value }))} /></div>
        )}
        {newItem.sessions.includes('evening') && (
          <div className="input-group"><label className="input-label">⏰ शाम Reminder</label>
            <input className="input" type="time" value={newItem.remindEvening} onChange={e => setNewItem(f => ({ ...f, remindEvening: e.target.value }))} /></div>
        )}
        {newItem.sessions.includes('night') && (
          <div className="input-group"><label className="input-label">⏰ रात Reminder</label>
            <input className="input" type="time" value={newItem.remindNight} onChange={e => setNewItem(f => ({ ...f, remindNight: e.target.value }))} /></div>
        )}
        <button className="btn btn-primary btn-block mt-2" onClick={saveItem}>
          ✓ {editSheet ? 'Update' : 'जोड़ें'}
        </button>
      </Sheet>

      {/* Rate Sheet */}
      <Sheet open={!!rateSheet} onClose={() => setRateSheet(null)} title={`💰 ${rateSheet?.emoji} ${rateSheet?.name} — Rate Set करें`}>
        <div className="input-group">
          <label className="input-label">Rate Unit</label>
          <div className="flex gap-2 mb-2">
            <button className={`btn btn-sm flex-1 ${rateForm.unit === 'base' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setRateForm(f => ({ ...f, unit: 'base' }))}>
              Per {rateSheet?.unit}
            </button>
            {(rateSheet?.unit === 'ml' || rateSheet?.unit === 'gram') && (
              <button className={`btn btn-sm flex-1 ${rateForm.unit !== 'base' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setRateForm(f => ({ ...f, unit: rateSheet.unit === 'ml' ? 'liter' : 'kg' }))}>
                Per {rateSheet.unit === 'ml' ? 'Liter (₹/L)' : 'Kg (₹/kg)'}
              </button>
            )}
          </div>
          <input className="input" type="number" value={rateForm.rate}
            onChange={e => setRateForm(f => ({ ...f, rate: e.target.value }))}
            placeholder={`जैसे: ${rateForm.unit === 'base' ? '0.06' : '60'}`} />
          {rateForm.rate && (
            <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--clr-teal)' }}>
              {rateSheet?.unit === 'ml' && rateForm.unit !== 'base'
                ? `₹${rateForm.rate}/L → per ml = ₹${(+rateForm.rate / 1000).toFixed(5)}`
                : `₹${rateForm.rate} per ${rateForm.unit === 'base' ? rateSheet?.unit : rateForm.unit}`}
            </div>
          )}
        </div>
        <div className="input-group">
          <label className="input-label">किस तारीख से?</label>
          <input className="input" type="date" value={rateForm.effectiveFrom} onChange={e => setRateForm(f => ({ ...f, effectiveFrom: e.target.value }))} />
        </div>
        {/* Rate history */}
        {(itemRates[rateSheet?.id] || []).length > 0 && (
          <div className="card mb-3" style={{ padding: 12 }}>
            <div className="text-xs text-muted mb-2">Rate History</div>
            {[...(itemRates[rateSheet?.id] || [])].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).map(r => (
              <div key={r.id} className="split-row">
                <div>
                  <div className="text-sm font-semi">₹{rateSheet?.unit === 'ml' ? (r.rate * 1000).toFixed(2) + '/L' : r.rate + '/' + rateSheet?.unit}</div>
                  <div className="text-xs text-muted">{r.effectiveFrom} से</div>
                </div>
                <button className="btn-icon-xs btn-red" onClick={() => deleteRate(r.id, rateSheet.id)}>🗑️</button>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-primary btn-block" onClick={saveRate}>✓ Rate Set करें</button>
      </Sheet>

      {/* Budget Sheet */}
      <Sheet open={!!budgetSheet} onClose={() => setBudgetSheet(null)} title={`📊 ${budgetSheet?.name} — Budget Set करें`}>
        <div className="input-group">
          <label className="input-label">Qty Limit ({budgetSheet?.unit})</label>
          <input className="input" type="number" value={budgetForm.limitQty}
            onChange={e => setBudgetForm(f => ({ ...f, limitQty: e.target.value }))}
            placeholder={`जैसे: 20000 (20L = 20000ml)`} />
        </div>
        <div className="input-group">
          <label className="input-label">Amount Limit (₹)</label>
          <input className="input" type="number" value={budgetForm.limitAmount}
            onChange={e => setBudgetForm(f => ({ ...f, limitAmount: e.target.value }))}
            placeholder="जैसे: 2000" />
        </div>
        <button className="btn btn-primary btn-block" onClick={saveBudget}>✓ Budget Set करें</button>
      </Sheet>

      {/* Subscription Sheet */}
      <Sheet open={subSheet} onClose={() => setSubSheet(false)} title="💳 New Subscription">
        <div className="flex gap-2 mb-3 scroll-x">
          {['⚡', '📺', '🏠', '🌐', '🏋️', '📱', '🚌', '💊', '📚', '🍕'].map(e => (
            <button key={e} style={{
              fontSize: '1.4rem', padding: '6px', borderRadius: 8, flexShrink: 0, cursor: 'pointer',
              background: subForm.emoji === e ? 'rgba(245,166,35,0.2)' : 'transparent',
              border: subForm.emoji === e ? '1px solid var(--clr-gold)' : '1px solid transparent',
            }} onClick={() => setSubForm(f => ({ ...f, emoji: e }))}>{e}</button>
          ))}
        </div>
        <div className="input-group"><label className="input-label">नाम *</label>
          <input className="input" value={subForm.name} onChange={e => setSubForm(f => ({ ...f, name: e.target.value }))} placeholder="जैसे: किराया, Bijli, Netflix..." /></div>
        <div className="grid-2 gap-3">
          <div className="input-group"><label className="input-label">Amount (₹) *</label>
            <input className="input" type="number" value={subForm.amount} onChange={e => setSubForm(f => ({ ...f, amount: e.target.value }))} placeholder="1200" /></div>
          <div className="input-group"><label className="input-label">Due तारीख</label>
            <input className="input" type="number" min="1" max="31" value={subForm.billingDay}
              onChange={e => setSubForm(f => ({ ...f, billingDay: e.target.value }))} placeholder="1-31" /></div>
        </div>
        <div className="input-group"><label className="input-label">Category</label>
          <select className="select" value={subForm.category} onChange={e => setSubForm(f => ({ ...f, category: e.target.value }))}>
            {SUB_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select></div>
        <button className="btn btn-primary btn-block" onClick={addSub}>✓ जोड़ें</button>
      </Sheet>

      {/* Add Member Sheet */}
      <Sheet open={addMember} onClose={() => setAddMember(false)} title="👤 Member जोड़ें">
        <div className="input-group"><label className="input-label">नाम *</label>
          <input className="input" value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} placeholder="जैसे: Papa, Mummy" /></div>
        <div className="input-group"><label className="input-label">Role</label>
          <select className="select" value={memberForm.role} onChange={e => setMemberForm(f => ({ ...f, role: e.target.value }))}>
            {['customer', 'vendor', 'admin'].map(r => <option key={r}>{r}</option>)}
          </select></div>
        <button className="btn btn-primary btn-block" onClick={async () => {
          if (!memberForm.name) return;
          await db.members.add({ ...memberForm, familyCode, deviceId: Date.now().toString() });
          showToast(`${memberForm.name} जोड़ा गया ✓`);
          setAddMember(false); setMemberForm({ name: '', role: 'customer' }); load();
        }}>✓ जोड़ें</button>
      </Sheet>

      {/* Import Sheet */}
      <Sheet open={importSheet} onClose={() => setImportSheet(false)} title="📥 Data Restore">
        <div className="text-sm text-muted mb-3">
          ⚠️ Restore करने से <b>मौजूदा data replace</b> हो जाएगा। पहले backup लें।
        </div>
        <div className="input-group">
          <label className="input-label">Backup JSON paste करें या file choose करें</label>
          <input type="file" accept=".json" className="input" style={{ padding: 8 }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = ev => setImportJson(ev.target.result);
              reader.readAsText(file);
            }} />
          {importJson && <div className="text-xs text-green mt-2">✓ File loaded ({Math.round(importJson.length/1024)}KB)</div>}
        </div>
        <button className="btn btn-danger btn-block" onClick={importData} disabled={!importJson}>
          📥 Restore करें
        </button>
      </Sheet>
    </div>
  );
}

// Helper used in sheet
function parsePresets(str) {
  return (str || '').split(',').map(s => +s.trim()).filter(n => !isNaN(n) && n > 0);
}
