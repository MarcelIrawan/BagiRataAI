import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTim,
  createStore,
  upsertTim,
  findPeriode,
  findAnggota,
  addNota,
  addSetoran,
  closePeriode,
  reopenPeriode,
  openNewPeriode,
  setParticipants,
  setSaldoAwal,
  setAnggotaStatus,
  handoverHolder,
  holderAt,
  archiveTim,
  unarchiveTim,
  canDeleteTim,
  deleteTim,
  settlementRows,
  saldoNow,
  openPeriodeOf,
} from '../public/js/domain.js';

const NOW = '2026-10-20T10:00:00.000Z';
const T1 = '2026-10-31T17:00:00.000Z';
const T2 = '2026-11-15T09:00:00.000Z';
const T3 = '2026-12-01T09:00:00.000Z';

function makeTim() {
  return createTim({
    id: 't1',
    name: 'Kantor',
    holderId: 'h',
    now: NOW,
    periodeId: 'p1',
    label: 'Oktober',
    members: [
      { id: 'h', name: 'Hana' },
      { id: 'a', name: 'Andi' },
      { id: 'b', name: 'Budi' },
    ],
  });
}

const periodeOf = (tim, id = 'p1') => findPeriode(tim, id);

function ok(result) {
  assert.equal(result.ok, true, result.message || 'expected the operation to be accepted');
  return result.tim;
}

function nota(over = {}) {
  return {
    id: 'n1',
    merchant: 'Warung',
    items: [{ name: 'Nasi', qty: 1, price: 10000, assignedTo: ['a'] }],
    tax: 0,
    service: 0,
    discount: 0,
    paidBy: [{ memberId: 'h', amount: 10000 }],
    ...over,
  };
}

/* ---------------------------------------------------------------- *
 * Periode lifecycle
 * ---------------------------------------------------------------- */

test('a Tim is created with exactly one open Periode and the Holder always on it', () => {
  const tim = makeTim();
  const periode = periodeOf(tim);

  assert.equal(tim.periods.length, 1);
  assert.equal(periode.status, 'open');
  assert.equal(periode.label, 'Oktober');
  assert.deepEqual(periode.participants, ['h', 'a', 'b']);
  assert.equal(openPeriodeOf(tim).id, 'p1');
});

test('a second open Periode is refused, naming the Periode already open', () => {
  const tim = makeTim();
  const result = openNewPeriode(tim, { id: 'p2', label: 'November', openedAt: T1 });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PERIODE_ALREADY_OPEN');
  assert.match(result.message, /Oktober/);
});

test('a new Periode seeds its participants from the active roster', () => {
  let tim = makeTim();
  tim = ok(closePeriode(tim, 'p1', T1));
  tim = ok(setAnggotaStatus(tim, 'b', 'keluar', T1));

  tim = ok(openNewPeriode(tim, { id: 'p2', label: 'November', openedAt: T1 }));
  assert.deepEqual(periodeOf(tim, 'p2').participants, ['h', 'a'], 'Budi has left, so is not seeded');
  assert.equal(periodeOf(tim, 'p2').status, 'open');
});

test('closing and reopening a Periode flips its status and the open-Period guard', () => {
  let tim = makeTim();
  tim = ok(closePeriode(tim, 'p1', T1));
  assert.equal(periodeOf(tim).status, 'closed');

  tim = ok(openNewPeriode(tim, { id: 'p2', label: 'November', openedAt: T1 }));

  const secondOpen = openNewPeriode(tim, { id: 'p3', label: 'Desember', openedAt: T2 });
  assert.equal(secondOpen.ok, false);
  assert.equal(secondOpen.code, 'PERIODE_ALREADY_OPEN');
  assert.match(secondOpen.message, /November/);

  const blockedReopen = reopenPeriode(tim, 'p1', T2);
  assert.equal(blockedReopen.ok, false);
  assert.equal(blockedReopen.code, 'PERIODE_ALREADY_OPEN', 'only one Periode may be open');

  tim = ok(closePeriode(tim, 'p2', T2));
  tim = ok(reopenPeriode(tim, 'p1', T2));
  assert.equal(periodeOf(tim, 'p1').status, 'open');
  assert.equal(periodeOf(tim, 'p2').status, 'closed');
  assert.equal(periodeOf(tim, 'p2').reDerivedAt, T2);
});

test('a Periode with no Nota closes to rows of zeroes', () => {
  let tim = makeTim();
  const result = closePeriode(tim, 'p1', T1);

  assert.equal(result.ok, true);
  const rows = settlementRows(result.tim, periodeOf(result.tim));
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.saldoAwal, 0);
    assert.equal(row.konsumsi, 0);
    assert.equal(row.kontribusi, 0);
    assert.equal(row.saldo, 0);
  }
  assert.equal(periodeOf(result.tim).snapshot.kas, 0);
});

/* ---------------------------------------------------------------- *
 * Anggota lifecycle
 * ---------------------------------------------------------------- */

test('an Anggota with a non-zero Saldo cannot leave, and the refusal names the amount', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 15000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 15000 }] }), NOW));
  assert.equal(saldoNow(tim, 'a'), 15000);

  const result = setAnggotaStatus(tim, 'a', 'keluar', T1);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ANGGOTA_SALDO_NOT_ZERO');
  assert.match(result.message, /Andi/);
  assert.match(result.message, /15000/);
});

test('the Holder cannot leave before a handover', () => {
  const tim = makeTim();
  const result = setAnggotaStatus(tim, 'h', 'keluar', T1);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'ANGGOTA_IS_HOLDER');
  assert.match(result.message, /menyerahkan peran Holder/i);
});

test('leaving keeps all history and reactivates with the same id', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 15000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 15000 }] }), NOW));
  tim = ok(addSetoran(tim, 'p1', { id: 's1', memberId: 'a', amount: 15000 }, NOW));
  assert.equal(saldoNow(tim, 'a'), 0);

  const before = findAnggota(tim, 'a');
  tim = ok(setAnggotaStatus(tim, 'a', 'keluar', T1));

  const left = findAnggota(tim, 'a');
  assert.equal(left.id, 'a');
  assert.equal(left.status, 'keluar');
  assert.equal(left.leftAt, T1);
  assert.equal(tim.members.length, 3, 'leaving destroys nothing');
  assert.equal(periodeOf(tim).bills.length, 1);
  assert.equal(periodeOf(tim).deposits.length, 1);
  assert.equal(settlementRows(tim, periodeOf(tim)).find((r) => r.memberId === 'a').konsumsi, 15000);

  tim = ok(setAnggotaStatus(tim, 'a', 'active', T2));
  const back = findAnggota(tim, 'a');
  assert.equal(back.id, before.id, 'a returning person keeps their id');
  assert.equal(back.status, 'active');
  assert.equal(back.leftAt, null);
  assert.equal(tim.members.length, 3);
});

test('a keluar Anggota is excluded from a new Periode participant set', () => {
  let tim = makeTim();
  tim = ok(closePeriode(tim, 'p1', T1));
  tim = ok(setAnggotaStatus(tim, 'a', 'keluar', T1));
  tim = ok(openNewPeriode(tim, { id: 'p2', label: 'November', openedAt: T1 }));

  assert.deepEqual(periodeOf(tim, 'p2').participants, ['h', 'b']);
});

/* ---------------------------------------------------------------- *
 * Holder handover
 * ---------------------------------------------------------------- */

test('a handover appends to the log and moves the Holder role', () => {
  let tim = makeTim();
  tim = ok(handoverHolder(tim, { toId: 'a', at: T2, note: 'Andi pegang kas' }));

  assert.equal(tim.holderId, 'a');
  assert.equal(tim.handovers.length, 1);
  assert.equal(tim.handovers[0].fromId, 'h');
  assert.equal(tim.handovers[0].toId, 'a');
  assert.equal(tim.handovers[0].at, T2);
  assert.equal(tim.handovers[0].note, 'Andi pegang kas');

  tim = ok(handoverHolder(tim, { toId: 'b', at: T3 }));
  assert.equal(tim.holderId, 'b');
  assert.equal(tim.handovers.length, 2, 'the log is append-only');
  assert.equal(tim.handovers[0].toId, 'a', 'a past handover is never rewritten');
});

test('a handover to someone outside the roster or to the current Holder is refused', () => {
  const tim = makeTim();

  const stranger = handoverHolder(tim, { toId: 'ghost', at: T2 });
  assert.equal(stranger.ok, false);
  assert.equal(stranger.code, 'HANDOVER_NOT_ON_ROSTER');
  assert.match(stranger.message, /roster Tim ini/i);

  const same = handoverHolder(tim, { toId: 'h', at: T2 });
  assert.equal(same.ok, false);
  assert.equal(same.code, 'HANDOVER_SAME');
  assert.match(same.message, /sudah jadi Holder/i);
});

test('holderAt answers who held the cash on a date', () => {
  let tim = makeTim();
  tim = ok(handoverHolder(tim, { toId: 'a', at: T2 }));
  tim = ok(handoverHolder(tim, { toId: 'b', at: T3 }));

  assert.equal(holderAt(tim, '2026-10-21T00:00:00.000Z'), 'h');
  assert.equal(holderAt(tim, T2), 'a');
  assert.equal(holderAt(tim, '2026-11-20T00:00:00.000Z'), 'a');
  assert.equal(holderAt(tim, '2026-12-05T00:00:00.000Z'), 'b');
  assert.equal(holderAt(tim, null), 'b', 'no date means the latest known Holder');
});

/* ---------------------------------------------------------------- *
 * Tim lifecycle
 * ---------------------------------------------------------------- */

test('a Tim can be archived and unarchived, and archiving blocks nothing', () => {
  let tim = makeTim();
  tim = ok(archiveTim(tim, T1));
  assert.equal(tim.archivedAt, T1);

  tim = ok(addNota(tim, 'p1', nota(), NOW));
  assert.equal(periodeOf(tim).bills.length, 1, 'archive is a filter, not a write barrier');

  tim = ok(unarchiveTim(tim));
  assert.equal(tim.archivedAt, null);
});

test('canDeleteTim is true only with no Nota, no Setoran and no hand-entered balance', () => {
  let tim = makeTim();
  assert.deepEqual(canDeleteTim(tim), { ok: true, notaCount: 0, setoranCount: 0, handEntered: false });

  const withNota = ok(addNota(tim, 'p1', nota(), NOW));
  assert.equal(canDeleteTim(withNota).ok, false);
  assert.equal(canDeleteTim(withNota).notaCount, 1);

  const withSetoran = ok(addSetoran(tim, 'p1', { id: 's1', memberId: 'a', amount: 5000 }, NOW));
  assert.equal(canDeleteTim(withSetoran).ok, false);
  assert.equal(canDeleteTim(withSetoran).setoranCount, 1);

  const withOpening = ok(setSaldoAwal(tim, 'p1', 'a', 20000));
  assert.equal(canDeleteTim(withOpening).ok, false);
  assert.equal(canDeleteTim(withOpening).handEntered, true);
});

test('deleteTim refuses a Tim with history and removes an empty one', () => {
  let store = createStore(NOW);
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota(), NOW));
  store = upsertTim(store, tim);

  const refused = deleteTim(store, 't1');
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'TIM_HAS_HISTORY');
  assert.match(refused.message, /tidak bisa dihapus/i);

  let emptyStore = upsertTim(createStore(NOW), makeTim());
  emptyStore.activeTimId = 't1';
  const removed = deleteTim(emptyStore, 't1');
  assert.equal(removed.ok, true);
  assert.equal(removed.store.tims.length, 0);
  assert.equal(removed.store.activeTimId, null);
});

test('deleting an unknown Tim is refused as not found', () => {
  const result = deleteTim(createStore(NOW), 'nope');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'TIM_NOT_FOUND');
});
