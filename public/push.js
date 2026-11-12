/* Push-notification reminders (phone and desktop). Loaded before app.js.
   Sends only item names + due dates for opted-in, signed-in people to the reminders service; the daily push carries
   no content and the service worker shows the reminder text saved on this device. */
'use strict';
const PUSH = { url: 'https://healthspan-reminders.lease-reader.workers.dev', key: 'BAw2-rfpCvk0Hm6UMBRBz6aLEJRuDYwMPE_c6yNlqa_aid9VuSLwKvxHqaD6_0YiUXpnBXxgfMrqP4XU5_nsgCk' };
let pushTimer = null;

const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function b64ToBytes(s) { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); }

/** An appointment you still have to book: a scheduled checkup, scan or test (not bloodwork, not something done at
    another visit) whose due date you haven't marked as booked. These get an extra reminder a month ahead. */
function needsBooking(i, s) {
  return isProc(i) && !i.bundleWith && !!s.due && !['never', 'complete', 'unscheduled'].includes(s.state) && i.bookedFor !== s.due;
}
const BOOK_AHEAD_DAYS = 30;
/** Due dates only, as {d: date, b: 1 if it still needs booking} — no names or anything about what's due leaves the device. */
function pushDueList() {
  return allItems().filter(x => x.s.due && !['never', 'complete', 'unscheduled'].includes(x.s.state))
    .map(x => ({ d: x.s.due, ...(needsBooking(x.i, x.s) ? { b: 1 } : {}) })).slice(0, 150);
}
/** The text a notification shows, saved on this device for the service worker. */
async function savePushSummary() {
  if (!('caches' in window)) return;
  const items = allItems(), T = today();
  const overdue = items.filter(x => x.s.state === 'overdue').map(x => short(x.i.name));
  const soon = items.filter(x => x.s.due && x.s.due >= T && days(T, x.s.due) <= 7 && x.s.state !== 'never').map(x => `${short(x.i.name)} (${fmtShort(x.s.due)})`);
  const book = items.filter(x => needsBooking(x.i, x.s) && x.s.due >= T && days(T, x.s.due) <= BOOK_AHEAD_DAYS + 1 && days(T, x.s.due) > 7).map(x => `${short(x.i.name)} (${fmtShort(x.s.due)})`);
  const parts = [soon.length && `Due soon: ${soon.slice(0, 4).join(', ')}${soon.length > 4 ? '…' : ''}`, book.length && `Time to book: ${book.slice(0, 3).join(', ')}${book.length > 3 ? '…' : ''}`, overdue.length && `Overdue: ${overdue.slice(0, 4).join(', ')}${overdue.length > 4 ? '…' : ''}`].filter(Boolean);
  const summary = { title: soon.length || overdue.length || book.length ? 'Healthspan Tracker reminder' : 'Healthspan Tracker', body: parts.join(' · ') || 'Open the app to see what’s coming up.' };
  try { await (await caches.open('healthspan-meta')).put('reminder-summary', new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } })); } catch (e) { }
}
async function pushCall(path, body) {
  const idToken = await window.cloud.getIdToken();
  const res = await fetch(PUSH.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken, ...body }) });
  if (!res.ok) throw new Error('reminders service ' + res.status);
  return res.json();
}
async function enablePush() {
  if (!cloudSync.user) { toast('Sign in first, so reminders know which account to use'); return; }
  if (!pushSupported()) { toast(isIOS() ? 'On iPhone, add the app to your Home Screen first (Share → Add to Home Screen), then open it from there' : 'This browser doesn’t support notifications'); return; }
  if (isIOS() && !isInstalled()) { toast('On iPhone, add the app to your Home Screen first (Share → Add to Home Screen), then turn reminders on from there'); return; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Notifications are blocked — allow them for this site in your browser settings'); render(); return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(PUSH.key) });
    await pushCall('/subscribe', { subscription: sub.toJSON(), due: pushDueList(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    db.settings.pushOn = true; await savePushSummary(); save('Reminder notifications are on');
  } catch (e) { console.error(e); toast('Couldn’t turn on notifications — try again'); }
}
async function disablePush(quiet) {
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (cloudSync.user) await pushCall('/unsubscribe', sub ? { endpoint: sub.endpoint } : {});
    if (sub) await sub.unsubscribe();
  } catch (e) { console.warn(e); }
  db.settings.pushOn = false; if (!quiet) save('Reminder notifications are off');
}
async function testPush() {
  try { const r = await pushCall('/test', {}); toast(r.sent ? 'Test notification sent' : 'No devices are signed up yet'); }
  catch (e) { toast('Couldn’t send a test — try again'); }
}
/** After any change: refresh the on-device text, and (debounced) the due dates the service knows about. */
function syncPushDue() {
  if (!db.settings.pushOn) return;
  savePushSummary();
  if (!cloudSync.user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushCall('/due', { due: pushDueList() }).catch(e => console.warn('reminder sync failed', e)), 2000);
}
function pushSection() {
  const on = db.settings.pushOn && 'Notification' in window && Notification.permission === 'granted';
  const blocked = 'Notification' in window && Notification.permission === 'denied';
  return `<h3 style="margin-top:18px">Phone &amp; desktop notifications</h3>
  <p class="small">${on ? '<b>✓ On.</b> You’ll get a notification on this device a month before anything you still need to book, a week before and on the day something is due, and on Mondays if anything is overdue.'
    : 'Get a notification a month before anything you still need to book, a week before and on the day something is due, and a weekly nudge for anything overdue.'}
    ${isIOS() && !isInstalled() ? ' On iPhone or iPad, first add the app to your Home Screen (Share → Add to Home Screen) and open it from there.' : ''}
    ${blocked ? ' <b>Notifications are blocked for this site</b> — allow them in your browser settings first.' : ''}</p>
  <div class="actions">${on ? '<button class="btn" data-pushtest>Send a test</button><button class="btn" data-pushoff>Turn off</button>'
    : `<button class="btn primary" data-pushon ${blocked ? 'disabled' : ''}>Turn on notifications</button>`}</div>
  <p class="small muted" style="margin-top:6px">Only due dates are shared with the notification service — not what’s due, and never results. ${cloudSync.user ? '' : 'Requires signing in.'}</p>`;
}
