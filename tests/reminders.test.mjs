// Unit tests for the reminder timing (node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldNotify } from '../reminders/src/index.js';

const row = (tz, due, last_sent = null) => ({ tz, due: JSON.stringify(due), last_sent });
// 2026-11-11 is a Wednesday; 16:00 UTC = 08:00 in Los Angeles (PST)
const at = iso => new Date(iso);

test('sends at 8 am local on the due day', () => {
  assert.equal(shouldNotify(row('America/Los_Angeles', [{ n: 'Dentist', d: '2026-11-11' }]), at('2026-11-11T16:00:00Z')), '2026-11-11');
});
test('does not send at other hours', () => {
  assert.equal(shouldNotify(row('America/Los_Angeles', [{ n: 'Dentist', d: '2026-11-11' }]), at('2026-11-11T15:00:00Z')), null);
});
test('uses the local date, not UTC (Sydney 8 am is the previous UTC day)', () => {
  // 2026-11-10T21:00Z = 2026-11-11 08:00 in Sydney (AEDT, UTC+11)
  assert.equal(shouldNotify(row('Australia/Sydney', [{ n: 'Eye exam', d: '2026-11-11' }]), at('2026-11-10T21:00:00Z')), '2026-11-11');
});
test('one week before', () => {
  assert.equal(shouldNotify(row('UTC', [{ n: 'Mammogram', d: '2026-11-18' }]), at('2026-11-11T08:00:00Z')), '2026-11-11');
});
test('overdue only on Mondays', () => {
  const r = row('UTC', [{ n: 'Flu shot', d: '2026-10-01' }]);
  assert.equal(shouldNotify(r, at('2026-11-11T08:00:00Z')), null);           // Wednesday
  assert.equal(shouldNotify(r, at('2026-11-16T08:00:00Z')), '2026-11-16');   // Monday
});
test('not twice on the same day', () => {
  assert.equal(shouldNotify(row('UTC', [{ n: 'Dentist', d: '2026-11-11' }], '2026-11-11'), at('2026-11-11T08:00:00Z')), null);
});
test('unknown time zone falls back to UTC', () => {
  assert.equal(shouldNotify(row('Not/AZone', [{ n: 'Dentist', d: '2026-11-11' }]), at('2026-11-11T08:00:00Z')), '2026-11-11');
});
