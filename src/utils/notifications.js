// =====================================================
// LOCAL NOTIFICATION MANAGER (Device-Level, Offline)
// Uses Web Notifications API + localStorage scheduling
// =====================================================

import db from '../db/db';

const STORAGE_KEY = 'ghk_notifications';

// Request notification permission
export async function requestPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// Show a local browser/app notification
export function showNotification(title, body, options = {}) {
  if (Notification.permission !== 'granted') return;
  const n = new Notification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    ...options,
  });
  n.onclick = () => { n.close(); window.focus(); };
  return n;
}

// ---------- Scheduled Notification Queue ----------
// Stores scheduled jobs in localStorage and checks them on app load

function loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveQueue(queue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function scheduleNotification({ id, title, body, scheduledAt, repeat = null }) {
  const queue = loadQueue().filter(n => n.id !== id); // dedup by id
  queue.push({ id, title, body, scheduledAt, repeat, fired: false });
  saveQueue(queue);
}

export function cancelNotification(id) {
  const queue = loadQueue().filter(n => n.id !== id);
  saveQueue(queue);
}

// Called on app startup — fires any overdue notifications
export function processPendingNotifications() {
  const now = Date.now();
  const queue = loadQueue();
  const updated = [];

  for (const n of queue) {
    if (!n.fired && new Date(n.scheduledAt).getTime() <= now) {
      showNotification(n.title, n.body);
      if (n.repeat) {
        const next = new Date(n.scheduledAt);
        if (n.repeat === 'daily') next.setDate(next.getDate() + 1);
        if (n.repeat === 'weekly') next.setDate(next.getDate() + 7);
        updated.push({ ...n, scheduledAt: next.toISOString(), fired: false });
      }
      // else: remove (don't push) — one-shot
    } else {
      updated.push(n);
    }
  }
  saveQueue(updated);
}

// ---------- Specific Reminder Schedulers ----------

/**
 * Schedule daily delivery reminder for an item
 * remindTime: "07:05"
 */
export function scheduleDailyReminder(itemId, itemName, remindTime) {
  if (!remindTime) return;
  const [h, m] = remindTime.split(':').map(Number);
  const next = new Date();
  next.setHours(h, m, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);

  scheduleNotification({
    id: `reminder_${itemId}`,
    title: `${itemName} aaya? 🤔`,
    body: 'Aaj ki entry karein — Yes / Half / No',
    scheduledAt: next.toISOString(),
    repeat: 'daily',
  });
}

/**
 * Schedule expiry alert (1 day before)
 */
export function scheduleExpiryAlert(groceryId, itemName, expiryDate) {
  const alertDate = new Date(expiryDate + 'T09:00:00');
  alertDate.setDate(alertDate.getDate() - 1);

  if (alertDate > new Date()) {
    scheduleNotification({
      id: `expiry_${groceryId}`,
      title: '⚠️ Expiry Alert!',
      body: `${itemName} kal expire hoga — abhi use karein`,
      scheduledAt: alertDate.toISOString(),
    });
  }
}

/**
 * Advance low-balance alert (threshold ₹)
 */
export function scheduleAdvanceLowAlert(vendorId, vendorName, balance, threshold) {
  if (balance <= threshold) {
    showNotification(
      '💰 Advance Khatam Hone Wala Hai!',
      `${vendorName}: sirf ₹${balance} bacha — advance dena hai`
    );
  }
}

/**
 * Dispute 48h reminder
 */
export function scheduleDisputeReminder(disputeId, vendorName, scheduledAt) {
  scheduleNotification({
    id: `dispute_${disputeId}`,
    title: '🚨 Vivad Solve Nahi Hua!',
    body: `${vendorName} ke saath 48 ghante ho gaye — please resolve karein`,
    scheduledAt,
  });
}

/**
 * Monthly bill ready notification (1st of month)
 */
export function scheduleMonthlyBillNotification() {
  const now = new Date();
  const firstOfNext = new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0, 0);
  scheduleNotification({
    id: 'monthly_bill',
    title: '📋 Mahinे Ka Bill Ready!',
    body: 'Apna monthly hisab check karein',
    scheduledAt: firstOfNext.toISOString(),
    repeat: 'monthly',
  });
}

// Start the processor — runs every 60 seconds while app is open
export function startNotificationScheduler() {
  processPendingNotifications();
  setInterval(processPendingNotifications, 60_000);
}
