import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTim,
  createStore,
  upsertTim,
  findTim,
  findAnggota,
  addNota,
  addSetoran,
  addAnggota,
  setAnggotaStatus,
  handoverHolder,
  archiveTim,
  unarchiveTim,
  canDeleteTim,
  deleteTim,
  settlementRows,
  saldoNow,
  activeMembers,
  konsumsi,
  kontribusi,
  setoranTotal,
  notaBreakdown,
  notaGrandTotal,
  paidByOf,
  kas,
  holderNet,
  outstandingAt,
  removeNota,
  removeSetoran,
  updateNota,
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

/* ---------------------------------------------------------------- *
 * Tim lifecycle
 * ---------------------------------------------------------------- */

test('a Tim is created with members, holder, empty notes/setorans, and openingBalances', () => {
  const tim = makeTim();

  assert.equal(tim.name, 'Kantor');
  assert.equal(tim.holderId, 'h');
  assert.equal(tim.members.length, 4);
  assert.equal(tim.notes.length, 0);
  assert.equal(tim.setorans.length, 0);
  assert.deepEqual(tim.openingBalances, {});
  assert.equal(tim.archivedAt, null);
});

test('a Tim can be archived and unarchived, and archiving blocks nothing', () => {
  let tim = makeTim();
  tim = assertOk(archiveTim(tim, T1));
  assert.equal(tim.archivedAt, T1);

  tim = assertOk(addNota(tim, nota(), NOW));
  assert.equal(tim.notes.length, 1, 'archive is a filter, not a write barrier');

  tim = assertOk(unarchiveTim(tim));
  assert.equal(tim.archivedAt, null);
});

test('canDeleteTim is true only with no Nota, no Setoran and no hand-entered balance', () => {
  let tim = makeTim();
  assert.deepEqual(canDeleteTim(tim), { ok: true, notaCount: 0, setoranCount: 0, handEntered: false });

  tim = addNota(tim, nota(), NOW).tim;
  assert.equal(canDeleteTim(tim).ok, false);
  assert.equal(canDeleteTim(tim).notaCount, 1);

  tim = addSetoran(tim, setoran(), NOW).tim;
  assert.equal(canDeleteTim(tim).ok, false);
  assert.equal(canDeleteTim(tim).setoranCount, 1);

  tim = createTim({
    id: 't2', name: 'X', holderId: 'h', now: NOW,
    members: [{ id: 'h', name: 'H' }],
    openingBalances: { h: 20000 }
  });
  assert.equal(canDeleteTim(tim).ok, false);
  assert.equal(canDeleteTim(tim).handEntered, true);
});

test('deleteTim refuses a Tim with history and removes an empty one', () => {
  let store = createStore(NOW);
  let tim = makeTim();
  tim = assertOk(addNota(tim, nota(), NOW));
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

/* ---------------------------------------------------------------- *
 * Anggota lifecycle
 * ---------------------------------------------------------------- */

test('an Anggota with a non-zero Saldo cannot leave, and the refusal names the amount', () => {
  let tim = makeTim();
  tim = assertOk(addNota(tim, nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 15000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 15000 }] }), NOW));
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
  tim = assertOk(addNota(tim, nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 15000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 15000 }] }), NOW));
  tim = assertOk(addSetoran(tim, setoran({ id: 's1', memberId: 'a', amount: 15000 }), NOW));
  assert.equal(saldoNow(tim, 'a'), 0);

  const before = findAnggota(tim, 'a');
  tim = assertOk(setAnggotaStatus(tim, 'a', 'keluar', T1));

  const left = findAnggota(tim, 'a');
  assert.equal(left.id, 'a');
  assert.equal(left.status, 'keluar');
  assert.equal(left.leftAt, T1);
  assert.equal(tim.members.length, 4, 'leaving destroys nothing');
  assert.equal(tim.notes.length, 1);
  assert.equal(tim.setorans.length, 1);
  assert.equal(konsumsi(tim, 'a'), 15000);

  tim = assertOk(setAnggotaStatus(tim, 'a', 'active', T2));
  const back = findAnggota(tim, 'a');
  assert.equal(back.id, before.id, 'a returning person keeps their id');
  assert.equal(back.status, 'active');
  assert.equal(back.leftAt, null);
  assert.equal(tim.members.length, 4);
});

test('a keluar Anggota is excluded from activeMembers', () => {
  let tim = makeTim();
  tim = assertOk(setAnggotaStatus(tim, 'a', 'keluar', T1));
  assert.deepEqual(activeMembers(tim).map(m => m.id), ['h', 'b', 'c']);
});

test('adding an Anggota works and they start active', () => {
  let tim = makeTim();
  tim = assertOk(addAnggota(tim, { id: 'c', name: 'Citra', colorIndex: 3 }, T1));
  const member = findAnggota(tim, 'c');
  assert.ok(member);
  assert.equal(member.name, 'Citra');
  assert.equal(member.status, 'active');
});

/* ---------------------------------------------------------------- *
 * Holder handover (simplified, no log)
 * ---------------------------------------------------------------- */

test('a handover moves the Holder role', () => {
  let tim = makeTim();
  tim = assertOk(handoverHolder(tim, { toId: 'a', at: T2, note: '' }));

  assert.equal(tim.holderId, 'a');

  tim = assertOk(handoverHolder(tim, { toId: 'b', at: T3, note: '' }));
  assert.equal(tim.holderId, 'b');
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

test('a keluar Anggota cannot receive Holder role', () => {
  let tim = makeTim();
  tim = assertOk(setAnggotaStatus(tim, 'a', 'keluar', T1));
  const result = handoverHolder(tim, { toId: 'a', at: T2 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'HANDOVER_MEMBER_LEFT');
});

/* ---------------------------------------------------------------- *
 * Opening balances (hand-entered on Tim, never changes)
 * ---------------------------------------------------------------- */

test('opening balances are set on Tim creation and never change', () => {
  const tim = createTim({
    id: 't1', name: 'Test', holderId: 'h', now: NOW,
    members: [{ id: 'h', name: 'Hana' }, { id: 'a', name: 'Andi' }],
    openingBalances: { a: 50000 }
  });

  assert.equal(tim.openingBalances.a, 50000);
  assert.equal(saldoNow(tim, 'a'), 50000, 'pre-app debt is owed with no Nota behind it');

  const rows = settlementRows(tim);
  assert.equal(rows.find(r => r.memberId === 'a').saldoAwal, 50000);
  assert.equal(rows.find(r => r.memberId === 'a').handEnteredAwal, true);
  assert.equal(rows.find(r => r.memberId === 'h').handEnteredAwal, false);
});

/* ---------------------------------------------------------------- *
 * Nota arithmetic
 * ---------------------------------------------------------------- */

test('nota splits tax, service and discount proportionally to each member item share', () => {
  const tim = makeTim();
  const breakdown = notaBreakdown(
    nota({
      items: [
        { name: 'Sate', qty: 1, price: 30000, assignedTo: ['a'] },
        { name: 'Es teh', qty: 1, price: 10000, assignedTo: ['b'] },
      ],
      tax: 4000,
      service: 2000,
      discount: 1000,
    }),
    tim
  );

  assert.equal(breakdown.itemsSubtotal, 40000);
  assert.equal(breakdown.grandTotal, 45000);

  const a = breakdown.rows.find(r => r.memberId === 'a');
  assert.equal(a.subtotal, 30000);
  assert.equal(a.tax, 3000);
  assert.equal(a.service, 1500);
  assert.equal(a.discount, 750);
  assert.equal(a.total, 33750, 'Andi ate 75% of the items, so pays 75% of the charges');

  const b = breakdown.rows.find(r => r.memberId === 'b');
  assert.equal(b.subtotal, 10000);
  assert.equal(b.tax, 1000);
  assert.equal(b.service, 500);
  assert.equal(b.discount, 250);
  assert.equal(b.total, 11250);

  assert.equal(a.total + b.total, breakdown.grandTotal);
});

test('an item assigned to several Anggota is divided evenly between them', () => {
  const tim = makeTim();
  const breakdown = notaBreakdown(
    nota({ items: [{ name: 'Pizza', qty: 2, price: 18000, assignedTo: ['a', 'b', 'c'] }] }),
    tim
  );

  assert.equal(breakdown.grandTotal, 36000);
  assert.equal(breakdown.rows.find(r => r.memberId === 'a').total, 12000);
  assert.equal(breakdown.rows.find(r => r.memberId === 'b').total, 12000);
  assert.equal(breakdown.rows.find(r => r.memberId === 'c').total, 12000);
});

test('the Rp1 Sisa Pembulatan goes to the Holder when the Holder consumed an item', () => {
  const tim = makeTim();
  const breakdown = notaBreakdown(
    nota({ items: [{ name: 'Kopi', qty: 1, price: 10000, assignedTo: ['h', 'a', 'b'] }] }),
    tim
  );

  assert.equal(breakdown.grandTotal, 10000);
  assert.equal(breakdown.rows.find(r => r.memberId === 'h').total, 3334, 'Holder absorbs the residual rupiah');
  assert.equal(breakdown.rows.find(r => r.memberId === 'a').total, 3333);
  assert.equal(breakdown.rows.find(r => r.memberId === 'b').total, 3333);
  assert.equal(breakdown.rows.reduce((s, r) => s + r.total, 0), 10000);
});

test('the Sisa Pembulatan goes to the first Anggota in roster order when the Holder ate nothing', () => {
  const tim = makeTim();
  const breakdown = notaBreakdown(
    nota({ items: [{ name: 'Kopi', qty: 1, price: 10000, assignedTo: ['b', 'c', 'a'] }] }),
    tim
  );

  assert.equal(breakdown.rows[0].memberId, 'a', 'rows follow roster order, not item order');
  assert.equal(breakdown.rows.find(r => r.memberId === 'a').total, 3334);
  assert.equal(breakdown.rows.find(r => r.memberId === 'b').total, 3333);
  assert.equal(breakdown.rows.find(r => r.memberId === 'c').total, 3333);
  assert.equal(
    breakdown.rows.some((r) => r.memberId === 'h'),
    false,
    'the Holder did not eat, so has no row'
  );
});

test('grand total is items plus tax plus service minus discount', () => {
  assert.equal(
    notaGrandTotal({
      items: [
        { qty: 2, price: 25000 },
        { qty: 1, price: 5000 },
      ],
      tax: 5500,
      service: 2000,
      discount: 1000,
    }),
    61500
  );
  assert.equal(notaGrandTotal({ items: [] }), 0);
});

/* ---------------------------------------------------------------- *
 * Konsumsi / Kontribusi
 * ---------------------------------------------------------------- */

test('Konsumsi of one Anggota sums their share of every Nota in the Tim', () => {
  let tim = makeTim();
  tim = assertOk(addNota(tim, nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a', 'b'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW));
  tim = assertOk(addNota(tim, nota({ id: 'n2', items: [{ name: 'B', qty: 1, price: 8000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 8000 }] }), NOW));

  assert.equal(konsumsi(tim, 'a'), 15000 + 8000);
  assert.equal(konsumsi(tim, 'b'), 15000);
  assert.equal(konsumsi(tim, 'h'), 0);
});

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
  assert.equal(rows.find(r => r.memberId === 'a').saldo, 20000);
  assert.equal(rows.find(r => r.memberId === 'a').konsumsi, 30000);
  assert.equal(rows.find(r => r.memberId === 'a').kontribusi, 10000);
  assert.equal(rows.find(r => r.memberId === 'h').isHolder, true);
  assert.equal(rows.find(r => r.memberId === 'h').saldo, -30000);
  assert.equal(rows.find(r => r.memberId === 'b').saldo, 0);
  assert.equal(rows.find(r => r.memberId === 'c').saldo, 0);
});

test('a keluar member still appears in roster but not in settlementRows', () => {
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
