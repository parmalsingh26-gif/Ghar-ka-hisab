import { useState, useEffect, useCallback } from 'react';
import db from '../db/db';
import { calcDailyUsage, calcSuggestedQty, calcDaysRemaining, daysUntilExpiry, formatDate, formatRupees } from '../utils/formulas';
import { scheduleExpiryAlert } from '../utils/notifications';
import { nativeShare, generateGroceryText, exportToPDF } from '../utils/export';
import { showToast, AutocompleteInput, Sheet } from '../components/UI';

const CATEGORIES = ['अनाज','दाल','तेल','मसाले','सब्जी','फल','डेयरी','Snacks','अन्य'];

export default function Grocery() {
  const [items, setItems]           = useState([]);
  const [addSheet, setAddSheet]     = useState(false);
  const [editSheet, setEditSheet]   = useState(null); // item being edited
  const [detailItem, setDetailItem] = useState(null);
  const [filterCat, setFilterCat]   = useState('');
  const [sortBy, setSortBy]         = useState('name');
  const [form, setForm] = useState({
    name: '', qty: '', unit: 'Kg', price: '', purchaseDate: new Date().toISOString().split('T')[0],
    expiryDate: '', category: 'अनाज'
  });
  const [suggestions, setSuggestions] = useState([]);

  const load = useCallback(async () => {
    const all = await db.grocery.toArray();
    setItems(all);
    // Build autocomplete suggestions from past item names
    const names = [...new Set(all.map(i => i.name))];
    setSuggestions(names);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.name || !form.qty) { showToast('नाम और मात्रा जरूरी है', 'error'); return; }
    const id = await db.grocery.add({
      name: form.name, qty: +form.qty, unit: form.unit, price: +form.price || 0,
      purchaseDate: form.purchaseDate, expiryDate: form.expiryDate || null,
      category: form.category,
    });
    // Price history
    await db.priceHistory.add({ groceryId: id, itemName: form.name, price: +form.price || 0, date: form.purchaseDate });
    // Expiry alert
    if (form.expiryDate) scheduleExpiryAlert(id, form.name, form.expiryDate);
    showToast(`${form.name} — जोड़ा गया ✓`);
    setAddSheet(false);
    setForm({ name:'', qty:'', unit:'Kg', price:'', purchaseDate: new Date().toISOString().split('T')[0], expiryDate:'', category:'अनाज' });
    load();
  };

  const handleDelete = async (id) => {
    await db.grocery.delete(id);
    showToast('हटा दिया गया', 'info');
    setDetailItem(null);
    load();
  };

  const openEdit = (item) => {
    setForm({
      name: item.name,
      qty: item.qty.toString(),
      unit: item.unit,
      price: item.price.toString(),
      purchaseDate: item.purchaseDate,
      expiryDate: item.expiryDate || '',
      category: item.category || 'अनाज',
    });
    setEditSheet(item);
  };

  const handleEdit = async () => {
    if (!form.name || !form.qty) { showToast('नाम और मात्रा जरूरी है', 'error'); return; }
    await db.grocery.update(editSheet.id, {
      name: form.name, qty: +form.qty, unit: form.unit,
      price: +form.price || 0, purchaseDate: form.purchaseDate,
      expiryDate: form.expiryDate || null, category: form.category,
    });
    showToast(`${form.name} — update हो गया ✓`);
    setEditSheet(null);
    setDetailItem(null);
    load();
  };

  const handleShare = async () => {
    const text = generateGroceryText(filtered);
    const result = await nativeShare(text, 'Grocery List');
    if (result === 'clipboard') showToast('List copy हो गई — WhatsApp पर paste करें!', 'info');
    else if (result) showToast('Shared!');
  };

  const handleExportPDF = async () => {
    const rows = filtered.map(it => ({
      'नाम': it.name, 'मात्रा': `${it.qty} ${it.unit}`, 'कीमत': formatRupees(it.price),
      'खरीदी': formatDate(it.purchaseDate), 'Expiry': it.expiryDate ? formatDate(it.expiryDate) : '-',
      'Category': it.category,
    }));
    await exportToPDF('Grocery List', rows);
    showToast('PDF save हो गई');
  };

  // Consumption forecast using formula
  const getForecast = (item) => {
    // Use purchase date to today as "days consumed"
    const purchasedOn = new Date(item.purchaseDate + 'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    const days = Math.max(1, Math.round((today - purchasedOn) / 86400000));
    const dailyUsage = calcDailyUsage(item.qty, days);
    const remaining  = calcDaysRemaining(item.qty, dailyUsage);
    const suggested30 = calcSuggestedQty(dailyUsage, 30);
    return { dailyUsage: dailyUsage.toFixed(3), remaining, suggested30: suggested30.toFixed(2) };
  };

  // Price history for item
  const [priceHistory, setPriceHistory] = useState([]);
  useEffect(() => {
    if (detailItem) {
      db.priceHistory.where('itemName').equals(detailItem.name).toArray().then(setPriceHistory);
    }
  }, [detailItem]);

  const filtered = items
    .filter(it => !filterCat || it.category === filterCat)
    .sort((a, b) => {
      if (sortBy === 'name')   return a.name.localeCompare(b.name);
      if (sortBy === 'expiry') return (a.expiryDate || 'z').localeCompare(b.expiryDate || 'z');
      if (sortBy === 'price')  return b.price - a.price;
      return 0;
    });

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">🛒 किराना</div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm btn-icon" onClick={handleShare} title="Share">📤</button>
          <button className="btn btn-outline btn-sm btn-icon" onClick={handleExportPDF} title="PDF">📄</button>
          <button className="btn btn-primary btn-sm" onClick={() => setAddSheet(true)}>+ Add</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 scroll-x">
        <button className={`btn btn-sm ${!filterCat ? 'btn-primary' : 'btn-outline'}`} style={{flexShrink:0}} onClick={() => setFilterCat('')}>
          सभी
        </button>
        {CATEGORIES.map(c => (
          <button key={c} style={{flexShrink:0}}
            className={`btn btn-sm ${filterCat===c ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilterCat(filterCat===c ? '' : c)}>{c}</button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <select className="select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="name">A-Z</option>
          <option value="expiry">Expiry</option>
          <option value="price">Price</option>
        </select>
      </div>

      {/* Items List */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-emoji">🛒</span>
          <div className="empty-title">कोई item नहीं</div>
          <div className="empty-desc">+ Add बटन से पहला item जोड़ें</div>
        </div>
      ) : (
        filtered.map(it => {
          const expDays = daysUntilExpiry(it.expiryDate);
          const isExpiring = expDays != null && expDays <= 3;
          return (
            <div key={it.id} className={`list-item ${isExpiring ? 'card-red' : ''}`} onClick={() => setDetailItem(it)}>
              <div style={{ flex: 1 }}>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{it.name}</span>
                  <span className="badge badge-violet" style={{fontSize:'0.65rem'}}>{it.category}</span>
                  {isExpiring && <span className="badge badge-red">⚠️ {expDays}d</span>}
                </div>
                <div className="text-xs text-muted">{it.qty} {it.unit} • {formatRupees(it.price)} • {formatDate(it.purchaseDate)}</div>
              </div>
              <span style={{ fontSize: '1.2rem' }}>›</span>
            </div>
          );
        })
      )}

      {/* Add Item Sheet */}
      <Sheet open={addSheet} onClose={() => setAddSheet(false)} title="🛒 नया Item जोड़ें">
        <div className="input-group">
          <label className="input-label">Item का नाम *</label>
          <AutocompleteInput
            value={form.name}
            onChange={v => setForm(f=>({...f, name:v}))}
            suggestions={suggestions}
            placeholder="जैसे: आटा, चावल..."
          />
        </div>
        <div className="grid-2 gap-3">
          <div className="input-group">
            <label className="input-label">मात्रा *</label>
            <input className="input" type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} placeholder="5" />
          </div>
          <div className="input-group">
            <label className="input-label">Unit</label>
            <select className="select" value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))}>
              {['Kg','Litre','Packet','Piece','Dozen','Box','Can'].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2 gap-3">
          <div className="input-group">
            <label className="input-label">कीमत (₹)</label>
            <input className="input" type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="200" />
          </div>
          <div className="input-group">
            <label className="input-label">Category</label>
            <select className="select" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2 gap-3">
          <div className="input-group">
            <label className="input-label">खरीदी तारीख</label>
            <input className="input" type="date" value={form.purchaseDate} onChange={e=>setForm(f=>({...f,purchaseDate:e.target.value}))} />
          </div>
          <div className="input-group">
            <label className="input-label">Expiry Date (optional)</label>
            <input className="input" type="date" value={form.expiryDate} onChange={e=>setForm(f=>({...f,expiryDate:e.target.value}))} />
          </div>
        </div>
        <button className="btn btn-primary btn-block" onClick={handleAdd}>✓ जोड़ें</button>
      </Sheet>

      {/* Item Detail Sheet */}
      <Sheet open={!!detailItem} onClose={() => setDetailItem(null)} title={detailItem ? `${detailItem.name} — Details` : ''}>
        {detailItem && (() => {
          const fc = getForecast(detailItem);
          const expDays = daysUntilExpiry(detailItem.expiryDate);
          return (
            <div>
              <div className="grid-2 gap-3 mb-4">
                <div className="stat-card"><div className="stat-value text-gold">{fc.dailyUsage}</div><div className="stat-label">Daily Usage ({detailItem.unit}/day)</div></div>
                <div className="stat-card"><div className="stat-value text-teal">{fc.remaining === Infinity ? '∞' : fc.remaining}</div><div className="stat-label">दिन और चलेगा</div></div>
                <div className="stat-card"><div className="stat-value text-violet">{fc.suggested30} {detailItem.unit}</div><div className="stat-label">30 दिन के लिए चाहिए</div></div>
                {detailItem.expiryDate && (
                  <div className={`stat-card ${expDays != null && expDays <= 3 ? 'card-red' : ''}`}>
                    <div className={`stat-value ${expDays != null && expDays <= 0 ? 'text-red' : 'text-orange'}`}>
                      {expDays != null ? (expDays <= 0 ? 'Expired!' : `${expDays}d`) : '-'}
                    </div>
                    <div className="stat-label">Expiry में</div>
                  </div>
                )}
              </div>
              {/* Price History */}
              {priceHistory.length > 0 && (
                <div className="card mb-4">
                  <div className="section-title">💰 Price History</div>
                  {priceHistory.map((ph, i) => (
                    <div key={i} className="split-row">
                      <span className="text-sm text-muted">{formatDate(ph.date)}</span>
                      <span className="font-bold text-gold">{formatRupees(ph.price)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 mt-2">
                <button className="btn btn-outline flex-1" onClick={() => openEdit(detailItem)}>✏️ Edit</button>
                <button className="btn btn-danger flex-1" onClick={() => handleDelete(detailItem.id)}>🗑️ हटाएं</button>
              </div>
            </div>
          );
        })()}
      </Sheet>

      {/* Edit Item Sheet */}
      <Sheet open={!!editSheet} onClose={() => setEditSheet(null)} title={`✏️ ${editSheet?.name} Edit करें`}>
        <div className="grid-2 gap-3 mb-3">
          <div className="input-group">
            <label className="input-label">मात्रा *</label>
            <input className="input" type="number" value={form.qty} onChange={e => setForm(f => ({...f, qty: e.target.value}))} />
          </div>
          <div className="input-group">
            <label className="input-label">Unit</label>
            <select className="select" value={form.unit} onChange={e => setForm(f => ({...f, unit: e.target.value}))}>
              {['Kg','Litre','Packet','Piece','Dozen','Box','Can'].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2 gap-3 mb-3">
          <div className="input-group">
            <label className="input-label">कीमत (₹)</label>
            <input className="input" type="number" value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} />
          </div>
          <div className="input-group">
            <label className="input-label">Category</label>
            <select className="select" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2 gap-3 mb-3">
          <div className="input-group">
            <label className="input-label">खरीदी तारीख</label>
            <input className="input" type="date" value={form.purchaseDate} onChange={e => setForm(f => ({...f, purchaseDate: e.target.value}))} />
          </div>
          <div className="input-group">
            <label className="input-label">Expiry Date</label>
            <input className="input" type="date" value={form.expiryDate} onChange={e => setForm(f => ({...f, expiryDate: e.target.value}))} />
          </div>
        </div>
        <button className="btn btn-primary btn-block" onClick={handleEdit}>✓ Update करें</button>
      </Sheet>
    </div>
  );
}
