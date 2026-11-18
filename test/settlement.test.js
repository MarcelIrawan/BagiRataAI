import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTim,
  addNota,
  addSetoran,
  setAnggotaStatus,
  settlementRows,
  saldoNow,
  saldoAwal,
  kontribusi,
  setoranTotal,
  paidByOf,
  notaGrandTotal,
  kas,
  holderNet,
  outstandingAt,
  minimalTransfers,
  removeNota,
  removeSetoran,
  updateNota,
  konsumsi,
} from '../public/js/domain.js';

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
    members: [
      { id: 'h', name: 'Hana' },
      { id: 'a', name: 'Andi' },
      { id: 'b', name: 'Budi' },
      { id: 'c', name: 'Citra' },
    ],
    openingBalances: {},
  });
}

function assertOk(result) {
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

function setoran(over = {}) {
  return {
    id: 's1',
    memberId: 'a',
    amount: 5000,
    note: 'Setoran',
    at: NOW,
    ...over,
  };
}

function rowOf(rows, memberId) {
  const row = rows.find((r) => r.memberId === memberId);
  assert.ok(row, 'expected a settlement row for ' + memberId);
  return row;
}

/* ---------------------------------------------------------------- *
 * Kontribusi
 * ---------------------------------------------------------------- */

test('Kontribusi is signed Setoran plus the amounts that member paid the merchant', () => {
  let tim = makeTim();
  tim = assertOk(addSetoran(tim, setoran({ id: 's1', memberId: 'a', amount: 20000 }), NOW));
  tim = assertOk(addSetoran(tim, setoran({ id: 's2', memberId: 'a', amount: -5000, note: 'Kembalian' }), NOW));
  tim = assertOk(
    addNota(
      tim,
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

  assert.equal(setoranTotal(tim, 'a'), 15000, 'signed setoran total');
  assert.equal(kontribusi(tim, 'a'), 25000, '15000 setoran + 10000 paid as Pembayar');
  assert.equal(kontribusi(tim, 'h'), 20000);
  assert.equal(kontribusi(tim, 'b'), 0);
});

test('a Nota with no paidBy list is read as paid in full by the Holder', () => {
  const tim = makeTim();
  tim.notes.push({
    id: 'legacy',
    items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }],
    tax: 0,
    service: 0,
    discount: 0,
    paidBy: [],
  });

  const stored = tim.notes[0];
  const payers = paidByOf(stored, tim);
  assert.equal(payers.length, 1);
  assert.equal(payers[0].memberId, 'h');
  assert.equal(payers[0].amount, notaGrandTotal(stored));
  assert.equal(payers[0].amount, 30000);
  assert.equal(kontribusi(tim, 'h'), 30000);
});

/* ---------------------------------------------------------------- *
 * Setoran refusals
 * ---------------------------------------------------------------- */

test('a zero Setoran is refused', () => {
  const tim = makeTim();
  const result = addSetoran(tim, setoran({ id: 's1', memberId: 'a', amount: 0 }), NOW);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SETORAN_ZERO');
  assert.match(result.message, /tidak boleh nol/i);
});

test('a negative Setoran without a note is refused, but is accepted with one', () => {
  const tim = makeTim();
  const refused = addSetoran(tim, setoran({ id: 's1', memberId: 'a', amount: -5000, note: '' }), NOW);

  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'SETORAN_NOTE_REQUIRED');
  assert.match(refused.message, /wajib punya catatan/i);

  const accepted = addSetoran(tim, setoran({ id: 's1', memberId: 'a', amount: -5000, note: 'Kembalian' }), NOW);
  assert.equal(accepted.ok, true);
  assert.equal(setoranTotal(accepted.tim, 'a'), -5000);
});

test('the Holder cannot be either party of a Setoran', () => {
  const tim = makeTim();
  const result = addSetoran(tim, setoran({ id: 's1', memberId: 'h', amount: 10000 }), NOW);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SETORAN_HOLDER');
  assert.match(result.message, /Holder tidak bisa jadi salah satu pihak/i);
});

test('a Setoran from someone off the roster or a keluar member is refused', () => {
  let tim = makeTim();
  tim = assertOk(setAnggotaStatus(tim, 'a', 'keluar', T1));

  const notMember = addSetoran(tim, setoran({ id: 's1', memberId: 'ghost', amount: 10000 }), NOW);
  assert.equal(notMember.ok, false);
  assert.equal(notMember.code, 'SETORAN_NOT_MEMBER');
  assert.match(notMember.message, /roster Tim ini/i);

  const leftMember = addSetoran(tim, setoran({ id: 's2', memberId: 'a', amount: 10000 }), NOW);
  assert.equal(leftMember.ok, false);
  assert.equal(leftMember.code, 'SETORAN_MEMBER_LEFT');
  assert.match(leftMember.message, /keluar/i);
});

/* ---------------------------------------------------------------- *
 * Saldo and Saldo Awal
 * ---------------------------------------------------------------- */

test('Saldo is Saldo Awal + Konsumsi - Kontribusi', () => {
  let tim = makeTim();
  tim = assertOk(addNota(tim, nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  tim = assertOk(addSetoran(tim, setoran({ id: 's1', memberId: 'a', amount: 5000 }), NOW));

  assert.equal(konsumsi(tim, 'a'), 30000);
  assert.equal(saldoNow(tim, 'a'), 0 + 30000 - 5000);
  assert.equal(saldoNow(tim, 'h'), -30000, 'the Holder paid the merchant and consumed nothing');
});

test('Saldo Awal defaults to 0 and can be hand-entered on Tim creation', () => {
  let tim = makeTim();
  assert.equal(saldoAwal(tim, 'b'), 0, 'defaults to zero');

  tim = createTim({
    id: 't2', name: 'Test', holderId: 'h', now: NOW,
    members: [{ id: 'h', name: 'H' }, { id: 'a', name: 'A' }],
    openingBalances: { a: 50000 }
  });
  assert.equal(saldoAwal(tim, 'a'), 50000);
  assert.equal(saldoNow(tim, 'a'), 50000, 'pre-app debt is owed with no Nota behind it');

  const rows = settlementRows(tim);
  assert.equal(rowOf(rows, 'a').saldoAwal, 50000);
  assert.equal(rowOf(rows, 'a').handEnteredAwal, true, 'a hand-entered opening must be visible');
  assert.equal(rowOf(rows, 'h').handEnteredAwal, false);
});

test('paying an old debt is an ordinary Setoran in the current Tim', () => {
  let tim = makeTim();
  tim = assertOk(addNota(tim, nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));

  assert.equal(saldoNow(tim, 'a'), 30000);
  tim = assertOk(addSetoran(tim, setoran({ id: 's2', memberId: 'a', amount: 30000, note: 'Bayar utang' }), NOW));

  assert.equal(saldoNow(tim, 'a'), 0);
});

/* ---------------------------------------------------------------- *
 * Settlement presentation (live, no snapshot)
 * ---------------------------------------------------------------- */

test('settlementRows renders live rows for all active members', () => {
  let tim = makeTim();
  tim = assertOk(addNota(tim, nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  tim = assertOk(addSetoran(tim, setoran({ id: 's1', memberId: 'a', amount: 10000 }), NOW));

  const rows = settlementRows(tim);
  assert.equal(rows.length, 4);
  for (const row of rows) assert.equal(row.source, 'live');
  assert.equal(rowOf(rows, 'a').saldo, 20000);
  assert.equal(rowOf(rows, 'a').konsumsi, 30000);
  assert.equal(rowOf(rows, 'a').kontribusi, 10000);
  assert.equal(rowOf(rows, 'h').isHolder, true);
  assert.equal(rowOf(rows, 'h').saldo, -30000);
  assert.equal(rowOf(rows, 'b').saldo, 0);
  assert.equal(rowOf(rows, 'c').saldo, 0);
});

test('a keluar member is not in settlementRows but still in roster', () => {
  let tim = makeTim();
  tim = assertOk(addNota(tim, nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  tim = assertOk(addSetoran(tim, setoran({ id: 's1', memberId: 'a', amount: 30000 }), NOW));
  tim = assertOk(setAnggotaStatus(tim, 'a', 'keluar', T1));

  const settlement = settlementRows(tim);
  assert.equal(settlement.length, 3, 'keluar member not in settlement');
  assert.ok(!settlement.find(r => r.memberId === 'a'));

  assert.equal(tim.members.length, 4, 'the Tim still carries her roster row');
});

/* ---------------------------------------------------------------- *
 * Kas Holder
 * ---------------------------------------------------------------- */

test('Kas Holder is Tim-wide: signed Setoran minus only the Holder own paidBy amounts', () => {
  let tim = makeTim();
  tim = assertOk(addNota(tim, nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  tim = assertOk(addSetoran(tim, setoran({ id: 's1', memberId: 'a', amount: 50000 }), NOW));
  assert.equal(kas(tim), 20000);

  // Another member paying the merchant directly does not touch the Holder's cash.
  tim = assertOk(addNota(tim, nota({ id: 'n2', items: [{ name: 'B', qty: 1, price: 20000, assignedTo: ['b'] }], paidBy: [{ memberId: 'b', amount: 20000 }] }), NOW));
  assert.equal(kas(tim), 20000);

  // A Pengembalian reduces the cash the Holder holds.
  tim = assertOk(addSetoran(tim, setoran({ id: 's2', memberId: 'a', amount: -5000, note: 'Kembalian' }), NOW));
  assert.equal(kas(tim), 15000);
});

test('a Nota part-paid by the Holder only reduces Kas by the Holder own share', () => {
  let tim = makeTim();
  tim = assertOk(addNota(tim, nota({
    id: 'n1',
    items: [{ name: 'A', qty: 1, price: 40000, assignedTo: ['a'] }],
    paidBy: [
      { memberId: 'a', amount: 30030 },
      { memberId: 'h', amount: 9970 },
    ],
  }), NOW));

  assert.equal(kas(tim), -9970);
});

/* ---------------------------------------------------------------- *
 * Holder Net
 * ---------------------------------------------------------------- */

test('Holder Net is positive Saldo minus absolute Kredits across the roster, excluding the Holder', () => {
  let tim = makeTim();
  tim = assertOk(addNota(tim, nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'b', amount: 30000 }] }), NOW));
  tim = assertOk(addNota(tim, nota({ id: 'n2', items: [{ name: 'B', qty: 1, price: 10000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 10000 }] }), NOW));

  assert.equal(saldoNow(tim, 'a'), 40000);
  assert.equal(saldoNow(tim, 'b'), -30000);
  assert.equal(saldoNow(tim, 'h'), -10000);
  assert.equal(holderNet(tim), 10000, '40000 owed - 30000 credit');
  assert.deepEqual(outstandingAt(tim), { owed: 40000, credit: 30000 });
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

test('settlementRows computes its transfers from the live balances', () => {
  let tim = makeTim();
  tim = assertOk(addNota(tim, nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'b', amount: 30000 }] }), NOW));

  const rows = settlementRows(tim);
  const transfers = minimalTransfers(rows);
  assert.ok(transfers.length > 0);
  assert.equal(summarize(transfers), 30000);
  for (const balance of applyTransfers(rows, transfers).values()) assert.equal(balance, 0);
});

function summarize(transfers) {
  return transfers.reduce((sum, t) => sum + t.amount, 0);
}

/* ---------------------------------------------------------------- *
 * Remove Setoran
 * ---------------------------------------------------------------- */

test('removeSetoran removes a deposit', () => {
  let tim = makeTim();
  tim = assertOk(addSetoran(tim, setoran({ id: 's1', memberId: 'a', amount: 10000 }), NOW));
  assert.equal(setoranTotal(tim, 'a'), 10000);

  tim = assertOk(removeSetoran(tim, 's1'));
  assert.equal(setoranTotal(tim, 'a'), 0);
  assert.equal(tim.setorans.length, 0);
});

/* ---------------------------------------------------------------- *
 * Remove Nota
 * ---------------------------------------------------------------- */

test('removeNota removes a nota and its konsumsi', () => {
  let tim = makeTim();
  tim = assertOk(addNota(tim, nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  assert.equal(konsumsi(tim, 'a'), 30000);

  tim = assertOk(removeNota(tim, 'n1'));
  assert.equal(konsumsi(tim, 'a'), 0);
  assert.equal(tim.notes.length, 0);
});

/* ---------------------------------------------------------------- *
 * Update Nota
 * ---------------------------------------------------------------- */

test('updateNota modifies an existing nota', () => {
  let tim = makeTim();
  tim = assertOk(addNota(tim, nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 10000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 10000 }] }), NOW));
  assert.equal(konsumsi(tim, 'a'), 10000);

  tim = assertOk(updateNota(tim, { ...tim.notes[0], items: [{ name: 'B', qty: 1, price: 20000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 20000 }] }, T1));
  assert.equal(konsumsi(tim, 'a'), 20000);
});
