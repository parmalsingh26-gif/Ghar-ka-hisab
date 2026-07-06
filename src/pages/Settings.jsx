import { useState, useEffect, useCallback } from 'react';
import db, { getSetting, setSetting, upsertEntry, getPresets, getSessions, formatQty } from '../db/db';
import { scheduleDailyReminder, requestPermission, scheduleMonthlyBillNotification } from '../utils/notifications';
import { showToast, Toggle, Sheet, RatingStars } from '../components/UI';
import { LANGS, setLang, getLang } from '../utils/i18n';
import { formatRupees } from '../utils/formulas';

const CATEGORIES_EMOJI = ['🥛','💧','🍞','🥚','🥦','☕','🫓','🏠','⚡','🛒','🍎','🧅','🧄','🥩','🐟'];
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
  const [editSheet,     setEditSheet]   = useState(null);  // item being edited
  const [familyCode,    setFamilyCode]  = useState('');
  const [advThreshold,  setAdvThreshold]= useState(50);
  const [members,       setMembers]     = useState([]);
  const [addMember,     setAddMember]   = useState(false);
  const [memberForm,    setMemberForm]  = useState({ name:'', role:'customer' });
  const [budgets,       setBudgets]     = useState([]);
  const [budgetSheet,   setBudgetSheet] = useState(null);
  const [budgetForm,    setBudgetForm]  = useState({ limitQty:'', limitAmount:'' });
  const [subscriptions, setSubscriptions] = useState([]);
  const [subSheet,      setSubSheet]    = useState(false);
  const [subForm,       setSubForm]     = useState({ name:'', emoji:'⚡', amount:'', billingDay:'1', category:'Utilities' });
  const [activeTab,     setActiveTab]   = useState('items'); // items | budget | subs | family | app

  // New item / edit item form
  const blankItem = { name:'', emoji:'🥛', unit:'ml', defaultQty:'500', presets:'250,500,750,1000', sessions:['morning'], remindMorning:'', remindEvening:'', remindNight:'' };
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
  }, []);

  useEffect(() => { load(); }, [load]);

  // Toggle helpers
  const toggleLargeMode = async (v) => {
    setLargeMode(v);
    await setSetting('largeMode', v);
    document.body.classList[v?'add':'remove']('large-mode');
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
    const start = new Date(vacFrom+'T00:00:00');
    const end   = new Date(vacTo+'T00:00:00');
    let d = new Date(start);
    while (d <= end) {
      const ds = d.toISOString().split('T')[0];
      for (const item of allItems) {
        for (const sess of ALL_SESSIONS) {
          await upsertEntry(item.id, ds, 0, 'छुट्टी मोड', sess);
        }
      }
      d.setDate(d.getDate()+1);
    }
    showToast('✓ Vacation dates save — entries 0 mark हो गईं');
  };
  const changeLang = (code) => {
    setLang(code); setLangState(code); setSetting('lang', code);
    showToast(`Language: ${LANGS.find(l=>l.code===code)?.label}`, 'info');
  };
  const toggleItem = async (item) => {
    await db.items.update(item.id, { isActive: !item.isActive });
    load();
  };

  // Parse presets input "250,500,1000" → [250,500,1000]
  const parsePresets = (str) => {
    return (str || '').split(',').map(s => +s.trim()).filter(n => !isNaN(n) && n > 0);
  };

  const openEditItem = (item) => {
    setNewItem({
      name: item.name,
      emoji: item.emoji,
      unit: item.unit,
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
      name: newItem.name,
      emoji: newItem.emoji,
      unit: newItem.unit,
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
    setAddSheet(false);
    setEditSheet(null);
    setNewItem({ ...blankItem });
    load();
  };

  const deleteItem = async (id) => {
    await db.items.delete(id);
    showToast('Item हटाया गया', 'info');
    load();
  };

  // Budgets
  const openBudget = async (item) => {
    const monthStr = new Date().toISOString().slice(0,7);
    const existing = budgets.find(b => b.itemId===item.id && b.month===monthStr);
    setBudgetForm({ limitQty: existing?.limitQty||'', limitAmount: existing?.limitAmount||'' });
    setBudgetSheet(item);
  };
  const saveBudget = async () => {
    const monthStr = new Date().toISOString().slice(0,7);
    const existing = budgets.find(b => b.itemId===budgetSheet.id && b.month===monthStr);
    const data = { itemId:budgetSheet.id, month:monthStr, limitQty:+budgetForm.limitQty||0, limitAmount:+budgetForm.limitAmount||0 };
    if (existing) await db.budgets.update(existing.id, data);
    else await db.budgets.add(data);
    showToast(`Budget set: ${formatQty(+budgetForm.limitQty, budgetSheet.unit)}`);
    setBudgetSheet(null);
    load();
  };

  // Subscriptions
  const addSub = async () => {
    if (!subForm.name || !subForm.amount) { showToast('नाम और amount जरूरी है', 'error'); return; }
    await db.subscriptions.add({ ...subForm, amount:+subForm.amount, billingDay:+subForm.billingDay, isActive:true, lastPaidDate:null });
    showToast(`${subForm.name} subscription जोड़ा ✓`);
    setSubSheet(false);
    setSubForm({ name:'', emoji:'⚡', amount:'', billingDay:'1', category:'Utilities' });
    load();
  };
  const toggleSub = async (sub) => {
    await db.subscriptions.update(sub.id, { isActive: !sub.isActive });
    load();
  };
  const markSubPaid = async (sub) => {
    await db.subscriptions.update(sub.id, { lastPaidDate: new Date().toISOString().split('T')[0] });
    showToast(`${sub.name} — Paid mark किया ✓`);
    load();
  };

  const TABS = [
    { id:'items',  label:'📦 Items'  },
    { id:'budget', label:'💰 Budget' },
    { id:'subs',   label:'💳 खर्चे'  },
    { id:'family', label:'👨‍👩‍👧 Family'},
    { id:'app',    label:'⚙️ App'    },
  ];

  const monthStr = new Date().toISOString().slice(0,7);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">⚙️ सेटिंग</div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-2 mb-4 scroll-x">
        {TABS.map(t => (
          <button key={t.id} style={{flexShrink:0}}
            className={`btn btn-sm ${activeTab===t.id?'btn-primary':'btn-outline'}`}
            onClick={()=>setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ===== ITEMS TAB ===== */}
      {activeTab === 'items' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="section-title" style={{marginBottom:0}}>Daily Items</div>
            <button className="btn btn-primary btn-sm" onClick={() => { setNewItem({...blankItem}); setEditSheet(null); setAddSheet(true); }}>+ Add</button>
          </div>
          {items.map(it => {
            const presets = getPresets(it);
            const sessions = getSessions(it);
            return (
              <div key={it.id} className="item-session-card mb-3">
                <div className="item-card-header">
                  <div className="flex items-center gap-3">
                    <span style={{fontSize:'1.5rem'}}>{it.emoji}</span>
                    <div>
                      <div className="font-bold">{it.name}</div>
                      <div className="text-xs text-muted">
                        {presets.map(p=>formatQty(p,it.unit)).join(' / ')} • {sessions.map(s=>SESSION_LABELS[s]).join(', ')}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-icon-xs" onClick={() => openBudget(it)} title="Budget">💰</button>
                    <button className="btn-icon-xs" onClick={() => openEditItem(it)} title="Edit">✏️</button>
                    <button className="btn-icon-xs btn-red" onClick={() => deleteItem(it.id)} title="Delete">🗑️</button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="preset-row">
                    {presets.map(p => <span key={p} className="preset-btn" style={{cursor:'default',padding:'4px 10px',fontSize:'0.72rem'}}>{formatQty(p,it.unit)}</span>)}
                  </div>
                  <Toggle label="" checked={!!it.isActive} onChange={() => toggleItem(it)} />
                </div>
                {(it.remindMorning || it.remindEvening || it.remindNight) && (
                  <div className="item-note">
                    ⏰ {[it.remindMorning&&`🌅${it.remindMorning}`, it.remindEvening&&`🌆${it.remindEvening}`, it.remindNight&&`🌙${it.remindNight}`].filter(Boolean).join('  ')}
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
          <div className="section-title">💰 Monthly Budget Limits</div>
          <div className="text-xs text-muted mb-4">इस महीने ({monthStr}) के लिए limit set करें। 80% होने पर alert आएगा।</div>
          {items.filter(i=>i.isActive).map(it => {
            const bud = budgets.find(b=>b.itemId===it.id && b.month===monthStr);
            return (
              <div key={it.id} className="list-item mb-2" onClick={() => openBudget(it)}>
                <span style={{fontSize:'1.3rem'}}>{it.emoji}</span>
                <div style={{flex:1}}>
                  <div className="font-semi">{it.name}</div>
                  {bud
                    ? <div className="text-xs text-muted">Limit: {formatQty(bud.limitQty, it.unit)}{bud.limitAmount>0?` • ₹${bud.limitAmount}`:''}</div>
                    : <div className="text-xs text-orange">No budget set — tap to set</div>
                  }
                </div>
                <span style={{fontSize:'1rem',color:'rgba(241,245,249,0.4)'}}>›</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== SUBSCRIPTIONS TAB ===== */}
      {activeTab === 'subs' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="section-title" style={{marginBottom:0}}>💳 Fixed Monthly Expenses</div>
            <button className="btn btn-primary btn-sm" onClick={()=>setSubSheet(true)}>+ Add</button>
          </div>
          <div className="text-xs text-muted mb-3">किराया, बिजली, Cable, Gym — सब यहाँ track करें।</div>
          {subscriptions.map(sub => {
            const today = new Date();
            const daysUntil = sub.billingDay - today.getDate();
            const isDue = daysUntil >= 0 && daysUntil <= 3;
            const isPaid = sub.lastPaidDate && sub.lastPaidDate.startsWith(new Date().toISOString().slice(0,7));
            return (
              <div key={sub.id} className={`subscription-card ${isDue&&!isPaid?'due':''} ${isPaid?'paid':''}`}>
                <span className="sub-icon">{sub.emoji}</span>
                <div style={{flex:1}}>
                  <div className="sub-name">{sub.name}</div>
                  <div className="sub-due">
                    {sub.category} • हर महीने {sub.billingDay} तारीख को
                    {isDue && !isPaid && <span className="text-orange"> • {daysUntil===0?'आज due!': `${daysUntil}d में due`}</span>}
                    {isPaid && <span className="text-green"> • ✓ Paid</span>}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="font-bold text-gold">{formatRupees(sub.amount)}</div>
                  {!isPaid && <button className="btn btn-green btn-sm" style={{padding:'4px 10px',fontSize:'0.72rem'}} onClick={()=>markSubPaid(sub)}>Paid ✓</button>}
                </div>
              </div>
            );
          })}
          {subscriptions.length > 0 && (
            <div className="card card-gold mt-3" style={{padding:12}}>
              <div className="text-xs text-muted">Monthly Total</div>
              <div className="font-bold text-gold" style={{fontSize:'1.2rem'}}>
                {formatRupees(subscriptions.filter(s=>s.isActive).reduce((s,sub)=>s+sub.amount,0))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== FAMILY TAB ===== */}
      {activeTab === 'family' && (
        <div>
          <div className="section-title">👨‍👩‍👧 Family Sync</div>
          <div className="card mb-4">
            <div className="input-group">
              <label className="input-label">Family Code</label>
              <div className="flex gap-2">
                <input className="input flex-1" value={familyCode} onChange={e=>setFamilyCode(e.target.value)} placeholder="जैसे: sharma2024" />
                <button className="btn btn-primary btn-sm" onClick={async()=>{await setSetting('familyCode',familyCode);showToast('Saved ✓');}}>Save</button>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mb-2">
            <div className="section-title" style={{marginBottom:0}}>👥 Members</div>
            <button className="btn btn-primary btn-sm" onClick={()=>setAddMember(true)}>+ Add</button>
          </div>
          {members.map(m => (
            <div key={m.id} className="list-item mb-2">
              <span>👤</span>
              <div style={{flex:1}}>
                <div className="font-semi">{m.name}</div>
                <div className="text-xs text-muted">{m.role}</div>
              </div>
              <button className="btn-icon-xs btn-red" onClick={async()=>{await db.members.delete(m.id);load();}}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ===== APP TAB ===== */}
      {activeTab === 'app' && (
        <div>
          <div className="section-title">🌐 भाषा</div>
          <div className="flex gap-2 mb-4">
            {LANGS.map(l=>(
              <button key={l.code} className={`btn btn-sm ${lang===l.code?'btn-primary':'btn-outline'}`}
                onClick={()=>changeLang(l.code)}>{l.label}</button>
            ))}
          </div>
          <div className="section-title">♿ Accessibility</div>
          <Toggle label="बड़े बटन (Elderly Mode)" sub="सभी buttons और text बड़े हो जाएंगे" checked={largeMode} onChange={toggleLargeMode} />
          <div className="section-title">✈️ Vacation Mode</div>
          <Toggle label="बाहर गए मोड" sub="इन तारीखों की entries 0 mark होंगी" checked={vacation} onChange={toggleVacation} />
          {vacation && (
            <div className="card mb-4">
              <div className="grid-2 gap-3 mb-3">
                <div className="input-group"><label className="input-label">From</label><input className="input" type="date" value={vacFrom} onChange={e=>setVacFrom(e.target.value)} /></div>
                <div className="input-group"><label className="input-label">To</label><input className="input" type="date" value={vacTo} onChange={e=>setVacTo(e.target.value)} /></div>
              </div>
              <button className="btn btn-teal btn-block" onClick={saveVacDates}>✓ Dates Save करें</button>
            </div>
          )}
          <div className="section-title">🔔 Notifications</div>
          <button className="btn btn-outline btn-block mb-4" onClick={async()=>{ const ok=await requestPermission(); showToast(ok?'✓ Notifications enabled!':'Permission denied', ok?'success':'error'); }}>
            🔔 Notification Permission लें
          </button>
          <div className="section-title">💰 Advance Alert Threshold</div>
          <div className="input-group">
            <label className="input-label">इस राशि से कम होने पर alert (₹)</label>
            <input className="input" type="number" value={advThreshold} onChange={e=>setAdvThreshold(+e.target.value)}
              onBlur={async()=>{await setSetting('advanceThreshold',advThreshold);showToast('Saved ✓');}} />
          </div>
        </div>
      )}

      {/* ===== ADD / EDIT ITEM SHEET ===== */}
      <Sheet open={addSheet} onClose={()=>{setAddSheet(false);setEditSheet(null);setNewItem({...blankItem});}}
        title={editSheet?`✏️ ${editSheet.name} Edit करें`:'📦 नया Item जोड़ें'}>
        {/* Emoji Picker */}
        <div className="flex gap-2 mb-3 scroll-x">
          {CATEGORIES_EMOJI.map(e=>(
            <button key={e} style={{
              fontSize:'1.5rem',padding:'8px',borderRadius:8,flexShrink:0,cursor:'pointer',
              background:newItem.emoji===e?'rgba(245,166,35,0.2)':'transparent',
              border:newItem.emoji===e?'1px solid var(--clr-gold)':'1px solid transparent',
            }} onClick={()=>setNewItem(f=>({...f,emoji:e}))}>{e}</button>
          ))}
        </div>
        <div className="input-group"><label className="input-label">नाम *</label>
          <input className="input" value={newItem.name} onChange={e=>setNewItem(f=>({...f,name:e.target.value}))} placeholder="जैसे: Doodh, Sabzi..." />
        </div>
        <div className="grid-2 gap-3">
          <div className="input-group"><label className="input-label">Default Qty</label>
            <input className="input" type="number" value={newItem.defaultQty} onChange={e=>setNewItem(f=>({...f,defaultQty:e.target.value}))} />
          </div>
          <div className="input-group"><label className="input-label">Unit</label>
            <select className="select" value={newItem.unit} onChange={e=>setNewItem(f=>({...f,unit:e.target.value}))}>
              {UNITS.map(u=><option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* Presets */}
        <div className="input-group">
          <label className="input-label">
            Quick Presets (comma separated)
            <span className="text-xs text-muted"> — जैसे: 250,500,750,1000 (ml के लिए)</span>
          </label>
          <input className="input" value={newItem.presets} onChange={e=>setNewItem(f=>({...f,presets:e.target.value}))} placeholder="250,500,1000" />
          {newItem.presets && (
            <div className="preset-row mt-2">
              {parsePresets(newItem.presets).map(p=>(
                <span key={p} className="preset-btn" style={{cursor:'default',fontSize:'0.72rem',padding:'4px 10px'}}>
                  {newItem.unit==='ml'&&p>=1000?`${p/1000}L`:newItem.unit==='gram'&&p>=1000?`${p/1000}kg`:`${p} ${newItem.unit}`}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Sessions */}
        <div className="input-group">
          <label className="input-label">Sessions (कब आता है?)</label>
          <div className="flex gap-2">
            {ALL_SESSIONS.map(s=>(
              <button key={s} className={`btn btn-sm ${newItem.sessions.includes(s)?'btn-primary':'btn-outline'}`}
                onClick={()=>setNewItem(f=>({...f, sessions: f.sessions.includes(s)?f.sessions.filter(x=>x!==s):[...f.sessions,s]}))}>
                {SESSION_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Reminder times per session */}
        {newItem.sessions.includes('morning') && (
          <div className="input-group"><label className="input-label">⏰ सुबह Reminder</label>
            <input className="input" type="time" value={newItem.remindMorning} onChange={e=>setNewItem(f=>({...f,remindMorning:e.target.value}))} />
          </div>
        )}
        {newItem.sessions.includes('evening') && (
          <div className="input-group"><label className="input-label">⏰ शाम Reminder</label>
            <input className="input" type="time" value={newItem.remindEvening} onChange={e=>setNewItem(f=>({...f,remindEvening:e.target.value}))} />
          </div>
        )}
        {newItem.sessions.includes('night') && (
          <div className="input-group"><label className="input-label">⏰ रात Reminder</label>
            <input className="input" type="time" value={newItem.remindNight} onChange={e=>setNewItem(f=>({...f,remindNight:e.target.value}))} />
          </div>
        )}

        <button className="btn btn-primary btn-block mt-2" onClick={saveItem}>
          ✓ {editSheet?'Update':'जोड़ें'}
        </button>
      </Sheet>

      {/* Budget Sheet */}
      <Sheet open={!!budgetSheet} onClose={()=>setBudgetSheet(null)} title={`💰 ${budgetSheet?.name} — Budget Set करें`}>
        <div className="input-group">
          <label className="input-label">Qty Limit ({budgetSheet?.unit})</label>
          <input className="input" type="number" value={budgetForm.limitQty} onChange={e=>setBudgetForm(f=>({...f,limitQty:e.target.value}))}
            placeholder={`जैसे: 20000 (20L = 20000ml)`} />
        </div>
        <div className="input-group">
          <label className="input-label">Amount Limit (₹)</label>
          <input className="input" type="number" value={budgetForm.limitAmount} onChange={e=>setBudgetForm(f=>({...f,limitAmount:e.target.value}))}
            placeholder="जैसे: 2000" />
        </div>
        <button className="btn btn-primary btn-block" onClick={saveBudget}>✓ Budget Set करें</button>
      </Sheet>

      {/* Subscription Sheet */}
      <Sheet open={subSheet} onClose={()=>setSubSheet(false)} title="💳 New Subscription">
        <div className="flex gap-2 mb-3 scroll-x">
          {['⚡','📺','🏠','🌐','🏋️','📱','🚌','💊','📚','🍕'].map(e=>(
            <button key={e} style={{fontSize:'1.4rem',padding:'6px',borderRadius:8,flexShrink:0,cursor:'pointer',
              background:subForm.emoji===e?'rgba(245,166,35,0.2)':'transparent',
              border:subForm.emoji===e?'1px solid var(--clr-gold)':'1px solid transparent'}}
              onClick={()=>setSubForm(f=>({...f,emoji:e}))}>{e}</button>
          ))}
        </div>
        <div className="input-group"><label className="input-label">नाम *</label>
          <input className="input" value={subForm.name} onChange={e=>setSubForm(f=>({...f,name:e.target.value}))} placeholder="जैसे: किराया, Bijli, Netflix..." />
        </div>
        <div className="grid-2 gap-3">
          <div className="input-group"><label className="input-label">Amount (₹) *</label>
            <input className="input" type="number" value={subForm.amount} onChange={e=>setSubForm(f=>({...f,amount:e.target.value}))} placeholder="1200" />
          </div>
          <div className="input-group"><label className="input-label">Due तारीख</label>
            <input className="input" type="number" min="1" max="31" value={subForm.billingDay}
              onChange={e=>setSubForm(f=>({...f,billingDay:e.target.value}))} placeholder="1-31" />
          </div>
        </div>
        <div className="input-group"><label className="input-label">Category</label>
          <select className="select" value={subForm.category} onChange={e=>setSubForm(f=>({...f,category:e.target.value}))}>
            {SUB_CATEGORIES.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-block" onClick={addSub}>✓ जोड़ें</button>
      </Sheet>

      {/* Add Member Sheet */}
      <Sheet open={addMember} onClose={()=>setAddMember(false)} title="👤 Member जोड़ें">
        <div className="input-group"><label className="input-label">नाम *</label>
          <input className="input" value={memberForm.name} onChange={e=>setMemberForm(f=>({...f,name:e.target.value}))} placeholder="जैसे: Papa, Mummy" />
        </div>
        <div className="input-group"><label className="input-label">Role</label>
          <select className="select" value={memberForm.role} onChange={e=>setMemberForm(f=>({...f,role:e.target.value}))}>
            {['customer','vendor','admin'].map(r=><option key={r}>{r}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-block" onClick={async()=>{
          if (!memberForm.name) return;
          await db.members.add({...memberForm,familyCode,deviceId:Date.now().toString()});
          showToast(`${memberForm.name} जोड़ा गया ✓`);
          setAddMember(false); setMemberForm({name:'',role:'customer'}); load();
        }}>✓ जोड़ें</button>
      </Sheet>
    </div>
  );
}

// Helper used in sheet
function parsePresets(str) {
  return (str||'').split(',').map(s=>+s.trim()).filter(n=>!isNaN(n)&&n>0);
}
