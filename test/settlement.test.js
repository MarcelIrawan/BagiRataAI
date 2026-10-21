import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTim,
  findPeriode,
  addNota,
  addSetoran,
  closePeriode,
  openNewPeriode,
  reopenPeriode,
  setParticipants,
  setSaldoAwal,
  settlementRows,
  currentBalances,
  saldoAt,
  saldoNow,
  saldoAwal,
  kontribusi,
  setoranTotal,
  paidByOf,
  notaGrandTotal,
  kas,
  holderNet,
  holderNetAt,
  outstandingAt,
  minimalTransfers,
} from '../js/domain.js';

const NOW = '2026-10-20T10:00:00.000Z';
const T1 = '2026-10-31T17:00:00.000Z';
const T2 = '2026-11-30T17:00:00.000Z';
const T3 = '2026-12-31T17:00:00.000Z';

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
      { id: 'c', name: 'Citra' },
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

function rowOf(rows, memberId) {
  const row = rows.find((r) => r.memberId === memberId);
  assert.ok(row, `expected a settlement row for ${memberId}`);
  return row;
}

/* ---------------------------------------------------------------- *
 * Kontribusi
 * ---------------------------------------------------------------- */

test('Kontribusi is signed Setoran plus the amounts that member paid the merchant', () => {
  let tim = makeTim();
  tim = ok(addSetoran(tim, 'p1', { id: 's1', memberId: 'a', amount: 20000 }, NOW));
  tim = ok(addSetoran(tim, 'p1', { id: 's2', memberId: 'a', amount: -5000, note: 'Kembalian' }, NOW));
  tim = ok(
    addNota(
      tim,
      'p1',
      nota({
        id: 'n1',
        items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['b'] }],
        paidBy: [
          { memberId: 'a', amount: 10000 },
          { memberId: 'h', amount: 20000 },
        ],
      }),
      NOW
    )
  );

  const periode = periodeOf(tim);
  assert.equal(setoranTotal(periode, 'a'), 15000, 'signed setoran total');
  assert.equal(kontribusi(tim, periode, 'a'), 25000, '15000 setoran + 10000 paid as Pembayar');
  assert.equal(kontribusi(tim, periode, 'h'), 20000);
  assert.equal(kontribusi(tim, periode, 'b'), 0);
});

test('a Nota with no paidBy list is read as paid in full by the Holder', () => {
  const tim = makeTim();
  // Written the way data predating payer lists was stored: no paidBy field at all.
  periodeOf(tim).bills.push({
    id: 'legacy',
    items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }],
    tax: 0,
    service: 0,
    discount: 0,
  });

  const stored = periodeOf(tim).bills[0];
  const payers = paidByOf(stored, tim);
  assert.equal(payers.length, 1);
  assert.equal(payers[0].memberId, 'h');
  assert.equal(payers[0].amount, notaGrandTotal(stored));
  assert.equal(payers[0].amount, 30000);
  assert.equal(kontribusi(tim, periodeOf(tim), 'h'), 30000);
});

/* ---------------------------------------------------------------- *
 * Setoran refusals
 * ---------------------------------------------------------------- */

test('a zero Setoran is refused', () => {
  const tim = makeTim();
  const result = addSetoran(tim, 'p1', { id: 's1', memberId: 'a', amount: 0 }, NOW);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SETORAN_ZERO');
  assert.match(result.message, /tidak boleh nol/i);
});

test('a negative Setoran without a note is refused, but is accepted with one', () => {
  const tim = makeTim();
  const refused = addSetoran(tim, 'p1', { id: 's1', memberId: 'a', amount: -5000 }, NOW);

  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'SETORAN_NOTE_REQUIRED');
  assert.match(refused.message, /wajib punya catatan/i);

  const accepted = addSetoran(tim, 'p1', { id: 's1', memberId: 'a', amount: -5000, note: 'Kembalian' }, NOW);
  assert.equal(accepted.ok, true);
  assert.equal(setoranTotal(periodeOf(accepted.tim), 'a'), -5000);
});

test('the Holder cannot be either party of a Setoran', () => {
  const tim = makeTim();
  const result = addSetoran(tim, 'p1', { id: 's1', memberId: 'h', amount: 10000 }, NOW);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SETORAN_HOLDER');
  assert.match(result.message, /Holder tidak bisa jadi salah satu pihak/i);
});

test('a Setoran from someone off the roster or outside the participant set is refused', () => {
  let tim = makeTim();
  tim = ok(setParticipants(tim, 'p1', ['h', 'a', 'b']));

  const notMember = addSetoran(tim, 'p1', { id: 's1', memberId: 'ghost', amount: 10000 }, NOW);
  assert.equal(notMember.ok, false);
  assert.equal(notMember.code, 'SETORAN_NOT_MEMBER');
  assert.match(notMember.message, /roster Tim ini/i);

  const notParticipant = addSetoran(tim, 'p1', { id: 's2', memberId: 'c', amount: 10000 }, NOW);
  assert.equal(notParticipant.ok, false);
  assert.equal(notParticipant.code, 'SETORAN_NOT_PARTICIPANT');
  assert.match(notParticipant.message, /bukan peserta/i);
});

test('a Setoran against a closed Periode is refused', () => {
  let tim = makeTim();
  tim = ok(closePeriode(tim, 'p1', T1));

  const result = addSetoran(tim, 'p1', { id: 's1', memberId: 'a', amount: 10000 }, NOW);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PERIODE_CLOSED');
  assert.match(result.message, /sudah ditutup/i);
});

/* ---------------------------------------------------------------- *
 * Saldo and Saldo Awal
 * ---------------------------------------------------------------- */

test('Saldo is Saldo Awal + Konsumsi - Kontribusi', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  tim = ok(addSetoran(tim, 'p1', { id: 's1', memberId: 'a', amount: 5000 }, NOW));

  assert.equal(konsumsiOf(tim, 'a'), 30000);
  assert.equal(saldoAt(tim, 0, 'a'), 0 + 30000 - 5000);
  assert.equal(saldoNow(tim, 'a'), 25000);
  assert.equal(saldoNow(tim, 'h'), -30000, 'the Holder paid the merchant and consumed nothing');
});

test('the first Periode starts every Saldo Awal at 0 and it can be hand-entered', () => {
  let tim = makeTim();
  assert.equal(saldoAwal(tim, 0, 'b'), 0, 'defaults to zero');

  tim = ok(setSaldoAwal(tim, 'p1', 'b', 50000));
  assert.equal(saldoAwal(tim, 0, 'b'), 50000);
  assert.equal(saldoNow(tim, 'b'), 50000, 'pre-app debt is owed with no Nota behind it');

  const rows = settlementRows(tim, periodeOf(tim));
  assert.equal(rowOf(rows, 'b').saldoAwal, 50000);
  assert.equal(rowOf(rows, 'b').handEnteredAwal, true, 'a hand-entered opening must be visible');
  assert.equal(rowOf(rows, 'a').handEnteredAwal, false);
});

test('a later Periode cannot have a hand-edited Saldo Awal', () => {
  let tim = makeTim();
  tim = ok(closePeriode(tim, 'p1', T1));
  tim = ok(openNewPeriode(tim, { id: 'p2', label: 'November', openedAt: T1 }));

  const result = setSaldoAwal(tim, 'p2', 'a', 99000);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SALDO_AWAL_NOT_EDITABLE');
  assert.match(result.message, /dibaca dari periode sebelumnya/i);
});

test('balances carry into the next Periode Saldo Awal', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  tim = ok(addSetoran(tim, 'p1', { id: 's1', memberId: 'a', amount: 10000 }, NOW));
  tim = ok(closePeriode(tim, 'p1', T1));
  tim = ok(openNewPeriode(tim, { id: 'p2', label: 'November', openedAt: T1 }));

  assert.equal(saldoAwal(tim, 1, 'a'), 20000);
  assert.equal(saldoAwal(tim, 1, 'b'), 0);
  assert.equal(saldoAt(tim, 1, 'a'), 20000);
});

test('paying an old debt is an ordinary Setoran in the current Periode', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  tim = ok(closePeriode(tim, 'p1', T1));
  tim = ok(openNewPeriode(tim, { id: 'p2', label: 'November', openedAt: T1 }));

  assert.equal(saldoNow(tim, 'a'), 30000);
  tim = ok(addSetoran(tim, 'p2', { id: 's2', memberId: 'a', amount: 30000, note: 'Bayar utang Oktober' }, NOW));

  assert.equal(saldoNow(tim, 'a'), 0);
  assert.equal(saldoAwal(tim, 1, 'a'), 30000, 'the old Periode is untouched');
  assert.equal(
    settlementRows(tim, periodeOf(tim, 'p1')).find((r) => r.memberId === 'a').saldo,
    30000,
    'the closed Periode still shows its own snapshot'
  );
});

/* ---------------------------------------------------------------- *
 * Settlement presentation: preview, snapshot, reopen, re-derive
 * ---------------------------------------------------------------- */

test('an open Periode renders live rows marked as a preview', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  tim = ok(addSetoran(tim, 'p1', { id: 's1', memberId: 'a', amount: 10000 }, NOW));

  const rows = settlementRows(tim, periodeOf(tim));
  assert.equal(rows.length, 4);
  for (const row of rows) assert.equal(row.source, 'preview');
  assert.equal(rowOf(rows, 'a').saldo, 20000);
  assert.equal(rowOf(rows, 'a').konsumsi, 30000);
  assert.equal(rowOf(rows, 'a').kontribusi, 10000);
  assert.equal(rowOf(rows, 'h').isHolder, true);
  assert.equal(rowOf(rows, 'h').saldo, -30000);
});

test('closing stores a snapshot carrying saldoAwal, konsumsi, kontribusi, saldo, kas and the close time', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  tim = ok(addSetoran(tim, 'p1', { id: 's1', memberId: 'a', amount: 10000 }, NOW));

  const result = closePeriode(tim, 'p1', T1);
  assert.equal(result.ok, true);
  const snapshot = periodeOf(result.tim).snapshot;
  assert.equal(snapshot.at, T1);
  assert.equal(snapshot.kas, -20000);
  const andi = snapshot.rows.find((r) => r.memberId === 'a');
  assert.deepEqual(andi, { memberId: 'a', saldoAwal: 0, konsumsi: 30000, kontribusi: 10000, saldo: 20000 });

  const rendered = settlementRows(result.tim, periodeOf(result.tim));
  assert.equal(rendered.length, 4);
  for (const row of rendered) {
    assert.equal(row.source, 'snapshot');
    assert.equal(row.asOf, T1);
  }
  assert.equal(rowOf(rendered, 'a').saldo, 20000);
});

test('reopening a Periode clears its snapshot and returns it to a live preview', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  tim = ok(closePeriode(tim, 'p1', T1));
  tim = ok(reopenPeriode(tim, 'p1', T1));

  const periode = periodeOf(tim);
  assert.equal(periode.status, 'open');
  assert.equal(periode.snapshot, null);
  assert.equal(periode.closedAt, null);
  assert.equal(settlementRows(tim, periode)[0].source, 'preview');
});

test('re-closing replaces the snapshot and moves the close time', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  tim = ok(closePeriode(tim, 'p1', T1));
  tim = ok(reopenPeriode(tim, 'p1', T1));
  tim = ok(addSetoran(tim, 'p1', { id: 's1', memberId: 'a', amount: 5000 }, NOW));
  tim = ok(closePeriode(tim, 'p1', T2));

  const periode = periodeOf(tim);
  assert.equal(periode.closedAt, T2);
  assert.equal(periode.snapshot.at, T2);
  assert.equal(periode.snapshot.rows.find((r) => r.memberId === 'a').saldo, 25000);
  assert.equal(settlementRows(tim, periode).find((r) => r.memberId === 'a').asOf, T2);
});

test('reopening an earlier Periode cascades later Periodes and re-derives their Saldo Awal only', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  tim = ok(addSetoran(tim, 'p1', { id: 's1', memberId: 'a', amount: 10000 }, NOW));
  tim = ok(closePeriode(tim, 'p1', T1)); // Andi owes 20000
  tim = ok(openNewPeriode(tim, { id: 'p2', label: 'November', openedAt: T1 }));
  tim = ok(addSetoran(tim, 'p2', { id: 's2', memberId: 'a', amount: 20000 }, NOW));
  tim = ok(closePeriode(tim, 'p2', T2)); // Andi at 0
  tim = ok(openNewPeriode(tim, { id: 'p3', label: 'Desember', openedAt: T2 }));
  tim = ok(closePeriode(tim, 'p3', T3));

  const beforeP2 = periodeOf(tim, 'p2').snapshot.rows.find((r) => r.memberId === 'a');
  assert.deepEqual(beforeP2, { memberId: 'a', saldoAwal: 20000, konsumsi: 0, kontribusi: 20000, saldo: 0 });

  const reopened = reopenPeriode(tim, 'p1', T3);
  assert.equal(reopened.ok, true);
  assert.deepEqual(
    reopened.cascade.map((c) => c.periodeId),
    ['p2', 'p3'],
    'every later Periode is returned in the cascade'
  );
  tim = reopened.tim;
  assert.equal(periodeOf(tim, 'p2').reDerivedAt, T3);
  assert.equal(periodeOf(tim, 'p3').reDerivedAt, T3);

  // Correct Periode #1 by 5.000 more than Andi had paid.
  tim = ok(addSetoran(tim, 'p1', { id: 's3', memberId: 'a', amount: -5000, note: 'Koreksi' }, NOW));
  tim = ok(closePeriode(tim, 'p1', T3));

  const rows = settlementRows(tim, periodeOf(tim, 'p2'));
  const andi = rowOf(rows, 'a');
  assert.equal(andi.source, 're-derived');
  assert.equal(andi.reDerivedAt, T3);
  assert.equal(andi.saldoAwal, 25000, 'opening balance follows the corrected chain');
  assert.equal(andi.konsumsi, 0, 'own Konsumsi stays frozen from the snapshot');
  assert.equal(andi.kontribusi, 20000, 'own Kontribusi stays frozen from the snapshot');
  assert.equal(andi.saldo, 5000);
});

test('reopening the newest Periode needs no cascade', () => {
  let tim = makeTim();
  tim = ok(closePeriode(tim, 'p1', T1));
  tim = ok(openNewPeriode(tim, { id: 'p2', label: 'November', openedAt: T1 }));
  tim = ok(closePeriode(tim, 'p2', T2));

  const result = reopenPeriode(tim, 'p2', T2);
  assert.equal(result.ok, true);
  assert.deepEqual(result.cascade, []);
  assert.equal(periodeOf(result.tim, 'p2').status, 'open');
});

/* ---------------------------------------------------------------- *
 * Kas Holder
 * ---------------------------------------------------------------- */

test('Kas Holder is Tim-wide: signed Setoran minus only the Holder own paidBy amounts', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  tim = ok(addSetoran(tim, 'p1', { id: 's1', memberId: 'a', amount: 50000 }, NOW));
  assert.equal(kas(tim), 20000);

  // Another member paying the merchant directly does not touch the Holder's cash.
  tim = ok(addNota(tim, 'p1', nota({ id: 'n2', items: [{ name: 'B', qty: 1, price: 20000, assignedTo: ['b'] }], paidBy: [{ memberId: 'b', amount: 20000 }] }), NOW));
  assert.equal(kas(tim), 20000);

  // A Pengembalian reduces the cash the Holder holds.
  tim = ok(addSetoran(tim, 'p1', { id: 's2', memberId: 'a', amount: -5000, note: 'Kembalian' }, NOW));
  assert.equal(kas(tim), 15000);

  // Cash does not reset at a Periode boundary.
  tim = ok(closePeriode(tim, 'p1', T1));
  tim = ok(openNewPeriode(tim, { id: 'p2', label: 'November', openedAt: T1 }));
  tim = ok(addSetoran(tim, 'p2', { id: 's3', memberId: 'b', amount: 10000 }, NOW));
  assert.equal(kas(tim), 25000);
  assert.equal(kas(tim, 0), 15000, 'a historical close can still ask for the position at that close');
});

test('a Nota part-paid by the Holder only reduces Kas by the Holder own share', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({
    id: 'n1',
    items: [{ name: 'A', qty: 1, price: 40000, assignedTo: ['a'] }],
    paidBy: [
      { memberId: 'a', amount: 30000 },
      { memberId: 'h', amount: 10000 },
    ],
  }), NOW));

  assert.equal(kas(tim), -10000);
});

/* ---------------------------------------------------------------- *
 * Holder Net
 * ---------------------------------------------------------------- */

test('Holder Net is positive Saldo minus absolute Kredits across the roster, excluding the Holder', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'b', amount: 30000 }] }), NOW));
  tim = ok(addNota(tim, 'p1', nota({ id: 'n2', items: [{ name: 'B', qty: 1, price: 10000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 10000 }] }), NOW));

  assert.equal(saldoNow(tim, 'a'), 40000);
  assert.equal(saldoNow(tim, 'b'), -30000);
  assert.equal(saldoNow(tim, 'h'), -10000);
  assert.equal(holderNet(tim), 10000, '40000 owed - 30000 credit');
  assert.deepEqual(outstandingAt(tim, 0), { owed: 40000, credit: 30000 });

  // Still the same running figure once the Periode is closed and a new one opened.
  tim = ok(closePeriode(tim, 'p1', T1));
  tim = ok(openNewPeriode(tim, { id: 'p2', label: 'November', openedAt: T1 }));
  assert.equal(holderNet(tim), 10000);
  assert.equal(holderNetAt(tim, 1), 10000);
  assert.equal(holderNetAt(tim, 0), 10000);
});

/* ---------------------------------------------------------------- *
 * minimalTransfers
 * ---------------------------------------------------------------- */

function applyTransfers(rows, transfers) {
  const balances = new Map(rows.map((r) => [r.memberId, r.saldo]));
  for (const t of transfers) {
    balances.set(t.fromId, balances.get(t.fromId) - t.amount);
    balances.set(t.toId, balances.get(t.toId) + t.amount);
  }
  return balances;
}

test('minimalTransfers greedily matches debtors and creditors and zeroes every Saldo', () => {
  const rows = [
    { memberId: 'a', name: 'Andi', saldo: 30000 },
    { memberId: 'b', name: 'Budi', saldo: -20000 },
    { memberId: 'c', name: 'Citra', saldo: -10000 },
    { memberId: 'h', name: 'Hana', saldo: 0 },
  ];

  const transfers = minimalTransfers(rows);
  assert.equal(transfers.length, 2);
  assert.deepEqual(transfers[0], { fromId: 'a', toId: 'b', amount: 20000 });
  assert.deepEqual(transfers[1], { fromId: 'a', toId: 'c', amount: 10000 });

  for (const balance of applyTransfers(rows, transfers).values()) assert.equal(balance, 0);
});

test('minimalTransfers returns an empty list when no debtor/creditor pair exists', () => {
  assert.deepEqual(minimalTransfers([
    { memberId: 'a', name: 'Andi', saldo: 0 },
    { memberId: 'b', name: 'Budi', saldo: 0 },
  ]), []);
  assert.deepEqual(minimalTransfers([
    { memberId: 'a', name: 'Andi', saldo: 10000 },
    { memberId: 'b', name: 'Budi', saldo: 5000 },
  ]), []);
  assert.deepEqual(minimalTransfers([]), []);
});

test('a closed Periode computes its transfers from the snapshot balances', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'b', amount: 30000 }] }), NOW));
  tim = ok(closePeriode(tim, 'p1', T1));

  const rows = settlementRows(tim, periodeOf(tim));
  const transfers = minimalTransfers(rows);
  assert.ok(transfers.length > 0);
  assert.equal(summarize(transfers), 30000);
  for (const balance of applyTransfers(rows, transfers).values()) assert.equal(balance, 0);
});

function summarize(transfers) {
  return transfers.reduce((sum, t) => sum + t.amount, 0);
}

/* ---------------------------------------------------------------- *
 * Participants
 * ---------------------------------------------------------------- */

test('participants default to the active roster, with the Holder always included', () => {
  const tim = makeTim();
  assert.deepEqual(periodeOf(tim).participants, ['h', 'a', 'b', 'c']);
});

test('the Holder cannot be removed from the participant set', () => {
  const tim = makeTim();
  const result = setParticipants(tim, 'p1', ['a', 'b']);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'HOLDER_REQUIRED_IN_PARTICIPANTS');
  assert.match(result.message, /Holder selalu jadi peserta/i);
});

test('a participant with Konsumsi cannot be removed, and the refusal names them', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));

  const result = setParticipants(tim, 'p1', ['h', 'b', 'c']);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PARTICIPANT_HAS_KONSUMSI');
  assert.match(result.message, /Andi/);
  assert.match(result.message, /30000/);
});

test('participants must come from the Tim roster', () => {
  const tim = makeTim();
  const result = setParticipants(tim, 'p1', ['h', 'a', 'ghost']);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PARTICIPANT_NOT_IN_ROSTER');
  assert.match(result.message, /roster Tim/i);
});

test('a participant with no Konsumsi can be dropped, and then leaves no Settlement row', () => {
  let tim = makeTim();
  tim = ok(addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  tim = ok(setParticipants(tim, 'p1', ['h', 'a', 'c']));

  assert.deepEqual(periodeOf(tim).participants, ['h', 'a', 'c']);

  const rows = settlementRows(tim, periodeOf(tim));
  assert.equal(rows.length, 3);
  assert.equal(rows.some((r) => r.memberId === 'b'), false, 'Budi is not charged this Periode');
  assert.equal(currentBalances(tim).length, 4, 'the roster is unchanged');
});

function konsumsiOf(tim, memberId) {
  return settlementRows(tim, periodeOf(tim)).find((r) => r.memberId === memberId).konsumsi;
}
