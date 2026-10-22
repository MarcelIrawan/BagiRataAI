import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTim,
  findPeriode,
  addNota,
  validateNota,
  notaBreakdown,
  notaGrandTotal,
  konsumsi,
  setParticipants,
} from '../js/domain.js';

const NOW = '2026-10-20T10:00:00.000Z';

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

const periodeOf = (tim) => findPeriode(tim, 'p1');

function rowOf(breakdown, memberId) {
  const row = breakdown.rows.find((r) => r.memberId === memberId);
  assert.ok(row, `expected a breakdown row for ${memberId}`);
  return row;
}

function codes(result) {
  return result.errors.map((e) => e.code);
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
 * Per-Anggota arithmetic
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

  const a = rowOf(breakdown, 'a');
  assert.equal(a.subtotal, 30000);
  assert.equal(a.tax, 3000);
  assert.equal(a.service, 1500);
  assert.equal(a.discount, 750);
  assert.equal(a.total, 33750, 'Andi ate 75% of the items, so pays 75% of the charges');

  const b = rowOf(breakdown, 'b');
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
  assert.equal(rowOf(breakdown, 'a').total, 12000);
  assert.equal(rowOf(breakdown, 'b').total, 12000);
  assert.equal(rowOf(breakdown, 'c').total, 12000);
  assert.equal(breakdown.rows.length, 3);
});

test('the Rp1 Sisa Pembulatan goes to the Holder when the Holder consumed an item', () => {
  const tim = makeTim();
  const breakdown = notaBreakdown(
    nota({ items: [{ name: 'Kopi', qty: 1, price: 10000, assignedTo: ['h', 'a', 'b'] }] }),
    tim
  );

  assert.equal(breakdown.grandTotal, 10000);
  assert.equal(rowOf(breakdown, 'h').total, 3334, 'Holder absorbs the residual rupiah');
  assert.equal(rowOf(breakdown, 'a').total, 3333);
  assert.equal(rowOf(breakdown, 'b').total, 3333);
  assert.equal(breakdown.rows.reduce((s, r) => s + r.total, 0), 10000);
});

test('the Sisa Pembulatan goes to the first Anggota in roster order when the Holder ate nothing', () => {
  const tim = makeTim();
  const breakdown = notaBreakdown(
    nota({ items: [{ name: 'Kopi', qty: 1, price: 10000, assignedTo: ['b', 'c', 'a'] }] }),
    tim
  );

  assert.equal(breakdown.rows[0].memberId, 'a', 'rows follow roster order, not item order');
  assert.equal(rowOf(breakdown, 'a').total, 3334);
  assert.equal(rowOf(breakdown, 'b').total, 3333);
  assert.equal(rowOf(breakdown, 'c').total, 3333);
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

test('Konsumsi of one Anggota sums their share of every Nota in the Periode', () => {
  let tim = makeTim();
  tim = addNota(tim, 'p1', nota({ id: 'n1', items: [{ name: 'A', qty: 1, price: 30000, assignedTo: ['a', 'b'] }], paidBy: [{ memberId: 'h', amount: 30000 }] }), NOW).tim;
  tim = addNota(tim, 'p1', nota({ id: 'n2', items: [{ name: 'B', qty: 1, price: 8000, assignedTo: ['a'] }], paidBy: [{ memberId: 'h', amount: 8000 }] }), NOW).tim;

  assert.equal(konsumsi(tim, periodeOf(tim), 'a'), 15000 + 8000);
  assert.equal(konsumsi(tim, periodeOf(tim), 'b'), 15000);
  assert.equal(konsumsi(tim, periodeOf(tim), 'h'), 0);
});

/* ---------------------------------------------------------------- *
 * Nota validity refusals
 * ---------------------------------------------------------------- */

test('a Nota with no items is refused and says an item is required', () => {
  const tim = makeTim();
  const result = validateNota(tim, periodeOf(tim), nota({ items: [] }));

  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('NOTA_NO_ITEMS'));
  assert.match(result.errors[0].message, /minimal satu item/i);
});

test('a Nota with unpicked items is refused and the message states how many', () => {
  const tim = makeTim();
  const result = validateNota(
    tim,
    periodeOf(tim),
    nota({
      items: [
        { name: 'A', qty: 1, price: 10000, assignedTo: [] },
        { name: 'B', qty: 1, price: 5000, assignedTo: [] },
        { name: 'C', qty: 1, price: 5000, assignedTo: ['a'] },
      ],
      paidBy: [{ memberId: 'h', amount: 20000 }],
    })
  );

  assert.equal(result.ok, false);
  const error = result.errors.find((e) => e.code === 'NOTA_ITEM_NO_PEMILIH');
  assert.ok(error, 'NOTA_ITEM_NO_PEMILIH must be reported');
  assert.match(error.message, /^2 item belum punya pemilih/, 'message must name the count');
  assert.equal(error.count, 2);
});

test('an item assigned to someone outside the Periode participant set is refused', () => {
  let tim = makeTim();
  tim = setParticipants(tim, 'p1', ['h', 'a', 'c']).tim;
  const result = validateNota(
    tim,
    periodeOf(tim),
    nota({ items: [{ name: 'A', qty: 1, price: 10000, assignedTo: ['b'] }] })
  );

  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('NOTA_PEMILIH_NOT_PARTICIPANT'));
  assert.match(
    result.errors.find((e) => e.code === 'NOTA_PEMILIH_NOT_PARTICIPANT').message,
    /bukan peserta/i
  );
});

test('an under-funded payer list is refused and reports the remainder', () => {
  const tim = makeTim();
  const result = validateNota(
    tim,
    periodeOf(tim),
    nota({ paidBy: [{ memberId: 'h', amount: 6000 }] })
  );

  assert.equal(result.ok, false);
  const error = result.errors.find((e) => e.code === 'NOTA_PEMBAYAR_UNFUNDED');
  assert.ok(error);
  assert.equal(error.remainder, 4000);
  assert.match(error.message, /kurang 4000 rupiah/i);
});

test('an over-funded payer list is refused and reports the excess', () => {
  const tim = makeTim();
  const result = validateNota(
    tim,
    periodeOf(tim),
    nota({ paidBy: [{ memberId: 'h', amount: 12000 }] })
  );

  assert.equal(result.ok, false);
  const error = result.errors.find((e) => e.code === 'NOTA_PEMBAYAR_UNFUNDED');
  assert.ok(error);
  assert.equal(error.remainder, -2000);
  assert.match(error.message, /kelebihan 2000 rupiah/i);
});

test('a negative grand total is refused', () => {
  const tim = makeTim();
  const result = validateNota(
    tim,
    periodeOf(tim),
    nota({ items: [{ name: 'A', qty: 1, price: 1000, assignedTo: ['a'] }], discount: 5000 })
  );

  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('NOTA_NEGATIVE_TOTAL'));
  assert.match(
    result.errors.find((e) => e.code === 'NOTA_NEGATIVE_TOTAL').message,
    /tidak boleh negatif/i
  );
});

test('a payer who is not a participant of the Periode is refused', () => {
  let tim = makeTim();
  tim = setParticipants(tim, 'p1', ['h', 'a', 'b']).tim;

  const result = validateNota(
    tim,
    periodeOf(tim),
    nota({ paidBy: [{ memberId: 'c', amount: 10000 }] })
  );

  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('NOTA_PEMBAYAR_NOT_PARTICIPANT'));
  assert.match(
    result.errors.find((e) => e.code === 'NOTA_PEMBAYAR_NOT_PARTICIPANT').message,
    /pembayar yang bukan peserta/i
  );
});

test('a valid Nota is accepted and records when it happened and when it was written', () => {
  const tim = makeTim();
  const result = addNota(tim, 'p1', nota({ occurredAt: '2026-10-19T12:00:00.000Z' }), NOW);

  assert.equal(result.ok, true);
  const bills = findPeriode(result.tim, 'p1').bills;
  assert.equal(bills.length, 1);
  assert.equal(bills[0].occurredAt, '2026-10-19T12:00:00.000Z');
  assert.equal(bills[0].createdAt, NOW);
});
