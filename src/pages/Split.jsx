import { useState, useEffect, useCallback, useRef } from 'react';
import db from '../db/db';
import { showToast, Sheet } from '../components/UI';
import { formatRupees } from '../utils/formulas';
import { nativeShare } from '../utils/export';

const EXPENSE_CATEGORIES = ['किराना','सब्जी','फल','रेंट','बिजली','पानी','पेट्रोल','खाना','दवाई','अन्य'];

export default function Split() {
  const [activeTab, setActiveTab] = useState('list');
  const [partners, setPartners]   = useState([]);
  const [expenses, setExpenses]   = useState([]);

  // Partner sheet
  const [partnerSheet, setPartnerSheet] = useState(false);
  const [partnerName, setPartnerName]   = useState('');

  // Expense form
  const [expenseSheet,  setExpenseSheet]  = useState(false);
  const [editExpenseId, setEditExpenseId] = useState(null);
  const [expDate,       setExpDate]       = useState(new Date().toISOString().split('T')[0]);
  const [expItem,       setExpItem]       = useState('');
  const [expCategory,   setExpCategory]   = useState('किराना');
  const [expQty,        setExpQty]        = useState('1');
  const [expAmount,     setExpAmount]     = useState('');
  const [expPaidBy,     setExpPaidBy]     = useState('');
  const [expSplit,      setExpSplit]      = useState('all');
  const [selectedSplits, setSelectedSplits] = useState([]);

  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));
  const partnersInitialized = useRef(false);

  const load = useCallback(async () => {
    const p = await db.sharedPartners.toArray();
    setPartners(p);
    const exps = await db.sharedExpenses.where('month').equals(monthFilter).toArray();
    exps.sort((a, b) => b.date.localeCompare(a.date));
    setExpenses(exps);

    // Only initialize paidBy on first load
    if (!partnersInitialized.current && p.length > 0) {
      setExpPaidBy(p[0].id.toString());
      partnersInitialized.current = true;
    }
  }, [monthFilter]);

  useEffect(() => { load(); }, [load]);

  // ---- Partner CRUD ----
  const addPartner = async () => {
    if (!partnerName.trim()) return;
    await db.sharedPartners.add({ name: partnerName, isActive: true });
    setPartnerName('');
    setPartnerSheet(false);
    showToast('Partner जोड़ा ✓');
    load();
  };

  const deletePartner = async (id) => {
    if (window.confirm('Delete this partner?')) {
      await db.sharedPartners.delete(id);
      load();
    }
  };

  // ---- Expense CRUD ----
  const openExpenseSheet = (exp = null) => {
    if (exp) {
      setEditExpenseId(exp.id);
      setExpDate(exp.date);
      setExpItem(exp.itemName);
      setExpCategory(exp.category || 'किराना');
      setExpQty(exp.qty.toString());
      setExpAmount(exp.amount.toString());
      setExpPaidBy(exp.paidById.toString());
      setExpSplit(exp.splitBetween === 'all' ? 'all' : 'custom');
      setSelectedSplits(exp.splitBetween === 'all' ? [] : JSON.parse(exp.splitBetween));
    } else {
      setEditExpenseId(null);
      setExpDate(new Date().toISOString().split('T')[0]);
      setExpItem('');
      setExpCategory('किराना');
      setExpQty('1');
      setExpAmount('');
      setExpSplit('all');
      setSelectedSplits([]);
      if (partners.length > 0) setExpPaidBy(partners[0].id.toString());
    }
    setExpenseSheet(true);
  };

  const saveExpense = async () => {
    if (!expItem || !expAmount || !expPaidBy) {
      showToast('नाम, Amount और Paid By जरूरी है', 'error');
      return;
    }
    const splitData = expSplit === 'all' ? 'all' : JSON.stringify(selectedSplits.map(Number));
    const data = {
      date: expDate,
      itemName: expItem,
      category: expCategory,
      qty: +expQty || 1,
      amount: +expAmount,
      paidById: +expPaidBy,
      splitBetween: splitData,
      month: expDate.slice(0, 7),
    };
    if (editExpenseId) {
      await db.sharedExpenses.update(editExpenseId, data);
      showToast('खर्च update हो गया ✓');
    } else {
      await db.sharedExpenses.add(data);
      showToast('खर्च जोड़ा गया ✓');
    }
    setExpenseSheet(false);
    load();
  };

  const deleteExpense = async (id) => {
    if (window.confirm('इस खर्च को delete करें?')) {
      await db.sharedExpenses.delete(id);
      setExpenseSheet(false);
      load();
    }
  };

  const toggleSplitSelection = (id) => {
    const numId = Number(id);
    if (selectedSplits.includes(numId)) {
      setSelectedSplits(selectedSplits.filter(x => x !== numId));
    } else {
      setSelectedSplits([...selectedSplits, numId]);
    }
  };

  // ---- Settlements ----
  const calculateSettlements = (expList = expenses) => {
    const balances = {};
    partners.forEach(p => balances[p.id] = 0);
    let totalExpense = 0;

    expList.forEach(exp => {
      totalExpense += exp.amount;
      if (balances[exp.paidById] !== undefined) {
        balances[exp.paidById] += exp.amount;
      }
      const splitList = exp.splitBetween === 'all'
        ? partners.map(p => p.id)
        : JSON.parse(exp.splitBetween).map(Number);
      if (splitList.length > 0) {
        const splitAmount = exp.amount / splitList.length;
        splitList.forEach(id => {
          if (balances[id] !== undefined) balances[id] -= splitAmount;
        });
      }
    });

    const summary = partners.map(p => ({
      id: p.id,
      name: p.name,
      balance: Math.round(balances[p.id] * 100) / 100,
    }));
    return { totalExpense, summary };
  };

  // ---- Share summary ----
  const handleShare = async () => {
    const { totalExpense, summary } = calculateSettlements();
    let text = `🤝 साझा खर्च — ${monthFilter}\n`;
    text += `कुल: ${formatRupees(totalExpense)}\n\n`;
    summary.forEach(s => {
      const sign = s.balance >= 0 ? `लेना: ${formatRupees(s.balance)}` : `देना: ${formatRupees(Math.abs(s.balance))}`;
      text += `${s.name} → ${sign}\n`;
    });
    text += `\nGhar Ka Hisab App`;
    const result = await nativeShare(text, 'साझा हिसाब');
    if (result === 'clipboard') showToast('Copy हो गया — Paste करें!', 'info');
  };

  // ---- Category totals ----
  const catTotals = {};
  expenses.forEach(e => {
    catTotals[e.category || 'अन्य'] = (catTotals[e.category || 'अन्य'] || 0) + e.amount;
  });

  const { totalExpense, summary } = calculateSettlements();
  const perPersonShare = partners.length > 0 ? totalExpense / partners.length : 0;

  return (
    <div className="page" style={{ paddingBottom: '100px' }}>
      <div className="page-header">
        <div className="page-title">🤝 Split (साझा खर्च)</div>
        <button className="btn btn-outline btn-sm btn-icon" onClick={handleShare} title="Share">📤</button>
      </div>

      <div className="flex gap-2 mb-3">
        {['list','summary','partners'].map(tab => (
          <button key={tab} className={`btn btn-sm flex-1 ${activeTab === tab ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab(tab)}>
            {tab === 'list' ? '📝 List' : tab === 'summary' ? '📊 हिसाब' : '👥 Partners'}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <input type="month" className="input" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} />
      </div>

      {/* ===== LIST TAB ===== */}
      {activeTab === 'list' && (
        <div>
          {partners.length === 0 ? (
            <div className="card text-center" style={{ padding: 24 }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>👥</div>
              <div className="font-bold mb-1">पहले Partners जोड़ें</div>
              <div className="text-muted text-sm mb-3">सभी रूम पार्टनर्स के नाम यहाँ add करें</div>
              <button className="btn btn-primary" onClick={() => setActiveTab('partners')}>Partners पर जाएं →</button>
            </div>
          ) : (
            <>
              <button className="btn btn-primary btn-block mb-4" onClick={() => openExpenseSheet()}>+ नया खर्च जोड़ें</button>

              {/* Category summary chips */}
              {Object.keys(catTotals).length > 0 && (
                <div className="flex gap-2 mb-3" style={{ overflowX: 'auto', paddingBottom: 4 }}>
                  {Object.entries(catTotals).map(([cat, amt]) => (
                    <div key={cat} className="today-summary-chip" style={{ flexShrink: 0 }}>
                      {cat}: {formatRupees(amt)}
                    </div>
                  ))}
                </div>
              )}

              {expenses.length === 0 && (
                <div className="text-center text-muted mt-4">इस महीने कोई खर्चा नहीं</div>
              )}

              {expenses.map(exp => {
                const payer = partners.find(p => p.id === exp.paidById)?.name || '?';
                const splitList = exp.splitBetween === 'all' ? 'सब' : `${JSON.parse(exp.splitBetween).length} लोग`;
                return (
                  <div key={exp.id} className="list-item mb-2" onClick={() => openExpenseSheet(exp)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                    <div className="flex justify-between items-center mb-1">
                      <div>
                        <span className="font-semi">{exp.itemName}</span>
                        {exp.category && (
                          <span className="badge badge-violet ml-2" style={{ fontSize: '0.65rem' }}>{exp.category}</span>
                        )}
                      </div>
                      <div className="font-bold text-gold">{formatRupees(exp.amount)}</div>
                    </div>
                    <div className="flex justify-between items-center text-xs text-muted">
                      <div>📅 {exp.date} • {exp.qty} Qty</div>
                      <div>💸 {payer} • Split: {splitList}</div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ===== SUMMARY TAB ===== */}
      {activeTab === 'summary' && (
        <div>
          <div className="grid-2 gap-3 mb-4">
            <div className="stat-card card-gold">
              <div className="stat-value text-gold">{formatRupees(totalExpense)}</div>
              <div className="stat-label">कुल खर्च ({monthFilter})</div>
            </div>
            <div className="stat-card">
              <div className="stat-value text-violet">{formatRupees(perPersonShare)}</div>
              <div className="stat-label">प्रति व्यक्ति</div>
            </div>
          </div>

          <div className="section-title">किसको कितना देना/लेना है?</div>
          {summary.map(s => (
            <div key={s.id} className="list-item mb-2">
              <div className="font-semi">👤 {s.name}</div>
              <div className={`font-bold ${s.balance > 0 ? 'text-green' : s.balance < 0 ? 'text-red' : 'text-muted'}`}>
                {s.balance > 0.01 ? `✅ लेना है: ${formatRupees(s.balance)}`
                  : s.balance < -0.01 ? `🔴 देना है: ${formatRupees(Math.abs(s.balance))}`
                  : '✔️ Clear'}
              </div>
            </div>
          ))}

          {/* Category breakdown */}
          {Object.keys(catTotals).length > 0 && (
            <>
              <div className="section-title mt-4">Category-wise खर्च</div>
              {Object.entries(catTotals).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => (
                <div key={cat} className="list-item mb-2">
                  <div>{cat}</div>
                  <div className="font-bold text-gold">{formatRupees(amt)}</div>
                </div>
              ))}
            </>
          )}

          <button className="btn btn-outline btn-block mt-4" onClick={handleShare}>
            📤 हिसाब Share करें
          </button>
        </div>
      )}

      {/* ===== PARTNERS TAB ===== */}
      {activeTab === 'partners' && (
        <div>
          <button className="btn btn-primary btn-block mb-4" onClick={() => setPartnerSheet(true)}>+ Partner जोड़ें</button>
          {partners.length === 0 && (
            <div className="text-center text-muted">अभी कोई partner नहीं है</div>
          )}
          {partners.map(p => (
            <div key={p.id} className="list-item mb-2">
              <span className="font-semi">👤 {p.name}</span>
              <button className="btn-icon-xs btn-red" onClick={() => deletePartner(p.id)}>🗑️</button>
            </div>
          ))}
        </div>
      )}

      {/* ===== EXPENSE SHEET ===== */}
      <Sheet open={expenseSheet} onClose={() => setExpenseSheet(false)} title={editExpenseId ? '✏️ खर्च Edit करें' : '📝 नया खर्च'}>
        <div className="grid-2 gap-3 mb-3">
          <div className="input-group">
            <label className="input-label">तारीख</label>
            <input className="input" type="date" value={expDate} onChange={e => setExpDate(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label">कितने का? (₹) *</label>
            <input className="input" type="number" value={expAmount} onChange={e => setExpAmount(e.target.value)} placeholder="500" />
          </div>
        </div>

        <div className="grid-2 gap-3 mb-3">
          <div className="input-group">
            <label className="input-label">सामान का नाम *</label>
            <input className="input" value={expItem} onChange={e => setExpItem(e.target.value)} placeholder="राशन, सब्जी..." />
          </div>
          <div className="input-group">
            <label className="input-label">Category</label>
            <select className="select" value={expCategory} onChange={e => setExpCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="input-group mb-3">
          <label className="input-label">मात्रा (Qty)</label>
          <input className="input" type="number" value={expQty} onChange={e => setExpQty(e.target.value)} placeholder="1" />
        </div>

        <div className="input-group mb-3">
          <label className="input-label">💸 किसने पैसे दिए? (Paid By) *</label>
          <div className="flex gap-2 flex-wrap">
            {partners.map(p => (
              <button key={p.id}
                className={`btn btn-sm ${expPaidBy === p.id.toString() ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setExpPaidBy(p.id.toString())}>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="input-group mb-4">
          <label className="input-label">किनमें बंटेगा? (Split Between)</label>
          <div className="flex gap-2 mb-2">
            <button className={`btn btn-sm flex-1 ${expSplit === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setExpSplit('all')}>
              सब में बराबर
            </button>
            <button className={`btn btn-sm flex-1 ${expSplit === 'custom' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setExpSplit('custom')}>
              कुछ लोगों में
            </button>
          </div>
          {expSplit === 'custom' && (
            <div className="flex flex-wrap gap-2 mt-2">
              {partners.map(p => (
                <button key={p.id}
                  className={`btn btn-sm ${selectedSplits.includes(p.id) ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => toggleSplitSelection(p.id)}>
                  {p.name} {selectedSplits.includes(p.id) ? '✓' : ''}
                </button>
              ))}
            </div>
          )}
          {expSplit === 'all' && partners.length > 0 && (
            <div className="text-xs text-muted mt-2">
              प्रति व्यक्ति: {formatRupees(+expAmount / partners.length || 0)}
            </div>
          )}
          {expSplit === 'custom' && selectedSplits.length > 0 && +expAmount > 0 && (
            <div className="text-xs text-muted mt-2">
              प्रति व्यक्ति: {formatRupees(+expAmount / selectedSplits.length)}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {editExpenseId && (
            <button className="btn btn-danger flex-1" onClick={() => deleteExpense(editExpenseId)}>🗑️ Delete</button>
          )}
          <button className="btn btn-primary flex-1" onClick={saveExpense}>✓ Save</button>
        </div>
      </Sheet>

      {/* ===== PARTNER SHEET ===== */}
      <Sheet open={partnerSheet} onClose={() => setPartnerSheet(false)} title="👤 नया Partner जोड़ें">
        <div className="input-group">
          <label className="input-label">पार्टनर का नाम *</label>
          <input className="input" value={partnerName} onChange={e => setPartnerName(e.target.value)}
            placeholder="जैसे: Rahul, Amit..." onKeyDown={e => e.key === 'Enter' && addPartner()} />
        </div>
        <button className="btn btn-primary btn-block" onClick={addPartner}>✓ जोड़ें</button>
      </Sheet>
    </div>
  );
}
