import { useState, useEffect, useCallback } from 'react';
import db, { formatQty } from '../db/db';
import { calcTrustScore, calcAdvanceBalance, formatRupees, formatDate } from '../utils/formulas';
import { nativeShare, generateBillText } from '../utils/export';
import { scheduleDisputeReminder } from '../utils/notifications';
import { showToast, Sheet, RatingStars, ConflictFlag } from '../components/UI';

export default function Vendor() {
  const [vendors,        setVendors]        = useState([]);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [customers,      setCustomers]      = useState([]);
  const [vendorEntries,  setVendorEntries]  = useState([]);
  const [disputes,       setDisputes]       = useState([]);
  const [advances,       setAdvances]       = useState([]);
  const [ratings,        setRatings]        = useState([]);
  const [addSheet,       setAddSheet]       = useState(false);
  const [editVendorSheet,setEditVendorSheet]= useState(null);
  const [ratingSheet,    setRatingSheet]    = useState(null);
  const [ratingVal,      setRatingVal]      = useState(3);
  const [sortDue,        setSortDue]        = useState(false);
  const [mode,           setMode]           = useState('customer'); // customer | vendor
  const [form,    setForm]    = useState({ name: '', phone: '', category: 'दूधवाला' });
  const [editForm,setEditForm]= useState({ name: '', phone: '', category: '' });
  // Advance management
  const [advanceSheet, setAdvanceSheet] = useState(false);
  const [advAmt,       setAdvAmt]       = useState('');
  const [advNote,      setAdvNote]      = useState('');
  // Bill preview
  const [billSheet, setBillSheet] = useState(null); // { vendor, items, total, amount }

  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const load = useCallback(async () => {
    const v = await db.vendors.toArray();
    setVendors(v);
    if (!selectedVendor && v.length > 0) setSelectedVendor(v[0]);
    const c = await db.members.toArray();
    setCustomers(c);
    const de = await db.vendorEntries.toArray();
    setVendorEntries(de);
    const disp = await db.disputes.toArray();
    setDisputes(disp);
    const adv = await db.advances.toArray();
    setAdvances(adv);
    const rat = await db.ratings.toArray();
    setRatings(rat);
  }, [selectedVendor]);

  useEffect(() => { load(); }, []);

  const addVendor = async () => {
    if (!form.name) { showToast('नाम जरूरी है', 'error'); return; }
    await db.vendors.add({ ...form, isActive: true });
    showToast(`${form.name} — जोड़ा गया ✓`);
    setAddSheet(false);
    setForm({ name: '', phone: '', category: 'दूधवाला' });
    load();
  };

  const updateVendor = async () => {
    if (!editVendorSheet || !editForm.name) return;
    await db.vendors.update(editVendorSheet.id, editForm);
    showToast(`${editForm.name} — updated ✓`);
    setEditVendorSheet(null);
    load();
  };

  const deleteVendor = async (id) => {
    if (!window.confirm('क्या इस vendor को delete करना है?')) return;
    await db.vendors.delete(id);
    await db.vendorEntries.where('vendorId').equals(id).delete();
    await db.advances.where('vendorId').equals(id).delete();
    if (selectedVendor?.id === id) setSelectedVendor(null);
    showToast('Vendor हटाया गया', 'info');
    load();
  };

  const markDelivered = async (vendorId, customerId, date) => {
    const existing = vendorEntries.find(e => e.vendorId === vendorId && e.customerId === customerId && e.date === date);
    if (existing) {
      await db.vendorEntries.update(existing.id, { delivered: !existing.delivered });
    } else {
      await db.vendorEntries.add({ vendorId, customerId, date, delivered: true });
    }
    // Conflict check
    const custEntry = await db.entries.filter(e => e.date === date && e.qty === 0).first();
    if (custEntry) {
      const existDisp = disputes.find(d => d.vendorId === vendorId && d.date === date && d.status === 'open');
      if (!existDisp) {
        const dispId = await db.disputes.add({ vendorId, customerId, date, status: 'open' });
        scheduleDisputeReminder(dispId, vendors.find(v => v.id === vendorId)?.name || 'Vendor',
          new Date(Date.now() + 48*3600*1000).toISOString());
        showToast('🚩 Conflict flag! 48h में resolve करें', 'info');
      }
    } else {
      showToast('Delivered mark ✓');
    }
    load();
  };

  const bulkMarkAll = async () => {
    const today = new Date().toISOString().split('T')[0];
    if (!selectedVendor) return;
    for (const cust of customers) {
      const existing = vendorEntries.find(e => e.vendorId === selectedVendor.id && e.customerId === cust.id && e.date === today);
      if (!existing) {
        await db.vendorEntries.add({ vendorId: selectedVendor.id, customerId: cust.id, date: today, delivered: true });
      }
    }
    showToast(`✓ सभी ${customers.length} customers के लिए Delivered mark किया`);
    load();
  };

  // Generate monthly bill with accurate calculation
  const generateMonthlyBill = async (vendor) => {
    const items = await db.items.filter(i => !!i.isActive).toArray();
    const billLines = [];
    let grandTotal = 0;

    for (const item of items) {
      const entries = await db.entries
        .where('itemId').equals(item.id)
        .filter(e => e.date.startsWith(monthStr))
        .toArray();
      if (!entries.length) continue;

      const qty = entries.reduce((s, e) => s + (e.qty || 0), 0);
      if (qty === 0) continue;

      const rates = await db.rates.where('itemId').equals(item.id)
        .filter(r => r.effectiveFrom <= `${monthStr}-31`).toArray();
      const rate = rates.length > 0 ? rates[rates.length - 1].rate : 0;
      const amount = Math.round(qty * rate * 100) / 100;
      grandTotal += amount;

      billLines.push({
        name: item.name, emoji: item.emoji, unit: item.unit,
        qty, rate, amount, daysCount: new Set(entries.filter(e => e.qty > 0).map(e => e.date)).size,
      });
    }

    setBillSheet({ vendor, lines: billLines, grandTotal });
  };

  const shareBill = async () => {
    if (!billSheet) return;
    const lines = billSheet.lines.map(l =>
      `${l.emoji} ${l.name}: ${formatQty(l.qty, l.unit)} × ₹${l.unit === 'ml' ? (l.rate * 1000).toFixed(2) + '/L' : l.rate + '/' + l.unit} = ${formatRupees(l.amount)} (${l.daysCount} दिन)`
    ).join('\n');
    const text = `🏠 घर का हिसाब\n📅 ${monthStr}\n👤 ${billSheet.vendor.name}\n\n${lines}\n\n💰 कुल: ${formatRupees(billSheet.grandTotal)}`;
    const result = await nativeShare(text, 'Monthly Bill');
    if (result === 'clipboard') showToast('Bill copy हो गई — WhatsApp पर paste करें!', 'info');
    else if (result) showToast('Bill shared!');
  };

  const submitRating = async () => {
    if (!ratingSheet) return;
    await db.ratings.add({ vendorId: ratingSheet.id, score: ratingVal, month: monthStr });
    showToast(`${ratingSheet.name} को ${ratingVal}⭐ rating दी`);
    setRatingSheet(null); load();
  };

  const resolveDispute = async (id) => {
    await db.disputes.update(id, { status: 'resolved', resolvedAt: new Date().toISOString() });
    showToast('Dispute resolve हो गया ✓', 'info'); load();
  };

  const addAdvance = async () => {
    if (!advAmt || !selectedVendor) return;
    await db.advances.add({
      vendorId: selectedVendor.id,
      amount: +advAmt,
      date: new Date().toISOString().split('T')[0],
      note: advNote,
      balance: +advAmt,
    });
    showToast(`₹${advAmt} advance जोड़ा ✓`);
    setAdvanceSheet(false); setAdvAmt(''); setAdvNote('');
    load();
  };

  const customerList = customers
    .map(c => {
      const adv = advances.filter(a => a.vendorId === selectedVendor?.id).reduce((s, a) => s + a.amount, 0);
      return { ...c, due: adv };
    })
    .sort((a, b) => sortDue ? b.due - a.due : 0);

  const openDisputes = disputes.filter(d => d.status === 'open');
  const vendorRatings = ratings.filter(r => r.vendorId === selectedVendor?.id);
  const trustScore = calcTrustScore(vendorRatings);
  const vendorAdvances = advances.filter(a => a.vendorId === selectedVendor?.id);
  const totalAdvance = vendorAdvances.reduce((s, a) => s + a.amount, 0);

  // Past 30 days delivery history for vendor mode
  const recentDeliveries = vendorEntries
    .filter(e => e.vendorId === selectedVendor?.id)
    .sort((a, b) => b.date?.localeCompare(a.date))
    .slice(0, 30);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">🧑‍💼 विक्रेता</div>
        <div className="flex gap-2">
          <button className={`btn btn-sm ${mode === 'customer' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('customer')}>Customer</button>
          <button className={`btn btn-sm ${mode === 'vendor' ? 'btn-secondary' : 'btn-outline'}`} onClick={() => setMode('vendor')}>Vendor</button>
          <button className="btn btn-primary btn-sm btn-icon" onClick={() => setAddSheet(true)}>+</button>
        </div>
      </div>

      {/* Vendor Selector */}
      {vendors.length > 0 && (
        <div className="flex gap-2 mb-4 scroll-x">
          {vendors.map(v => (
            <button key={v.id} style={{ flexShrink: 0 }}
              className={`btn btn-sm ${selectedVendor?.id === v.id ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSelectedVendor(v)}>
              {v.category} {v.name}
            </button>
          ))}
        </div>
      )}

      {vendors.length === 0 ? (
        <div className="empty-state">
          <span className="empty-emoji">🧑‍💼</span>
          <div className="empty-title">कोई Vendor नहीं</div>
          <div className="empty-desc">+ बटन से vendor जोड़ें</div>
          <button className="btn btn-primary" onClick={() => setAddSheet(true)}>+ Vendor जोड़ें</button>
        </div>
      ) : selectedVendor && (
        <>
          {/* Vendor Info Card */}
          <div className="card card-gradient mb-4">
            <div className="flex justify-between items-start">
              <div style={{ flex: 1 }}>
                <div className="font-bold text-lg">{selectedVendor.name}</div>
                <div className="text-xs text-muted">{selectedVendor.category} {selectedVendor.phone && `• 📱 ${selectedVendor.phone}`}</div>
                <div className="flex items-center gap-2 mt-2">
                  <RatingStars value={Math.round(trustScore)} readOnly />
                  <span className="text-sm text-gold">{trustScore > 0 ? `${trustScore}/5` : 'No rating yet'}</span>
                </div>
                {totalAdvance > 0 && (
                  <div className="text-xs mt-2" style={{ color: 'var(--clr-teal)' }}>
                    💵 Advance: {formatRupees(totalAdvance)}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setRatingSheet(selectedVendor)}>⭐ Rate</button>
                <button className="btn btn-outline btn-sm" onClick={() => generateMonthlyBill(selectedVendor)}>📋 Bill</button>
                <button className="btn btn-outline btn-sm" onClick={() => setAdvanceSheet(true)}>💵 Advance</button>
                <button className="btn btn-outline btn-sm" onClick={() => { setEditForm({ name: selectedVendor.name, phone: selectedVendor.phone || '', category: selectedVendor.category }); setEditVendorSheet(selectedVendor); }}>✏️ Edit</button>
              </div>
            </div>
          </div>

          {/* Conflict Disputes */}
          {openDisputes.length > 0 && (
            <div className="card card-red mb-4">
              <div className="section-title" style={{ color: 'var(--clr-red)' }}>🚩 Open Disputes ({openDisputes.length})</div>
              {openDisputes.map(d => (
                <div key={d.id} className="flex justify-between items-center mb-2">
                  <div>
                    <div className="text-sm font-semi">{formatDate(d.date)}</div>
                    <div className="text-xs text-red">Vendor: Delivered | Customer: Not Received</div>
                  </div>
                  <button className="btn btn-green btn-sm" onClick={() => resolveDispute(d.id)}>Resolve</button>
                </div>
              ))}
            </div>
          )}

          {/* CUSTOMER MODE */}
          {mode === 'customer' && (
            <div>
              <div className="section-title">आज की Delivery Status</div>
              {customers.length === 0 ? (
                <div className="text-muted text-sm p-4">कोई customer नहीं (Settings → Family में members जोड़ें)</div>
              ) : (
                <>
                  <button className="btn btn-green btn-block mb-3" onClick={bulkMarkAll}>
                    ✓ सभी Delivered (Bulk)
                  </button>
                  <div className="flex gap-2 mb-3">
                    <button className={`btn btn-sm ${!sortDue ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSortDue(false)}>A-Z</button>
                    <button className={`btn btn-sm ${sortDue ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSortDue(true)}>बकाया ↓</button>
                  </div>
                  {customerList.map(cust => {
                    const today = new Date().toISOString().split('T')[0];
                    const delivered = vendorEntries.find(e => e.vendorId === selectedVendor.id && e.customerId === cust.id && e.date === today)?.delivered;
                    const hasConflict = openDisputes.some(d => d.customerId === cust.id && d.vendorId === selectedVendor.id);
                    return (
                      <div key={cust.id} className="list-item">
                        <div style={{ flex: 1 }}>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{cust.name}</span>
                            {hasConflict && <ConflictFlag show />}
                          </div>
                          {cust.due > 0 && <div className="text-xs text-orange">बाकी: {formatRupees(cust.due)}</div>}
                        </div>
                        <button
                          className={`btn btn-sm ${delivered ? 'btn-green' : 'btn-outline'}`}
                          onClick={() => markDelivered(selectedVendor.id, cust.id, today)}>
                          {delivered ? '✓ Delivered' : 'Mark'}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* VENDOR MODE — Delivery History */}
          {mode === 'vendor' && (
            <div>
              <div className="section-title">मेरी Delivery Records (Last 30)</div>
              {recentDeliveries.length === 0 ? (
                <div className="text-muted text-sm">अभी कोई entry नहीं</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {recentDeliveries.map((e, i) => {
                    const custName = customers.find(c => c.id === e.customerId)?.name || 'Customer';
                    return (
                      <div key={i} className="list-item" style={{ padding: '10px 14px' }}>
                        <div style={{ flex: 1 }}>
                          <div className="text-sm font-semi">{formatDate(e.date)}</div>
                          <div className="text-xs text-muted">{custName}</div>
                        </div>
                        <span className={`badge ${e.delivered ? 'badge-green' : 'badge-red'}`}>
                          {e.delivered ? '✓ Delivered' : '✗ Missed'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Advance History for this vendor */}
              {vendorAdvances.length > 0 && (
                <div className="card mt-4" style={{ padding: 14 }}>
                  <div className="section-title" style={{ marginBottom: 8 }}>💵 Advance History</div>
                  {vendorAdvances.sort((a, b) => b.date?.localeCompare(a.date)).map((a, i) => (
                    <div key={i} className="flex justify-between items-center" style={{ marginBottom: 6 }}>
                      <div>
                        <div className="text-sm">{a.note || 'Advance'}</div>
                        <div className="text-xs text-muted">{a.date}</div>
                      </div>
                      <div className="font-bold text-green">+{formatRupees(a.amount)}</div>
                    </div>
                  ))}
                  <div className="split-total" style={{ marginTop: 8 }}>कुल Advance: {formatRupees(totalAdvance)}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Add Vendor Sheet */}
      <Sheet open={addSheet} onClose={() => setAddSheet(false)} title="🧑‍💼 Vendor जोड़ें">
        <div className="input-group">
          <label className="input-label">नाम *</label>
          <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="जैसे: Ramesh Doodhwala" />
        </div>
        <div className="input-group">
          <label className="input-label">Phone</label>
          <input className="input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="9876543210" />
        </div>
        <div className="input-group">
          <label className="input-label">Category</label>
          <select className="select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {['दूधवाला', 'पानीवाला', 'सब्जीवाला', 'किराना', 'Courier', 'अन्य'].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-block" onClick={addVendor}>✓ जोड़ें</button>
      </Sheet>

      {/* Edit Vendor Sheet */}
      <Sheet open={!!editVendorSheet} onClose={() => setEditVendorSheet(null)} title={`✏️ ${editVendorSheet?.name} Edit करें`}>
        <div className="input-group">
          <label className="input-label">नाम</label>
          <input className="input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="input-group">
          <label className="input-label">Phone</label>
          <input className="input" type="tel" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div className="input-group">
          <label className="input-label">Category</label>
          <select className="select" value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}>
            {['दूधवाला', 'पानीवाला', 'सब्जीवाला', 'किराना', 'Courier', 'अन्य'].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex gap-2 mt-3">
          <button className="btn btn-danger flex-1" onClick={() => { deleteVendor(editVendorSheet.id); setEditVendorSheet(null); }}>🗑️ Delete</button>
          <button className="btn btn-primary flex-1" onClick={updateVendor}>✓ Update</button>
        </div>
      </Sheet>

      {/* Rating Sheet */}
      <Sheet open={!!ratingSheet} onClose={() => setRatingSheet(null)} title={`⭐ ${ratingSheet?.name} को Rate करें`}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <RatingStars value={ratingVal} onChange={setRatingVal} />
          <div className="text-muted text-sm">{['', 'बहुत बुरा', 'बुरा', 'ठीक', 'अच्छा', 'बहुत अच्छा'][ratingVal]}</div>
          <button className="btn btn-primary btn-block" onClick={submitRating}>✓ Rating दें</button>
        </div>
      </Sheet>

      {/* Advance Sheet */}
      <Sheet open={advanceSheet} onClose={() => setAdvanceSheet(false)} title="💵 Advance जोड़ें">
        <div className="text-sm text-muted mb-3">
          Vendor: <b>{selectedVendor?.name}</b>
          {totalAdvance > 0 && <span className="text-teal"> • अभी तक: {formatRupees(totalAdvance)}</span>}
        </div>
        <div className="input-group">
          <label className="input-label">Amount (₹)</label>
          <input className="input" type="number" value={advAmt} onChange={e => setAdvAmt(e.target.value)} placeholder="जैसे: 500" />
        </div>
        <div className="input-group">
          <label className="input-label">Note</label>
          <input className="input" type="text" value={advNote} onChange={e => setAdvNote(e.target.value)} placeholder="जैसे: July advance" />
        </div>
        <button className="btn btn-primary btn-block" onClick={addAdvance}>✓ Advance Add करें</button>
      </Sheet>

      {/* Bill Preview Sheet */}
      <Sheet open={!!billSheet} onClose={() => setBillSheet(null)} title={`📋 ${billSheet?.vendor?.name} — ${monthStr} Bill`}>
        {billSheet && (
          <>
            {billSheet.lines.length === 0 ? (
              <div className="text-muted text-sm text-center py-4">इस महीने कोई entry नहीं</div>
            ) : (
              <>
                {billSheet.lines.map((l, i) => (
                  <div key={i} className="split-row">
                    <div>
                      <div className="text-sm font-semi">{l.emoji} {l.name}</div>
                      <div className="text-xs text-muted">
                        {formatQty(l.qty, l.unit)} × ₹{l.unit === 'ml' ? (l.rate * 1000).toFixed(2) + '/L' : l.rate + '/' + l.unit}
                        <span style={{ marginLeft: 6 }}>({l.daysCount} दिन)</span>
                      </div>
                    </div>
                    <div className="font-bold text-gold">{formatRupees(l.amount)}</div>
                  </div>
                ))}
                <div className="split-total" style={{ fontSize: '1.1rem' }}>
                  कुल: {formatRupees(billSheet.grandTotal)}
                </div>
                <button className="btn btn-primary btn-block mt-3" onClick={shareBill}>
                  📱 WhatsApp पर Share करें
                </button>
              </>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
