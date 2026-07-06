import { useState, useEffect, useCallback } from 'react';
import db from '../db/db';
import { showToast, Sheet } from '../components/UI';
import { formatRupees } from '../utils/formulas';

export default function Split() {
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'summary' | 'partners'
  const [partners, setPartners] = useState([]);
  const [expenses, setExpenses] = useState([]);
  
  // Add Partner
  const [partnerSheet, setPartnerSheet] = useState(false);
  const [partnerName, setPartnerName] = useState('');

  // Add Expense
  const [expenseSheet, setExpenseSheet] = useState(false);
  const [editExpenseId, setEditExpenseId] = useState(null);
  
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
  const [expItem, setExpItem] = useState('');
  const [expQty, setExpQty] = useState('1');
  const [expAmount, setExpAmount] = useState('');
  const [expPaidBy, setExpPaidBy] = useState('');
  const [expSplit, setExpSplit] = useState('all'); // 'all' or JSON array of partner IDs
  const [selectedSplits, setSelectedSplits] = useState([]); // array of partner IDs if custom split

  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    const p = await db.sharedPartners.toArray();
    setPartners(p);
    
    // Load expenses for selected month
    const exps = await db.sharedExpenses.where('month').equals(monthFilter).reverse().sortBy('date');
    setExpenses(exps);
    
    if (p.length > 0 && !expPaidBy) {
      setExpPaidBy(p[0].id.toString());
    }
  }, [monthFilter, expPaidBy]);

  useEffect(() => { load(); }, [load]);

  // ---- Partner Functions ----
  const addPartner = async () => {
    if (!partnerName.trim()) return;
    await db.sharedPartners.add({ name: partnerName, isActive: true });
    setPartnerName('');
    setPartnerSheet(false);
    showToast('Partner added');
    load();
  };

  const deletePartner = async (id) => {
    if (window.confirm('Delete this partner?')) {
      await db.sharedPartners.delete(id);
      load();
    }
  };

  // ---- Expense Functions ----
  const openExpenseSheet = (exp = null) => {
    if (exp) {
      setEditExpenseId(exp.id);
      setExpDate(exp.date);
      setExpItem(exp.itemName);
      setExpQty(exp.qty.toString());
      setExpAmount(exp.amount.toString());
      setExpPaidBy(exp.paidById.toString());
      setExpSplit(exp.splitBetween === 'all' ? 'all' : 'custom');
      setSelectedSplits(exp.splitBetween === 'all' ? [] : JSON.parse(exp.splitBetween));
    } else {
      setEditExpenseId(null);
      setExpDate(new Date().toISOString().split('T')[0]);
      setExpItem('');
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
      showToast('Name, Amount, and Payer required', 'error');
      return;
    }
    const splitData = expSplit === 'all' ? 'all' : JSON.stringify(selectedSplits);
    const data = {
      date: expDate,
      itemName: expItem,
      qty: +expQty || 1,
      amount: +expAmount,
      paidById: +expPaidBy,
      splitBetween: splitData,
      month: expDate.slice(0, 7)
    };

    if (editExpenseId) {
      await db.sharedExpenses.update(editExpenseId, data);
      showToast('Expense updated');
    } else {
      await db.sharedExpenses.add(data);
      showToast('Expense added');
    }
    setExpenseSheet(false);
    load();
  };

  const deleteExpense = async (id) => {
    if (window.confirm('Delete this expense?')) {
      await db.sharedExpenses.delete(id);
      load();
    }
  };

  const toggleSplitSelection = (id) => {
    if (selectedSplits.includes(id)) {
      setSelectedSplits(selectedSplits.filter(x => x !== id));
    } else {
      setSelectedSplits([...selectedSplits, id]);
    }
  };

  // ---- Calculate Settlements ----
  const calculateSettlements = () => {
    const balances = {};
    partners.forEach(p => balances[p.id] = 0);

    let totalExpense = 0;

    expenses.forEach(exp => {
      totalExpense += exp.amount;
      // Payer gets positive balance
      if (balances[exp.paidById] !== undefined) {
        balances[exp.paidById] += exp.amount;
      }

      // Splitters get negative balance
      const splitList = exp.splitBetween === 'all' 
        ? partners.map(p => p.id) 
        : JSON.parse(exp.splitBetween);
      
      // Prevent division by zero
      if (splitList.length > 0) {
        const splitAmount = exp.amount / splitList.length;
        splitList.forEach(id => {
          if (balances[id] !== undefined) {
            balances[id] -= splitAmount;
          }
        });
      }
    });

    const summary = partners.map(p => ({
      name: p.name,
      balance: balances[p.id]
    }));

    return { totalExpense, summary };
  };

  const { totalExpense, summary } = calculateSettlements();

  return (
    <div className="page" style={{ paddingBottom: '100px' }}>
      <div className="page-header">
        <div className="page-title">🤝 Split (साझा खर्च)</div>
      </div>

      <div className="flex gap-2 mb-4">
        <button className={`btn btn-sm ${activeTab === 'list' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('list')}>📝 List</button>
        <button className={`btn btn-sm ${activeTab === 'summary' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('summary')}>📊 Summary</button>
        <button className={`btn btn-sm ${activeTab === 'partners' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('partners')}>👥 Partners</button>
      </div>

      <div className="mb-4">
        <input type="month" className="input" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} />
      </div>

      {activeTab === 'list' && (
        <div>
          {partners.length === 0 ? (
            <div className="card text-center text-muted">
              पार्टनर्स जोड़ें फिर खर्चे लिखें!
              <br/><br/>
              <button className="btn btn-primary" onClick={() => setActiveTab('partners')}>Partners पर जाएं</button>
            </div>
          ) : (
            <>
              <button className="btn btn-primary btn-block mb-4" onClick={() => openExpenseSheet()}>+ नया खर्च जोड़ें</button>
              
              {expenses.length === 0 && <div className="text-center text-muted mt-4">इस महीने कोई खर्चा नहीं</div>}

              {expenses.map(exp => {
                const payer = partners.find(p => p.id === exp.paidById)?.name || 'Unknown';
                return (
                  <div key={exp.id} className="list-item mb-2" onClick={() => openExpenseSheet(exp)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                    <div className="flex justify-between items-center mb-1">
                      <div className="font-semi">{exp.itemName}</div>
                      <div className="font-bold text-gold">{formatRupees(exp.amount)}</div>
                    </div>
                    <div className="flex justify-between items-center text-xs text-muted">
                      <div>📅 {exp.date} • {exp.qty} Qty</div>
                      <div>💸 {payer} ने दिए</div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {activeTab === 'summary' && (
        <div>
          <div className="card card-gold mb-4 text-center">
            <div className="text-sm">कुल खर्च ({monthFilter})</div>
            <div className="text-2xl font-bold">{formatRupees(totalExpense)}</div>
          </div>

          <div className="section-title">किसका कितना हिसाब?</div>
          {summary.map(s => (
            <div key={s.name} className="list-item mb-2">
              <div className="font-semi">{s.name}</div>
              <div className={`font-bold ${s.balance >= 0 ? 'text-green' : 'text-red'}`}>
                {s.balance > 0 ? `लेना है: ` : s.balance < 0 ? `देना है: ` : `Clear: `}
                {formatRupees(Math.abs(s.balance))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'partners' && (
        <div>
          <button className="btn btn-primary btn-block mb-4" onClick={() => setPartnerSheet(true)}>+ Partner जोड़ें</button>
          {partners.map(p => (
            <div key={p.id} className="list-item mb-2">
              <span className="font-semi">👤 {p.name}</span>
              <button className="btn-icon-xs btn-red" onClick={() => deletePartner(p.id)}>🗑️</button>
            </div>
          ))}
        </div>
      )}

      {/* Expense Sheet */}
      <Sheet open={expenseSheet} onClose={() => setExpenseSheet(false)} title={editExpenseId ? "✏️ खर्च Edit करें" : "📝 नया खर्च"}>
        <div className="grid-2 gap-3 mb-3">
          <div className="input-group">
            <label className="input-label">तारीख</label>
            <input className="input" type="date" value={expDate} onChange={e => setExpDate(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label">कितने का? (₹)</label>
            <input className="input" type="number" value={expAmount} onChange={e => setExpAmount(e.target.value)} placeholder="500" />
          </div>
        </div>

        <div className="grid-2 gap-3 mb-3">
          <div className="input-group">
            <label className="input-label">सामान का नाम</label>
            <input className="input" value={expItem} onChange={e => setExpItem(e.target.value)} placeholder="राशन, सब्जी..." />
          </div>
          <div className="input-group">
            <label className="input-label">मात्रा (Qty)</label>
            <input className="input" type="number" value={expQty} onChange={e => setExpQty(e.target.value)} placeholder="1" />
          </div>
        </div>

        <div className="input-group mb-3">
          <label className="input-label">किसने पैसे दिए? (Paid By)</label>
          <select className="select" value={expPaidBy} onChange={e => setExpPaidBy(e.target.value)}>
            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="input-group mb-4">
          <label className="input-label">किनमें बंटेगा? (Split Between)</label>
          <div className="flex gap-2 mb-2">
            <button className={`btn btn-sm flex-1 ${expSplit === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setExpSplit('all')}>सब में बराबर (All)</button>
            <button className={`btn btn-sm flex-1 ${expSplit === 'custom' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setExpSplit('custom')}>कुछ लोगों में (Custom)</button>
          </div>
          {expSplit === 'custom' && (
            <div className="flex flex-wrap gap-2 mt-2">
              {partners.map(p => (
                <button 
                  key={p.id} 
                  className={`btn btn-sm ${selectedSplits.includes(p.id) ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => toggleSplitSelection(p.id)}
                >
                  {p.name} {selectedSplits.includes(p.id) ? '✓' : ''}
                </button>
              ))}
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

      {/* Partner Sheet */}
      <Sheet open={partnerSheet} onClose={() => setPartnerSheet(false)} title="👤 नया Partner">
        <div className="input-group">
          <label className="input-label">पार्टनर का नाम</label>
          <input className="input" value={partnerName} onChange={e => setPartnerName(e.target.value)} placeholder="नाम..." />
        </div>
        <button className="btn btn-primary btn-block" onClick={addPartner}>✓ जोड़ें</button>
      </Sheet>
    </div>
  );
}
