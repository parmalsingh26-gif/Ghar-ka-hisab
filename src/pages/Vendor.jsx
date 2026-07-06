import { useState, useEffect, useCallback } from 'react';
import db from '../db/db';
import { calcTrustScore, calcAdvanceBalance, formatRupees, formatDate } from '../utils/formulas';
import { nativeShare, generateBillText, exportToPDF } from '../utils/export';
import { scheduleDisputeReminder } from '../utils/notifications';
import { showToast, Sheet, RatingStars, ConflictFlag, StatCard } from '../components/UI';

export default function Vendor() {
  const [vendors, setVendors]         = useState([]);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [customers, setCustomers]     = useState([]);
  const [vendorEntries, setVendorEntries] = useState([]);
  const [disputes, setDisputes]       = useState([]);
  const [advances, setAdvances]       = useState([]);
  const [ratings, setRatings]         = useState([]);
  const [addSheet, setAddSheet]       = useState(false);
  const [ratingSheet, setRatingSheet] = useState(null);
  const [ratingVal, setRatingVal]     = useState(3);
  const [sortDue, setSortDue]         = useState(false);
  const [filterMode, setFilterMode]   = useState('all'); // all | conflict | due
  const [form, setForm] = useState({ name:'', phone:'', category:'दूधवाला' });
  const [mode, setMode] = useState('customer'); // customer | vendor
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
    setForm({ name:'', phone:'', category:'दूधवाला' });
    load();
  };

  const markDelivered = async (vendorId, customerId, date) => {
    const existing = vendorEntries.find(e => e.vendorId===vendorId && e.customerId===customerId && e.date===date);
    if (existing) {
      await db.vendorEntries.update(existing.id, { delivered: !existing.delivered });
    } else {
      await db.vendorEntries.add({ vendorId, customerId, date, delivered: true });
    }
    // Check for conflict: if customer has "not received" (qty=0) but vendor says delivered
    const custEntry = await db.entries.filter(e => e.date === date && e.qty === 0).first();
    if (custEntry) {
      const existDisp = disputes.find(d => d.vendorId===vendorId && d.date===date && d.status==='open');
      if (!existDisp) {
        const dispId = await db.disputes.add({ vendorId, customerId, date, status:'open' });
        scheduleDisputeReminder(dispId, vendors.find(v=>v.id===vendorId)?.name || 'Vendor',
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
      await db.vendorEntries.add({ vendorId: selectedVendor.id, customerId: cust.id, date: today, delivered: true });
    }
    showToast(`✓ सभी ${customers.length} customers के लिए Delivered mark किया`);
    load();
  };

  const generateMonthlyBill = async (vendor) => {
    // Get all entries for this month
    const entries = await db.entries
      .filter(e => e.date.startsWith(monthStr))
      .toArray();
    const rates = await db.rates.toArray();
    const currentRate = rates.filter(r => r.effectiveFrom <= `${monthStr}-31`).pop()?.rate || 0;
    const total = entries.reduce((s,e) => s + (e.qty||0), 0);
    const text = generateBillText({
      vendorName: vendor.name,
      month: monthStr,
      entries: entries.map(e=>({date:e.date, qty:e.qty})),
      rate: currentRate,
      total: (total * currentRate).toFixed(2),
    });
    const result = await nativeShare(text, 'Monthly Bill');
    if (result === 'clipboard') showToast('Bill copy हो गई — WhatsApp पर paste करें!', 'info');
    else if (result) showToast('Bill shared!');
  };

  const submitRating = async () => {
    if (!ratingSheet) return;
    await db.ratings.add({ vendorId: ratingSheet.id, score: ratingVal, month: monthStr });
    showToast(`${ratingSheet.name} को ${ratingVal}⭐ rating दी`);
    setRatingSheet(null);
    load();
  };

  const resolveDispute = async (id) => {
    await db.disputes.update(id, { status:'resolved', resolvedAt: new Date().toISOString() });
    showToast('Dispute resolve हो गया ✓', 'info');
    load();
  };

  // Build customer list with dues (simple sort)
  const customerList = customers
    .map(c => {
      const adv = advances.filter(a => a.vendorId === selectedVendor?.id).reduce((s,a)=>s+a.amount,0);
      return { ...c, due: adv }; // Simplified: real due would subtract bills
    })
    .sort((a,b) => sortDue ? b.due - a.due : 0);

  const openDisputes = disputes.filter(d => d.status === 'open');
  const vendorRatings = ratings.filter(r => r.vendorId === selectedVendor?.id);
  const trustScore = calcTrustScore(vendorRatings);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">🧑‍💼 विक्रेता</div>
        <div className="flex gap-2">
          {/* Mode Toggle */}
          <button className={`btn btn-sm ${mode==='customer'?'btn-primary':'btn-outline'}`} onClick={() => setMode('customer')}>Customer</button>
          <button className={`btn btn-sm ${mode==='vendor'?'btn-secondary':'btn-outline'}`} onClick={() => setMode('vendor')}>Vendor</button>
          <button className="btn btn-primary btn-sm btn-icon" onClick={() => setAddSheet(true)}>+</button>
        </div>
      </div>

      {/* Vendor Selector */}
      {vendors.length > 0 && (
        <div className="flex gap-2 mb-4 scroll-x">
          {vendors.map(v => (
            <button key={v.id} style={{flexShrink:0}}
              className={`btn btn-sm ${selectedVendor?.id===v.id?'btn-primary':'btn-outline'}`}
              onClick={() => setSelectedVendor(v)}
            >{v.category} {v.name}</button>
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
          {/* Trust Score */}
          <div className="card card-gradient mb-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-bold text-lg">{selectedVendor.name}</div>
                <div className="text-xs text-muted">{selectedVendor.category} • {selectedVendor.phone}</div>
                <div className="flex items-center gap-2 mt-2">
                  <RatingStars value={Math.round(trustScore)} readOnly />
                  <span className="text-sm text-gold">{trustScore > 0 ? `${trustScore}/5` : 'No rating'}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setRatingSheet(selectedVendor)}>⭐ Rate</button>
                <button className="btn btn-outline btn-sm" onClick={() => generateMonthlyBill(selectedVendor)}>📋 Bill</button>
              </div>
            </div>
          </div>

          {/* Conflict Disputes */}
          {openDisputes.length > 0 && (
            <div className="card card-red mb-4">
              <div className="section-title" style={{color:'var(--clr-red)'}}>🚩 Open Disputes ({openDisputes.length})</div>
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

          {/* CUSTOMER MODE: Delivery tracking */}
          {mode === 'customer' && (
            <div>
              <div className="section-title">आज की Delivery Status</div>
              {customers.length === 0 ? (
                <div className="text-muted text-sm p-4">कोई customer नहीं (Settings में family members जोड़ें)</div>
              ) : (
                <>
                  <button className="btn btn-green btn-block mb-3" onClick={bulkMarkAll}>
                    ✓ सभी Delivered (Bulk)
                  </button>
                  <div className="flex gap-2 mb-3">
                    <button className={`btn btn-sm ${!sortDue?'btn-primary':'btn-outline'}`} onClick={()=>setSortDue(false)}>A-Z</button>
                    <button className={`btn btn-sm ${sortDue?'btn-primary':'btn-outline'}`} onClick={()=>setSortDue(true)}>बकाया ↓</button>
                  </div>
                  {customerList.map(cust => {
                    const today = new Date().toISOString().split('T')[0];
                    const delivered = vendorEntries.find(e => e.vendorId===selectedVendor.id && e.customerId===cust.id && e.date===today)?.delivered;
                    const hasConflict = openDisputes.some(d => d.customerId===cust.id && d.vendorId===selectedVendor.id);
                    return (
                      <div key={cust.id} className="list-item">
                        <div style={{flex:1}}>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{cust.name}</span>
                            {hasConflict && <ConflictFlag show />}
                          </div>
                          {cust.due > 0 && <div className="text-xs text-orange">बाकी: {formatRupees(cust.due)}</div>}
                        </div>
                        <button
                          className={`btn btn-sm ${delivered?'btn-green':'btn-outline'}`}
                          onClick={() => markDelivered(selectedVendor.id, cust.id, today)}
                        >
                          {delivered ? '✓ Delivered' : 'Mark'}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* VENDOR MODE: My deliveries */}
          {mode === 'vendor' && (
            <div>
              <div className="section-title">मेरी Delivery Records</div>
              {vendorEntries.filter(e => e.vendorId === selectedVendor.id).length === 0 ? (
                <div className="text-muted text-sm">अभी कोई entry नहीं</div>
              ) : (
                vendorEntries
                  .filter(e => e.vendorId === selectedVendor.id)
                  .sort((a,b)=>b.date.localeCompare(a.date))
                  .slice(0,20)
                  .map((e,i) => (
                    <div key={i} className="list-item">
                      <div style={{flex:1}}>
                        <div className="text-sm font-semi">{formatDate(e.date)}</div>
                      </div>
                      <span className={`badge ${e.delivered?'badge-green':'badge-red'}`}>
                        {e.delivered ? '✓ Delivered' : '✗ Missed'}
                      </span>
                    </div>
                  ))
              )}
            </div>
          )}
        </>
      )}

      {/* Add Vendor Sheet */}
      <Sheet open={addSheet} onClose={() => setAddSheet(false)} title="🧑‍💼 Vendor जोड़ें">
        <div className="input-group">
          <label className="input-label">नाम *</label>
          <input className="input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="जैसे: Ramesh Doodhwala" />
        </div>
        <div className="input-group">
          <label className="input-label">Phone</label>
          <input className="input" type="tel" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="9876543210" />
        </div>
        <div className="input-group">
          <label className="input-label">Category</label>
          <select className="select" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
            {['दूधवाला','पानीवाला','सब्जीवाला','किराना','Courier','अन्य'].map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-block" onClick={addVendor}>✓ जोड़ें</button>
      </Sheet>

      {/* Rating Sheet */}
      <Sheet open={!!ratingSheet} onClose={() => setRatingSheet(null)} title={`⭐ ${ratingSheet?.name} को Rate करें`}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:24}}>
          <RatingStars value={ratingVal} onChange={setRatingVal} />
          <div className="text-muted text-sm">{['','बहुत बुरा','बुरा','ठीक','अच्छा','बहुत अच्छा'][ratingVal]}</div>
          <button className="btn btn-primary btn-block" onClick={submitRating}>✓ Rating दें</button>
        </div>
      </Sheet>
    </div>
  );
}
