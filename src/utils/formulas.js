// =====================================================
// GHAR KA HISAB — Pure Formula Utilities (No AI/ML)
// =====================================================

/**
 * Daily usage rate = total qty / number of days
 */
export function calcDailyUsage(totalQty, days) {
  if (!days || days <= 0) return 0;
  return totalQty / days;
}

/**
 * Suggested quantity for a future period
 */
export function calcSuggestedQty(dailyUsage, periodDays) {
  return Math.ceil(dailyUsage * periodDays * 100) / 100;
}

/**
 * Days remaining given current stock and daily usage
 */
export function calcDaysRemaining(currentStock, dailyUsage) {
  if (!dailyUsage || dailyUsage <= 0) return Infinity;
  return Math.floor(currentStock / dailyUsage);
}

/**
 * Rate-change split billing:
 * entries: [{ date, qty }], rates: [{ effectiveFrom, rate }]
 * Returns: { splits: [{from, to, qty, rate, amount}], total }
 */
export function calcSplitBill(entries, rates) {
  if (!entries?.length || !rates?.length) return { splits: [], total: 0 };

  const sortedRates = [...rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  const splits = sortedRates.map((rateObj, idx) => {
    const from = rateObj.effectiveFrom;
    const to = sortedRates[idx + 1]?.effectiveFrom ?? '9999-12-31';
    const applicable = entries.filter(e => e.date >= from && e.date < to);
    const qty = applicable.reduce((s, e) => s + (e.qty || 0), 0);
    const amount = Math.round(qty * rateObj.rate * 100) / 100;
    return { from, to: sortedRates[idx + 1]?.effectiveFrom ?? 'Present', qty, rate: rateObj.rate, amount };
  });

  const total = splits.reduce((s, sp) => s + sp.amount, 0);
  return { splits, total };
}

/**
 * Simple bill: qty × rate
 */
export function calcBill(qty, rate) {
  return Math.round(qty * rate * 100) / 100;
}

/**
 * Flatmate/family split
 * @param {number} total
 * @param {number|Array} membersOrSplits - number of members, or [{name, pct}]
 */
export function calcFlatmateSplit(total, membersOrSplits) {
  if (typeof membersOrSplits === 'number') {
    const each = Math.round((total / membersOrSplits) * 100) / 100;
    return Array.from({ length: membersOrSplits }, (_, i) => ({ member: `Person ${i + 1}`, amount: each }));
  }
  return membersOrSplits.map(m => ({
    member: m.name,
    amount: Math.round((total * m.pct / 100) * 100) / 100,
  }));
}

/**
 * Running advance balance after billing
 * advances: [{ amount, date }], bills: [{ amount, date }]
 * Returns: { balance, transactions: [{date, desc, amount, balance}] }
 */
export function calcAdvanceBalance(advances, bills) {
  const events = [
    ...advances.map(a => ({ date: a.date, desc: 'Advance', amount: +a.amount })),
    ...bills.map(b => ({ date: b.date, desc: 'Bill',    amount: -b.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  let balance = 0;
  const transactions = events.map(ev => {
    balance = Math.round((balance + ev.amount) * 100) / 100;
    return { ...ev, balance };
  });

  return { balance, transactions };
}

/**
 * Average trust score from ratings array [1-5]
 */
export function calcTrustScore(ratings) {
  if (!ratings?.length) return 0;
  const sum = ratings.reduce((s, r) => s + (r.score || 0), 0);
  return Math.round((sum / ratings.length) * 10) / 10;
}

/**
 * Streak counter: consecutive days with at least 1 entry (any non-null qty)
 * entries: [{ date, qty }] - sorted by date desc
 */
export function calcStreak(entries) {
  if (!entries?.length) return 0;
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  for (const entry of sorted) {
    const entryDate = new Date(entry.date + 'T00:00:00');
    const diff = Math.round((cursor - entryDate) / 86400000);
    if (diff <= 1 && entry.qty > 0) {
      streak++;
      cursor = entryDate;
    } else if (diff > 1) {
      break;
    }
  }
  return streak;
}

/**
 * Sum qty for a date range
 */
export function sumRange(entries) {
  return entries.reduce((s, e) => s + (e.qty || 0), 0);
}

/**
 * Monthly summary stats
 */
export function monthlySummary(entries, rate) {
  const total = sumRange(entries);
  const days  = entries.length;
  const avg   = days > 0 ? Math.round((total / days) * 100) / 100 : 0;
  const amount = calcBill(total, rate);
  return { total, days, avg, amount };
}

/**
 * Generate date strings for a month
 */
export function getDaysInMonth(year, month) {
  const days = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/**
 * Today's date string YYYY-MM-DD
 */
export function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Format number as Indian currency
 */
export function formatRupees(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Format date as "6 Jul 2026"
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Days until expiry
 */
export function daysUntilExpiry(expiryDateStr) {
  if (!expiryDateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const exp   = new Date(expiryDateStr + 'T00:00:00');
  return Math.round((exp - today) / 86400000);
}
