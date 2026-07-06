import Dexie from 'dexie';

export const db = new Dexie('GharKaHisabDB');

db.version(2).stores({
  // Daily consumable item definitions
  // presets: JSON string e.g. "[250,500,1000]" (in ml/grams)
  // sessions: JSON string e.g. '["morning","evening"]' which sessions this item has
  items: '++id, name, emoji, unit, baseUnit, defaultQty, presets, sessions, remindMorning, remindEvening, remindNight, isActive',

  // Daily quantity entries — NOW includes session (morning/evening/night)
  entries: '++id, itemId, date, session, qty, note, vendorId',

  // Vendor profiles
  vendors: '++id, name, phone, category, isActive',

  // Vendor-side delivery records
  vendorEntries: '++id, vendorId, customerId, itemId, date, session, delivered, photo',

  // Grocery / ration items
  grocery: '++id, name, qty, unit, price, purchaseDate, expiryDate, category',

  // Grocery price history
  priceHistory: '++id, groceryId, itemName, price, date',

  // Rate configurations per item (supports rate change history)
  rates: '++id, itemId, rate, effectiveFrom',

  // Advance payments
  advances: '++id, vendorId, amount, date, note, balance',

  // Vendor trust ratings
  ratings: '++id, vendorId, customerId, score, month, note',

  // Dispute flags
  disputes: '++id, vendorId, customerId, itemId, date, status, resolvedAt',

  // Scheduled local notifications
  notifications: '++id, type, targetId, scheduledTime, fired, message',

  // App-wide settings (key-value)
  settings: 'key',

  // Flatmate/family members
  members: '++id, name, role, familyCode, deviceId',

  // Holiday / Festival markers (auto-zero those dates)
  holidays: '++id, date, name, autoZero',

  // Monthly budget per item
  budgets: '++id, itemId, month, limitAmount, limitQty',

  // Fixed subscriptions / recurring costs (rent, electricity, etc.)
  subscriptions: '++id, name, emoji, amount, billingDay, category, isActive, lastPaidDate',
});

// ---------- Default seed on first run ----------
db.on('ready', async () => {
  const count = await db.items.count();
  if (count === 0) {
    await db.items.bulkAdd([
      {
        name: 'Doodh', emoji: '🥛', unit: 'ml', baseUnit: 'ml',
        defaultQty: 500,
        presets: JSON.stringify([250, 500, 750, 1000]),
        sessions: JSON.stringify(['morning', 'evening']),
        remindMorning: '07:05', remindEvening: '18:05', remindNight: null,
        isActive: true,
      },
      {
        name: 'Paani', emoji: '💧', unit: 'Camper', baseUnit: 'Camper',
        defaultQty: 1,
        presets: JSON.stringify([1, 2]),
        sessions: JSON.stringify(['morning']),
        remindMorning: '09:00', remindEvening: null, remindNight: null,
        isActive: true,
      },
      {
        name: 'Bread', emoji: '🍞', unit: 'Packet', baseUnit: 'Packet',
        defaultQty: 1,
        presets: JSON.stringify([1, 2]),
        sessions: JSON.stringify(['morning']),
        remindMorning: '08:00', remindEvening: null, remindNight: null,
        isActive: true,
      },
      {
        name: 'Anda', emoji: '🥚', unit: 'Piece', baseUnit: 'Piece',
        defaultQty: 6,
        presets: JSON.stringify([6, 12, 30]),
        sessions: JSON.stringify(['morning']),
        remindMorning: null, remindEvening: null, remindNight: null,
        isActive: true,
      },
      {
        name: 'Sabzi', emoji: '🥦', unit: 'gram', baseUnit: 'gram',
        defaultQty: 500,
        presets: JSON.stringify([250, 500, 1000]),
        sessions: JSON.stringify(['morning']),
        remindMorning: '09:00', remindEvening: null, remindNight: null,
        isActive: true,
      },
      {
        name: 'Chai', emoji: '☕', unit: 'Cup', baseUnit: 'Cup',
        defaultQty: 2,
        presets: JSON.stringify([1, 2, 3, 4]),
        sessions: JSON.stringify(['morning', 'evening']),
        remindMorning: null, remindEvening: null, remindNight: null,
        isActive: false,
      },
    ]);
  }

  const settingsCount = await db.settings.count();
  if (settingsCount === 0) {
    await db.settings.bulkPut([
      { key: 'lang',             value: 'hi' },
      { key: 'largeMode',        value: false },
      { key: 'darkMode',         value: true },
      { key: 'vacationMode',     value: false },
      { key: 'vacationFrom',     value: null },
      { key: 'vacationTo',       value: null },
      { key: 'familyCode',       value: null },
      { key: 'advanceThreshold', value: 50 },
      { key: 'encrypt',          value: false },
      { key: 'onboarded',        value: false },
      { key: 'defaultSession',   value: 'morning' },
    ]);
  }

  // Seed sample subscriptions
  const subCount = await db.subscriptions.count();
  if (subCount === 0) {
    await db.subscriptions.bulkAdd([
      { name: 'Bijli Bill', emoji: '⚡', amount: 1200, billingDay: 15, category: 'Utilities', isActive: true, lastPaidDate: null },
      { name: 'Cable TV',   emoji: '📺', amount: 400,  billingDay: 1,  category: 'Entertainment', isActive: true, lastPaidDate: null },
    ]);
  }
});

// ---------- Helpers ----------

export async function getSetting(key) {
  const row = await db.settings.get(key);
  return row ? row.value : null;
}

export async function setSetting(key, value) {
  return db.settings.put({ key, value });
}

export function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// Get entry for specific item + date + session
export async function getEntry(itemId, date, session = 'morning') {
  return db.entries.where({ itemId, date, session }).first();
}

// Upsert entry with session support
export async function upsertEntry(itemId, date, qty, note = '', session = 'morning') {
  const existing = await getEntry(itemId, date, session);
  if (existing) {
    await db.entries.update(existing.id, { qty, note });
    return existing.id;
  } else {
    return db.entries.add({ itemId, date, session, qty, note });
  }
}

// Get all entries for item+date (all sessions)
export async function getDayEntries(itemId, date) {
  return db.entries.where({ itemId, date }).toArray();
}

// Get total qty for item+date across all sessions
export async function getDayTotal(itemId, date) {
  const entries = await getDayEntries(itemId, date);
  return entries.reduce((s, e) => s + (e.qty || 0), 0);
}

// Get entries for date range
export async function getEntriesRange(itemId, fromDate, toDate) {
  return db.entries
    .where('date').between(fromDate, toDate, true, true)
    .filter(e => e.itemId === itemId)
    .toArray();
}

// Get active rate for item on date
export async function getRate(itemId, date) {
  const rates = await db.rates
    .where('itemId').equals(itemId)
    .filter(r => r.effectiveFrom <= date)
    .sortBy('effectiveFrom');
  return rates.length > 0 ? rates[rates.length - 1].rate : 0;
}

// Parse item presets
export function getPresets(item) {
  try {
    return JSON.parse(item.presets || '[]');
  } catch { return []; }
}

// Parse item sessions
export function getSessions(item) {
  try {
    return JSON.parse(item.sessions || '["morning"]');
  } catch { return ['morning']; }
}

// Format qty with smart unit display
export function formatQty(qty, unit) {
  if (unit === 'ml') {
    if (qty >= 1000) return `${(qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1)}L`;
    return `${qty}ml`;
  }
  if (unit === 'gram') {
    if (qty >= 1000) return `${(qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1)}kg`;
    return `${qty}g`;
  }
  return `${qty} ${unit}`;
}

export default db;
